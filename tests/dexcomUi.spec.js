import { test, expect } from "@playwright/test";

// The Dexcom connect / return / sync flows in the real app, with the Netlify
// function mocked (no Dexcom account is touched).

// Same reason as smoke.spec.js: this test browser reports Web Bluetooth even
// with no adapter, so the unified sync would otherwise stop at the meter prompt.
async function stubNoBluetooth(page) {
  await page.addInitScript(() => {
    const real = navigator;
    const fake = new Proxy(real, {
      has: (target, prop) => (prop === "bluetooth" ? false : prop in target),
      get: (target, prop) => {
        if (prop === "bluetooth") return undefined;
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    Object.defineProperty(window, "navigator", { value: fake, configurable: true });
  });
}

const STATE = "a".repeat(48);

async function mockDexcom(page, handlers) {
  await page.route("**/.netlify/functions/dexcom", async (route) => {
    const body = route.request().postDataJSON();
    const [status, payload] = handlers[body.action](body);
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function seedConnection(page, env = "eu") {
  await page.addInitScript((env) => {
    localStorage.setItem(
      "rht-dexcom-tokens",
      JSON.stringify({ accessToken: "A1", refreshToken: "R1", expiresAt: "2099-01-01T00:00:00Z", env, connectedAt: "2026-10-03T00:00:00Z" })
    );
    // Libre is set up but returns nothing, so the sequence runs straight on to Dexcom.
    localStorage.setItem("rht-cgm-passcode", "test-passcode-123");
  }, env);
  await page.route("**/.netlify/functions/cgm-sync", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, readings: [] }) })
  );
}

function recentReadings() {
  const now = Date.now();
  return [5.2, 4.1].map((value, i) => ({ value, unit: "mmol/L", timestamp: new Date(now - (2 - i) * 5 * 60000).toISOString() }));
}

test.describe("Dexcom ONE+ connection", () => {
  test("Settings shows Connect Dexcom when not connected", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await expect(page.locator("#dexcom-status")).toContainText("Not connected");
    await expect(page.locator("#dexcom-connect-btn")).toBeVisible();
    await expect(page.locator("#dexcom-disconnect-btn")).toBeHidden();
  });

  test("returning from Dexcom with a matching state connects and cleans the code out of the address", async ({ page }) => {
    await page.addInitScript((s) => sessionStorage.setItem("rht-dexcom-state", JSON.stringify(s)), STATE);
    let exchanged = null;
    await mockDexcom(page, {
      exchange: (b) => {
        exchanged = b.code;
        return [200, { configured: true, env: "eu", tokens: { accessToken: "A1", refreshToken: "R1", expiresAt: "2099-01-01T00:00:00Z" } }];
      },
    });
    await page.goto(`/dexcom-callback?code=one-time-code&state=${STATE}`);
    await expect(page.locator("#dexcom-status")).toContainText("Dexcom connected");
    await expect(page.locator("#dexcom-disconnect-btn")).toBeVisible();
    expect(exchanged).toBe("one-time-code");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(page.url()).not.toContain("one-time-code");
  });

  test("a return trip that didn't start in this app is refused and nothing is saved", async ({ page }) => {
    await page.addInitScript((s) => sessionStorage.setItem("rht-dexcom-state", JSON.stringify(s)), STATE);
    let called = false;
    await mockDexcom(page, { exchange: () => ((called = true), [200, {}]) });
    await page.goto(`/dexcom-callback?code=one-time-code&state=${"b".repeat(48)}`);
    await expect(page.locator("#dexcom-status")).toContainText("didn't start from this app");
    await expect(page.locator("#dexcom-connect-btn")).toBeVisible();
    expect(called).toBe(false);
  });

  test("Sync devices pulls Dexcom readings, records the sensor, and skips them the second time", async ({ page }) => {
    await stubNoBluetooth(page);
    await seedConnection(page, "eu");
    const readings = recentReadings();
    await mockDexcom(page, { sync: () => [200, { configured: true, env: "eu", readings, transmitterId: "TX12345" }] });
    await page.goto("/");
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Dexcom: 2 new readings", { timeout: 10000 });
    await expect(page.locator("#home-sync-status")).toContainText("New sensor recorded (…2345)");

    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Dexcom: 0 new readings, 2 already saved", { timeout: 10000 });

    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await expect(page.locator("#device-list")).toContainText("Dexcom ONE+");
    await expect(page.locator("#device-list")).toContainText("…2345");
  });

  test("Dexcom test mode proves the connection but never saves simulated readings", async ({ page }) => {
    await stubNoBluetooth(page);
    await seedConnection(page, "sandbox");
    await mockDexcom(page, { sync: () => [200, { configured: true, env: "sandbox", readings: recentReadings(), transmitterId: "SANDBOX1" }] });
    await page.goto("/");
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Dexcom (test mode): connection works, 2 simulated readings received, not saved", {
      timeout: 10000,
    });
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("rht-db");
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("glucose")) return resolve(0);
            const count = db.transaction("glucose").objectStore("glucose").count();
            count.onsuccess = () => resolve(count.result);
          };
          req.onerror = () => resolve(-1);
        })
    );
    expect(stored).toBe(0);
  });

  test("a rejected Dexcom connection disconnects so Settings offers Connect again", async ({ page }) => {
    await stubNoBluetooth(page);
    await seedConnection(page, "eu");
    await mockDexcom(page, {
      sync: () => [401, { error: "Dexcom no longer accepts this connection — reconnect Dexcom in Settings → My devices.", reconnect: true }],
    });
    await page.goto("/");
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Dexcom: failed — Dexcom no longer accepts this connection", { timeout: 10000 });
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await expect(page.locator("#dexcom-connect-btn")).toBeVisible();
  });
});

