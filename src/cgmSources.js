// Which glucose sources are continuous sensors (CGMs) rather than finger-pricks.
// One list, so adding a sensor type (Dexcom, 2026-10-03) updates the graph, the
// Readings filter, spike prompts and meal outcomes together — before this, each
// checked for "librelinkup" on its own, and Dexcom readings would have been drawn
// and counted as finger-pricks. No imports, so pure-logic modules and their unit
// tests can use it without pulling in IndexedDB or Bluetooth code.
export const CGM_SOURCE_IDS = ["librelinkup", "dexcom"];

export const isCgmSource = (sourceId) => CGM_SOURCE_IDS.includes(sourceId);

export const CGM_SOURCE_LABELS = { librelinkup: "Libre", dexcom: "Dexcom" };
