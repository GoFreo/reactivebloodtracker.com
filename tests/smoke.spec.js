import { test, expect } from "@playwright/test";

test.describe("app shell", () => {
  test("loads on Timeline with all nav tabs present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#view-title")).toHaveText("Timeline");
    await expect(page.locator("#view-timeline")).toBeVisible();
    await expect(page.locator(".timeline-empty")).toBeVisible();
    for (const nav of ["timeline", "glucose", "food", "diary", "export", "settings"]) {
      await expect(page.locator(`button[data-nav="${nav}"]`)).toBeVisible();
    }
  });

  test("every nav tab opens its own view", async ({ page }) => {
    await page.goto("/");
    const expectTitle = { glucose: "Add glucose reading", food: "Add food", diary: "Add diary note", export: "Export report", settings: "Settings" };
    for (const [nav, title] of Object.entries(expectTitle)) {
      await page.locator(`button[data-nav="${nav}"]`).click();
      await expect(page.locator("#view-title")).toHaveText(title);
      await expect(page.locator(`#view-${nav}`)).toBeVisible();
    }
  });
});

test.describe("glucose entry", () => {
  test("saving a reading shows it on the Timeline", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[data-nav="glucose"]').click();
    await page.locator("#glucose-value").fill("5.6");
    await page.locator("#glucose-note").fill("smoke test reading");
    await page.locator('#glucose-form button[type="submit"]').click();

    await expect(page.locator("#view-title")).toHaveText("Timeline");
    const entry = page.locator(".timeline-entry").first();
    await expect(entry).toContainText("5.6 mmol/L");
    await expect(entry).toContainText("smoke test reading");
  });
});

test.describe("diary entry", () => {
  test("saving a note shows it on the Timeline", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[data-nav="diary"]').click();
    await page.locator("#diary-text").fill("smoke test diary note");
    await page.locator('#diary-form button[type="submit"]').click();

    await expect(page.locator("#view-title")).toHaveText("Timeline");
    await expect(page.locator(".timeline-entry").first()).toContainText("smoke test diary note");
  });
});

test.describe("food entry + AI clarify loop", () => {
  test("degrades gracefully when the AI proxy isn't reachable", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[data-nav="food"]').click();
    await page.locator("#food-text").fill("a slice of toast");
    await page.locator("#food-parse-btn").click();

    await expect(page.locator("#food-ai-result")).toContainText("not available yet");
    await page.locator('#food-form button[type="submit"]').click();
    await expect(page.locator(".timeline-entry").first()).toContainText("a slice of toast");
  });

  test("shows a low-confidence result and lets the user answer the clarifying question", async ({ page }) => {
    let call = 0;
    await page.route("**/.netlify/functions/ai-proxy", async (route) => {
      call += 1;
      const body =
        call === 1
          ? { configured: true, foodName: "Mixed pasta dish", portionEstimate: "~1.5 cups", confidencePercent: 55, assumptions: "Assumed some oil", clarifyingQuestion: "Cream or tomato based?" }
          : { configured: true, foodName: "Pasta with tomato sauce", portionEstimate: "~1.5 cups", confidencePercent: 82, assumptions: "Tomato-based", clarifyingQuestion: null };
      await route.fulfill({ json: body });
    });

    await page.goto("/");
    await page.locator('button[data-nav="food"]').click();
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
    await expect(page.locator(".timeline-entry").first()).toContainText("Pasta with tomato sauce");
  });
});

test.describe("settings", () => {
  test("unit choice carries into the glucose form default", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[data-nav="settings"]').click();
    await page.locator("#unit-mgdl").check();

    await page.locator('button[data-nav="glucose"]').click();
    await expect(page.locator("#glucose-unit")).toHaveValue("mg/dL");
  });

  test("reminder toggle persists and drives the Timeline banner", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[data-nav="settings"]').click();
    await page.locator("#reminder-enabled").check();
    await page.locator("#reminder-time").fill("00:00"); // already past midnight, so it should trigger

    await page.locator('button[data-nav="timeline"]').click();
    await expect(page.locator("#reminder-banner")).toBeVisible();
    await expect(page.locator("#reminder-banner")).toContainText("no glucose reading logged yet today");
  });
});

test.describe("export", () => {
  test("CSV download contains the logged entries", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[data-nav="glucose"]').click();
    await page.locator("#glucose-value").fill("6.1");
    await page.locator('#glucose-form button[type="submit"]').click();

    await page.locator('button[data-nav="export"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-csv-btn").click();
    const download = await downloadPromise;
    const path = await download.path();
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(path, "utf-8");
    expect(content).toContain("6.1 mmol/L");
  });

  test("printable summary populates without opening a new window", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await page.goto("/");
    await page.locator('button[data-nav="glucose"]').click();
    await page.locator("#glucose-value").fill("7.2");
    await page.locator('#glucose-form button[type="submit"]').click();

    await page.locator('button[data-nav="export"]').click();
    await page.locator("#export-print-btn").click();

    await expect(page.locator("#print-summary")).toContainText("7.2 mmol/L");
    expect(await page.evaluate(() => window.__printed)).toBe(true);
  });
});
