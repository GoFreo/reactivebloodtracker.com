import { test, expect } from "@playwright/test";
import { mealOutcome, formatAfter } from "../src/mealOutcome.js";

const MEAL = "2026-09-28T01:00:00.000Z";
const at = (min) => new Date(Date.parse(MEAL) + min * 60000).toISOString();
const cgm = (min, v) => ({ timestamp: at(min), value: v, unit: "mmol/L", sourceId: "librelinkup" });
const prick = (min, v) => ({ timestamp: at(min), value: v, unit: "mmol/L", sourceId: "manual" });

test.describe("meal outcome (pure logic)", () => {
  test("reports before, peak and lowest with minutes after the meal", () => {
    const g = [cgm(-10, 5.2), cgm(30, 8.0), cgm(45, 10.8), cgm(120, 5.0), cgm(160, 3.4), cgm(200, 4.8)];
    expect(mealOutcome(MEAL, g)).toEqual({
      before: 5.2,
      peak: { value: 10.8, afterMin: 45 },
      lowest: { value: 3.4, afterMin: 160 },
      count: 5,
      source: "cgm",
    });
  });

  test("ignores readings more than 5 hours after, and none after means null", () => {
    expect(mealOutcome(MEAL, [cgm(-10, 5), cgm(301, 2.5)])).toBeNull();
  });

  test("prefers Libre when it covers the window, falls back to finger-pricks when it doesn't", () => {
    const withCgm = [cgm(20, 7), cgm(40, 9), cgm(60, 8), prick(50, 12)];
    expect(mealOutcome(MEAL, withCgm).peak.value).toBe(9);
    const pricksOnly = [prick(60, 9.1), prick(180, 3.9)];
    const o = mealOutcome(MEAL, pricksOnly);
    expect(o.source).toBe("mixed");
    expect(o.lowest).toEqual({ value: 3.9, afterMin: 180 });
  });

  test("mg/dL readings are converted to mmol/L", () => {
    const o = mealOutcome(MEAL, [{ timestamp: at(30), value: 180, unit: "mg/dL", sourceId: "manual" }]);
    expect(o.peak.value).toBe(10);
  });

  test("formats durations plainly", () => {
    expect(formatAfter(45)).toBe("45 min");
    expect(formatAfter(120)).toBe("2h");
    expect(formatAfter(160)).toBe("2h 40m");
  });
});
