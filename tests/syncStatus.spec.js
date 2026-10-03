import { test, expect } from "@playwright/test";
import { recordSyncResult, getSyncStatus, lightFor, forgetSyncResult, FRESH_HOURS } from "../src/syncStatus.js";

// Device status lights (Scott, 2026-10-03): green = working recently, amber =
// worked but not lately, red = last try failed, grey = not set up.
function memoryStorage() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v), removeItem: (k) => delete data[k] };
}

test.describe("device status lights (pure logic)", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();

  test("grey when never synced, pulsing while syncing", () => {
    expect(lightFor(undefined, { now })).toBe("grey");
    expect(lightFor({ ok: false, at: hoursAgo(1) }, { syncing: true, now })).toBe("syncing");
  });

  test("green when it worked recently, amber once it's older than the fresh window", () => {
    expect(lightFor({ ok: true, at: hoursAgo(1), lastOkAt: hoursAgo(1) }, { now })).toBe("green");
    expect(lightFor({ ok: true, at: hoursAgo(FRESH_HOURS + 1), lastOkAt: hoursAgo(FRESH_HOURS + 1) }, { now })).toBe("amber");
  });

  test("red when the last attempt failed, even if an earlier one worked", () => {
    const storage = memoryStorage();
    recordSyncResult("meter", { ok: true, at: hoursAgo(2) }, storage);
    const entry = recordSyncResult("meter", { ok: false, message: "the meter stopped responding", at: hoursAgo(1) }, storage);
    expect(lightFor(entry, { now })).toBe("red");
    expect(entry.lastOkAt).toBe(hoursAgo(2));
    expect(entry.message).toBe("the meter stopped responding");
  });

  test("a later success turns it green again; forgetting removes the light", () => {
    const storage = memoryStorage();
    recordSyncResult("dexcom", { ok: false, message: "x", at: hoursAgo(3) }, storage);
    recordSyncResult("dexcom", { ok: true, at: hoursAgo(1) }, storage);
    expect(lightFor(getSyncStatus(storage).dexcom, { now })).toBe("green");
    forgetSyncResult("dexcom", storage);
    expect(getSyncStatus(storage).dexcom).toBeUndefined();
  });
});
