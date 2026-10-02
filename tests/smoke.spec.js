import { test, expect } from "@playwright/test";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Unlike real Safari/iPhone (which never implements Web Bluetooth at all),
// this test browser's `navigator.bluetooth` exists as an API surface even
// with no real adapter — isBluetoothAvailable() sees it as present, so the
// unified Sync button's sequence would otherwise always continue into the
// Bluetooth manual-action prompt after Libre. Tests that are only exercising
// the Libre/LibreLinkUp side call this first to behave like a Bluetooth-less
// browser, same as the original (pre-unification) assumption these tests
// were written against. Tests that specifically cover the two-device
// sequence deliberately don't call this.
async function stubNoBluetooth(page) {
  await page.addInitScript(() => {
    // isBluetoothAvailable() checks `"bluetooth" in navigator` — Chrome
    // defines `bluetooth` on Navigator.prototype even with no real adapter,
    // so just overwriting its *value* (e.g. to undefined) leaves the *key*
    // present and the `in` check still true. A Proxy intercepting `has`
    // directly is what's actually needed to make the key disappear.
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

// Hand-built minimal JPEG/EXIF bytes carrying one DateTimeOriginal tag — same
// construction as tests/photoImport.spec.js's unit test, reused here so the
// UI-level import flow is exercised against a real (if tiny) file, not a mock.
function buildJpegWithExifDate(dateString) {
  const buf = new ArrayBuffer(78);
  const v = new DataView(buf);
  v.setUint16(0, 0xffd8);
  v.setUint16(2, 0xffe1);
  v.setUint16(4, 0x0048);
  v.setUint32(6, 0x45786966);
  v.setUint16(10, 0x0000);
  const tiffStart = 12;
  v.setUint16(tiffStart, 0x4949, true);
  v.setUint16(tiffStart + 2, 0x002a, true);
  v.setUint32(tiffStart + 4, 8, true);
  v.setUint16(tiffStart + 8, 1, true);
  v.setUint16(tiffStart + 10, 0x8769, true);
  v.setUint16(tiffStart + 12, 4, true);
  v.setUint32(tiffStart + 14, 1, true);
  v.setUint32(tiffStart + 18, 26, true);
  v.setUint32(tiffStart + 22, 0, true);
  v.setUint16(tiffStart + 26, 1, true);
  v.setUint16(tiffStart + 28, 0x9003, true);
  v.setUint16(tiffStart + 30, 2, true);
  v.setUint32(tiffStart + 32, 20, true);
  v.setUint32(tiffStart + 36, 44, true);
  v.setUint32(tiffStart + 40, 0, true);
  const bytes = new TextEncoder().encode(`${dateString}\0`);
  for (let i = 0; i < bytes.length; i++) v.setUint8(56 + i, bytes[i]);
  v.setUint16(76, 0xffda);
  return Buffer.from(buf);
}

// Real files on disk, not in-memory buffers — setInputFiles with an inline
// buffer never resolves on WebKit's Playwright driver (the exact same gotcha
// already worked around below for CSV import); a real path is reliable on
// all four projects.
async function writeTempJpeg(dateString, filename) {
  const dir = await mkdtemp(path.join(tmpdir(), "rht-photo-"));
  const filePath = path.join(dir, filename);
  await writeFile(filePath, buildJpegWithExifDate(dateString));
  return filePath;
}

// A CGM rise of 5.0 → 9.8 mmol/L over the last hour, relative to "now" so it
// always counts as recent. Used by the spike-prompt tests.
async function mockSpikySync(page) {
  const now = Date.now();
  const values = [5.0, 5.1, 7.5, 9.8];
  const readings = values.map((v, i) => ({
    value: v,
    unit: "mmol/L",
    timestamp: new Date(now - (values.length - 1 - i) * 15 * 60000).toISOString(),
  }));
  await page.route("**/.netlify/functions/cgm-sync", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, readings }) })
  );
}

async function syncCgm(page) {
  await stubNoBluetooth(page);
  await page.goto("/");
  // Save the passcode via Settings ahead of time so the unified Sync button
  // (Home) doesn't need to pause for the inline passcode prompt — that pause
  // itself is covered by its own "CGM sync from Home" tests below.
  await page.locator('button.nav-btn[data-nav="settings"]').click();
  await page.locator("#cgm-passcode").fill("test-passcode-123");
  await page.locator('button.nav-btn[data-nav="home"]').click();
  await page.locator("#home-sync-btn").click();
  await expect(page.locator("#home-sync-status")).toContainText("new reading", { timeout: 10000 });
}

test.describe("app shell", () => {
  test("loads on Home with glucose + food entry and all nav tabs present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#view-title")).toHaveText("Reactive Blood Tracker");
    await expect(page.locator("#view-home")).toBeVisible();
    await expect(page.locator("#glucose-form")).toBeVisible();
    await expect(page.locator("#food-form")).toBeVisible();
    await expect(page.locator("#latest-reading")).toBeHidden(); // no reading logged yet
    for (const nav of ["home", "readings", "settings"]) {
      await expect(page.locator(`button.nav-btn[data-nav="${nav}"]`)).toBeVisible();
    }
  });

  test("Readings starts empty, and Diary/Export are reachable from Home", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#view-title")).toHaveText("Readings");
    await expect(page.locator(".timeline-empty")).toBeVisible();

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator('#view-home button[data-nav="diary"]').click();
    await expect(page.locator("#view-title")).toHaveText("Add diary note");
    await page.locator('#view-diary button[data-nav="home"]').click();

    await page.locator('#view-home button[data-nav="export"]').click();
    await expect(page.locator("#view-title")).toHaveText("Export report");
  });

  test("Food guidance is reachable from Home and lists its sources", async ({ page }) => {
    await page.goto("/");
    await page.locator('#view-home button[data-nav="food-guidance"]').click();
    await expect(page.locator("#view-title")).toHaveText("Food Guidance");
    await expect(page.locator("#view-food-guidance h2")).toContainText(["Everyday eating", "Alcohol", "Eating out & social occasions", "Sources"]);
    await expect(page.locator(".guidance-sources a").first()).toHaveAttribute("href", /^https:\/\//);
    await page.locator('#view-food-guidance button[data-nav="home"]').click();
    await expect(page.locator("#view-title")).toHaveText("Reactive Blood Tracker");
  });
});

