// The made-up patient used by everything that photographs or films the app: the explainer video
// (video/record.mjs) and the pictures in the Help guide (scripts/guide-screenshots.mjs). It is
// built from demo-data-full-fidelity.json, never from anyone's real records.

import { readFileSync } from "node:fs";
import path from "node:path";

// The demo data's three days are 28-30 Sep 2026 (+11:00). The browser's clock is set to the
// evening of the last day, so the app sees them as "today and the two days before", and the
// time zone is pinned so times of day read as recorded.
export const FAKE_NOW = new Date("2026-09-30T23:20:00+11:00");
export const TIMEZONE = "Etc/GMT-11"; // = UTC+11

// Day order is reversed (the worst day becomes "today") so the 24-hour graph opens on a spike and
// crash, and the calm day becomes two days ago. Times of day are untouched. Day 1's evening gets
// an unexplained rise, so Home shows the "what happened?" question, and two diary lines are
// reworded to fit the new order.
export function demoData(root) {
  const raw = JSON.parse(readFileSync(path.join(root, "demo-data-full-fidelity.json"), "utf8"));
  const DAY = 86400000;
  const day0 = Date.parse("2026-09-28T00:00:00+11:00");
  const remap = (ts) => {
    const t = Date.parse(ts);
    const d = Math.floor((t - day0) / DAY);
    return new Date(t + (2 - 2 * d) * DAY).toISOString();
  };
  let n = 0;
  const id = (p) => `demo-${p}-${n++}`;
  const glucose = raw.glucose
    .filter((g) => !(g.timestamp.startsWith("2026-09-28T2") && g.sourceId === "librelinkup" && g.timestamp >= "2026-09-28T21"))
    .map((g) => ({ ...g, id: id("g"), timestamp: remap(g.timestamp) }));
  // Unexplained evening rise on the (new) last day: nothing logged in the two hours before.
  for (const [hhmm, v] of [["21:20", 5.7], ["21:40", 6.6], ["22:00", 8.1], ["22:20", 7.9], ["22:40", 7.0], ["23:00", 6.2]]) {
    glucose.push({ type: "glucose", value: v, unit: "mmol/L", note: "", sourceId: "librelinkup", id: id("g"), timestamp: new Date(`2026-09-30T${hhmm}:00+11:00`).toISOString() });
  }
  const food = raw.food.map((f) => ({ ...f, id: id("f"), timestamp: remap(f.timestamp) }));
  const diary = raw.diary.map((e) => {
    const out = { ...e, id: id("d"), timestamp: remap(e.timestamp) };
    if (e.text.startsWith("Quiet evening")) out.timestamp = new Date("2026-09-30T23:10:00+11:00").toISOString();
    if (e.text.startsWith("Better evening")) out.text = "Settled evening, dinner sat fine.";
    if (e.text.startsWith("Best day this week")) out.text = "Best day in a while - no reactive drops at all.";
    // The demo file's own excursion ids don't match the app's, so leave these as plain notes.
    delete out.excursionId;
    delete out.answer;
    return out;
  });
  return { glucose, food, diary };
}

export const localSettings = {
  "rht-accepted-terms": JSON.stringify({ version: "2026-09-28", acceptedAt: "2026-09-20T09:00:00+11:00" }),
  "rht-profile": JSON.stringify({ name: "", condition: "reactive", careTeam: "" }),
  "rht-thresholds": JSON.stringify({ low: 4, high: 10, unit: "mmol/L" }),
  "rht-graph-range-hours": "24",
  "rht-readings-mode": "list",
  "rht-install-tip-dismissed": "1",
  "rht-cgm-last-sync": "2026-09-30T23:05:00+11:00",
  "rht-devices": JSON.stringify([
    { id: "dev1", type: "librelinkup", serial: "3MH0Q8K2T7", nickname: "", status: "in use", dateAdded: "2026-09-26T08:00:00+11:00" },
    { id: "dev2", type: "librelinkup", serial: "3MH0P41LZ9", nickname: "", status: "failed", dateAdded: "2026-09-22T08:00:00+11:00" },
    { id: "dev3", type: "bluetooth-meter", serial: "92381147", nickname: "Kitchen meter", status: "in use", dateAdded: "2026-09-14T10:00:00+11:00" },
    { id: "dev4", type: "dexcom-one-plus", serial: "", nickname: "", status: "in use", dateAdded: "2026-09-30T10:00:00+11:00" },
  ]),
  "rht-saved-meals": JSON.stringify([
    {
      name: "Usual lunch",
      savedAt: "2026-09-25T12:00:00+11:00",
      items: [
        { name: "Weet-Bix Bars Choc Chip", grams: 40, carbsPer100g: 64, sugarsPer100g: 29, carbsGrams: null, barcode: "9310072012345", servingSizeG: 40 },
        { name: "Chicken & salad wrap", grams: 180, carbsPer100g: 18.5, sugarsPer100g: 2.1, carbsGrams: null, barcode: "", servingSizeG: null },
      ],
    },
  ]),
};

// Loads the demo records straight into the app's own IndexedDB (run inside the app's page).
export async function seedIndexedDB(page, data) {
  await page.evaluate(async (data) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("rht-db", 1);
      req.onupgradeneeded = () => {
        for (const s of ["glucose", "food", "diary"]) {
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: "id" }).createIndex("timestamp", "timestamp");
        }
      };
      req.onsuccess = () => {
        const tx = req.result.transaction(["glucose", "food", "diary"], "readwrite");
        for (const s of ["glucose", "food", "diary"]) for (const row of data[s]) tx.objectStore(s).put(row);
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, data);
}
