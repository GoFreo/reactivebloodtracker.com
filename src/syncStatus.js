// Device status lights on Home (Scott, 2026-10-03: "lights to indicate each meter
// and whether they are being synced, whether they are working or not, as an easy
// look"). One record per device of how its last sync attempt went; pure logic so
// it's testable without a browser. Stored on this device only.

const KEY = "rht-sync-status";

// Green while a successful sync is this recent; amber after that.
export const FRESH_HOURS = 12;

export const DEVICE_LIGHTS = [
  { key: "libre", label: "Libre" },
  { key: "dexcom", label: "Dexcom" },
  { key: "meter", label: "Accu-Chek" },
];

function store(storage) {
  return storage || globalThis.localStorage;
}

export function getSyncStatus(storage) {
  try {
    const v = JSON.parse(store(storage).getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// ok: true (worked) or false (failed). Skipping a device isn't recorded, so a
// skip never turns a working device's light red.
export function recordSyncResult(key, { ok, message = "", at = new Date().toISOString() }, storage) {
  const all = getSyncStatus(storage);
  const prev = all[key] || {};
  all[key] = ok ? { ...prev, ok: true, at, lastOkAt: at, message } : { ...prev, ok: false, at, message };
  try {
    store(storage).setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the light just won't remember.
  }
  return all[key];
}

// "syncing" | "green" | "amber" | "red" | "grey"
export function lightFor(entry, { syncing = false, now = Date.now() } = {}) {
  if (syncing) return "syncing";
  if (!entry?.at) return "grey";
  if (!entry.ok) return "red";
  const ageHours = (now - new Date(entry.lastOkAt || entry.at).getTime()) / 3600000;
  return ageHours <= FRESH_HOURS ? "green" : "amber";
}

export const LIGHT_WORDS = {
  syncing: "syncing now",
  green: "working",
  amber: "not synced lately",
  red: "last sync failed",
  grey: "not set up",
};

// A device that's been removed (e.g. Dexcom disconnected) shouldn't keep a light.
export function forgetSyncResult(key, storage) {
  const all = getSyncStatus(storage);
  delete all[key];
  try {
    store(storage).setItem(KEY, JSON.stringify(all));
  } catch {}
}