test.describe("glucose entry", () => {
  test("saving a reading shows it on Home and in Readings", async ({ page }) => {
    await page.goto("/");
    await page.locator("#glucose-value").fill("5.6");
    await page.locator("#glucose-note").fill("smoke test reading");
    await page.locator('#glucose-form button[type="submit"]').click();

    await expect(page.locator("#latest-reading")).toBeVisible();
    await expect(page.locator("#latest-reading-value")).toHaveText("5.6");

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    const entry = page.locator(".timeline-entry").first();
    await expect(entry).toContainText("5.6 mmol/L");
    await expect(entry).toContainText("smoke test reading");
  });
});

test.describe("diary entry", () => {
  test("saving a note returns Home and shows on Readings", async ({ page }) => {
    await page.goto("/");
    await page.locator('#view-home button[data-nav="diary"]').click();
    await page.locator("#diary-text").fill("smoke test diary note");
    await page.locator('#diary-form button[type="submit"]').click();

    await expect(page.locator("#view-title")).toHaveText("Reactive Blood Tracker");
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry").first()).toContainText("smoke test diary note");
  });
});

test.describe("food entry + AI clarify loop", () => {
  test("camera button is on Home; barcode button opens the scanner (real decode needs a physical camera)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#food-camera-btn")).toBeVisible();
    await page.locator("#food-barcode-btn").click();
    // Playwright's headless run has no real camera, so this can't verify an
    // actual decode — that needs Scott's device. What's testable here is that
    // tapping it lazy-loads the scanner and opens the overlay without crashing.
    await expect(page.locator("#barcode-scanner")).toBeVisible();
    await page.locator("#barcode-cancel-btn").click();
    await expect(page.locator("#barcode-scanner")).toBeHidden();
  });

  test("degrades gracefully when the AI proxy isn't reachable", async ({ page }) => {
    await page.goto("/");
    await page.locator("#food-text").fill("a slice of toast");
    await page.locator("#food-parse-btn").click();

    await expect(page.locator("#food-ai-result")).toContainText("not available yet");
    await page.locator('#food-form button[type="submit"]').click();

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry").first()).toContainText("a slice of toast");
  });

  test("shows a low-confidence result and lets the user answer the clarifying question", async ({ page }) => {
    let call = 0;
    // A URL-predicate function, not a glob string — the glob form was flaky on
    // WebKit specifically (route silently not applied, real fetch went through
    // instead), while the predicate form matches reliably across engines.
    await page.route((url) => url.pathname.endsWith("/ai-proxy"), async (route) => {
      call += 1;
      const body =
        call === 1
          ? { configured: true, foodName: "Mixed pasta dish", portionEstimate: "~1.5 cups", confidencePercent: 55, assumptions: "Assumed some oil", clarifyingQuestion: "Cream or tomato based?" }
          : { configured: true, foodName: "Pasta with tomato sauce", portionEstimate: "~1.5 cups", confidencePercent: 82, assumptions: "Tomato-based", clarifyingQuestion: null };
      await route.fulfill({ json: body });
    });

    await page.goto("/");
    await page.locator("#food-text").fill("a big bowl of pasta with sauce");
    await page.locator("#food-parse-btn").click();

    await expect(page.locator("#food-ai-result")).toContainText("55% confidence");
    await expect(page.locator("#food-clarify")).toBeVisible();
    await expect(page.locator("#food-clarify-question")).toContainText("Cream or tomato based?");

    await page.locator("#food-clarify-answer").fill("Tomato-based");
    await page.locator("#food-clarify-submit").click();

    await expect(page.locator("#food-ai-result")).toContainText("82% confidence");
    await expect(page.locator("#food-clarify")).toBeHidden();

    await page.locator('#food-form button[type="submit"]').click();
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry").first()).toContainText("Pasta with tomato sauce");
  });

  test("a repeated food entry appears as a quick-pick suggestion", async ({ page }) => {
    await page.goto("/");
    await page.locator("#food-text").fill("leftover roast chicken");
    await page.locator('#food-form button[type="submit"]').click();

    await expect(page.locator("#food-suggestions .chip")).toContainText("leftover roast chicken");
    await page.locator("#food-text").fill("");
    await page.locator("#food-suggestions .chip", { hasText: "leftover roast chicken" }).click();
    await expect(page.locator("#food-text")).toHaveValue("leftover roast chicken");
  });

  test("importing photos logs one food entry per photo, dated from each photo's own EXIF timestamp", async ({ page, browserName }) => {
    // Real WebKit bug, not a flaky test: Safari's IndexedDB throws "Error
    // preparing Blob/File data to be stored in object store" for a File
    // that reached the page via Playwright's automated file-input injection
    // — confirmed 2026-09-15 against both this new import path AND the
    // pre-existing single-photo camera path (see HANDOVER.md), so it isn't
    // something this feature introduced. Rebuilding a plain Blob from the
    // file's own bytes (toStorableBlob in photoImport.js) didn't clear it
    // either, which is what points at the automation environment itself
    // rather than real Mobile Safari — a genuine photo from the native
    // camera is a differently-backed Blob than one injected this way.
    // Chromium coverage below is real and unaffected; skipping WebKit here
    // rather than silently weakening what the assertion actually checks.
    test.skip(browserName === "webkit", "WebKit + automated file-input injection hits a real IndexedDB Blob-storage bug — see comment above");
    await page.goto("/");
    const lunchPath = await writeTempJpeg("2026:09:15 12:15:00", "lunch.jpg");
    const dinnerPath = await writeTempJpeg("2026:09:15 18:30:00", "dinner.jpg");
    await page.locator("#food-photo-import-input").setInputFiles([lunchPath, dinnerPath]);

    await expect(page.locator("#food-photo-import-status")).toContainText("Imported 2 photos");

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    const entries = page.locator(".timeline-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText("photo attached"); // most-recent-first: dinner (6:30pm) before lunch (12:15pm)
  });
});

