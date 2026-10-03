// Pure merge rules for "Keep my devices in sync" (cloudSync.js on the device,
// netlify/functions/data-sync.js on the server). Shared so both sides agree.
//
// Records are only ever added in this app (db.js has no edit or delete), so a
// merge is a union: nothing to resolve, nothing lost. Two things need care:
//  - The same CGM/meter reading pulled on two devices before sync was on has two
//    different ids. A device-sourced reading is the same reading when its source
//    and time match, so it's kept once.
//  - Photos are full-size Blobs; they stay on the device that took them and only
//    a `hadPhoto` flag travels.

export const SYNC_STORES = ["glucose", "food", "diary"];

// One shard per store per month (by the record's own timestamp), so a sync only
// moves the months that changed, not years of CGM readings every time.
export function shardKey(store, record) {
  const d = new Date(record.timestamp);
  const month = Number.isNaN(d.getTime()) ? "undated" : d.toISOString().slice(0, 7);
  return `${store}/${month}`;
}

// The "same reading" key for readings that came from a device, or null for
// anything typed in by hand (those are always distinct, even if identical).
export function naturalKey(store, record) {
  if (store !== "glucose" || !record.sourceId || record.sourceId === "manual") return null;
  const t = new Date(record.timestamp).getTime();
  return Number.isNaN(t) ? null : `${record.sourceId}|${t}`;
}

// What leaves the device: everything except the photo itself.
export function toCloudRecord(record) {
  if (!record || typeof record !== "object") return record;
  if (!("photoBlob" in record)) return record;
  const { photoBlob, ...rest } = record;
  return photoBlob ? { ...rest, hadPhoto: true } : rest;
}

const MAX_RECORD_CHARS = 20_000;

// Server-side sanity check on one incoming record.
export function validRecord(store, r) {
  if (!SYNC_STORES.includes(store)) return false;
  if (!r || typeof r !== "object" || Array.isArray(r)) return false;
  if (typeof r.id !== "string" || !r.id || r.id.length > 64) return false;
  if (typeof r.timestamp !== "string" || Number.isNaN(new Date(r.timestamp).getTime())) return false;
  return JSON.stringify(r).length <= MAX_RECORD_CHARS;
}

// Adds `incoming` records to `existing` (both arrays for one store). Returns
// { merged, added } where `added` are the incoming records that were new.
export function mergeRecords(store, existing, incoming) {
  const ids = new Set(existing.map((r) => r.id));
  const natural = new Set(existing.map((r) => naturalKey(store, r)).filter(Boolean));
  const merged = existing.slice();
  const added = [];
  for (const r of incoming) {
    if (!r || ids.has(r.id)) continue;
    const nk = naturalKey(store, r);
    if (nk && natural.has(nk)) continue;
    ids.add(r.id);
    if (nk) natural.add(nk);
    merged.push(r);
    added.push(r);
  }
  return { merged, added };
}
