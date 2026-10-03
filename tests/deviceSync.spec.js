import { test, expect } from "@playwright/test";
import { createHandler } from "../netlify/functions/data-sync.js";
import { mergeRecords, naturalKey, shardKey, toCloudRecord, validRecord } from "../src/recordMerge.js";
import { recordsToPush, idTime } from "../src/cloudSync.js";

const PASS = "test-passcode-123";

// In-memory Netlify Blobs with ETags, so the "two devices write at once" path
// is real. `interfere` lets a test change a blob between a read and a write.
function memoryStore() {
  const m = new Map();
  let n = 0;
  const store = {
    interfere: null,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k).data) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: JSON.parse(m.get(k).data), etag: m.get(k).etag } : null),
    setJSON: async (k, v, opts = {}) => {
      if (store.interfere) {
        const f = store.interfere;
        store.interfere = null;
        await f();
      }
      const cur = m.get(k);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      m.set(k, { data: JSON.stringify(v), etag: `e${++n}` });
      return { modified: true, etag: `e${n}` };
    },
  };
  return store;
}
const ev = (method, { shard, body, passcode = PASS } = {}) => ({
  httpMethod: method,
  headers: passcode ? { "x-cgm-passcode": passcode } : {},
  queryStringParameters: shard ? { shard } : {},
  body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ status: r.statusCode, ...JSON.parse(r.body) });
const g = (id, ts, extra = {}) => ({ id, type: "glucose", value: 5.5, unit: "mmol/L", timestamp: ts, note: "", sourceId: "manual", ...extra });

test.describe("device sync merge rules (pure logic)", () => {
  test("the same CGM reading pulled on two devices is kept once; hand-typed ones never merge", () => {
    const phone = [g("1-a", "2026-10-03T01:00:00.000Z", { sourceId: "librelinkup" })];
    const mac = [
      g("2-b", "2026-10-03T01:00:00.000Z", { sourceId: "librelinkup" }), // same reading, other id
      g("3-c", "2026-10-03T01:00:00.000Z"), // typed by hand at the same minute
    ];
    const { merged, added } = mergeRecords("glucose", phone, mac);
    expect(added.map((r) => r.id)).toEqual(["3-c"]);
    expect(merged).toHaveLength(2);
    expect(naturalKey("glucose", mac[1])).toBeNull();
    expect(naturalKey("diary", { sourceId: "librelinkup", timestamp: "2026-10-03T01:00:00Z" })).toBeNull();
  });

  test("an id already there is never added twice", () => {
    const a = [g("1-a", "2026-10-03T01:00:00Z")];
    expect(mergeRecords("glucose", a, a).added).toEqual([]);
  });

  test("photos stay on the device; only a flag travels", () => {
    expect(toCloudRecord({ id: "1-a", photoBlob: { big: true }, text: "toast" })).toEqual({ id: "1-a", text: "toast", hadPhoto: true });
    expect(toCloudRecord({ id: "1-a", photoBlob: null, text: "toast" })).toEqual({ id: "1-a", text: "toast" });
  });

  test("monthly shards and record checks", () => {
    expect(shardKey("glucose", { timestamp: "2026-10-03T01:00:00Z" })).toBe("glucose/2026-10");
    expect(shardKey("food", { timestamp: "nonsense" })).toBe("food/undated");
    expect(validRecord("glucose", g("1-a", "2026-10-03T01:00:00Z"))).toBe(true);
    expect(validRecord("photos", g("1-a", "2026-10-03T01:00:00Z"))).toBe(false);
    expect(validRecord("glucose", { id: "1-a" })).toBe(false);
    expect(validRecord("glucose", g("1-a", "2026-10-03T01:00:00Z", { note: "x".repeat(30000) }))).toBe(false);
  });

  test("only records made since the last push are sent again", () => {
    const now = 1_790_000_000_000;
    const recs = [{ id: `${now - 3_600_000}-old` }, { id: `${now + 1000}-new` }, { id: "imported-no-time" }];
    expect(recordsToPush(recs, 0)).toHaveLength(3);
    expect(recordsToPush(recs, now).map((r) => r.id)).toEqual([`${now + 1000}-new`]);
    expect(idTime("1790000000000-ab12cd")).toBe(1790000000000);
    expect(idTime("nope")).toBeNull();
  });
});

