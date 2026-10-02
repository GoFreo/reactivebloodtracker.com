import { test, expect } from "@playwright/test";
import { isCgmSource } from "../src/cgmSources.js";
import { cgmSeries, detectExcursions, DEFAULT_SPIKE_SETTINGS } from "../src/spikeDetection.js";
import { filterEntries } from "../src/readingsFilter.js";
import { mealOutcome } from "../src/mealOutcome.js";

// Dexcom readings (sourceId "dexcom") must count as sensor data everywhere
// Libre's do — found 2026-10-04: every one of these places checked for
// "librelinkup" alone, so Dexcom would have been treated as finger-pricks.
const T0 = Date.UTC(2026, 9, 3, 0, 0);
const at = (min) => new Date(T0 + min * 60000).toISOString();
const reading = (sourceId, min, value) => ({ sourceId, timestamp: at(min), value, unit: "mmol/L" });

test.describe("CGM sources (Libre and Dexcom)", () => {
  test("Libre and Dexcom are sensors; meters and typed readings are not", () => {
    expect(isCgmSource("librelinkup")).toBe(true);
    expect(isCgmSource("dexcom")).toBe(true);
    expect(isCgmSource("bluetooth-meter")).toBe(false);
    expect(isCgmSource("manual")).toBe(false);
    expect(isCgmSource(undefined)).toBe(false);
  });

  test("the Readings CGM filter includes Dexcom readings", () => {
    const entries = [
      { _kind: "glucose", sourceId: "dexcom", value: 5 },
      { _kind: "glucose", sourceId: "manual", value: 6 },
    ];
    expect(filterEntries(entries, "cgm")).toHaveLength(1);
    expect(filterEntries(entries, "meter")).toEqual([entries[1]]);
  });

  test("meal outcomes use a Dexcom-only trace as the sensor", () => {
    const g = [reading("dexcom", 30, 9), reading("dexcom", 60, 10.5), reading("dexcom", 150, 3.6), reading("manual", 90, 7)];
    const out = mealOutcome(at(0), g);
    expect(out.source).toBe("cgm");
    expect(out.lowest.value).toBe(3.6);
  });

  test("spike detection uses one sensor, so two worn at once can't fake a swing", () => {
    // Two sensors reading about 2 mmol/L apart, interleaved: mixed together
    // they'd look like repeated 2+ mmol/L jumps within minutes.
    const glucose = [];
    for (let i = 0; i < 12; i++) {
      glucose.push(reading("librelinkup", i * 15, 5));
      glucose.push(reading("dexcom", i * 15 + 5, 7.2));
    }
    glucose.push(reading("librelinkup", 200, 5)); // Libre has the most readings
    const series = cgmSeries(glucose);
    expect(series.every((p) => p.v === 5)).toBe(true);
    expect(detectExcursions(series, DEFAULT_SPIKE_SETTINGS)).toEqual([]);
  });
});
