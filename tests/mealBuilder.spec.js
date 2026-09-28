import { test, expect } from "@playwright/test";
import { itemCarbs, itemSugars, mealTotals, mealToText, productToItem, cleanItems } from "../src/mealBuilder.js";

test.describe("meal builder (pure logic)", () => {
  test("carbs scale from the per-100g label figure", () => {
    expect(itemCarbs({ grams: 40, carbsPer100g: 60 })).toBe(24);
    expect(itemCarbs({ grams: "250", carbsPer100g: "4.8" })).toBe(12);
    expect(itemSugars({ grams: 250, sugarsPer100g: 4.8 })).toBe(12);
  });

  test("a typed carbs figure wins over the label calculation", () => {
    expect(itemCarbs({ grams: 40, carbsPer100g: 60, carbsGrams: 30 })).toBe(30);
    expect(itemCarbs({ carbsGrams: "0" })).toBe(0);
  });

  test("missing amount or label means unknown, not zero", () => {
    expect(itemCarbs({ grams: 40, carbsPer100g: "" })).toBeNull();
    expect(itemCarbs({ grams: "", carbsPer100g: 60 })).toBeNull();
    expect(itemCarbs({ grams: "abc", carbsPer100g: 60 })).toBeNull();
  });

  test("totals add known items and name the unknown ones", () => {
    const t = mealTotals([
      { name: "Oats", grams: 40, carbsPer100g: 60, sugarsPer100g: 1 },
      { name: "Milk", grams: 250, carbsPer100g: 4.8, sugarsPer100g: 4.8 },
      { name: "Whey", grams: 30 },
    ]);
    expect(t.carbs).toBe(36);
    expect(t.sugars).toBe(12.4);
    expect(t.missing).toEqual(["Whey"]);
  });

  test("no sugar figures at all gives null, not 0", () => {
    expect(mealTotals([{ name: "Rice", grams: 100, carbsPer100g: 28 }]).sugars).toBeNull();
  });

  test("saved text keeps the user's notes and lists each item and the total", () => {
    const items = [
      { name: "Oats", grams: 40, carbsPer100g: 60 },
      { name: "Whey", grams: 30 },
    ];
    expect(mealToText(items, "Breakfast ")).toBe(
      "Breakfast | Oats 40g (24g carbs), Whey 30g (carbs unknown) | Total 24g carbs (not counting 1 item without carb info)"
    );
    expect(mealToText([], "just notes")).toBe("just notes");
    expect(mealToText([{ name: "  " }], "")).toBe("");
  });

  test("a barcode product becomes an item with the portion left for the user", () => {
    const item = productToItem({ found: true, barcode: "93", name: "Weet-Bix", brand: "Sanitarium", carbsPer100g: 67, sugarsPer100g: 3.3 });
    expect(item).toMatchObject({ name: "Sanitarium Weet-Bix", grams: "", carbsPer100g: 67, barcode: "93" });
    expect(itemCarbs(item)).toBeNull();
  });

  test("cleanItems drops blank rows and stores numbers", () => {
    expect(cleanItems([{ name: "", grams: "5" }, { name: " Oats ", grams: "40", carbsPer100g: "60", sugarsPer100g: "", carbsGrams: "" }])).toEqual([
      { name: "Oats", grams: 40, carbsPer100g: 60, sugarsPer100g: null, carbsGrams: null, barcode: null },
    ]);
  });
});
