// Pure functions behind the Readings graph redesign (Scott, 2026-09-28 22:23):
// a smoothed line with peaks labelled above it and troughs below, plus shaded
// bands (and a list) wherever a reading crosses the low or high threshold.
// No DOM, no storage — src/timeline.js owns the SVG; tests here are plain
// unit tests over arrays of {t, v} points.

import { convertUnit } from "./thresholds.js";

// Centred rolling average. Each run from splitAtGaps() is smoothed on its own
// (the caller does this, one run at a time) so a sensor gap is never bridged
// by averaging across it. O(n^2), fine for a week of 15-min CGM data (~700
// points) — this app's own rule is simple-and-good-enough, not a streaming
// algorithm.
export function smoothSeries(points, windowMinutes = 30) {
  const halfMs = (windowMinutes * 60000) / 2;
  return points.map((p) => {
    let sum = 0;
    let count = 0;
    for (const q of points) {
      if (Math.abs(q.t - p.t) <= halfMs) {
        sum += q.v;
        count++;
      }
    }
    return { t: p.t, v: sum / count };
  });
}

// Local peaks/troughs on the smoothed line, kept only if they're at least
// `prominence` more extreme than the higher (for a peak) / lower (for a
// trough) of their two neighbouring extrema — a simplified topographic
// prominence: repeatedly drop the single least-prominent extremum until none
// remain below the threshold, so a small wobble next to a real peak doesn't
// also get labelled. Flat runs collapse to one extremum, not several.
export function findPeaksAndTroughs(smoothed, { prominence = 1.5 } = {}) {
  if (smoothed.length < 3) return [];

  let extrema = [];
  let dir = 0; // -1 falling, 1 rising, 0 unknown (start, or a flat run so far)
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i].v - smoothed[i - 1].v;
    const newDir = delta > 1e-9 ? 1 : delta < -1e-9 ? -1 : dir;
    if (dir !== 0 && newDir !== 0 && newDir !== dir) {
      extrema.push({ t: smoothed[i - 1].t, v: smoothed[i - 1].v, type: dir === 1 ? "peak" : "trough" });
    }
    if (newDir !== 0) dir = newDir;
  }

  let changed = true;
  while (changed && extrema.length > 0) {
    changed = false;
    let weakestIdx = -1;
    let weakestProminence = Infinity;
    for (let i = 0; i < extrema.length; i++) {
      const e = extrema[i];
      const before = i > 0 ? extrema[i - 1].v : smoothed[0].v;
      const after = i < extrema.length - 1 ? extrema[i + 1].v : smoothed[smoothed.length - 1].v;
      const prom = e.type === "peak" ? e.v - Math.max(before, after) : Math.min(before, after) - e.v;
      if (prom < weakestProminence) {
        weakestProminence = prom;
        weakestIdx = i;
      }
    }
    if (weakestIdx !== -1 && weakestProminence < prominence) {
      extrema.splice(weakestIdx, 1);
      changed = true;
    }
  }
  return extrema;
}

// Spans where consecutive RAW readings (not the smoothed line — a genuine
// brief low still matters, Scott's own "crossings shorter than 15 min still
// listed") sit continuously below `low` or above `high`. Finger-pricks are
// deliberately excluded: they're already flagged individually on their own
// diamond marker (see warn-low/warn-high in timeline.js), and treating two
// isolated finger-prick moments as a continuous "crossing" with a duration
// would overstate what was actually measured. Call once per gap-split run,
// same as smoothSeries, so a crossing never bridges a sensor data gap.
// `pointsUnit` is the unit the points themselves are already in (the graph
// converts readings to its display unit before this is called, which may
// differ from thresholds.unit — same conversion timeline.js already does
// for the low/high rule lines, mirrored here rather than assuming mmol/L).
export function findThresholdCrossings(cgmPoints, thresholds, pointsUnit = "mmol/L") {
  if (thresholds.low == null && thresholds.high == null) return [];
  const lowV = thresholds.low != null ? convertUnit(thresholds.low, thresholds.unit, pointsUnit) : null;
  const highV = thresholds.high != null ? convertUnit(thresholds.high, thresholds.unit, pointsUnit) : null;
  const classify = (v) => (lowV != null && v < lowV ? "low" : highV != null && v > highV ? "high" : null);

  const crossings = [];
  let current = null;
  for (const p of cgmPoints) {
    const cls = classify(p.v);
    if (cls && current && current.type === cls) {
      current.endT = p.t;
      if (cls === "low" ? p.v < current.extreme : p.v > current.extreme) current.extreme = p.v;
    } else {
      if (current) crossings.push(current);
      current = cls ? { type: cls, startT: p.t, endT: p.t, extreme: p.v } : null;
    }
  }
  if (current) crossings.push(current);
  return crossings;
}