test("Libre and Dexcom worn together draw as two separate sensor lines, not one zigzag", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < 12; i++) {
      rows.push({ id: `l${i}`, type: "glucose", sourceId: "librelinkup", value: 5, unit: "mmol/L", note: "", timestamp: new Date(now - (12 - i) * 15 * 60000).toISOString() });
      rows.push({ id: `d${i}`, type: "glucose", sourceId: "dexcom", value: 7, unit: "mmol/L", note: "", timestamp: new Date(now - (12 - i) * 15 * 60000 + 5 * 60000).toISOString() });
    }
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("rht-db", 1);
      // Same schema as src/db.js, in case the app hasn't opened the database yet.
      req.onupgradeneeded = () => {
        for (const store of ["glucose", "food", "diary"]) {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, { keyPath: "id" }).createIndex("timestamp", "timestamp");
        }
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("glucose", "readwrite");
        for (const r of rows) tx.objectStore("glucose").put(r);
        tx.oncomplete = resolve;
        tx.onerror = reject;
      };
      req.onerror = reject;
    });
  });
  await page.locator('button.nav-btn[data-nav="readings"]').click();
  await page.locator('#readings-view-toggle button[data-mode="graph"]').click();
  await expect(page.locator("#readings-graph-container polyline.graph-line")).toHaveCount(2);
  await expect(page.locator("#readings-graph-container .graph-prick")).toHaveCount(0);
});

test.describe("device status lights on Home", () => {
  test("after a good sync, Libre and Dexcom show green lights", async ({ page }) => {
    await stubNoBluetooth(page);
    await seedConnection(page, "eu");
    await mockDexcom(page, { sync: () => [200, { configured: true, env: "eu", readings: recentReadings(), transmitterId: "TX1" }] });
    await page.goto("/");
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Dexcom: 2 new readings", { timeout: 10000 });
    await expect(page.locator('#device-lights [data-device="libre"]')).toHaveClass(/light-green/);
    await expect(page.locator('#device-lights [data-device="dexcom"]')).toHaveClass(/light-green/);
    await expect(page.locator('#device-lights [data-device="meter"]')).toHaveCount(0);
  });

  test("a failed sync turns that device red, and tapping it says why", async ({ page }) => {
    await stubNoBluetooth(page);
    await seedConnection(page, "eu");
    await mockDexcom(page, { sync: () => [502, { error: "Dexcom request failed (503)." }] });
    await page.goto("/");
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Dexcom: failed", { timeout: 10000 });
    const dexcom = page.locator('#device-lights [data-device="dexcom"]');
    await expect(dexcom).toHaveClass(/light-red/);
    await dexcom.click();
    await expect(page.locator("#device-light-detail")).toContainText("Dexcom: last sync failed");
    await expect(page.locator("#device-light-detail")).toContainText("Dexcom request failed (503).");
    // Lights survive a reload.
    await page.reload();
    await expect(page.locator('#device-lights [data-device="libre"]')).toHaveClass(/light-green/);
  });
});
