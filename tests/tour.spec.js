import { test, expect } from "@playwright/test";

test.describe("How it works", () => {
  test("Home button opens the tour; video stays hidden when no file is deployed", async ({ page }) => {
    await page.goto("/");
    await page.locator('.secondary-links [data-nav="tour"]').click();
    await expect(page.locator("#view-tour")).toBeVisible();
    await expect(page.locator("#view-tour")).toContainText("How to use it");
    await expect(page.locator("#view-tour")).toContainText("Why it helps");
    await expect(page.locator("#tour-video-wrap")).toBeHidden();
    await page.locator("#view-tour .back-link").click();
    await expect(page.locator("#view-home")).toBeVisible();
  });

  test("the video player appears when explainer.mp4 is served", async ({ page }) => {
    await page.route("**/explainer.mp4", (route) =>
      route.fulfill({ status: 200, contentType: "video/mp4", body: "" })
    );
    await page.goto("/");
    await page.locator('.secondary-links [data-nav="tour"]').click();
    await expect(page.locator("#tour-video-wrap")).toBeVisible();
  });
});
