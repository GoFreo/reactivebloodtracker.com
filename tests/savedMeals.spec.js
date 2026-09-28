import { test, expect } from "@playwright/test";
import { listSavedMeals, saveMeal, deleteSavedMeal, mealToBuilderItems } from "../src/savedMeals.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const oats = { name: "Rolled oats", grams: 40, carbsPer100g: 60, sugarsPer100g: null, carbsGrams: null, barcode: null, servingSizeG: 40 };

test.describe("saved meals (pure logic)", () => {
  test("needs a name and at least one ingredient", () => {
    const s = fakeStorage();
    expect(saveMeal("", [oats], s).error).toContain("name");
    expect(saveMeal("Breakfast", [{ name: " " }], s).error).toContain("ingredient");
    expect(saveMeal("  Usual breakfast ", [oats], s).meal.name).toBe("Usual breakfast");
  });

  test("same name replaces; list is alphabetical; delete removes", () => {
    const s = fakeStorage();
    saveMeal("Usual breakfast", [oats], s);
    saveMeal("Afternoon snack", [oats], s);
    saveMeal("usual BREAKFAST", [{ ...oats, grams: 30 }], s);
    expect(listSavedMeals(s).map((m) => m.name)).toEqual(["Afternoon snack", "usual BREAKFAST"]);
    expect(listSavedMeals(s)[1].items[0].grams).toBe(30);
    deleteSavedMeal("Afternoon snack", s);
    expect(listSavedMeals(s)).toHaveLength(1);
  });

  test("loading gives the builder's editable shape", () => {
    expect(mealToBuilderItems({ items: [oats] })).toEqual([
      { name: "Rolled oats", grams: "40", carbsPer100g: "60", sugarsPer100g: "", carbsGrams: "", barcode: "", servingSizeG: 40 },
    ]);
  });
});
