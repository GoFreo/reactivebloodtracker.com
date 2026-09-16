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
  // Future: { id: "librelinkup", label: "LibreLinkUp (Libre 2 Plus)", ... }
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
