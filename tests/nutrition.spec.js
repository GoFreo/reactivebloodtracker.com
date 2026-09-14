import { test, expect } from "@playwright/test";
import { lookupBarcode, productToFoodText } from "../src/nutrition.js";

// Pure logic + a mocked global fetch — no network call, no browser needed.
// The camera/scanning half of this feature (barcode.js) can't be exercised
// this way (see its own header comment) and needs a real device to confirm.
test.describe("Open Food Facts lookup", () => {
  test("a found product formats into a descriptive food-log line", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: "Coca-Cola", brands: "Coca-Cola", nutriments: { sugars_100g: 10.6, carbohydrates_100g: 10.6 } },
      }),
    });
    try {
      const product = await lookupBarcode("5000112637922");
      expect(product.found).toBe(true);
      expect(productToFoodText(product)).toBe("Coca-Cola Coca-Cola — 10.6g sugar/100g — 10.6g carbs/100g (via barcode 5000112637922)");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("a barcode not in the database degrades to a clear message, not a crash", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 0 }) });
    try {
      const product = await lookupBarcode("0000000000000");
      expect(product.found).toBe(false);
      expect(product.error).toContain("describe it yourself");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("a network failure degrades gracefully instead of throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("network down");
    };
    try {
      const product = await lookupBarcode("123");
      expect(product.found).toBe(false);
      expect(product.error).toContain("Couldn't reach Open Food Facts");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
