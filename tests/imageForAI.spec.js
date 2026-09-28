import { test, expect } from "@playwright/test";
import { scaledSize, AI_MAX_EDGE } from "../src/imageForAI.js";

// Pure size math only — no browser, no canvas. The actual decode/re-encode path is
// exercised inside real browser engines by tests/aiPhoto.spec.js.

test.describe("scaledSize (photo downscale math)", () => {
  test("leaves an image that already fits untouched", () => {
    expect(scaledSize(1000, 800)).toEqual({ width: 1000, height: 800 });
    expect(scaledSize(AI_MAX_EDGE, AI_MAX_EDGE)).toEqual({ width: AI_MAX_EDGE, height: AI_MAX_EDGE });
  });

  test("scales a landscape camera photo down to the long-edge cap, keeping aspect ratio", () => {
    // 4032x3024 is a typical 12MP iPhone photo (4:3).
    expect(scaledSize(4032, 3024)).toEqual({ width: 1568, height: 1176 });
  });

  test("scales a portrait camera photo down by its height instead", () => {
    expect(scaledSize(3024, 4032)).toEqual({ width: 1176, height: 1568 });
  });

  test("never collapses an extreme aspect ratio to a zero-sized edge", () => {
    const { width, height } = scaledSize(20000, 10);
    expect(width).toBe(AI_MAX_EDGE);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  test("honours a custom cap", () => {
    expect(scaledSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});