test.describe("My devices", () => {
  test("adding a device manually lists it, and its status can be changed", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await expect(page.locator("#device-list")).toContainText("No devices recorded yet");

    await page.locator("#device-type").selectOption("other");
    await page.locator("#device-serial").fill("XYZ-999");
    await page.locator("#device-nickname").fill("Spare meter");
    await page.locator("#device-add-form button[type=submit]").click();

    const row = page.locator("#device-list .device-item");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Spare meter");
    await expect(row).toContainText("-999"); // last 4 characters of "XYZ-999"

    await row.locator(".device-status").selectOption("finished");
    await expect(row.locator(".device-status")).toHaveValue("finished");
    // Still listed (retiring isn't deleting), and survives a reload.
    await page.reload();
    await expect(page.locator("#device-list .device-item")).toHaveCount(1);
    await expect(page.locator("#device-list .device-status")).toHaveValue("finished");
  });
});

test.describe("settings", () => {
  test("CGM sync saves Libre readings once, tagged as CGM, and asks for a passcode first", async ({ page }) => {
    await stubNoBluetooth(page);
    let calls = 0;
    let sentPasscode = null;
    await page.route("**/.netlify/functions/cgm-sync", async (route) => {
      calls++;
      sentPasscode = route.request().headers()["x-cgm-passcode"];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          readings: [
            { value: 5.5, unit: "mmol/L", timestamp: "2026-09-28T01:15:00.000Z" },
            { value: 4.0, unit: "mmol/L", timestamp: "2026-09-28T01:30:00.000Z" },
          ],
        }),
      });
    });
    await page.goto("/");

    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("passcode");
    expect(calls).toBe(0);
    // The button stays disabled for the whole sequence, including while this
    // prompt waits (prevents double-triggering a sync already in progress) —
    // so a real user resolves or cancels it before anything else, same as here.
    await page.locator("#home-cgm-pass-cancel").click();
    await expect(page.locator("#home-sync-btn")).toBeEnabled();

    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#cgm-passcode").fill("test-passcode-123");
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Libre: 2 new readings.");
    expect(sentPasscode).toBe("test-passcode-123");

    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Libre: 0 new readings, 2 already saved.");

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry", { hasText: "CGM" })).toHaveCount(2);
  });

  test("a synced Libre sensor is recorded automatically in My devices", async ({ page }) => {
    await stubNoBluetooth(page);
    await page.route("**/.netlify/functions/cgm-sync", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          readings: [{ value: 5.5, unit: "mmol/L", timestamp: "2026-09-28T01:15:00.000Z" }],
          sensor: { serial: "3L0012A4BF", activatedAt: "2026-09-25T00:00:00.000Z" },
        }),
      })
    );
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#cgm-passcode").fill("test-passcode-123");
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#home-sync-btn").click();

    await expect(page.locator("#home-sync-status")).toContainText("New sensor recorded");
    const deviceRow = page.locator("#device-list .device-item", { hasText: "Libre 2 Plus sensor" });
    await expect(deviceRow).toContainText("A4BF"); // last 4 of the serial

    // Syncing again with the same sensor doesn't add a second row.
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#device-list .device-item")).toHaveCount(1);
  });

  test("a wrong saved passcode re-prompts inline on Home, rather than just failing silently", async ({ page }) => {
    await stubNoBluetooth(page);
    await page.route("**/.netlify/functions/cgm-sync", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Wrong sync passcode." }) })
    );
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#cgm-passcode").fill("wrong-passcode");
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#home-sync-btn").click();

    // The whole point of this re-prompting (2026-09-28 fix): a wrong saved
    // passcode doesn't just fail quietly — Home shows the reason and asks
    // again right there, same place the fix was originally made.
    await expect(page.locator("#home-sync-status")).toContainText("Wrong sync passcode");
    await expect(page.locator("#home-cgm-pass")).toBeVisible();
  });

  test("an unexplained CGM rise asks why; 'not sure' records it and clears the card", async ({ page }) => {
    await mockSpikySync(page);
    await syncCgm(page);
    await page.locator('button.nav-btn[data-nav="home"]').click();

    const card = page.locator(".spike-card.rise");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("rose from 5.0 to 9.8 mmol/L");
    await expect(card.locator(".spike-explain-form")).toBeHidden();

    await card.locator('button[data-answer="unexplained"]').click();
    await expect(page.locator(".spike-card")).toHaveCount(0);
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry", { hasText: "Unexplained rise" })).toHaveCount(1);
  });

  test("answering 'yes' logs the food at the spike's time and clears the card", async ({ page }) => {
    await mockSpikySync(page);
    await syncCgm(page);
    await page.locator('button.nav-btn[data-nav="home"]').click();

    const card = page.locator(".spike-card.rise");
    await card.locator('button[data-answer="yes"]').click();
    await expect(card.locator(".spike-explain-form")).toBeVisible();
    await card.locator(".spike-explain-text").fill("chocolate biscuit");
    await card.locator('.spike-explain-form button[type="submit"]').click();

    await expect(page.locator(".spike-card")).toHaveCount(0);
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry", { hasText: "🍽️" }).filter({ hasText: "chocolate biscuit" })).toHaveCount(1);
  });

  test("Meals tab shows each meal with what glucose did afterwards, flagging a drop below the user's low", async ({ page }) => {
    await stubNoBluetooth(page);
    const now = Date.now();
    const mealTime = new Date(now - 4 * 3600000);
    const readings = [0, 30, 60, 120, 180].map((min, i) => ({
      value: [5.1, 8.9, 10.2, 5.5, 3.6][i],
      unit: "mmol/L",
      timestamp: new Date(mealTime.getTime() + (min + 5) * 60000).toISOString(),
    }));
    await page.route("**/.netlify/functions/cgm-sync", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, readings }) })
    );
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#threshold-low").fill("4.0");
    await page.locator("#threshold-low").press("Tab");
    await page.locator("#cgm-passcode").fill("test-passcode-123");
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("Libre: 5 new readings.");

    const local = new Date(mealTime.getTime() - mealTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await page.locator("#food-text").fill("toast and jam");
    await page.locator("#food-time").fill(local);
    await page.locator('#food-form button[type="submit"]').click();

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await page.locator('#readings-view-toggle button[data-mode="meals"]').click();
    await expect(page.locator("#meal-gallery")).toBeVisible();
    await expect(page.locator("#timeline-list")).toBeHidden();
    const card = page.locator(".meal-card", { hasText: "toast and jam" });
    await expect(card).toHaveClass(/went-low/);
    await expect(card.locator(".meal-stats")).toContainText("10.2");
    await expect(card.locator(".stat-low")).toContainText("3.6");
    await expect(card.locator(".meal-note")).toContainText("below your low of 4.0");
  });

  test("unit choice carries into the glucose form default", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#unit-mgdl").check();

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await expect(page.locator("#glucose-unit")).toHaveValue("mg/dL");
  });

  test("locking a date format overrides the automatic one in the Readings list", async ({ page }) => {
    // Home's "latest reading" shows relative time ("just now") for anything
    // recent, so a fresh save won't exercise the format there — the Readings
    // list always goes through formatDate(), which is what this checks.
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#date-format-ymd").check();

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#glucose-value").fill("5.5");
    await page.locator('#glucose-form button[type="submit"]').click();

    // Local date components, not toISOString() (UTC) — formatDate()'s "ymd"
    // format uses getFullYear()/getMonth()/getDate() (src/dateformat.js), so a
    // UTC-based "today" string mismatches for part of the day in any timezone
    // ahead of UTC (this machine included: AEST, UTC+10) and made this flaky.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry").first()).toContainText(today);
  });

  test("reminder toggle persists and drives the Home banner", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#reminder-enabled").check();
    await page.locator("#reminder-time").fill("00:00"); // already past midnight, so it should trigger

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await expect(page.locator("#reminder-banner")).toBeVisible();
    await expect(page.locator("#reminder-banner")).toContainText("no glucose reading logged yet today");
  });

  test("glucose warning thresholds are blank by default and stay neutral until set", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await expect(page.locator("#threshold-low")).toHaveValue("");
    await expect(page.locator("#threshold-high")).toHaveValue("");

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#glucose-value").fill("2.5");
    await page.locator('#glucose-form button[type="submit"]').click();
    await expect(page.locator("#latest-reading")).not.toHaveClass(/warn-/);
    await expect(page.locator("#latest-reading-info-btn")).toBeHidden();
  });

  test("the low threshold can be raised for extra margin but not lowered past the standard floor", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();

    // Raising it for personal margin (Scott's own driving-limit analogy, 2026-09-14) is allowed.
    await page.locator("#threshold-low").fill("5");
    await page.locator("#threshold-low").press("Tab");
    await expect(page.locator("#threshold-low-hint")).toBeHidden();
    await expect(page.locator("#threshold-low")).toHaveValue("5");

    // Trying to go below the standard floor gets pulled back up, with an explanation.
    await page.locator("#threshold-low").fill("3");
    await page.locator("#threshold-low").press("Tab");
    await expect(page.locator("#threshold-low-hint")).toBeVisible();
    await expect(page.locator("#threshold-low-hint")).toContainText("3.9");
    await expect(page.locator("#threshold-low")).toHaveValue("3.9");
  });

  test("setting a low threshold colors a reading below it and explains why", async ({ page }) => {
    await page.goto("/");
    await page.locator('button.nav-btn[data-nav="settings"]').click();
    await page.locator("#threshold-low").fill("4.0");
    await page.locator("#threshold-low").press("Tab");

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#glucose-value").fill("3.2");
    await page.locator('#glucose-form button[type="submit"]').click();

    await expect(page.locator("#latest-reading")).toHaveClass(/warn-low/);
    await page.locator("#latest-reading-info-btn").click();
    await expect(page.locator("#latest-reading-explanation")).toContainText("below your low threshold of 4");

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry").first()).toHaveClass(/warn-low/);
  });
});

