import { test, expect } from "@playwright/test";
import { createHandler } from "../netlify/functions/food-bank.js";

// The Netlify function with an in-memory store — never touches real Netlify Blobs.
function memoryStore() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
  };
}
const PASS = "test-passcode-123";
const ev = (method, { barcode, body, passcode = PASS } = {}) => ({
  httpMethod: method,
  headers: passcode ? { "x-cgm-passcode": passcode } : {},
  queryStringParameters: barcode ? { barcode } : {},
  body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ status: r.statusCode, ...JSON.parse(r.body) });

test.describe("food bank function", () => {
  test.beforeEach(() => { process.env.CGM_SYNC_PASSCODE = PASS; });
  test.afterAll(() => { delete process.env.CGM_SYNC_PASSCODE; });

  test("not configured without a passcode in Netlify, and refuses a wrong one", async () => {
    const store = memoryStore();
    const h = createHandler(() => store);
    delete process.env.CGM_SYNC_PASSCODE;
    expect(parse(await h(ev("GET"))).configured).toBe(false);
    process.env.CGM_SYNC_PASSCODE = PASS;
    expect(parse(await h(ev("GET", { passcode: "wrong-guess-999" }))).status).toBe(401);
  });

  test("add, read one, read all, delete", async () => {
    const store = memoryStore();
    const h = createHandler(() => store);
    const oj = { barcode: "9326932000187", name: "Hilltop orange juice", carbsPer100g: 9.2, sugarsPer100g: 7.5, servingSizeG: 200 };
    expect(parse(await h(ev("POST", { body: { food: oj } }))).ok).toBe(true);
    expect(parse(await h(ev("GET", { barcode: "9326932000187" }))).food).toMatchObject(oj);
    expect(parse(await h(ev("GET", { barcode: "0000000000000" }))).food).toBeNull();
    expect(parse(await h(ev("GET"))).foods).toHaveLength(1);
    await h(ev("DELETE", { barcode: "9326932000187" }));
    expect(parse(await h(ev("GET"))).foods).toHaveLength(0);
  });

  test("validates like the app, and keeps the newer edit when two devices clash", async () => {
    const store = memoryStore();
    const h = createHandler(() => store);
    const bad = parse(await h(ev("POST", { body: { food: { barcode: "9326932000187", name: "OJ", carbsPer100g: 7, sugarsPer100g: 9 } } })));
    expect(bad.status).toBe(400);
    expect(bad.error).toContain("Sugars can't be more");
    await h(ev("POST", { body: { food: { barcode: "9326932000187", name: "New name", carbsPer100g: 9.2, updatedAt: "2026-09-29T08:00:00Z" } } }));
    const stale = parse(await h(ev("POST", { body: { food: { barcode: "9326932000187", name: "Old name", carbsPer100g: 9.2, updatedAt: "2026-09-28T08:00:00Z" } } })));
    expect(stale.kept).toBe("newer");
    expect(parse(await h(ev("GET", { barcode: "9326932000187" }))).food.name).toBe("New name");
  });

  test("rejects oversized bodies and unknown methods", async () => {
    const h = createHandler(() => memoryStore());
    const big = ev("POST");
    big.body = "x".repeat(20000);
    expect(parse(await h(big)).status).toBe(413);
    expect(parse(await h(ev("PUT"))).status).toBe(405);
  });
});

test.describe("scan lookup chain", () => {
  test("device first, then food bank, then public database — with a stage report", async () => {
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    const originalFetch = global.fetch;
    try {
      const { lookupFood } = await import("../src/foodBank.js");
      const { saveMyFood, getMyFood } = await import("../src/myFoods.js");
      saveMyFood({ barcode: "9310653105719", name: "Blueberry yoghurt", carbsPer100g: 16.5, servingSizeG: 170 });
      const online = async (code) => ({ found: code === "9310232132013", name: "Pura milk", carbsPer100g: 4.5 });

      let stages = [];
      const a = await lookupFood("9310653105719", online, (s) => stages.push(s));
      expect(a).toMatchObject({ found: true, source: "device", servingSizeG: 170 });
      expect(stages).toEqual(["device"]);

      // With the passcode saved, the food bank is asked before the public database, and a hit is kept on the device.
      mem.set("rht-cgm-passcode", "test-passcode-123");
      global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ food: { barcode: "9326932000187", name: "Hilltop OJ", carbsPer100g: 9.2, updatedAt: "2026-09-28T08:00:00Z" } }) });
      stages = [];
      const b = await lookupFood("9326932000187", online, (s) => stages.push(s));
      expect(b).toMatchObject({ found: true, source: "bank", name: "Hilltop OJ" });
      expect(stages).toEqual(["device", "bank"]);
      expect(getMyFood("9326932000187").name).toBe("Hilltop OJ");

      global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ food: null }) });
      stages = [];
      const c = await lookupFood("9310232132013", online, (s) => stages.push(s));
      expect(c).toMatchObject({ found: true, source: "online" });
      expect(stages).toEqual(["device", "bank", "online"]);
      const d = await lookupFood("1111111111116", online);
      expect(d).toMatchObject({ found: false, source: "none" });
    } finally {
      global.fetch = originalFetch;
      delete globalThis.localStorage;
    }
  });
});
