// What glucose did after each meal: the idea behind Undermyfork's meal gallery
// (see the 2026-09-28 field study), turned toward lows. Reactive hypoglycemia's
// crash typically lands 2–5 hours after eating, so the window is 5 hours and
// the lowest point matters as much as the peak.
//
// Pure and descriptive: it reports numbers and times from the user's own
// readings, never a verdict on whether the meal was "good".

import { convertUnit } from "./thresholds.js";
import { isCgmSource } from "./cgmSources.js";

export const OUTCOME_HOURS = 5;
const BEFORE_MINUTES = 60; // a reading this recent counts as "before the meal"

// Returns null when there are no readings after the meal, otherwise
// { before, peak, lowest, count, source } with values in mmol/L and
// minutes-after-meal for peak/lowest. `source` says whether CGM or
// finger-prick readings were used.
export function mealOutcome(mealTimestamp, glucose, { hours = OUTCOME_HOURS } = {}) {
  const t0 = new Date(mealTimestamp).getTime();
  if (!Number.isFinite(t0)) return null;
  const end = t0 + hours * 3600000;
  const pts = glucose
    .map((g) => ({ t: new Date(g.timestamp).getTime(), v: convertUnit(Number(g.value), g.unit, "mmol/L"), cgm: isCgmSource(g.sourceId) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));

  // Prefer the continuous sensor when it covers the window: a handful of
  // finger-pricks can easily miss the real peak or low between them.
  const after = pts.filter((p) => p.t > t0 && p.t <= end);
  const cgmAfter = after.filter((p) => p.cgm);
  const use = cgmAfter.length >= 3 ? cgmAfter : after;
  if (!use.length) return null;

  const beforePts = pts
    .filter((p) => p.t <= t0 && p.t >= t0 - BEFORE_MINUTES * 60000 && (use === cgmAfter ? p.cgm : true))
    .sort((a, b) => b.t - a.t);

  const minutes = (p) => Math.round((p.t - t0) / 60000);
  let peak = use[0];
  let lowest = use[0];
  for (const p of use) {
    if (p.v > peak.v) peak = p;
    if (p.v < lowest.v) lowest = p;
  }
  const round = (v) => Math.round(v * 10) / 10;
  return {
    before: beforePts[0] ? round(beforePts[0].v) : null,
    peak: { value: round(peak.v), afterMin: minutes(peak) },
    lowest: { value: round(lowest.v), afterMin: minutes(lowest) },
    count: use.length,
    source: use === cgmAfter ? "cgm" : "mixed",
  };
}

export function formatAfter(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
