import { test, expect } from "@playwright/test";
import {
  validateFood, saveMyFood, getMyFood, deleteMyFood, listMyFoods, lookupWithMyFoods, rememberFromItems, exportMyFoods, importMyFoods,
} from "../src/myFoods.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test.describe("My foods (pure logic)", () => {
  test("validation catches impossible figures and bad barcodes", () => {
    expect(validateFood({ barcode: "9310645419336", name: "Cheddar", carbsPer100g: "0.5", sugarsPer100g: "0.5" }).ok).toBe(true);
    expect(validateFood({ barcode: "12", name: "x" }).error).toContain("6 to 14 digits");
    expect(validateFood({ barcode: "9310645419336", name: " " }).error).toContain("name");
    expect(validateFood({ barcode: "9310645419336", name: "Syrup", carbsPer100g: 180 }).error).toContain("between 0 and 100");
    expect(validateFood({ barcode: "9310645419336", name: "Juice", carbsPer100g: 7, sugarsPer100g: 9 }).error).toContain("Sugars can't be more");
  });

  test("save, get, list (by name), update and delete", () => {
    const s = fakeStorage();
    saveMyFood({ barcode: "9326932000187", name: "Hilltop orange juice", carbsPer100g: 9.2, sugarsPer100g: 7.5 }, s);
    saveMyFood({ barcode: "9311594019018", name: "Primo prosciutto", carbsPer100g: 0.5 }, s);
    expect(listMyFoods(s).map((f) => f.name)).toEqual(["Hilltop orange juice", "Primo prosciutto"]);
    saveMyFood({ barcode: "9311594019018", name: "Primo prosciutto", carbsPer100g: 0.2 }, s);
    expect(getMyFood("9311594019018", s).carbsPer100g).toBe(0.2);
    expect(listMyFoods(s)).toHaveLength(2);
    deleteMyFood("9311594019018", s);
    expect(getMyFood("9311594019018", s)).toBeNull();
  });

  test("a saved product is used before the online database", async () => {
    const s = fakeStorage();
    saveMyFood({ barcode: "9310645419336", name: "Coles Finest Pepper Cheddar", carbsPer100g: 0.5 }, s);
    let online = 0;
    const lookup = async () => { online += 1; return { found: true, name: "online", carbsPer100g: 3.85 }; };
    const r = await lookupWithMyFoods("9310645419336", lookup, s);
    expect(r).toMatchObject({ found: true, fromMyFoods: true, carbsPer100g: 0.5 });
    expect(online).toBe(0);
    await lookupWithMyFoods("9300601970223", lookup, s);
    expect(online).toBe(1);
  });

  test("saving a built meal remembers scanned items with figures, and nothing else", () => {
    const s = fakeStorage();
    const saved = rememberFromItems([
      { name: "Blueberry yoghurt", barcode: "9310653105719", grams: 170, carbsPer100g: 16.5, sugarsPer100g: 15 },
      { name: "Coles Gouda", barcode: "9300601970223", grams: 21, carbsPer100g: null },
      { name: "Banana", grams: 120, carbsPer100g: 20 },
    ], s);
    expect(saved).toBe(1);
    expect(getMyFood("9310653105719", s).carbsPer100g).toBe(16.5);
  });

  test("backup round-trips, and restore keeps the newer entry", () => {
    const a = fakeStorage();
    saveMyFood({ barcode: "9326932000187", name: "Hilltop orange juice", carbsPer100g: 9.2 }, a);
    const backup = exportMyFoods(a);
    const b = fakeStorage();
    expect(importMyFoods(backup, b)).toEqual({ ok: true, added: 1, skipped: 0 });
    expect(getMyFood("9326932000187", b).name).toBe("Hilltop orange juice");
    saveMyFood({ barcode: "9326932000187", name: "OJ (edited later)", carbsPer100g: 9.2 }, b);
    importMyFoods(backup, b); // older backup must not overwrite the newer edit
    expect(getMyFood("9326932000187", b).name).toBe("OJ (edited later)");
    expect(importMyFoods("not json", b).ok).toBe(false);
    expect(importMyFoods('{"kind":"other"}', b).ok).toBe(false);
  });
});