test.describe("readings display", () => {
  test("list/graph toggle switches views and persists", async ({ page }) => {
    await page.goto("/");
    await page.locator("#glucose-value").fill("5.0");
    await page.locator('#glucose-form button[type="submit"]').click();
    // Wait for the first save's own async refresh to finish before firing the
    // second — otherwise both submits can race the same IndexedDB round trip.
    await expect(page.locator("#latest-reading-value")).toHaveText("5");
    await page.locator("#glucose-value").fill("6.0");
    await page.locator('#glucose-form button[type="submit"]').click();
    await expect(page.locator("#latest-reading-value")).toHaveText("6");

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#timeline-list")).toBeVisible();

    await page.locator('#readings-view-toggle button[data-mode="graph"]').click();
    await expect(page.locator("#readings-graph-container")).toBeVisible();
    await expect(page.locator("#timeline-list")).toBeHidden();
    await expect(page.locator(".readings-graph")).toBeVisible();

    // Persisted: leaving and coming back keeps Graph selected.
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#readings-graph-container")).toBeVisible();
  });
});

test.describe("export", () => {
  test("CSV download contains the logged entries", async ({ page }) => {
    await page.goto("/");
    await page.locator("#glucose-value").fill("6.1");
    await page.locator('#glucose-form button[type="submit"]').click();

    await page.locator('#view-home button[data-nav="export"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-csv-btn").click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("6.1 mmol/L");
  });

  test("printable summary populates without opening a new window", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await page.goto("/");
    await page.locator("#glucose-value").fill("7.2");
    await page.locator('#glucose-form button[type="submit"]').click();

    await page.locator('#view-home button[data-nav="export"]').click();
    await page.locator("#export-print-btn").click();

    await expect(page.locator("#print-summary")).toContainText("7.2 mmol/L");
    expect(await page.evaluate(() => window.__printed)).toBe(true);
  });

  test("printable summary includes a 7-day graph snapshot, independent of the chosen date range", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await mockSpikySync(page);
    await syncCgm(page);

    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator('#view-home button[data-nav="export"]').click();
    // A from/to range that excludes today — the graph snapshot should still
    // show, since it's deliberately always "the last 7 days ending now".
    await page.locator("#export-from").fill("2020-01-01");
    await page.locator("#export-to").fill("2020-01-02");
    await page.locator("#export-print-btn").click();

    // #print-summary is display:none outside @media print (same reason the
    // existing printable-summary test above checks text content, not
    // visibility) — assert presence/content, not toBeVisible().
    await expect(page.locator("#print-summary h2")).toHaveText("Last 7 days");
    await expect(page.locator("#print-summary .readings-graph")).toHaveCount(1);
    await expect(page.locator("#print-summary .graph-legend")).toContainText("Smoothed average");
    expect(await page.evaluate(() => window.__printed)).toBe(true);
  });

  test("importing a previously-exported CSV adds its entries", async ({ page }) => {
    const dir = await mkdtemp(path.join(tmpdir(), "rht-import-"));
    const filePath = path.join(dir, "export.csv");
    const csv = [
      "Type,When,Detail,Timestamp,Value,Unit,Note,Text",
      '"glucose","9/14/2026, 8:00:00 AM","4.8 mmol/L","2026-09-14T08:00:00.000Z","4.8","mmol/L","imported reading",""',
    ].join("\n");
    await writeFile(filePath, csv, "utf-8");

    await page.goto("/");
    await page.locator('#view-home button[data-nav="export"]').click();
    await page.locator("#import-file").setInputFiles(filePath);

    await expect(page.locator("#import-status")).toContainText("Imported 1 entry");

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator(".timeline-entry").first()).toContainText("4.8 mmol/L");
    await expect(page.locator(".timeline-entry").first()).toContainText("imported reading");

    await rm(dir, { recursive: true, force: true });
  });
});

