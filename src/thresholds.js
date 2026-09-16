const KEY = "rht-thresholds";

// Blank until Scott enters his own numbers (with his doctor) — see HANDOVER.md
// "Descriptive, not prescriptive": this app never guesses a clinical cutoff.
// { low: number|null, high: number|null, unit: "mmol/L"|"mg/dL" }
export function getThresholds() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { low: null, high: null, unit: "mmol/L" };
  } catch {
    return { low: null, high: null, unit: "mmol/L" };
  }
}

export function saveThresholds(thresholds) {
  localStorage.setItem(KEY, JSON.stringify(thresholds));
}

const MMOL_TO_MGDL = 18.0182;

export function convertUnit(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  return fromUnit === "mmol/L" ? value * MMOL_TO_MGDL : value / MMOL_TO_MGDL;
}

// Scott's explicit rule (2026-09-14, his own driving-limit analogy: he drives to
// a personal 5 mmol/L cutoff even though the real risk starts around 4.6-4.7 —
// padding a standard upward for margin, never eroding it downward). The low
// threshold may be RAISED for extra personal safety margin but never LOWERED
// past a recognized floor. Anchored to the ADA's "Level 1 hypoglycemia alert
// value" (see HANDOVER.md) since that's the figure actually sourced and shown
// in Settings — not this app inventing a number, just refusing to go less safe
// than a cited standard.
export const LOW_THRESHOLD_FLOOR = { value: 3.9, unit: "mmol/L" };

export function floorInUnit(unit) {
  return convertUnit(LOW_THRESHOLD_FLOOR.value, LOW_THRESHOLD_FLOOR.unit, unit);
}

export function isBelowFloor(value, unit) {
  return convertUnit(value, unit, LOW_THRESHOLD_FLOOR.unit) < LOW_THRESHOLD_FLOOR.value - 1e-9;
}

// Returns "low" | "high" | "in-range" | null (null = no threshold set for that
// side, so this reading can't be classified — stay neutral, never guess).
export function classifyReading(value, unit) {
  const t = getThresholds();
  if (t.low == null && t.high == null) return null;

  const valueInThresholdUnit = convertUnit(value, unit, t.unit);
  if (t.low != null && valueInThresholdUnit < t.low) return "low";
  if (t.high != null && valueInThresholdUnit > t.high) return "high";
  if (t.low != null || t.high != null) return "in-range";
  return null;
}

export function explainClassification(value, unit) {
  const t = getThresholds();
  const cls = classifyReading(value, unit);
  if (cls === "low") return `${value} ${unit} is below your low threshold of ${t.low} ${t.unit}, set in Settings.`;
  if (cls === "high") return `${value} ${unit} is above your high threshold of ${t.high} ${t.unit}, set in Settings.`;
  if (cls === "in-range") return `${value} ${unit} is within the range you set in Settings.`;
  return "No warning thresholds set yet — add them in Settings to see warnings here.";
}
