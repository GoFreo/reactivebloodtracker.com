// "Keep my devices in sync": the person's own glucose, food and diary records,
// copied between their phone, Mac and any other device that has the sync
// passcode. OFF unless switched on in Settings (CLAUDE.md privacy rule 1:
// cloud copies are opt-in, never silently on). Photos never come here; see
// src/recordMerge.js.
//
// Stored in Netlify Blobs, one JSON shard per store per month, plus an index of
// when each shard last changed, so a device only downloads months that changed.
// Locked with the same passcode as the Libre sync and food bank
// (CGM_SYNC_PASSCODE, x-cgm-passcode header). Phase 1 is one household, the
// same as the food bank; a public version needs real per-person accounts.
//
//   GET                       → { index: { "glucose/2026-10": { updatedAt, count } }, serverTime }
//   GET ?shard=glucose/2026-10 → { records: [...] }
//   POST { store, records }   → { ok, added, index }   (union, never overwrites)
import { getStore } from "@netlify/blobs";
import { passcodeMatches } from "./cgm-sync.js";
import { SYNC_STORES, shardKey, mergeRecords, validRecord } from "../../src/recordMerge.js";

const MIN_PASSCODE_LENGTH = 8;
const MAX_BODY_BYTES = 4_000_000;
const MAX_RECORDS_PER_POST = 1000;
const MAX_RECORDS_PER_SHARD = 60_000;
const INDEX_KEY = "index";
const SHARD_PATTERN = /^(glucose|food|diary)\/(\d{4}-\d{2}|undated)$/;

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

// Read-modify-write that can't lose another device's write: retries if the
// blob changed between the read and the write (ETag check).
async function casUpdate(store, key, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const next = change(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const res = await store.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res?.modified !== false) return next;
  }
  throw new Error("busy");
}

// `openStore` is injectable so tests can use an in-memory store.
export function createHandler(openStore = () => getStore({ name: "personal-data", consistency: "strong" })) {
  return async (event) => {
    const expected = process.env.CGM_SYNC_PASSCODE;
    if (!expected) return json(200, { configured: false, error: "Device sync needs the sync passcode set in Netlify (CGM_SYNC_PASSCODE)." });
    if (expected.length < MIN_PASSCODE_LENGTH) {
      return json(200, { configured: false, error: `The sync passcode saved in Netlify is too short — use at least ${MIN_PASSCODE_LENGTH} characters.` });
    }
    if (!passcodeMatches(event.headers?.["x-cgm-passcode"], expected)) {
      await new Promise((r) => setTimeout(r, 1000));
      return json(401, { error: "Wrong sync passcode." });
    }

    const store = openStore();

    if (event.httpMethod === "GET") {
      const shard = event.queryStringParameters?.shard;
      if (shard) {
        if (!SHARD_PATTERN.test(shard)) return json(400, { error: "Unknown shard." });
        return json(200, { records: (await store.get(shard, { type: "json" })) || [] });
      }
      return json(200, { index: (await store.get(INDEX_KEY, { type: "json" })) || {}, serverTime: new Date().toISOString() });
    }

    if (event.httpMethod === "POST") {
      if ((event.body || "").length > MAX_BODY_BYTES) return json(413, { error: "Too large — send fewer records at once." });
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON." });
      }
      const { store: storeName, records } = body;
      if (!SYNC_STORES.includes(storeName)) return json(400, { error: "Unknown record type." });
      if (!Array.isArray(records)) return json(400, { error: "records must be a list." });
      if (records.length > MAX_RECORDS_PER_POST) return json(413, { error: `At most ${MAX_RECORDS_PER_POST} records at once.` });
      if (!records.every((r) => validRecord(storeName, r))) return json(400, { error: "A record was malformed." });

      const byShard = new Map();
      for (const r of records) {
        const key = shardKey(storeName, r);
        if (!byShard.has(key)) byShard.set(key, []);
        byShard.get(key).push(r);
      }

      let added = 0;
      const touched = {};
      try {
        for (const [key, incoming] of byShard) {
          let addedHere = 0;
          let count = 0;
          let full = false;
          await casUpdate(store, key, (cur) => {
            const { merged, added: a } = mergeRecords(storeName, cur || [], incoming);
            addedHere = a.length;
            count = merged.length;
            if (!a.length) return undefined;
            if (merged.length > MAX_RECORDS_PER_SHARD) {
              full = true;
              return undefined;
            }
            return merged;
          });
          if (full) return json(507, { error: "Too many records in one month." });
          if (addedHere) {
            added += addedHere;
            touched[key] = count;
          }
        }
        const now = new Date().toISOString();
        const index = Object.keys(touched).length
          ? await casUpdate(store, INDEX_KEY, (cur) => {
              const next = { ...(cur || {}) };
              for (const [key, count] of Object.entries(touched)) next[key] = { updatedAt: now, count };
              return next;
            })
          : (await store.get(INDEX_KEY, { type: "json" })) || {};
        return json(200, { ok: true, added, index });
      } catch {
        return json(503, { error: "Sync was busy — it will try again." });
      }
    }

    return json(405, { error: "Method not allowed" });
  };
}

export const handler = createHandler();