test.describe("meal builder", () => {
  test("ingredients add up to a carb total, save as one meal, and show in Meals", async ({ page }) => {
    await page.goto("/");
    await page.locator("#meal-builder > summary").click();
    // Opening the builder starts one empty ingredient row.
    await expect(page.locator(".meal-item")).toHaveCount(1);

    const rows = page.locator(".meal-item");
    await rows.nth(0).locator(".mi-name input").fill("Rolled oats");
    await rows.nth(0).locator(".mi-grams input").fill("40");
    await rows.nth(0).locator(".mi-per100 input").fill("60");
    await expect(page.locator("#meal-total")).toContainText("Total: 24 g carbs");

    await page.locator("#meal-add-item-btn").click();
    await rows.nth(1).locator(".mi-name input").fill("Milk");
    await rows.nth(1).locator(".mi-grams input").fill("250");
    await rows.nth(1).locator(".mi-per100 input").fill("4.8");
    await expect(page.locator("#meal-total")).toContainText("Total: 36 g carbs");

    await page.locator("#meal-add-item-btn").click();
    await rows.nth(2).locator(".mi-name input").fill("Whey powder");
    await expect(page.locator("#meal-total")).toContainText("not counting Whey powder");
    // A known total typed straight in counts too.
    await rows.nth(2).locator(".mi-carbs input").fill("2");
    await expect(page.locator("#meal-total")).toContainText("Total: 38 g carbs");

    // Removing a row takes its carbs out.
    await rows.nth(2).locator(".mi-remove").click();
    await expect(page.locator(".meal-item")).toHaveCount(2);
    await expect(page.locator("#meal-total")).toContainText("Total: 36 g carbs");

    await page.locator("#food-text").fill("Breakfast");
    await page.locator('#food-form button[type="submit"]').click();
    // The form resets: builder closed and emptied.
    await expect(page.locator("#meal-builder")).not.toHaveAttribute("open", "");
    await expect(page.locator(".meal-item")).toHaveCount(0);

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#timeline-list")).toContainText("Rolled oats 40g (24g carbs), Milk 250g (12g carbs) | Total 36g carbs");
    await page.locator('#readings-view-toggle button[data-mode="meals"]').click();
    const card = page.locator(".meal-card", { hasText: "Rolled oats, Milk" });
    await expect(card.locator(".meal-carbs")).toContainText("36 g carbs from 2 ingredients");
  });

  test("a meal without the builder saves exactly as before", async ({ page }) => {
    await page.goto("/");
    await page.locator("#food-text").fill("an apple");
    await page.locator('#food-form button[type="submit"]').click();
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#timeline-list")).toContainText("an apple");
    await expect(page.locator("#timeline-list")).not.toContainText("Total");
  });
});

