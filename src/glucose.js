import { addEntry, getAllEntries } from "./db.js";

// Pluggable glucose-source abstraction (Scott's explicit requirement, 2026-09-12):
// equipment changes over time (DVA product list, doctor's prescription, device
// availability), so "where a reading comes from" is a registry, not a hardcoded
// meter/CGM. v1 ships only `manualSource`; a future Bluetooth meter or LibreLinkUp
// polling source plugs in here without touching the UI or storage layer.
export const glucoseSources = [
  {
    id: "manual",
    label: "Manual entry",
    description: "Type in a finger-prick (or any) reading yourself.",
    isAvailable: () => true,
  },
  // Future: { id: "librelinkup", label: "LibreLinkUp (Libre 2 Plus)", ... }
  // Future: { id: "bluetooth-meter", label: "Bluetooth meter", ... }
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
