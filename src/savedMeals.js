// Saved meals: a built meal kept under a name ("Usual breakfast") so it can be
// loaded again in one tap, then adjusted. Stored on this device only. Items are
// the meal builder's cleaned items (see mealBuilder.cleanItems).

const KEY = "rht-saved-meals";

function store(storage) {
  return storage || globalThis.localStorage;
}

function readAll(storage) {
  try {
    const v = JSON.parse(store(storage).getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function listSavedMeals(storage) {
  return readAll(storage).sort((a, b) => a.name.localeCompare(b.name));
}

// Same name (ignoring case) replaces the earlier version, so re-saving updates it.
export function saveMeal(name, items, storage) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Give the meal a name, e.g. Usual breakfast." };
  const named = (items || []).filter((i) => (i.name || "").trim());
  if (!named.length) return { ok: false, error: "Add at least one ingredient first." };
  const all = readAll(storage).filter((m) => m.name.toLowerCase() !== clean.toLowerCase());
  const meal = { name: clean, items: named, savedAt: new Date().toISOString() };
  all.push(meal);
  store(storage).setItem(KEY, JSON.stringify(all));
  return { ok: true, meal };
}

export function deleteSavedMeal(name, storage) {
  const all = readAll(storage).filter((m) => m.name !== name);
  store(storage).setItem(KEY, JSON.stringify(all));
}

// A fresh, editable copy of the items, in the builder's own shape (its inputs
// hold strings, so numbers become strings and missing figures become "").
const asInput = (v) => (v == null ? "" : String(v));

export function mealToBuilderItems(meal) {
  return meal.items.map((i) => ({
    name: i.name,
    grams: asInput(i.grams),
    carbsPer100g: asInput(i.carbsPer100g),
    sugarsPer100g: asInput(i.sugarsPer100g),
    carbsGrams: asInput(i.carbsGrams),
    barcode: i.barcode || "",
    servingSizeG: i.servingSizeG ?? null,
  }));
}
