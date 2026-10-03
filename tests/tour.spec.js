import { test, expect } from "@playwright/test";

test.describe("How it works", () => {
  test("Home button opens the tour; the video stays hidden if the file is missing", async ({ page }) => {
    // Simulates a deploy that forgot the file: the host answers with its HTML fallback page.
    await page.route("**/explainer.mp4", (route) =>
      route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>Not found</title>" })
    );
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

  // Regression guard for 2026-10-03: the player is hidden whenever the file is absent, so a build
  // that never shipped explainer.mp4 looked fine in every other test while Scott saw no video.
  // This one runs against the real built bundle with nothing mocked.
  test("the real build ships the explainer video, streamable, with its poster", async ({ page }) => {
    const range = await page.request.get("/explainer.mp4", { headers: { Range: "bytes=0-1023" } });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-type"]).toMatch(/^video\//);
    expect((await range.body()).length).toBe(1024);

    const poster = await page.request.get("/explainer-poster.jpg");
    expect(poster.status()).toBe(200);
    expect(poster.headers()["content-type"]).toMatch(/^image\//);

    await page.goto("/");
    await page.locator('.secondary-links [data-nav="tour"]').click();
    await expect(page.locator("#tour-video-wrap")).toBeVisible();
    await expect(page.locator("#tour-video")).toHaveAttribute("poster", "/explainer-poster.jpg");
  });
});
