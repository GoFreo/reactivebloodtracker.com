// Client for netlify/functions/food-bank.js — the household's shared product
// list. Uses the sync passcode already saved in Settings (the same one as the
// Libre sync). Without it, or offline, everything falls back to the device's
// own copy (myFoods.js), so scanning never depends on the internet.
import { getSavedPasscode } from "./libreLinkUp.js";
import { getMyFood, mergeFoods } from "./myFoods.js";

const URL_BASE = "/.netlify/functions/food-bank";

export function foodBankAvailable() {
  return !!getSavedPasscode();
}

async function call(method, { barcode, body } = {}) {
  const passcode = getSavedPasscode();
  if (!passcode) return { ok: false, off: true, error: "Food bank is off: save the sync passcode in Settings to share across devices." };
  const url = barcode ? `${URL_BASE}?barcode=${encodeURIComponent(barcode)}` : URL_BASE;
  try {
    const res = await fetch(url, {
      method,
      headers: { "x-cgm-passcode": passcode, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: "The food bank only works on the live site." };
    if (res.status === 401) return { ok: false, error: "Wrong sync passcode — check it in Settings." };
    if (data.configured === false || !res.ok) return { ok: false, error: data.error || `Food bank error (${res.status}).` };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Couldn't reach the food bank (offline?). Saved on this device; it will share next time." };
  }
}

export const fetchFoodBank = () => call("GET");
export const pushToFoodBank = (food) => call("POST", { body: { food } });
export const deleteFromFoodBank = (barcode) => call("DELETE", { barcode });

// Pulls the whole bank into the device copy. Returns { ok, changed } or { ok: false, error }.
export async function syncFoodBank() {
  const r = await fetchFoodBank();
  if (!r.ok) return r;
  return { ok: true, changed: mergeFoods(r.foods), total: r.foods.length };
}

// The scan lookup chain, reporting each stage so the scanner can say what it's
// doing: this device → the food bank → Open Food Facts. A food-bank hit is also
// copied to the device, so the next scan is instant and works offline.
export async function lookupFood(barcode, lookupOnline, onStage = () => {}) {
  onStage("device");
  const mine = getMyFood(barcode);
  if (mine) return { found: true, source: "device", barcode: mine.barcode, name: mine.name, brand: "", carbsPer100g: mine.carbsPer100g, sugarsPer100g: mine.sugarsPer100g, servingSizeG: mine.servingSizeG ?? null };
  if (foodBankAvailable()) {
    onStage("bank");
    const r = await call("GET", { barcode });
    if (r.ok && r.food) {
      mergeFoods([r.food]);
      return { found: true, source: "bank", barcode, name: r.food.name, brand: "", carbsPer100g: r.food.carbsPer100g, sugarsPer100g: r.food.sugarsPer100g, servingSizeG: r.food.servingSizeG ?? null };
    }
  }
  onStage("online");
  const p = await lookupOnline(barcode);
  return p.found ? { ...p, source: "online" } : { ...p, source: "none" };
}

export const STAGE_TEXT = {
  device: "checking your foods on this phone…",
  bank: "checking your food bank…",
  online: "checking the public food database…",
};
