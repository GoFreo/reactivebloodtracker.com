import { test, expect } from "@playwright/test";
import { smoothSeries, findPeaksAndTroughs, findThresholdCrossings } from "../src/graphAnalysis.js";

// Builds {t, v} points at 15-minute steps starting at `start` (ms).
const series = (values, start = Date.UTC(2026, 8, 28, 9, 0)) =>
  values.map((v, i) => ({ t: start + i * 15 * 60000, v }));

test.describe("smoothSeries (pure logic)", () => {
  test("a flat series stays flat", () => {
    const out = smoothSeries(series([6, 6, 6, 6, 6]));
    expect(out.map((p) => p.v)).toEqual([6, 6, 6, 6, 6]);
  });

  test("averages only points within the centred half-window", () => {
    // 30-min window = +-15 min = +-1 step at 15-min spacing either side.
    const out = smoothSeries(series([5, 6, 7, 8, 9]), 30);
    // Middle point (index 2, value 7) averages indices 1-3: (6+7+8)/3.
    expect(out[2].v).toBeCloseTo((6 + 7 + 8) / 3, 5);
    // First point only has itself + the next within +-15 min: (5+6)/2.
    expect(out[0].v).toBeCloseTo((5 + 6) / 2, 5);
  });

  test("timestamps are unchanged", () => {
    const input = series([5, 6, 7]);
    const out = smoothSeries(input);
    expect(out.map((p) => p.t)).toEqual(input.map((p) => p.t));
  });
});

test.describe("findPeaksAndTroughs (pure logic)", () => {
  test("a clear rise and fall is one peak", () => {
    const extrema = findPeaksAndTroughs(series([5, 6, 7, 9, 7, 6, 5]));
    expect(extrema).toHaveLength(1);
    expect(extrema[0]).toMatchObject({ type: "peak", v: 9 });
  });

  test("a clear dip is one trough", () => {
    const extrema = findPeaksAndTroughs(series([9, 7, 5, 3, 5, 7, 9]));
    expect(extrema).toHaveLength(1);
    expect(extrema[0]).toMatchObject({ type: "trough", v: 3 });
  });

  test("a small wobble below the prominence threshold is suppressed", () => {
    // Rises to 9, dips to 8.2 (only 0.8 below the peak — under the default
    // 1.5 prominence), rises again to 9.3, then falls away.
    const extrema = findPeaksAndTroughs(series([5, 7, 9, 8.2, 9.3, 7, 5]));
    expect(extrema).toHaveLength(1);
    expect(extrema[0].type).toBe("peak");
    expect(extrema[0].v).toBe(9.3); // the more extreme of the two merged peaks
  });

  test("two genuinely separate, well-separated peaks both survive", () => {
    const extrema = findPeaksAndTroughs(series([5, 9, 5, 3, 5, 10, 5]));
    expect(extrema.map((e) => e.type)).toEqual(["peak", "trough", "peak"]);
    expect(extrema.map((e) => e.v)).toEqual([9, 3, 10]);
  });

  test("a flat run collapses to a single extremum, not several", () => {
    const extrema = findPeaksAndTroughs(series([5, 7, 9, 9, 9, 7, 5]));
    expect(extrema).toHaveLength(1);
    expect(extrema[0].v).toBe(9);
  });

  test("fewer than 3 points: nothing to find", () => {
    expect(findPeaksAndTroughs(series([5, 6]))).toEqual([]);
    expect(findPeaksAndTroughs([])).toEqual([]);
  });

  test("a custom prominence can be tighter or looser", () => {
    const points = series([5, 7, 9, 8.2, 9.3, 7, 5]); // the 0.8 dip from above
    expect(findPeaksAndTroughs(points, { prominence: 0.5 })).toHaveLength(3); // peak, trough, peak
    expect(findPeaksAndTroughs(points, { prominence: 1.5 })).toHaveLength(1); // merged away
  });
});

test.describe("findThresholdCrossings (pure logic)", () => {
  const thresholds = (low, high) => ({ low, high, unit: "mmol/L" });

  test("no thresholds set: nothing to find", () => {
    expect(findThresholdCrossings(series([2, 3, 2]), thresholds(null, null))).toEqual([]);
  });

  test("one low crossing, with its lowest value and start/end time", () => {
    const points = series([5, 4.5, 3.5, 3.0, 3.8, 5]);
    const crossings = findThresholdCrossings(points, thresholds(3.9, null));
    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toMatchObject({ type: "low", extreme: 3.0 });
    expect(crossings[0].startT).toBe(points[2].t); // first point under 3.9 is 3.5, at index 2 (4.5 at index 1 isn't)
    expect(crossings[0].endT).toBe(points[4].t); // last point under 3.9 is 3.8, at index 4
  });

  test("a crossing shorter than 15 minutes is still listed (single reading)", () => {
    const points = series([5, 3.5, 5, 5]);
    const crossings = findThresholdCrossings(points, thresholds(3.9, null));
    expect(crossings).toHaveLength(1);
    expect(crossings[0].startT).toBe(crossings[0].endT); // one reading, zero duration, still a crossing
  });

  test("high and low crossings are both found, independently", () => {
    const points = series([6, 3.5, 6, 11, 6]);
    const crossings = findThresholdCrossings(points, thresholds(3.9, 10));
    expect(crossings.map((c) => c.type)).toEqual(["low", "high"]);
  });

  test("two separate low spells are two crossings, not one", () => {
    const points = series([3.0, 6, 3.2]);
    const crossings = findThresholdCrossings(points, thresholds(3.9, null));
    expect(crossings).toHaveLength(2);
  });

  test("a threshold set in mmol/L is converted when the points are in mg/dL", () => {
    // Threshold is 3.9 mmol/L (~70 mg/dL). A reading of 60 mg/dL (~3.33 mmol/L)
    // is below it; 80 mg/dL (~4.44 mmol/L) is not — only works if the
    // threshold is actually converted into the points' unit before comparing.
    const points = series([80, 60, 80]);
    const crossings = findThresholdCrossings(points, thresholds(3.9, null), "mg/dL");
    expect(crossings).toHaveLength(1);
    expect(crossings[0].extreme).toBe(60);
  });

  test("a threshold set in mg/dL is converted when the points are in mmol/L", () => {
    const points = series([5, 3.5, 5]); // 3.5 mmol/L ~= 63 mg/dL, below a 70 mg/dL threshold
    const crossings = findThresholdCrossings(points, { low: 70, high: null, unit: "mg/dL" }, "mmol/L");
    expect(crossings).toHaveLength(1);
    expect(crossings[0].extreme).toBe(3.5);
  });
});
