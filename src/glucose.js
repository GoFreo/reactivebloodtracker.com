import { addEntry, getAllEntries } from "./db.js";
import { isBluetoothAvailable } from "./bluetoothGlucose.js";

// Pluggable glucose-source abstraction (Scott's explicit requirement, 2026-09-12):
// equipment changes over time (DVA product list, doctor's prescription, device
// availability), so "where a reading comes from" is a registry, not a hardcoded
// meter/CGM. v1 shipped only `manualSource`; the Bluetooth entry below is the
// first of the "future" sources this registry was built for.
export const glucoseSources = [
  {
    id: "manual",
    label: "Manual entry",
    description: "Type in a finger-prick (or any) reading yourself.",
    isAvailable: () => true,
  },
  {
    id: "bluetooth-meter",
    label: "Bluetooth meter (Accu-Chek Guide Me)",
    description: "Connect once, then pull the meter's stored readings on demand from Settings.",
    // Chrome only (Mac or Android) — Safari/iOS has never implemented Web
    // Bluetooth, an Apple platform restriction. See HANDOVER.md 2026-09-14.
    isAvailable: isBluetoothAvailable,
  },
  {
    id: "librelinkup",
    label: "Libre 2 Plus CGM",
    description: "Pulls the last ~12 hours of sensor readings on demand, protected by a sync passcode.",
    // Server-side sync (netlify/functions/cgm-sync.js), so any browser works —
    // unlike Bluetooth. Whether it's actually set up is only known after a sync.
    isAvailable: () => true,
  },
  {
    id: "dexcom",
    label: "Dexcom ONE+ CGM",
    description: "Connect once with your Dexcom sign-in (Settings → My devices); Sync devices then pulls new readings. Dexcom holds readings back about 3 hours outside the US.",
    // Server-side via Dexcom's official API (netlify/functions/dexcom.js), so
    // any browser works. Connected or not is shown in Settings → My devices.
    isAvailable: () => true,
  },
];

export async function saveGlucoseReading({ value, unit, timestamp, note, sourceId = "manual" }) {
  return addEntry("glucose", {
    type: "glucose",
    value: Number(value),
    unit,
    timestamp,
    note: note || "",
    sourceId,
  });
}

export async function listGlucoseReadings() {
  return getAllEntries("glucose");
}
