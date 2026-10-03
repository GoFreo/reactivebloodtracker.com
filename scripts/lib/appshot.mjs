// Shared plumbing for scripts that photograph the real app: a phone-sized browser with the
// made-up demo patient loaded, plus numbered markers drawn on the page before a picture is taken.
// Used by scripts/guide-screenshots.mjs.

import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_NOW, TIMEZONE, demoData, localSettings, seedIndexedDB } from "../../video/demo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");
export const APP_URL = process.env.APP_URL || "http://localhost:4173/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Opens the app on the demo patient. `scheme` is "light" or "dark" (the app follows the phone's setting).
export async function openApp(browser, { scheme = "light", width = 390, height = 844, scale = 2 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    hasTouch: width < 600,
    isMobile: width < 600,
    colorScheme: scheme,
    locale: "en-AU",
    timezoneId: TIMEZONE,
    serviceWorkers: "block",
  });
  await context.clock.install({ time: FAKE_NOW });
  await context.addInitScript((settings) => {
    for (const [k, v] of Object.entries(settings)) localStorage.setItem(k, v);
  }, localSettings);
  const page = await context.newPage();
  await page.goto(APP_URL);
  await seedIndexedDB(page, demoData(ROOT));
  await page.reload();
  await page.locator("#latest-reading").waitFor({ state: "visible" });
  // Pictures are stills: no animation, no smooth scrolling, so what's captured is the settled state.
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}" });
  await page.locator("#splash").waitFor({ state: "hidden" }).catch(() => {});
  return { context, page };
}

export async function go(page, view) {
  await page.evaluate((v) => document.querySelector(`[data-nav="${v}"]`).click(), view);
  await page.locator(`#view-${view}`).waitFor({ state: "visible" });
  await page.evaluate(() => document.querySelector("#views").scrollTo(0, 0));
  await sleep(250);
}

export async function scrollInto(page, selector, block = "start") {
  await page.locator(selector).first().evaluate((el, b) => el.scrollIntoView({ block: b }), block);
  await sleep(200);
}

// Draws a numbered badge (and an outline box) on each target, in the page itself, so the marker is
// positioned by the real layout. `marks` is a list of:
//   { sel, n, at, out, pad, radius, box, dx, dy }
//   sel    a CSS selector, or { x, y, w, h } in page coordinates (a spot on a drawing)
//   at     where the badge sits: "tl" "tr" "bl" "br" (corners), or "l" "r" "t" "b" (middle of a side)
//   out    true to push a corner badge diagonally outward, clear of the text inside the box
//   box    false for a badge alone (no outline), e.g. on a line in a graph
// `bounds` ({ x0, y0, x1, y1 }) keeps every badge inside the picture that will be cropped.
export async function mark(page, marks, bounds, container = "body") {
  await page.evaluate(([marks, bounds, container]) => {
    document.querySelectorAll(".shot-mark").forEach((n) => n.remove());
    const layer = document.createElement("div");
    layer.className = "shot-mark";
    Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: 2147483000 });
    // Pictures of the printed report mark inside #print-summary: in print view, everything else is hidden.
    document.querySelector(container).appendChild(layer);
    const AMBER = "#f5a400";
    const d = 22;
    for (const m of marks) {
      let r;
      if (typeof m.sel === "string") {
        const el = document.querySelector(m.sel);
        if (!el) { console.warn("mark: not found", m.sel); continue; }
        r = el.getBoundingClientRect();
      } else {
        r = { left: m.sel.x, top: m.sel.y, width: m.sel.w, height: m.sel.h, right: m.sel.x + m.sel.w, bottom: m.sel.y + m.sel.h };
      }
      const pad = m.pad ?? 3;
      const L = r.left - pad, T = r.top - pad, R = r.right + pad, B = r.bottom + pad;
      if (m.box !== false) {
        const b = document.createElement("div");
        Object.assign(b.style, {
          position: "absolute", left: `${L}px`, top: `${T}px`, width: `${R - L}px`, height: `${B - T}px`,
          border: `2.5px solid ${AMBER}`, borderRadius: `${m.radius ?? 10}px`, boxShadow: "0 0 0 1px rgba(0,0,0,.25)",
        });
        layer.appendChild(b);
      }
      const at = m.at || "tl";
      const k = m.out ? 8 : 0; // push a corner badge outward by this much
      let cx, cy; // badge centre
      if (at === "tl") { cx = L - k; cy = T - k; }
      else if (at === "tr") { cx = R + k; cy = T - k; }
      else if (at === "bl") { cx = L - k; cy = B + k; }
      else if (at === "br") { cx = R + k; cy = B + k; }
      else if (at === "l") { cx = L - d / 2 - 3; cy = (T + B) / 2; }
      else if (at === "r") { cx = R + d / 2 + 3; cy = (T + B) / 2; }
      else if (at === "t") { cx = (L + R) / 2; cy = T - d / 2 - 3; }
      else { cx = (L + R) / 2; cy = B + d / 2 + 3; }
      cx += m.dx || 0; cy += m.dy || 0;
      let x = cx - d / 2, y = cy - d / 2;
      if (bounds) {
        x = Math.min(Math.max(x, bounds.x0 + 2), bounds.x1 - d - 2);
        y = Math.min(Math.max(y, bounds.y0 + 2), bounds.y1 - d - 2);
      }
      const c = document.createElement("div");
      c.textContent = String(m.n);
      Object.assign(c.style, {
        position: "absolute", left: `${x}px`, top: `${y}px`, width: `${d}px`, height: `${d}px`, borderRadius: "50%",
        background: AMBER, color: "#1a1200", font: "700 13px/22px -apple-system, system-ui, sans-serif", textAlign: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,.45)",
      });
      layer.appendChild(c);
    }
  }, [marks, bounds || null, container]);
}

export async function unmark(page) {
  await page.evaluate(() => document.querySelectorAll(".shot-mark").forEach((n) => n.remove()));
}

export async function launch() {
  return chromium.launch();
}
