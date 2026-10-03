// "Keep my devices in sync" — the device side of netlify/functions/data-sync.js.
// OFF unless the person switches it on in Settings (CLAUDE.md privacy rule 1).
// Uses the sync passcode already saved for the Libre sync and food bank.
//
// One round: send this device's new records up, then fetch any month another
// device has changed and add what's missing here. Records are only ever added
// in this app, so nothing is overwritten either way (see recordMerge.js).
import { getAllEntries, addSyncedEntries } from "./db.js";
import { getSavedPasscode } from "./libreLinkUp.js";
import { SYNC_STORES, mergeRecords, toCloudRecord } from "./recordMerge.js";

const URL_BASE = "/.netlify/functions/data-sync";
export const CLOUD_SYNC_ON_KEY = "rht-cloud-sync-on";
const SEEN_KEY = "rht-cloud-sync-seen"; // { shard: updatedAt } already fetched
const PUSHED_KEY = "rht-cloud-sync-pushed-ms"; // records made before this were sent
export const CLOUD_SYNC_LAST_KEY = "rht-cloud-sync-last";
const BATCH = 400;
// Entries are saved with an id starting with their creation time; resend a
// little either side of the last push so nothing saved mid-push is missed.
const PUSH_OVERLAP_MS = 5 * 60 * 1000;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function isCloudSyncOn() {
  return read(CLOUD_SYNC_ON_KEY, false) === true;
}

// Turning it on starts from scratch: send everything, fetch everything.
export function setCloudSyncOn(on) {
  write(CLOUD_SYNC_ON_KEY, !!on);
  if (on) {
    write(SEEN_KEY, {});
    write(PUSHED_KEY, 0);
  }
}

export function lastCloudSync() {
  return read(CLOUD_SYNC_LAST_KEY, null);
}

// Creation time from an id like "1790987039000-ab12cd" (db.js makeId), or null.
export function idTime(id) {
  const n = Number(String(id).split("-")[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The records to send: those created since the last push, or all of them the
// first time. Ids that don't carry a time are sent on the first push only.
export function recordsToPush(records, pushedMs) {
  if (!pushedMs) return records;
  return records.filter((r) => {
    const t = idTime(r.id);
    return t !== null && t >= pushedMs - PUSH_OVERLAP_MS;
  });
}

async function call(method, { shard, body } = {}) {
  const passcode = getSavedPasscode();
  const url = shard ? `${URL_BASE}?shard=${encodeURIComponent(shard)}` : URL_BASE;
  const res = await fetch(url, {
    method,
    headers: { "x-cgm-passcode": passcode, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Device sync only works on the live site.");
  if (res.status === 401) throw new Error("Wrong sync passcode — check it in Settings.");
  if (data.configured === false || !res.ok) throw new Error(data.error || `Device sync error (${res.status}).`);
  return data;
}

let running = null;

// Returns { ok, sent, received } or { ok: false, error } (or { ok: false, off }
// when switched off). Only one round runs at a time; a second call shares it.
export function runCloudSync() {
  if (!isCloudSyncOn()) return Promise.resolve({ ok: false, off: true });
  if (!getSavedPasscode()) {
    return Promise.resolve({ ok: false, error: "Save your sync passcode (Settings → Libre sync, tick Remember) to keep devices in sync." });
  }
  if (running) return running;
  running = (async () => {
    try {
      const startedAt = Date.now();
      const pushedMs = read(PUSHED_KEY, 0);
      let sent = 0;
      for (const store of SYNC_STORES) {
        const pending = recordsToPush(await getAllEntries(store), pushedMs).map(toCloudRecord);
        for (let i = 0; i < pending.length; i += BATCH) {
          const r = await call("POST", { body: { store, records: pending.slice(i, i + BATCH) } });
          sent += r.added || 0;
        }
      }
      write(PUSHED_KEY, startedAt);

      const { index } = await call("GET");
      const seen = read(SEEN_KEY, {});
      let received = 0;
      for (const [shard, info] of Object.entries(index || {})) {
        if (seen[shard] === info.updatedAt) continue;
        const store = shard.split("/")[0];
        if (!SYNC_STORES.includes(store)) continue;
        const { records } = await call("GET", { shard });
        const { added } = mergeRecords(store, await getAllEntries(store), records || []);
        received += await addSyncedEntries(store, added);
        seen[shard] = info.updatedAt;
        write(SEEN_KEY, seen);
      }
      write(CLOUD_SYNC_LAST_KEY, new Date().toISOString());
      return { ok: true, sent, received };
    } catch (err) {
      const offline = err instanceof TypeError;
      return { ok: false, error: offline ? "Couldn't reach device sync (offline?). It will try again." : err.message };
    } finally {
      running = null;
    }
  })();
  return running;
}
