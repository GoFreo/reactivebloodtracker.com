// Food bank: the household's shared list of products checked against the pack
// (name, carbs/sugars per 100 g, serving size), stored in Netlify Blobs so the
// phone, the Mac and family devices all see the same list. Product facts only:
// no glucose readings, meals or anything about the person are ever sent here.
//
// Locked with the same passcode as the Libre sync (CGM_SYNC_PASSCODE), sent in
// the x-cgm-passcode header, so there's no second secret to set up. Phase 1 is
// one household; a public version will need real per-household accounts.
//
//   GET                  → { foods: [...] }   whole list (the app keeps a copy)
//   GET ?barcode=123     → { food: {...} | null }
//   POST { food }        → { ok: true, food }  add or update (validated)
//   DELETE ?barcode=123  → { ok: true }
import { getStore } from "@netlify/blobs";
import { passcodeMatches } from "./cgm-sync.js";
import { validateFood } from "../../src/myFoods.js";

const MIN_PASSCODE_LENGTH = 8;
const MAX_BODY_BYTES = 10_000;
const MAX_FOODS = 20_000;
const KEY = "catalogue";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

// `openStore` is injectable so tests can use an in-memory store.
export function createHandler(openStore = () => getStore("food-bank")) {
  return async (event) => {
    const expected = process.env.CGM_SYNC_PASSCODE;
    if (!expected) return json(200, { configured: false, error: "The food bank needs the sync passcode set in Netlify (CGM_SYNC_PASSCODE)." });
    if (expected.length < MIN_PASSCODE_LENGTH) {
      return json(200, { configured: false, error: `The sync passcode saved in Netlify is too short — use at least ${MIN_PASSCODE_LENGTH} characters.` });
    }
    if (!passcodeMatches(event.headers?.["x-cgm-passcode"], expected)) {
      await new Promise((r) => setTimeout(r, 1000));
      return json(401, { error: "Wrong sync passcode." });
    }

    const store = openStore();
    const all = (await store.get(KEY, { type: "json" })) || {};
    const barcode = event.queryStringParameters?.barcode ? String(event.queryStringParameters.barcode).trim() : "";

    if (event.httpMethod === "GET") {
      if (barcode) return json(200, { food: all[barcode] || null });
      return json(200, { foods: Object.values(all) });
    }

    if (event.httpMethod === "POST") {
      if ((event.body || "").length > MAX_BODY_BYTES) return json(413, { error: "Too large." });
      let food;
      try {
        food = JSON.parse(event.body || "{}").food;
      } catch {
        return json(400, { error: "Invalid JSON." });
      }
      const v = validateFood(food || {});
      if (!v.ok) return json(400, { error: v.error });
      if (!all[v.food.barcode] && Object.keys(all).length >= MAX_FOODS) return json(507, { error: "The food bank is full." });
      // Keep the newer copy if two devices edit the same product.
      const incomingAt = typeof food.updatedAt === "string" ? food.updatedAt : new Date().toISOString();
      const existing = all[v.food.barcode];
      if (existing && existing.updatedAt && existing.updatedAt > incomingAt) return json(200, { ok: true, food: existing, kept: "newer" });
      all[v.food.barcode] = { ...v.food, updatedAt: incomingAt };
      await store.setJSON(KEY, all);
      return json(200, { ok: true, food: all[v.food.barcode] });
    }

    if (event.httpMethod === "DELETE") {
      if (!barcode) return json(400, { error: "Which barcode?" });
      delete all[barcode];
      await store.setJSON(KEY, all);
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  };
}

export const handler = createHandler();
