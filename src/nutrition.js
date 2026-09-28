// Open Food Facts: free, open, no API key — already the brief's own §6
// recommendation (see HANDOVER.md) and permissively licensed, unlike
// SparkyFitness (custom non-commercial license — never copy its source, see
// HANDOVER.md's "Corrected brief (v2)" entry). Global database with real
// Australian-market product coverage, which is what a barcode scan mostly
// needs — packaged/branded goods, not generic home-cooked food.
const API_BASE = "https://world.openfoodfacts.org/api/v2/product";

// Returns { found: true, name, brand, sugarsPer100g, carbsPer100g, barcode } or
// { found: false, barcode, error }. Never throws — a lookup failure should
// degrade to "describe it yourself", the same pattern as the AI proxy.
export async function lookupBarcode(barcode) {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments`);
    // Open Food Facts answers 404 for a product it doesn't have (seen 2026-09-28 with real
    // pantry barcodes), so that's "not in the database", not a failed lookup.
    if (res.status === 404) {
      return { found: false, barcode, error: "Not in Open Food Facts — describe it yourself instead." };
    }
    if (!res.ok) return { found: false, barcode, error: `Lookup failed (${res.status})` };
    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      return { found: false, barcode, error: "Not in Open Food Facts — describe it yourself instead." };
    }
    const p = data.product;
    return {
      found: true,
      barcode,
      name: p.product_name || "Unknown product",
      brand: p.brands || "",
      sugarsPer100g: p.nutriments?.sugars_100g ?? null,
      carbsPer100g: p.nutriments?.carbohydrates_100g ?? null,
    };
  } catch {
    return { found: false, barcode, error: "Couldn't reach Open Food Facts — check your connection, or describe the item yourself." };
  }
}

// Turns a found product into the food-log text line — descriptive facts only
// (this app's own rule: show what's in it, never estimate a "safe" portion).
export function productToFoodText(product) {
  const parts = [product.brand ? `${product.brand} ${product.name}` : product.name];
  if (product.sugarsPer100g != null) parts.push(`${product.sugarsPer100g}g sugar/100g`);
  if (product.carbsPer100g != null) parts.push(`${product.carbsPer100g}g carbs/100g`);
  return `${parts.join(" — ")} (via barcode ${product.barcode})`;
}
