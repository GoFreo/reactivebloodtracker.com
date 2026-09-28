import { test, expect } from "@playwright/test";

// Real-engine coverage for the photo->AI path: a camera-sized photo is built inside the
// browser itself (no fixture file checked in) and handed to the food photo input, then we
// look at exactly what the app sends to the AI proxy. The proxy route is mocked, so no real
// Anthropic call is ever made.

const CAP = 1568;
// The failing case that motivated the change: Scott's largest staged photo was 4.68 MB raw
// (~6.25 MB once base64'd, over Netlify's ~6 MB request cap). Anything >= 4 MB raw is the same
// class of photo, so that's the floor the generated fixture must clear.
const REPRESENTATIVE_HEAVY_PHOTO_BYTES = 4 * 1024 * 1024;

// Builds a noisy JPEG, then sets it on #food-photo via DataTransfer — entirely in-page, so
// nothing big crosses the Playwright wire (and WebKit's inline-buffer setInputFiles gotcha,
// noted in smoke.spec.js, never comes into play).
async function attachHeavyPhoto(page) {
  return page.evaluate(async () => {
    const width = 4032;
    const height = 3024;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(width, height);
    const d = pixels.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const x = p % width;
      const y = (p / width) | 0;
      const noise = (Math.random() * 140) | 0; // heavy noise = a heavy JPEG, like a busy real photo
      d[i] = (x / width) * 160 + noise;
      d[i + 1] = (y / height) * 160 + noise;
      d[i + 2] = 90 + noise;
      d[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    const file = new File([blob], "heavy-food-photo.jpg", { type: "image/jpeg" });

    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById("food-photo");
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { bytes: blob.size, width, height };
  });
}

test.describe("food photo -> AI request", () => {
  test("a camera-sized photo is shrunk before it is sent, so it can't exceed request limits", async ({ page }) => {
    let sent = null;
    await page.route((url) => url.pathname.endsWith("/ai-proxy"), async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        json: { configured: true, foodName: "Toast", portionEstimate: "1 slice", confidencePercent: 90, assumptions: "", clarifyingQuestion: null },
      });
    });

    await page.goto("/");
    const original = await attachHeavyPhoto(page);
    // Guard against a vacuous pass: the fixture must actually be as heavy as the real failure.
    expect(original.bytes).toBeGreaterThan(REPRESENTATIVE_HEAVY_PHOTO_BYTES);

    await page.locator("#food-parse-btn").click();
    await expect(page.locator("#food-ai-result")).toContainText("Toast");

    expect(sent).not.toBeNull();
    expect(sent.mimeType).toBe("image/jpeg");
    // A worst-case noisy 1568px JPEG measured 0.76 MB (Chromium) / 1.27 MB (WebKit) as base64 on
    // 2026-09-20; real photos compress far better. 2 MB leaves headroom for encoder differences
    // while staying 3x under the ~6 MB request cap the unshrunk photo blew past.
    expect(sent.imageBase64.length).toBeLessThan(2 * 1024 * 1024);

    const dims = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = "data:image/jpeg;base64," + b64;
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    }, sent.imageBase64);
    expect(Math.max(dims.w, dims.h)).toBeLessThanOrEqual(CAP);
    // Aspect ratio survives (4:3 in, 4:3 out, within a pixel of rounding).
    expect(Math.abs(dims.w / dims.h - 4032 / 3024)).toBeLessThan(0.01);
  });

  test("when the hosting layer turns the request away with a non-JSON reply, the message says so — not 'needs netlify dev'", async ({ page }) => {
    await page.route((url) => url.pathname.endsWith("/ai-proxy"), async (route) => {
      await route.fulfill({ status: 413, contentType: "text/html", body: "<h1>Request Entity Too Large</h1>" });
    });

    await page.goto("/");
    await page.locator("#food-text").fill("a slice of toast");
    await page.locator("#food-parse-btn").click();

    const result = page.locator("#food-ai-result");
    await expect(result).toContainText("turned away");
    await expect(result).toContainText("HTTP 413");
    await expect(result).not.toContainText("netlify dev");
  });
});

test.describe("food photo -> saved with the meal", () => {
  test("the saved copy is shrunk to at most 1600 px and far smaller than the original", async ({ page, browserName }) => {
    // Same documented WebKit automation gap as the other photo-save tests (HANDOVER.md 2026-09-15):
    // saving a Blob to IndexedDB can't be driven reliably under Playwright's WebKit.
    test.skip(browserName === "webkit", "WebKit IndexedDB photo-save automation gap");
    await page.goto("/");
    const original = await attachHeavyPhoto(page);
    await page.locator("#food-text").fill("dinner");
    await page.locator('#food-form button[type="submit"]').click();
    await expect(page.locator("#food-photo-preview")).toBeHidden(); // form reset = saved

    const saved = await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open("rht-db", 1); r.onsuccess = () => res(r.result); });
      const all = await new Promise((res) => { const q = db.transaction("food").objectStore("food").getAll(); q.onsuccess = () => res(q.result); });
      const blob = all.find((e) => e.text === "dinner").photoBlob;
      const bmp = await createImageBitmap(blob);
      return { bytes: blob.size, width: bmp.width, height: bmp.height, type: blob.type };
    });
    expect(Math.max(saved.width, saved.height)).toBe(1600);
    expect(saved.width / saved.height).toBeCloseTo(original.width / original.height, 2);
    expect(saved.type).toBe("image/jpeg");
    expect(saved.bytes).toBeLessThan(original.bytes / 3);
  });
});
