import { test, expect } from "@playwright/test";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test.describe("app shell", () => {
  test("loads on Home with glucose + food entry and all nav tabs present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#view-title")).toHaveText("Home");
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
    await expect(page.locator("#view-title")).toHaveText("Home");
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

    await expect(page.locator("#view-title")).toHaveText("Home");
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
});

test.describe("settings", () => {
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

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