test.describe("data-sync function", () => {
  test.beforeEach(() => { process.env.CGM_SYNC_PASSCODE = PASS; });
  test.afterAll(() => { delete process.env.CGM_SYNC_PASSCODE; });

  test("not configured without a Netlify passcode, and refuses a wrong one", async () => {
    const h = createHandler(() => memoryStore());
    delete process.env.CGM_SYNC_PASSCODE;
    expect(parse(await h(ev("GET"))).configured).toBe(false);
    process.env.CGM_SYNC_PASSCODE = PASS;
    expect(parse(await h(ev("GET", { passcode: "wrong-guess-999" }))).status).toBe(401);
  });

  test("records go up, the index shows which month changed, and come back down", async () => {
    const h = createHandler(memoryStore);
    const store = memoryStore();
    const hs = createHandler(() => store);
    const up = parse(await hs(ev("POST", { body: { store: "glucose", records: [g("1-a", "2026-10-03T01:00:00Z"), g("2-b", "2026-09-30T01:00:00Z")] } })));
    expect(up).toMatchObject({ ok: true, added: 2 });
    expect(Object.keys(up.index).sort()).toEqual(["glucose/2026-09", "glucose/2026-10"]);
    const again = parse(await hs(ev("POST", { body: { store: "glucose", records: [g("1-a", "2026-10-03T01:00:00Z")] } })));
    expect(again.added).toBe(0);
    expect(again.index["glucose/2026-10"].updatedAt).toBe(up.index["glucose/2026-10"].updatedAt); // nothing changed
    expect(parse(await hs(ev("GET", { shard: "glucose/2026-10" }))).records.map((r) => r.id)).toEqual(["1-a"]);
    expect(parse(await hs(ev("GET", { shard: "../secrets" }))).status).toBe(400);
    expect(parse(await h(ev("POST", { body: { store: "glucose", records: [{ id: "x" }] } }))).status).toBe(400);
    expect(parse(await h(ev("POST", { body: { store: "photos", records: [] } }))).status).toBe(400);
  });

  test("two devices writing the same month at once both keep their records", async () => {
    const store = memoryStore();
    const h = createHandler(() => store);
    await h(ev("POST", { body: { store: "diary", records: [{ id: "1-a", text: "first", timestamp: "2026-10-03T01:00:00Z" }] } }));
    // The other device's write lands between this request's read and its write.
    store.interfere = () => h(ev("POST", { body: { store: "diary", records: [{ id: "2-b", text: "mac", timestamp: "2026-10-03T02:00:00Z" }] } }));
    await h(ev("POST", { body: { store: "diary", records: [{ id: "3-c", text: "phone", timestamp: "2026-10-03T03:00:00Z" }] } }));
    const ids = parse(await h(ev("GET", { shard: "diary/2026-10" }))).records.map((r) => r.id).sort();
    expect(ids).toEqual(["1-a", "2-b", "3-c"]);
  });
});

test.describe("Keep my devices in sync (two devices, one shared store)", () => {
  test.beforeEach(() => { process.env.CGM_SYNC_PASSCODE = PASS; });
  test.afterAll(() => { delete process.env.CGM_SYNC_PASSCODE; });

  async function device(browser, handler, baseURL) {
    const context = await browser.newContext({
      baseURL,
      serviceWorkers: "block",
      storageState: {
        cookies: [],
        origins: [{
          origin: "http://localhost:4173",
          localStorage: [
            { name: "rht-accepted-terms", value: JSON.stringify({ version: "2026-09-28", acceptedAt: "2026-09-28T00:00:00Z" }) },
            { name: "rht-cgm-passcode", value: PASS },
          ],
        }],
      },
    });
    await context.route("**/.netlify/functions/data-sync**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const res = await handler({
        httpMethod: req.method(),
        headers: { "x-cgm-passcode": req.headers()["x-cgm-passcode"] },
        queryStringParameters: Object.fromEntries(url.searchParams),
        body: req.postData() || undefined,
      });
      await route.fulfill({ status: res.statusCode, contentType: "application/json", body: res.body });
    });
    const page = await context.newPage();
    await page.goto("/");
    return { context, page };
  }

  async function switchOn(page) {
    await page.locator("nav [data-nav='settings']").first().click();
    await page.locator("#cloud-sync-enabled").check();
    await expect(page.locator("#cloud-sync-status")).toContainText(/On\. Sent \d+, received \d+/);
  }

  test("off by default; a reading saved on the phone shows up on the Mac", async ({ browser, baseURL }) => {
    const store = memoryStore();
    const handler = createHandler(() => store);
    const phone = await device(browser, handler, baseURL);
    const mac = await device(browser, handler, baseURL);

    await phone.page.locator("nav [data-nav='settings']").first().click();
    await expect(phone.page.locator("#cloud-sync-enabled")).not.toBeChecked();
    await expect(phone.page.locator("#cloud-sync-status")).toContainText("Off");

    await switchOn(phone.page);
    await phone.page.locator("nav [data-nav='home']").first().click();
    await phone.page.locator("#glucose-value").fill("6.4");
    await phone.page.locator('#glucose-form button[type="submit"]').click();
    // Shared a few seconds after saving.
    await expect.poll(async () => (await store.get("index")) && Object.keys(await store.get("index")).length, { timeout: 10_000 }).toBe(1);

    await switchOn(mac.page);
    await expect(mac.page.locator("#cloud-sync-status")).toContainText("received 1");
    await mac.page.locator("nav [data-nav='home']").first().click();
    await expect(mac.page.locator("#latest-reading-value")).toHaveText("6.4");

    await phone.context.close();
    await mac.context.close();
  });

  test("the Help button sits at the top left of the opening page", async ({ page }) => {
    await page.goto("/");
    const help = page.locator("#header-tour-btn");
    await expect(help).toBeVisible();
    await expect(help).toContainText("Help");
    const helpBox = await help.boundingBox();
    const titleBox = await page.locator("#view-title").boundingBox();
    expect(helpBox.x).toBeLessThan(titleBox.x);
    await help.click();
    await expect(page.locator("#view-tour")).toBeVisible();
  });
});
