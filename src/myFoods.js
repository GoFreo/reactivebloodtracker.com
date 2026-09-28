// "My foods": products the user has checked against the pack, kept on this
// device only (localStorage, never uploaded — CLAUDE.md privacy principle 1).
// A barcode scan looks here first, then Open Food Facts, so a product the
// database lacks or has wrong only needs fixing once. Figures are per 100 g
// (or 100 ml) as printed on Australian labels.

const KEY = "rht-my-foods";

function store(storage) {
  return storage || globalThis.localStorage;
}

function readAll(storage) {
  try {
    const parsed = JSON.parse(store(storage).getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all, storage) {
  store(storage).setItem(KEY, JSON.stringify(all));
}

const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// Returns { ok: true, food } or { ok: false, error }. Per-100 g figures can't
// be negative or above 100, which catches a per-serve figure typed by mistake
// only when it's impossible, not every slip — the hint in the form covers the rest.
export function validateFood({ barcode, name, carbsPer100g, sugarsPer100g }) {
  const code = String(barcode || "").trim();
  if (!/^\d{6,14}$/.test(code)) return { ok: false, error: "The barcode should be 6 to 14 digits." };
  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "Give it a name." };
  const carbs = num(carbsPer100g);
  const sugars = num(sugarsPer100g);
  for (const [label, v] of [["Carbs", carbs], ["Sugars", sugars]]) {
    if (v != null && (v < 0 || v > 100)) return { ok: false, error: `${label} per 100 g must be between 0 and 100.` };
  }
  if (carbs != null && sugars != null && sugars > carbs) {
    return { ok: false, error: "Sugars can't be more than total carbs (sugars are part of the carbs)." };
  }
  return { ok: true, food: { barcode: code, name: cleanName, carbsPer100g: carbs, sugarsPer100g: sugars } };
}

export function saveMyFood(input, storage) {
  const v = validateFood(input);
  if (!v.ok) return v;
  const all = readAll(storage);
  all[v.food.barcode] = { ...v.food, updatedAt: new Date().toISOString() };
  writeAll(all, storage);
  return { ok: true, food: all[v.food.barcode] };
}

export function getMyFood(barcode, storage) {
  return readAll(storage)[String(barcode).trim()] || null;
}

export function deleteMyFood(barcode, storage) {
  const all = readAll(storage);
  delete all[String(barcode).trim()];
  writeAll(all, storage);
}

export function listMyFoods(storage) {
  return Object.values(readAll(storage)).sort((a, b) => a.name.localeCompare(b.name));
}

// Same result shape as nutrition.js lookupBarcode, so callers don't care where
// the figures came from; `fromMyFoods` lets the UI say so.
export async function lookupWithMyFoods(barcode, lookupFn, storage) {
  const mine = getMyFood(barcode, storage);
  if (mine) {
    return { found: true, fromMyFoods: true, barcode: mine.barcode, name: mine.name, brand: "", carbsPer100g: mine.carbsPer100g, sugarsPer100g: mine.sugarsPer100g };
  }
  return lookupFn(barcode);
}

// After a built meal is saved: remember every scanned ingredient that has a
// per-100 g carbs figure, including any the user corrected from the pack.
// Items without a barcode or without figures are skipped; nothing is guessed.
export function rememberFromItems(items, storage) {
  let saved = 0;
  for (const item of items) {
    if (!item.barcode || num(item.carbsPer100g) == null) continue;
    if (saveMyFood({ barcode: item.barcode, name: item.name, carbsPer100g: item.carbsPer100g, sugarsPer100g: item.sugarsPer100g }, storage).ok) saved += 1;
  }
  return saved;
}

// Backup: a plain JSON file the user downloads and can restore on this or
// another device. Restore merges; for a barcode in both, the newer entry wins.
export function exportMyFoods(storage) {
  return JSON.stringify({ app: "reactivebloodtracker", kind: "my-foods", version: 1, foods: listMyFoods(storage) }, null, 2);
}

export function importMyFoods(text, storage) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a My foods backup." };
  }
  if (data?.kind !== "my-foods" || !Array.isArray(data.foods)) return { ok: false, error: "That file isn't a My foods backup." };
  const all = readAll(storage);
  let added = 0;
  let skipped = 0;
  for (const f of data.foods) {
    const v = validateFood(f);
    if (!v.ok) { skipped += 1; continue; }
    const existing = all[v.food.barcode];
    if (existing && existing.updatedAt && f.updatedAt && existing.updatedAt >= f.updatedAt) continue;
    all[v.food.barcode] = { ...v.food, updatedAt: f.updatedAt || new Date().toISOString() };
    added += 1;
  }
  writeAll(all, storage);
  return { ok: true, added, skipped };
}
