import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { lookupBarcode } from "../src/nutrition.js";
import { productToItem, itemCarbs, mealTotals, mealToText } from "../src/mealBuilder.js";

// Test starter set: real products from Scott's own fridge and pantry (his barcode photos,
// 2026-09-28). By default Open Food Facts is mocked with the snapshot in the fixture, so
// these run offline. RUN_LIVE_OFF=1 re-checks every barcode against the live database and
// fails if one has disappeared or its carb figure changed (the database is crowd-edited).
const fixture = JSON.parse(readFileSync(new URL("./fixtures/scott-pantry-barcodes.json", import.meta.url)));
const byCode = Object.fromEntries(fixture.products.map((p) => [p.barcode, p]));

function mockOffFromSnapshot() {
  const original = global.fetch;
  global.fetch = async (url) => {
    const code = String(url).match(/product\/(\d+)\.json/)[1];
    const p = byCode[code];
    if (!p || !p.off.found) return { ok: true, json: async () => ({ status: 0 }) };
    return {
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: p.off.name,
          brands: p.off.brand,
          nutriments: { carbohydrates_100g: p.off.carbsPer100g ?? undefined, sugars_100g: p.off.sugarsPer100g ?? undefined },
        },
      }),
    };
  };
  return () => { global.fetch = original; };
}

test.describe("Scott's pantry (offline snapshot)", () => {
  test("every barcode resolves the way the database did on the snapshot date", async () => {
    const restore = mockOffFromSnapshot();
    try {
      for (const p of fixture.products) {
        const r = await lookupBarcode(p.barcode);
        expect(r.found, p.photo).toBe(p.off.found);
        if (!r.found) expect(r.error).toContain("describe it yourself");
      }
    } finally { restore(); }
  });

  test("a real breakfast from the fridge adds up, and names what it couldn't count", async () => {
    const restore = mockOffFromSnapshot();
    try {
      const yoghurt = productToItem(await lookupBarcode("9310653105719"));
      const milk = productToItem(await lookupBarcode("9310232132013"));
      const gouda = productToItem(await lookupBarcode("9300601970223"));
      // Portions are the user's to fill in; the app never guesses them.
      expect(itemCarbs(yoghurt)).toBeNull();
      yoghurt.grams = 170;
      milk.grams = 250;
      gouda.grams = 21;
      // Orange juice isn't in the database: typed from the pack (9.2 g/100 ml).
      const oj = { name: "Hilltop orange juice", grams: 200, carbsPer100g: byCode["9326932000187"].label.carbsPer100g };
      const t = mealTotals([yoghurt, milk, gouda, oj]);
      expect(t.carbs).toBe(59.2); // 29.5 yoghurt + 11.3 milk + 18.4 juice
      expect(t.missing).toEqual(["Coles Gouda"]);
      expect(mealToText([yoghurt, milk, gouda, oj])).toContain("(not counting 1 item without carb info)");
    } finally { restore(); }
  });

  test("known database-vs-pack disagreements stay recorded (the pack wins when they differ)", () => {
    const cheddar = byCode["9310645419336"];
    expect(cheddar.off.carbsPer100g).toBeGreaterThan(1);
    expect(cheddar.label.carbsPer100g).toBe("<1");
    // A user who types the pack figure into "Carbs g" overrides the database figure.
    expect(itemCarbs({ grams: 40, carbsPer100g: cheddar.off.carbsPer100g, carbsGrams: 0.4 })).toBe(0.4);
  });
});

test.describe("Scott's pantry (live Open Food Facts, opt-in)", () => {
  test.skip(!process.env.RUN_LIVE_OFF, "set RUN_LIVE_OFF=1 to check against the live database");
  test.setTimeout(300000);
  test("barcodes still resolve and carb figures haven't drifted", async () => {
    const drift = [];
    const unchecked = [];
    const pause = (ms) => new Promise((res) => setTimeout(res, ms));
    for (const p of fixture.products) {
      let r = await lookupBarcode(p.barcode);
      // lookupBarcode reports any failure as found:false. Only "Not in Open Food Facts" is a
      // real answer; anything else (rate limit, network) is retried once, then reported
      // as unchecked rather than as drift.
      const genuine = (x) => x.found || String(x.error).includes("Not in Open Food Facts");
      if (!genuine(r)) { await pause(8000); r = await lookupBarcode(p.barcode); }
      if (!genuine(r)) unchecked.push(`${p.photo}: ${r.error}`);
      else if (r.found !== p.off.found) drift.push(`${p.photo}: found ${p.off.found} → ${r.found}`);
      else if (r.found && r.carbsPer100g != null && p.off.carbsPer100g != null &&
               Math.abs(r.carbsPer100g - p.off.carbsPer100g) > 0.1) {
        drift.push(`${p.photo}: carbs ${p.off.carbsPer100g} → ${r.carbsPer100g}`);
      }
      await pause(3000); // Open Food Facts is a free service with rate limits
    }
    if (unchecked.length) console.log("Couldn't check (not counted as drift):\n" + unchecked.join("\n"));
    expect(drift).toEqual([]);
  });
});
