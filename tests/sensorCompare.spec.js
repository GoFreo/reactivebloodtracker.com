import { test, expect } from "@playwright/test";
import { valueAt, isClose, compareRows, summarise, buildCompareHTML } from "../src/sensorCompare.js";

const MIN = 60000;
const T0 = Date.parse("2026-10-03T05:00:00Z");
const at = (m) => new Date(T0 + m * MIN).toISOString();
const r = (sourceId, m, value, unit = "mmol/L") => ({ id: `${sourceId}-${m}`, type: "glucose", sourceId, value, unit, note: "", timestamp: at(m) });

test.describe("sensor comparison (pure logic)", () => {
  test("a sensor's value at a finger-prick: between two readings, nearest, or none", () => {
    const series = [{ t: T0, v: 4.0 }, { t: T0 + 15 * MIN, v: 5.5 }, { t: T0 + 120 * MIN, v: 6.0 }];
    expect(valueAt(series, T0 + 5 * MIN)).toBeCloseTo(4.5); // straight line between 4.0 and 5.5
    expect(valueAt(series, T0 + 15 * MIN)).toBe(5.5);
    expect(valueAt(series, T0 + 24 * MIN)).toBe(5.5); // gap too long to bridge; nearest is 9 min away
    expect(valueAt(series, T0 + 60 * MIN)).toBeNull(); // nothing within 10 min
    expect(valueAt([], T0)).toBeNull();
  });

  test("close agreement: 0.8 mmol/L under 5.6, 15% above", () => {
    expect(isClose(4.6, 3.8)).toBe(true);
    expect(isClose(4.8, 3.8)).toBe(false);
    expect(isClose(11.4, 10)).toBe(true);
    expect(isClose(11.6, 10)).toBe(false);
  });

  test("this morning's case: Libre low, Dexcom close, finger-prick decides", () => {
    const glucose = [
      r("librelinkup", 0, 3.6), r("librelinkup", 15, 3.5),
      r("dexcom", 5, 4.8), r("dexcom", 10, 4.7),
      r("bluetooth-meter", 7, 4.9),
      r("manual", 300, 6.0), // no sensor near it
    ];
    const rows = compareRows(glucose);
    expect(rows).toHaveLength(2);
    const morning = rows.find((x) => x.raw.sourceId === "bluetooth-meter");
    expect(morning.closest).toBe("dexcom");
    expect(morning.sensors.librelinkup.close).toBe(false);
    expect(morning.sensors.dexcom.close).toBe(true);
    expect(rows.find((x) => x.raw.sourceId === "manual").sensors.dexcom).toBeNull();

    const s = summarise(rows);
    expect(s.dexcom.n).toBe(1);
    expect(s.dexcom.closestCount).toBe(1);
    expect(s.librelinkup.bias).toBeLessThan(0); // reads low
    expect(s.librelinkup.closePct).toBe(0);
  });

  test("mg/dL readings are compared on the same scale", () => {
    const rows = compareRows([r("dexcom", 0, 90, "mg/dL"), r("dexcom", 10, 90, "mg/dL"), r("manual", 5, 5.0)]);
    expect(rows[0].sensors.dexcom.v).toBeCloseTo(4.99, 1);
  });

  test("the view explains an empty range and a too-recent Dexcom", () => {
    const now = T0 + 60 * MIN;
    expect(buildCompareHTML([], { now })).toContain("No finger-pricks in this range");
    expect(buildCompareHTML([r("manual", 55, 5)], { now })).toContain("about 3 hours late");
  });
});

test("Readings → Compare shows the three together and which sensor was closer", async ({ page }) => {
  await page.goto("/");
  const now = Date.now();
  const iso = (minsAgo) => new Date(now - minsAgo * MIN).toISOString();
  const rows = [
    ...[90, 75, 60, 45].map((m, i) => ({ id: `l${i}`, type: "glucose", sourceId: "librelinkup", value: 3.6, unit: "mmol/L", note: "", timestamp: iso(m) })),
    ...[90, 85, 80, 75, 70, 65, 60].map((m, i) => ({ id: `d${i}`, type: "glucose", sourceId: "dexcom", value: 4.8, unit: "mmol/L", note: "", timestamp: iso(m) })),
    { id: "p1", type: "glucose", sourceId: "bluetooth-meter", value: 4.9, unit: "mmol/L", note: "", timestamp: iso(72) },
  ];
  await page.evaluate(
    (rows) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("rht-db", 1);
        req.onupgradeneeded = () => {
          for (const s of ["glucose", "food", "diary"]) {
            if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: "id" }).createIndex("timestamp", "timestamp");
          }
        };
        req.onsuccess = () => {
          const tx = req.result.transaction("glucose", "readwrite");
          for (const r of rows) tx.objectStore("glucose").put(r);
          tx.oncomplete = resolve;
          tx.onerror = reject;
        };
        req.onerror = reject;
      }),
    rows
  );
  await page.locator("nav [data-nav='readings']").first().click();
  await page.locator('#readings-view-toggle [data-mode="compare"]').click();
  const box = page.locator("#compare-container");
  await expect(box.locator("polyline.cmp-libre")).toHaveCount(1);
  await expect(box.locator("polyline.cmp-dexcom")).toHaveCount(1);
  await expect(box.locator(".graph-prick")).toHaveCount(1);
  await expect(box.locator(".cmp-rows tbody tr")).toHaveCount(1);
  await expect(box.locator(".cmp-rows .cmp-best")).toContainText("4.8");
  await expect(box.locator(".cmp-summary")).toContainText("Closest of the sensors");
  await expect(page.locator("#timeline-list")).toBeHidden();
  await expect(page.locator("#readings-graph-wrap")).toBeHidden();
});
