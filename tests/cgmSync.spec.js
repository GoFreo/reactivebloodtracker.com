import { test, expect } from "@playwright/test";
import { parseFactoryTimestamp, toReadings, passcodeMatches, handler } from "../netlify/functions/cgm-sync.js";

// Pure server-side logic, no network — the real LibreLinkUp account can't be
// exercised from a test run, so the parts that decide *what number and what
// time* get saved are pinned down here instead.
test.describe("LibreLinkUp CGM sync (server logic)", () => {
  test("FactoryTimestamp is read as UTC, including 12 AM/PM edge cases", () => {
    expect(parseFactoryTimestamp("9/28/2026 1:15:30 PM").toISOString()).toBe("2026-09-28T13:15:30.000Z");
    expect(parseFactoryTimestamp("9/28/2026 12:05:00 AM").toISOString()).toBe("2026-09-28T00:05:00.000Z");
    expect(parseFactoryTimestamp("9/28/2026 12:05:00 PM").toISOString()).toBe("2026-09-28T12:05:00.000Z");
    expect(parseFactoryTimestamp("not a date")).toBeNull();
  });

  test("converts mg/dL to mmol/L, sorts oldest first, and drops the duplicated current reading", () => {
    const readings = toReadings({
      graphData: [
        { FactoryTimestamp: "9/28/2026 1:30:00 AM", ValueInMgPerDl: 72 },
        { FactoryTimestamp: "9/28/2026 1:15:00 AM", ValueInMgPerDl: 99 },
      ],
      connection: { glucoseMeasurement: { FactoryTimestamp: "9/28/2026 1:30:00 AM", ValueInMgPerDl: 72 } },
    });
    expect(readings).toEqual([
      { value: 5.5, unit: "mmol/L", timestamp: "2026-09-28T01:15:00.000Z" },
      { value: 4, unit: "mmol/L", timestamp: "2026-09-28T01:30:00.000Z" },
    ]);
  });

  test("implausible or malformed points are dropped, never saved", () => {
    const readings = toReadings({
      graphData: [
        { FactoryTimestamp: "9/28/2026 1:00:00 AM", ValueInMgPerDl: 0 },
        { FactoryTimestamp: "9/28/2026 1:05:00 AM", ValueInMgPerDl: 5000 },
        { FactoryTimestamp: "garbage", ValueInMgPerDl: 90 },
        { FactoryTimestamp: "9/28/2026 1:10:00 AM", ValueInMgPerDl: "n/a" },
      ],
    });
    expect(readings).toEqual([]);
  });

  test("passcode comparison only accepts an exact match", () => {
    expect(passcodeMatches("correct-horse", "correct-horse")).toBe(true);
    expect(passcodeMatches("correct-hors", "correct-horse")).toBe(false);
    expect(passcodeMatches(undefined, "correct-horse")).toBe(false);
  });

  test("reports not-configured, and refuses a too-short passcode, before touching LibreLinkUp", async () => {
    const saved = { ...process.env };
    try {
      delete process.env.CGM_SYNC_PASSCODE;
      let res = await handler({ httpMethod: "POST", headers: {} });
      expect(JSON.parse(res.body).configured).toBe(false);

      Object.assign(process.env, { CGM_SYNC_PASSCODE: "short", LIBRELINKUP_EMAIL: "x@example.com", LIBRELINKUP_PASSWORD: "x" });
      res = await handler({ httpMethod: "POST", headers: { "x-cgm-passcode": "short" } });
      expect(JSON.parse(res.body).error).toContain("too short");
    } finally {
      process.env = saved;
    }
  });
});
