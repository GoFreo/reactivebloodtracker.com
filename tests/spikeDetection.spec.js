import { test, expect } from "@playwright/test";
import { detectExcursions, findUnexplainedExcursions, DEFAULT_SPIKE_SETTINGS } from "../src/spikeDetection.js";

// Builds CGM readings (mmol/L) at 15-minute steps ending at `end`.
function cgm(values, end = Date.UTC(2026, 8, 28, 12, 0)) {
  return values.map((v, i) => ({
    value: v,
    unit: "mmol/L",
    sourceId: "librelinkup",
    timestamp: new Date(end - (values.length - 1 - i) * 15 * 60000).toISOString(),
  }));
}
const NOW = Date.UTC(2026, 8, 28, 12, 30);
const series = (g) => g.map((r) => ({ t: new Date(r.timestamp).getTime(), v: r.value }));

test.describe("spike detection (pure logic)", () => {
  test("one climb becomes one rise event, peaked at its highest reading", () => {
    const events = detectExcursions(series(cgm([5.0, 5.1, 6.5, 8.0, 9.8, 9.6])));
    const rises = events.filter((e) => e.type === "rise");
    expect(rises).toHaveLength(1);
    expect(rises[0].startValue).toBe(5.0);
    expect(rises[0].peakValue).toBe(9.8);
  });

  test("a change smaller than the set amount, or slower than the window, is ignored", () => {
    expect(detectExcursions(series(cgm([5.0, 5.5, 6.0, 6.5, 6.9])))).toHaveLength(0); // +1.9
    // +3.0 but spread over 3h at 15-min steps: never 2.0 within any 60 min
    expect(detectExcursions(series(cgm([5.0, 5.25, 5.5, 5.75, 6.0, 6.25, 6.5, 6.75, 7.0, 7.25, 7.5, 7.75, 8.0])))).toHaveLength(0);
  });

  test("detects a drop too", () => {
    const events = detectExcursions(series(cgm([9.0, 8.8, 7.0, 5.5, 4.2])));
    expect(events.map((e) => e.type)).toEqual(["drop"]);
    expect(events[0].peakValue).toBe(4.2);
  });

  test("finger-prick readings are never used, only CGM", () => {
    const pricks = cgm([5.0, 9.0]).map((r) => ({ ...r, sourceId: "manual" }));
    expect(findUnexplainedExcursions({ glucose: pricks, food: [], diary: [], settings: DEFAULT_SPIKE_SETTINGS, now: NOW })).toHaveLength(0);
  });

  test("food logged within the lookback explains a rise; food logged earlier doesn't", () => {
    const glucose = cgm([5.0, 5.1, 7.5, 9.8]);
    const start = new Date(glucose[0].timestamp).getTime();
    const at = (minBefore) => [{ timestamp: new Date(start - minBefore * 60000).toISOString() }];
    const ask = (food) => findUnexplainedExcursions({ glucose, food, diary: [], settings: DEFAULT_SPIKE_SETTINGS, now: NOW });
    expect(ask(at(30))).toHaveLength(0);
    expect(ask(at(200))).toHaveLength(1);
  });

  test("a drop looks back 4 hours, so a meal 3h earlier explains a reactive crash", () => {
    const glucose = cgm([9.0, 8.8, 7.0, 5.5, 4.2]);
    const start = new Date(glucose[0].timestamp).getTime();
    const food = [{ timestamp: new Date(start - 180 * 60000).toISOString() }];
    expect(findUnexplainedExcursions({ glucose, food, diary: [], settings: DEFAULT_SPIKE_SETTINGS, now: NOW })).toHaveLength(0);
  });

  test("answered, dismissed, disabled or old events are not asked again", () => {
    const glucose = cgm([5.0, 5.1, 7.5, 9.8]);
    const base = { glucose, food: [], diary: [], settings: DEFAULT_SPIKE_SETTINGS, now: NOW };
    const [e] = findUnexplainedExcursions(base);
    expect(e).toBeTruthy();
    expect(findUnexplainedExcursions({ ...base, diary: [{ timestamp: glucose[0].timestamp, excursionId: e.id }] })).toHaveLength(0);
    expect(findUnexplainedExcursions({ ...base, dismissedIds: [e.id] })).toHaveLength(0);
    expect(findUnexplainedExcursions({ ...base, settings: { ...DEFAULT_SPIKE_SETTINGS, enabled: false } })).toHaveLength(0);
    expect(findUnexplainedExcursions({ ...base, now: NOW + 8 * 86400000 })).toHaveLength(0);
  });

  test("answering a rise also settles the crash that follows it", () => {
    const glucose = cgm([5.0, 5.1, 7.5, 9.8, 9.2, 7.4, 5.9, 4.9, 4.1]);
    const base = { glucose, food: [], settings: DEFAULT_SPIKE_SETTINGS, now: NOW };
    const both = findUnexplainedExcursions({ ...base, diary: [] });
    expect(both.map((e) => e.type).sort()).toEqual(["drop", "rise"]);
    const rise = both.find((e) => e.type === "rise");
    const diary = [{ timestamp: new Date(rise.startT).toISOString(), excursionId: rise.id, excursionAnswer: "unexplained" }];
    expect(findUnexplainedExcursions({ ...base, diary })).toHaveLength(0);
  });

  test("an answer note doesn't count as 'something logged' for a neighbouring event", () => {
    const glucose = cgm([5.0, 5.1, 7.5, 9.8]);
    const diary = [{ timestamp: glucose[1].timestamp, excursionId: "drop-some-other-event" }];
    expect(findUnexplainedExcursions({ glucose, food: [], diary, settings: DEFAULT_SPIKE_SETTINGS, now: NOW })).toHaveLength(1);
  });
});

import { splitAtGaps } from "../src/timeline.js";

test.describe("graph gap handling", () => {
  test("a CGM gap over 45 minutes splits the line and is reported as a gap", () => {
    const m = 60000;
    const pts = [0, 15, 30, 120, 135].map((min) => ({ t: min * m, v: 5 }));
    const { runs, gaps } = splitAtGaps(pts);
    expect(runs.map((r) => r.length)).toEqual([3, 2]);
    expect(gaps).toEqual([{ from: 30 * m, to: 120 * m }]);
  });

  test("normal 15-minute spacing stays one continuous line", () => {
    const pts = [0, 15, 30, 45, 60].map((min) => ({ t: min * 60000, v: 5 }));
    expect(splitAtGaps(pts).gaps).toHaveLength(0);
  });
});