test.describe("readings list filter", () => {
  test("chips narrow the list to one kind, show counts, and remember the choice", async ({ page }) => {
    await mockSpikySync(page);
    await syncCgm(page); // 4 CGM readings
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator("#glucose-value").fill("4.6");
    await page.locator('#glucose-form button[type="submit"]').click();
    await page.locator("#food-text").fill("banana");
    await page.locator('#food-form button[type="submit"]').click();

    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await page.locator('#readings-view-toggle button[data-mode="list"]').click();
    const chips = page.locator("#readings-filter");
    await expect(chips).toBeVisible();
    await expect(chips.locator('[data-filter="all"]')).toHaveText("All 6");
    await expect(chips.locator('[data-filter="cgm"]')).toHaveText("CGM 4");
    await expect(chips.locator('[data-filter="meter"]')).toHaveText("Finger-prick 1");

    await chips.locator('[data-filter="meter"]').click();
    await expect(chips.locator('[data-filter="meter"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#timeline-list .timeline-entry")).toHaveCount(1);
    await expect(page.locator("#timeline-list")).toContainText("4.6");

    await chips.locator('[data-filter="diary"]').click();
    await expect(page.locator("#timeline-list")).toContainText("Nothing of this kind logged yet");

    // Remembered after leaving and coming back; hidden outside List mode.
    await chips.locator('[data-filter="food"]').click();
    await page.locator('button.nav-btn[data-nav="home"]').click();
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#timeline-list .timeline-entry")).toHaveCount(1);
    await expect(page.locator("#timeline-list")).toContainText("banana");
    await page.locator('#readings-view-toggle button[data-mode="graph"]').click();
    await expect(chips).toBeHidden();
  });
});

test.describe("my foods", () => {
  async function mockOff(page) {
    await page.route("**/api/v2/product/**", (route) => {
      const found = route.request().url().includes("9310653105719");
      return found
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: 1, product: { product_name: "Blueberry Twist Yogurt", brands: "Gippsland Dairy", nutriments: { carbohydrates_100g: 17.4, sugars_100g: 15.9 } } }) })
        : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ status: 0 }) });
    });
  }

  test("type a barcode, check it against the pack, save, edit and delete", async ({ page }) => {
    await mockOff(page);
    await page.goto("/");
    await page.locator('#view-home button[data-nav="my-foods"]').click();
    await expect(page.locator("#myfood-list")).toContainText("Nothing saved yet");

    // Found online: fields prefilled, user corrects to the pack figure.
    await page.locator("#myfood-barcode").fill("9310653105719");
    await page.locator("#myfood-lookup-btn").click();
    await expect(page.locator("#myfood-lookup-status")).toContainText("Found online");
    await expect(page.locator("#myfood-name")).toHaveValue("Gippsland Dairy Blueberry Twist Yogurt");
    await page.locator("#myfood-carbs").fill("16.5");
    await page.locator("#myfood-sugars").fill("15");
    await page.locator('#myfood-form button[type="submit"]').click();
    await expect(page.locator("#myfood-status")).toContainText("Saved Gippsland Dairy Blueberry Twist Yogurt");
    await expect(page.locator("#myfood-list-heading")).toHaveText("Saved (1)");
    await expect(page.locator("#myfood-list")).toContainText("16.5 g carbs · 15 g sugars per 100 g");

    // Not online: typed from the pack. A sugars-above-carbs slip is caught.
    await page.locator("#myfood-barcode").fill("9326932000187");
    await page.locator("#myfood-lookup-btn").click();
    await expect(page.locator("#myfood-lookup-status")).toContainText("Not found online");
    await page.locator("#myfood-name").fill("Hilltop orange juice");
    await page.locator("#myfood-carbs").fill("7.5");
    await page.locator("#myfood-sugars").fill("9.2");
    await page.locator('#myfood-form button[type="submit"]').click();
    await expect(page.locator("#myfood-status")).toContainText("Sugars can't be more");
    await page.locator("#myfood-carbs").fill("9.2");
    await page.locator("#myfood-sugars").fill("7.5");
    await page.locator('#myfood-form button[type="submit"]').click();
    await expect(page.locator("#myfood-list-heading")).toHaveText("Saved (2)");

    // Looking up a saved barcode uses My foods, not the internet.
    await page.locator("#myfood-barcode").fill("9310653105719");
    await page.locator("#myfood-lookup-btn").click();
    await expect(page.locator("#myfood-lookup-status")).toContainText("Already in My foods");
    await expect(page.locator("#myfood-carbs")).toHaveValue("16.5");

    // Survives a reload (stored on the device), and can be deleted.
    await page.reload();
    await page.locator('#view-home button[data-nav="my-foods"]').click();
    await expect(page.locator("#myfood-list-heading")).toHaveText("Saved (2)");
    page.once("dialog", (d) => d.accept());
    await page.locator('#myfood-list [aria-label="Delete Hilltop orange juice"]').click();
    await expect(page.locator("#myfood-list-heading")).toHaveText("Saved (1)");
  });

  test("backup downloads as a file", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("rht-my-foods", JSON.stringify({ "9326932000187": { barcode: "9326932000187", name: "Hilltop orange juice", carbsPer100g: 9.2, sugarsPer100g: 7.5, updatedAt: "2026-09-28T10:00:00Z" } })));
    await page.locator('#view-home button[data-nav="my-foods"]').click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#myfood-export-btn").click()]);
    expect(download.suggestedFilename()).toMatch(/^my-foods-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

test.describe("meal builder with saved foods and portions", () => {
  test("picking a saved food fills its figures, and ½ serve sets the grams", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("rht-my-foods", JSON.stringify({
      "9310653105719": { barcode: "9310653105719", name: "Blueberry yoghurt", carbsPer100g: 16.5, sugarsPer100g: 15, servingSizeG: 170, updatedAt: "2026-09-28T10:00:00Z" },
    })));
    await page.reload();
    await page.locator("#meal-builder > summary").click();
    const row = page.locator(".meal-item").first();
    await row.locator(".mi-name input").fill("Blueberry yoghurt");
    await row.locator(".mi-name input").press("Tab"); // fires change, like choosing from the list
    const filled = page.locator(".meal-item").first();
    await expect(filled.locator(".mi-per100 input")).toHaveValue("16.5");
    await expect(filled.locator(".mi-portions")).toContainText("Serve 170 g");
    await filled.locator(".mi-portions button", { hasText: "½" }).click();
    await expect(filled.locator(".mi-grams input")).toHaveValue("85");
    await expect(page.locator("#meal-total")).toContainText("Total: 14 g carbs"); // 85 g × 16.5/100 = 14.0
  });

  test("My foods says the food bank is off until the sync passcode is saved", async ({ page }) => {
    await page.goto("/");
    await page.locator('#view-home button[data-nav="my-foods"]').click();
    await expect(page.locator("#myfood-bank-status")).toContainText("Food bank: off");
  });
});

