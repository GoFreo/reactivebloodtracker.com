// Device register (Settings → My devices), Scott's spec 2026-09-28 22:43: each
// physical device kept individually — type, serial, a nickname, date added,
// and status — so "which meter is this" and "when did this sensor start" are
// answered without digging through readings. Stored on this device only (not
// the food bank, which is shared household product facts, not personal gear).

const KEY = "rht-devices";

export const DEVICE_TYPES = [
  { id: "bluetooth-meter", label: "Accu-Chek Guide Me" },
  { id: "librelinkup", label: "Libre 2 Plus sensor" },
  { id: "dexcom-one-plus", label: "Dexcom ONE+" },
  { id: "other", label: "Other" },
];

export const DEVICE_STATUSES = ["in use", "finished", "failed"];

function store(storage) {
  return storage || globalThis.localStorage;
}

function readAll(storage) {
  try {
    const v = JSON.parse(store(storage).getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list, storage) {
  store(storage).setItem(KEY, JSON.stringify(list));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Most recently added first, matching Scott's own framing ("might be more
// than one" — the one he's currently holding is usually the one just added).
export function listDevices(storage) {
  return readAll(storage).sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
}

export function getDevice(id, storage) {
  return readAll(storage).find((d) => d.id === id) || null;
}

// Only "in use" devices of a type are offered as the thing a sync compares
// against — a "finished"/"failed" one shouldn't block syncing with whatever
// replaced it.
export function activeDeviceOfType(type, storage) {
  return readAll(storage).find((d) => d.type === type && d.status === "in use") || null;
}

export function addDevice({ type, serial, nickname, status = "in use", dateAdded }, storage) {
  if (!DEVICE_TYPES.some((t) => t.id === type)) throw new Error(`Unknown device type: ${type}`);
  const device = {
    id: makeId(),
    type,
    serial: (serial || "").trim(),
    nickname: (nickname || "").trim(),
    status,
    dateAdded: dateAdded || new Date().toISOString(),
  };
  const all = readAll(storage);
  all.push(device);
  writeAll(all, storage);
  return device;
}

export function updateDevice(id, patch, storage) {
  const all = readAll(storage);
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all, storage);
  return all[idx];
}

// No hard delete — a device's history (which readings came from it) stays
// meaningful even once replaced; "failed"/"finished" is the record of that,
// matching Scott's own status vocabulary rather than losing the row.
export function retireDevice(id, status, storage) {
  return updateDevice(id, { status }, storage);
}

export function deviceLabel(type) {
  return DEVICE_TYPES.find((t) => t.id === type)?.label || type;
}

// Auto-records a new Libre sensor from LibreLinkUp's own connection data
// (Scott's spec: "record each new sensor automatically into the register with
// its start date" — this also gives the sensor-failure history he needs for
// Abbott replacements). Idempotent by serial: a sensor already registered
// isn't duplicated on every sync. Returns the device if one was newly added,
// otherwise null.
export function recordLibreSensorIfNew(sensor, storage) {
  if (!sensor?.serial) return null;
  const all = readAll(storage);
  if (all.some((d) => d.type === "librelinkup" && d.serial === sensor.serial)) return null;
  // A newly-seen sensor replaces the previous Libre as "in use" — the old one
  // finished (or failed), not still active, since Scott wears one at a time.
  for (const d of all) {
    if (d.type === "librelinkup" && d.status === "in use") d.status = "finished";
  }
  const device = {
    id: makeId(),
    type: "librelinkup",
    serial: sensor.serial,
    nickname: "",
    status: "in use",
    dateAdded: sensor.activatedAt || new Date().toISOString(),
  };
  all.push(device);
  writeAll(all, storage);
  return device;
}
