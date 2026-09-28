// Meal builder: a meal as a list of ingredients, with carbs added up from each
// item's label figures. Plain arithmetic on numbers the user (or a barcode's
// Open Food Facts entry) supplied, never an estimate of what's "safe" to eat,
// and never anything dose-related (see CLAUDE.md's "Descriptive, not
// prescriptive"). Pure functions only, so it can be tested without a browser.

// An item is { name, grams, carbsPer100g, sugarsPer100g, carbsGrams, barcode }.
// Either carbsPer100g (from a label or barcode, scaled by grams) or carbsGrams
// (the user already knows the total for that item) supplies its carbs. ml is
// treated like g, which is how Australian labels quote drinks per 100 ml.

const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function itemCarbs(item) {
  const direct = num(item.carbsGrams);
  if (direct != null) return round1(Math.max(0, direct));
  const grams = num(item.grams);
  const per100 = num(item.carbsPer100g);
  if (grams == null || per100 == null) return null;
  return round1(Math.max(0, (grams * per100) / 100));
}

export function itemSugars(item) {
  const grams = num(item.grams);
  const per100 = num(item.sugarsPer100g);
  if (grams == null || per100 == null) return null;
  return round1(Math.max(0, (grams * per100) / 100));
}

// Totals only count items that have figures; `missing` lists the names of the
// ones that don't, so the UI can say the total is incomplete rather than
// quietly under-reporting.
export function mealTotals(items) {
  let carbs = 0;
  let sugars = 0;
  let sugarsKnown = 0;
  const missing = [];
  for (const item of items) {
    const c = itemCarbs(item);
    if (c == null) missing.push(item.name || "Unnamed item");
    else carbs += c;
    const s = itemSugars(item);
    if (s != null) {
      sugars += s;
      sugarsKnown += 1;
    }
  }
  return { carbs: round1(carbs), sugars: sugarsKnown ? round1(sugars) : null, missing };
}

function itemLine(item) {
  const grams = num(item.grams);
  const c = itemCarbs(item);
  let line = item.name || "Unnamed item";
  if (grams != null) line += ` ${grams}g`;
  line += c != null ? ` (${c}g carbs)` : " (carbs unknown)";
  return line;
}

// The human-readable line saved as the food entry's text, so the timeline, CSV
// export and printed report all show the breakdown without any change to their
// formats. `notes` is whatever the user typed in the description box.
export function mealToText(items, notes = "") {
  const named = items.filter((i) => (i.name || "").trim());
  if (!named.length) return notes.trim();
  const t = mealTotals(named);
  let total = `Total ${t.carbs}g carbs`;
  if (t.missing.length) total += ` (not counting ${t.missing.length} item${t.missing.length > 1 ? "s" : ""} without carb info)`;
  const parts = [named.map(itemLine).join(", "), total];
  const trimmed = notes.trim();
  return trimmed ? `${trimmed} | ${parts.join(" | ")}` : parts.join(" | ");
}

// A barcode product (from nutrition.js lookupBarcode) as a builder item. The
// portion is left empty on purpose: the user weighs or reads it, the app doesn't guess.
export function productToItem(product) {
  return {
    name: product.brand ? `${product.brand} ${product.name}` : product.name,
    grams: "",
    carbsPer100g: product.carbsPer100g ?? "",
    sugarsPer100g: product.sugarsPer100g ?? "",
    carbsGrams: "",
    barcode: product.barcode || "",
    servingSizeG: product.servingSizeG ?? null,
  };
}

export function emptyItem() {
  return { name: "", grams: "", carbsPer100g: "", sugarsPer100g: "", carbsGrams: "", barcode: "" };
}

// What gets stored on the food entry: only rows with a name, numbers as numbers.
export function cleanItems(items) {
  return items
    .filter((i) => (i.name || "").trim())
    .map((i) => ({
      name: i.name.trim(),
      grams: num(i.grams),
      carbsPer100g: num(i.carbsPer100g),
      sugarsPer100g: num(i.sugarsPer100g),
      carbsGrams: num(i.carbsGrams),
      barcode: i.barcode || null,
      servingSizeG: num(i.servingSizeG),
    }));
}

// Portions: after a gastric sleeve a "serve" is often a half or a quarter of
// what the pack calls one. Grams for a fraction of the pack's serving size,
// rounded to whole grams; null when the serving size isn't known.
export const PORTIONS = [
  { label: "¼", fraction: 0.25 },
  { label: "½", fraction: 0.5 },
  { label: "¾", fraction: 0.75 },
  { label: "Full", fraction: 1 },
];

export function portionGrams(servingSizeG, fraction) {
  const s = num(servingSizeG);
  if (s == null || s <= 0) return null;
  return Math.round(s * fraction);
}