test.describe("readings list paging", () => {
  test("a long history shows the newest 200 first, with Show more", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open("rht-db", 1); r.onsuccess = () => res(r.result); });
      await new Promise((res) => {
        const t = db.transaction("glucose", "readwrite");
        const s = t.objectStore("glucose");
        const now = Date.now();
        for (let i = 0; i < 450; i++) s.add({ id: `c${i}`, type: "glucose", value: 5.5, unit: "mmol/L", sourceId: "librelinkup", timestamp: new Date(now - i * 900000).toISOString() });
        t.oncomplete = res;
      });
    });
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await page.locator('#readings-view-toggle button[data-mode="list"]').click();
    await expect(page.locator("#readings-filter [data-filter='all']")).toHaveText("All 450");
    await expect(page.locator("#timeline-list .timeline-entry")).toHaveCount(200);
    await page.locator("#timeline-list .show-more").click();
    await expect(page.locator("#timeline-list .timeline-entry")).toHaveCount(400);
    await expect(page.locator("#timeline-list .show-more")).toHaveText("Show 50 more (50 older)");
    await page.locator("#timeline-list .show-more").click();
    await expect(page.locator("#timeline-list .timeline-entry")).toHaveCount(450);
    await expect(page.locator("#timeline-list .show-more")).toHaveCount(0);
  });
});

test.describe("saved meals", () => {
  test("save a built meal, load it next time, adjust, and delete it", async ({ page }) => {
    await page.goto("/");
    await page.locator("#meal-builder > summary").click();
    const rows = page.locator(".meal-item");
    await rows.nth(0).locator(".mi-name input").fill("Rolled oats");
    await rows.nth(0).locator(".mi-grams input").fill("40");
    await rows.nth(0).locator(".mi-per100 input").fill("60");
    await page.locator("#meal-add-item-btn").click();
    await rows.nth(1).locator(".mi-name input").fill("Milk");
    await rows.nth(1).locator(".mi-grams input").fill("250");
    await rows.nth(1).locator(".mi-per100 input").fill("4.8");
    await page.locator("#save-meal-btn").click();
    await expect(page.locator("#save-meal-status")).toContainText("Give the meal a name");
    await page.locator("#save-meal-name").fill("Usual breakfast");
    await page.locator("#save-meal-btn").click();
    await expect(page.locator("#save-meal-status")).toContainText('Saved "Usual breakfast"');

    // Next time: open the builder fresh and load it.
    await page.reload();
    await page.locator("#meal-builder > summary").click();
    await page.locator(".saved-meal-load", { hasText: "Usual breakfast" }).click();
    await expect(page.locator(".meal-item")).toHaveCount(2);
    await expect(page.locator("#meal-total")).toContainText("Total: 36 g carbs");
    await page.locator(".meal-item").nth(1).locator(".mi-grams input").fill("125");
    await expect(page.locator("#meal-total")).toContainText("Total: 30 g carbs");

    page.once("dialog", (d) => d.accept());
    await page.locator('[aria-label="Delete saved meal Usual breakfast"]').click();
    await expect(page.locator(".saved-meal")).toHaveCount(0);
  });
});

test.describe("CGM sync from Home", () => {
  test("with no saved passcode, Home asks for it, remembers it, and syncs", async ({ page }) => {
    await stubNoBluetooth(page);
    let sentPasscode = null;
    const readingTime = new Date(Date.now() - 600000).toISOString(); // same reading on both syncs
    await page.route("**/.netlify/functions/cgm-sync", (route) => {
      sentPasscode = route.request().headers()["x-cgm-passcode"];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, readings: [{ value: 5.4, unit: "mmol/L", timestamp: readingTime }] }) });
    });
    await page.goto("/");
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-cgm-pass")).toBeVisible();
    await expect(page.locator("#home-cgm-remember")).toBeChecked();
    await page.locator("#home-cgm-passcode").fill("test-passcode-123");
    await page.locator('#home-cgm-pass button[type="submit"]').click();
    await expect(page.locator("#home-sync-status")).toContainText("Libre: 1 new reading.");
    expect(sentPasscode).toBe("test-passcode-123");
    await expect(page.locator("#home-cgm-pass")).toBeHidden();
    // Remembered: next time it syncs straight away.
    await page.reload();
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-sync-status")).toContainText("already saved");
  });

  test("a wrong saved passcode is forgotten and Home asks again", async ({ page }) => {
    await stubNoBluetooth(page);
    await page.route("**/.netlify/functions/cgm-sync", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Wrong sync passcode." }) })
    );
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("rht-cgm-passcode", "old-wrong-passcode"));
    await page.reload();
    await page.locator("#home-sync-btn").click();
    await expect(page.locator("#home-cgm-pass")).toBeVisible();
    await expect(page.locator("#home-sync-status")).toContainText("Please type it again");
    expect(await page.evaluate(() => localStorage.getItem("rht-cgm-passcode"))).toBeNull();
  });

  test("skipping a device doesn't block the rest of the sync sequence (Libre, then the Bluetooth meter)", async ({ page, browserName }) => {
    // Deliberately NOT stubNoBluetooth here — this is the one test covering
    // the real two-device sequence Scott asked for: Libre first, then the
    // meter, each independently skippable, without the whole thing hanging.
    // WebKit never implements Web Bluetooth at all (real platform limit, not
    // a bug — see isBluetoothAvailable()), so there's no meter step to skip
    // there; Chrome is where this sequence actually matters.
    test.skip(browserName === "webkit", "WebKit has no Web Bluetooth — isBluetoothAvailable() is false, so there's no meter step in the sequence to test here");
    await page.goto("/");
    await page.locator("#home-sync-btn").click();

    await expect(page.locator("#home-cgm-pass")).toBeVisible();
    await page.locator("#home-cgm-pass-cancel").click();
    await expect(page.locator("#home-cgm-pass")).toBeHidden();
    await expect(page.locator("#home-sync-status")).toContainText("Libre: skipped.");

    // Skipping the meter's manual-action prompt happens before any real
    // Bluetooth API call is made (see syncBluetoothStep), so this is safe to
    // exercise even though there's no real meter in this environment.
    await expect(page.locator("#home-sync-manual-step")).toBeVisible();
    await expect(page.locator("#home-sync-manual-prompt")).toContainText("Turn on your Bluetooth meter");
    await page.locator("#home-sync-skip-btn").click();
    await expect(page.locator("#home-sync-manual-step")).toBeHidden();

    await expect(page.locator("#home-sync-status")).toContainText("Libre: skipped. Meter: skipped.");
    await expect(page.locator("#home-sync-btn")).toBeEnabled();
  });
});

test.describe("header and install tip", () => {
  test("header shows the app name and the date/time", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#view-title")).toHaveText("Reactive Blood Tracker");
    await expect(page.locator("#header-now")).toContainText(":"); // the time, e.g. "Mon 28 Sep, 10:02 pm"
  });

  test("on a phone in the browser, a one-time Add to Home Screen tip shows and can be dismissed", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones only");
    await page.goto("/");
    await expect(page.locator("#install-tip")).toBeVisible();
    await page.locator("#install-tip-close").click();
    await expect(page.locator("#install-tip")).toBeHidden();
    await page.reload();
    await expect(page.locator("#install-tip")).toBeHidden();
  });
});

test.describe("Readings on a phone turned sideways", () => {
  test("landscape phone shows graph and list side by side; portrait and Meals are unchanged", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone-only layout");
    await page.goto("/");
    for (const v of ["5.4", "6.1"]) { // the graph needs at least 2 readings
      await page.locator("#glucose-value").fill(v);
      await page.locator('#glucose-form button[type="submit"]').click();
      await expect(page.locator("#latest-reading-value")).toHaveText(v);
    }

    const vp = page.viewportSize();
    const portrait = { width: Math.min(vp.width, vp.height), height: Math.max(vp.width, vp.height) };
    const landscape = { width: portrait.height, height: portrait.width };

    await page.setViewportSize(landscape);
    await page.locator('button.nav-btn[data-nav="readings"]').click();
    await expect(page.locator("#view-readings")).toHaveClass(/split/);
    await expect(page.locator(".readings-graph")).toBeVisible();
    await expect(page.locator("#timeline-list")).toContainText("6.1");
    const g = await page.locator("#readings-graph-wrap").boundingBox();
    const l = await page.locator("#timeline-list").boundingBox();
    expect(g.x + g.width).toBeLessThanOrEqual(l.x + 1); // graph left of list
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Meals stays full width, one view.
    await page.locator('#readings-view-toggle button[data-mode="meals"]').click();
    await expect(page.locator("#view-readings")).not.toHaveClass(/split/);
    await expect(page.locator("#timeline-list")).toBeHidden();

    // Rotating back to portrait returns to one view at a time, no reload.
    await page.locator('#readings-view-toggle button[data-mode="graph"]').click();
    await expect(page.locator("#view-readings")).toHaveClass(/split/);
    await page.setViewportSize(portrait);
    await expect(page.locator("#view-readings")).not.toHaveClass(/split/);
    await expect(page.locator(".readings-graph")).toBeVisible();
    await expect(page.locator("#timeline-list")).toBeHidden();
  });
});
