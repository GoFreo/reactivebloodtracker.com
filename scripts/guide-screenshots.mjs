// Makes the pictures in the Help guide: the real app (a local production build) running on the
// made-up demo patient, photographed at phone size, with numbered amber markers on the parts the
// text describes. Light and dark versions of each. It never uses anyone's real records.
//
// Run:  npm run build && npm run preview -- --port 4173     (in another terminal)
//       node scripts/guide-screenshots.mjs                  → public/guide/<name>.webp and <name>-dark.webp
//       node scripts/guide-screenshots.mjs home-top graph   → only the named pictures
//
// Also writes src/guide/figures.js (each picture's pixel size) so the guide can reserve the space.
// Needs Python 3 with Pillow (for WebP) and demo-data-full-fidelity.json at the project root.
//
// Marker numbers are matched to the numbered lists under each figure in src/guide/chapters/*.html.
// If the app's screens change, re-run this and look at the pictures before shipping.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import path from "node:path";
import { launch, openApp, go, scrollInto, mark, unmark, sleep, ROOT } from "./lib/appshot.mjs";

const OUT = path.join(ROOT, "public", "guide");
const TMP = path.join(ROOT, "scripts", ".shots");
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const WIDTH = 390;
const HEADER = 66; // the app's header, in CSS pixels; most pictures start just below it

// A rectangle (page coordinates) for the nth element matching `sel`, or the first whose text matches.
const rect = (page, sel, { nth = 0, text } = {}) =>
  page.evaluate(([sel, nth, text]) => {
    let els = [...document.querySelectorAll(sel)];
    if (text) els = els.filter((e) => e.textContent.trim().startsWith(text));
    const el = els[nth];
    if (!el) throw new Error(`no element for ${sel} ${text || nth}`);
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, top: r.top, right: r.right, left: r.left };
  }, [sel, nth, text]);

// A point a given fraction of the way along an SVG polyline, in page coordinates.
const pointOnLine = (page, sel, fraction) =>
  page.evaluate(([sel, f]) => {
    const line = document.querySelector(sel);
    const pts = line.points;
    const p = pts.getItem(Math.min(pts.numberOfItems - 1, Math.round((pts.numberOfItems - 1) * f)));
    const m = line.ownerSVGElement.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, [sel, fraction]);

const dot = ({ x, y }, r = 5) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
const fromHeader = (page, endSel) => async () => ({ y: HEADER, h: Math.ceil((await rect(page, endSel)).bottom + 16 - HEADER) });

// ---- the pictures ----
// Each: name; setup(page); clip(page) → { y, h } in CSS pixels; marks(page) → numbered markers.
const SHOTS = [
  {
    name: "home-top",
    async setup(page) {
      await go(page, "home");
    },
    clip: async (page) => ({ y: 0, h: Math.ceil((await rect(page, "#latest-reading")).bottom + 12) }),
    marks: async () => [
      { sel: "#latest-reading-when", n: 1, at: "l", pad: 4 },
      { sel: "#latest-reading-value", n: 2, at: "l", pad: 6, radius: 14 },
      { sel: "#latest-reading-delta", n: 3, at: "r", pad: 4 },
      { sel: "#latest-reading-info-btn", n: 4, at: "r", pad: 3, radius: 16 },
      { sel: "#sync-status-badge", n: 5, at: "b", pad: 4, radius: 14 },
      { sel: "#header-tour-btn", n: 6, at: "b", pad: 2, radius: 20 },
    ],
  },
  {
    name: "home-glucose",
    async setup(page) {
      await go(page, "home");
      await scrollInto(page, "#glucose-form", "start");
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -52));
    },
    clip: async (page) => fromHeader(page, "#device-lights")(),
    marks: async () => [
      { sel: "#glucose-value", n: 1, at: "tr", out: true },
      { sel: "#glucose-unit", n: 2, at: "tr", out: true },
      { sel: "#glucose-time", n: 3, at: "tr", out: true },
      { sel: "#glucose-note", n: 4, at: "tr", out: true },
      { sel: "#home-sync-btn", n: 5, at: "tl", radius: 14 },
      { sel: "#device-lights", n: 6, at: "tl", radius: 16 },
    ],
  },
  {
    name: "home-food",
    async setup(page) {
      await go(page, "home");
      await scrollInto(page, "#food-form", "start");
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -54));
    },
    clip: async (page) => fromHeader(page, "#food-parse-btn")(),
    marks: async () => [
      { sel: "#food-text", n: 1, at: "tr", out: true },
      { sel: "#food-suggestions", n: 2, at: "tr", out: true, radius: 12 },
      { sel: "#food-camera-btn", n: 3, at: "tl", radius: 14 },
      { sel: "#food-barcode-btn", n: 4, at: "tl", radius: 14 },
      { sel: "#food-photo-import-btn", n: 5, at: "tr", radius: 14 },
      { sel: "#meal-builder > summary", n: 6, at: "tl", radius: 14 },
      { sel: "#food-time", n: 7, at: "tr", out: true },
      { sel: "#food-parse-btn", n: 8, at: "tl", radius: 14 },
    ],
  },
  {
    name: "meal-builder",
    async setup(page) {
      await go(page, "home");
      await click(page, "#meal-builder > summary");
      await click(page, "#saved-meals button");
      await sleep(300);
      await scrollInto(page, "#meal-builder", "start");
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -10));
    },
    clip: async (page) => fromHeader(page, "#save-meal-btn")(),
    marks: async () => [
      { sel: "#saved-meals button", n: 1, at: "tl", radius: 18 },
      { sel: ".meal-item:nth-child(1) .mi-grams", n: 2, at: "tr", out: true, pad: 2 },
      { sel: ".meal-item:nth-child(1) .mi-per100", n: 3, at: "tr", out: true, pad: 2 },
      { sel: ".meal-item:nth-child(1) .mi-carbs", n: 4, at: "tr", out: true, pad: 2 },
      { sel: ".meal-item:nth-child(1) .mi-portions", n: 5, at: "bl", radius: 16 },
      { sel: "#meal-total", n: 6, at: "tl", radius: 8 },
    ],
  },
  {
    name: "barcode-lookup",
    async setup(page) {
      await page.route("**/world.openfoodfacts.org/api/v2/product/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          // A made-up product from a made-up brand: the picture shows how the screen works, nothing more.
          body: JSON.stringify({ status: 1, product: { product_name: "Rolled Oats Quick", brands: "Example Mills", nutriments: { sugars_100g: 1.1, carbohydrates_100g: 60.4 }, serving_quantity: "40" } }),
        }),
      );
      await go(page, "home");
      await click(page, '[data-nav="my-foods"]');
      await page.locator("#view-my-foods").waitFor({ state: "visible" });
      await page.fill("#myfood-barcode", "9310645419336");
      await click(page, "#myfood-lookup-btn");
      await page.waitForFunction(() => document.querySelector("#myfood-name").value !== "");
      await sleep(300);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await scrollInto(page, "#myfood-barcode", "start");
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -52));
    },
    clip: async (page) => fromHeader(page, "#myfood-form button[type=submit]")(),
    marks: async () => [
      { sel: "#myfood-barcode", n: 1, at: "tr", out: true },
      { sel: "#myfood-lookup-btn", n: 2, at: "tl", radius: 14 },
      { sel: "#myfood-lookup-status", n: 3, at: "tr", out: true, radius: 8 },
      { sel: "#myfood-carbs", n: 4, at: "tr", out: true },
      { sel: "#myfood-serving", n: 5, at: "tr", out: true },
      { sel: "#myfood-form button[type=submit]", n: 6, at: "tl", radius: 14 },
    ],
  },
  {
    name: "graph-24h",
    async setup(page) {
      await go(page, "readings");
      await click(page, '#readings-view-toggle [data-mode="graph"]');
      await click(page, '#graph-range-toggle [data-hours="24"]');
      await sleep(400);
    },
    clip: async (page) => {
      const top = (await rect(page, "#readings-view-toggle")).top - 8;
      return { y: top, h: Math.ceil((await rect(page, "li.graph-crossing-item-low")).bottom + 24 - top) };
    },
    marks: async (page) => {
      const onLine = await pointOnLine(page, "polyline.graph-line", 0.72);
      return [
        { sel: dot(onLine, 3), n: 1, at: "t", box: false, dy: -4 },
        { sel: await rect(page, "text.graph-extremum-label", { nth: 0 }), n: 2, at: "tl", out: true, pad: 3, radius: 6 },
        { sel: await rect(page, "text.graph-extremum-label", { text: "4.5" }), n: 3, at: "r", pad: 3, radius: 6 },
        { sel: await rect(page, "path.graph-prick.warn-low"), n: 4, at: "l", pad: 5, radius: 6 },
        { sel: await rect(page, "path.graph-meal", { nth: 0 }), n: 5, at: "b", pad: 5, radius: 6 },
        { sel: await rect(page, "text.graph-axis-label", { text: "your low" }), n: 6, at: "l", pad: 3, radius: 6 },
        { sel: await rect(page, "li.graph-crossing-item-low"), n: 7, at: "bl", pad: 2, radius: 10 },
      ];
    },
  },
  {
    name: "meals-view",
    async setup(page) {
      await go(page, "readings");
      await click(page, '#readings-view-toggle [data-mode="meals"]');
      await sleep(300);
      await scrollInto(page, "#meal-gallery > :nth-child(4)", "start");
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -12));
    },
    clip: async (page) => {
      const r = await rect(page, "#meal-gallery > :nth-child(4)");
      return { y: r.top - 14, h: Math.ceil(r.h + 28) };
    },
    marks: async () => {
      const card = "#meal-gallery > :nth-child(4)";
      return [
        { sel: `${card} .meal-title`, n: 1, at: "tl", pad: 3, radius: 8 },
        { sel: `${card} .meal-stats > div:nth-child(1)`, n: 2, at: "tl", pad: 2, radius: 10 },
        { sel: `${card} .meal-stats > div:nth-child(2)`, n: 3, at: "tl", pad: 2, radius: 10 },
        { sel: `${card} .meal-stats > .stat-low`, n: 4, at: "tl", pad: 2, radius: 10 },
        { sel: `${card} .meal-note`, n: 5, at: "tl", pad: 3, radius: 8 },
      ];
    },
  },
  {
    name: "compare-view",
    async setup(page) {
      await go(page, "readings");
      await click(page, '#readings-view-toggle [data-mode="compare"]');
      await sleep(500);
    },
    clip: async (page) => {
      const top = (await rect(page, "#readings-view-toggle")).top - 8;
      const end = (await rect(page, ".cmp-summary + .field-hint")).bottom + 10;
      return { y: top, h: Math.ceil(end - top) };
    },
    marks: async (page) => {
      const onLine = await pointOnLine(page, "polyline.cmp-libre", 0.7);
      return [
        { sel: dot(onLine, 3), n: 1, at: "t", box: false, dy: -4 },
        { sel: await rect(page, "#compare-container path.graph-prick", { nth: 0 }), n: 2, at: "l", pad: 5, radius: 6 },
        { sel: await rect(page, ".cmp-summary tr", { text: "Average % difference" }), n: 3, at: "tl", pad: 1, radius: 4 },
        { sel: await rect(page, ".cmp-summary tr", { text: "Close to the finger-prick" }), n: 4, at: "tl", pad: 1, radius: 4 },
      ];
    },
  },
  {
    name: "devices-list",
    async setup(page) {
      await go(page, "settings");
      await page.evaluate(() => {
        const h = [...document.querySelectorAll("#view-settings h2")].find((e) => e.textContent.trim() === "My devices");
        h.scrollIntoView({ block: "start" });
      });
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -12));
      await sleep(200);
    },
    clip: async (page) => {
      const h2 = await page.evaluate(() => [...document.querySelectorAll("#view-settings h2")].find((e) => e.textContent.trim() === "My devices").getBoundingClientRect().top);
      const last = await page.evaluate(() => { const l = document.querySelectorAll(".device-item"); return l[l.length - 1].getBoundingClientRect().bottom; });
      return { y: h2 - 8, h: Math.ceil(last + 10 - (h2 - 8)) };
    },
    marks: async () => [
      { sel: ".device-item:nth-child(1) .device-info", n: 1, at: "tl", pad: 3, radius: 8 },
      { sel: ".device-item:nth-child(1) .device-status", n: 2, at: "tr", pad: 2, radius: 14 },
      { sel: ".device-item:nth-child(3)", n: 3, at: "tl", pad: 0, radius: 14 },
    ],
  },
  {
    name: "thresholds",
    async setup(page) {
      await go(page, "settings");
    },
    clip: async (page) => fromHeader(page, "#threshold-unit")(),
    marks: async (page) => [
      { sel: "#threshold-low", n: 1, at: "tr", out: true },
      { sel: await rect(page, "#view-settings p.field-hint", { text: "You can set this" }), n: 2, at: "tr", out: true, pad: 3, radius: 8 },
      { sel: "#threshold-high", n: 3, at: "tr", out: true },
      { sel: "#threshold-unit", n: 4, at: "tr", out: true },
    ],
  },
  {
    name: "spike-prompt",
    async setup(page) {
      await go(page, "home");
    },
    clip: async (page) => {
      const r = await rect(page, "#spike-prompts .spike-card");
      return { y: r.top - 14, h: Math.ceil(r.h + 28) };
    },
    marks: async () => [
      { sel: "#spike-prompts .spike-summary", n: 1, at: "tl", pad: 3, radius: 8 },
      { sel: "#spike-prompts .spike-question", n: 2, at: "tl", pad: 3, radius: 8 },
      { sel: "#spike-prompts .spike-actions button[data-answer=yes]", n: 3, at: "tl", radius: 14 },
      { sel: "#spike-prompts .spike-actions button[data-answer=unexplained]", n: 4, at: "tr", radius: 14 },
      { sel: "#spike-prompts .spike-actions button[data-answer=glitch]", n: 5, at: "bl", radius: 14 },
      { sel: "#spike-prompts .spike-actions button[data-answer=dismiss]", n: 6, at: "br", radius: 14 },
    ],
  },
  {
    name: "export-dates",
    viewport: { width: 390, height: 1500 },
    async setup(page) {
      await go(page, "export");
    },
    clip: async (page) => {
      const bottom = (await rect(page, "#export-preview")).bottom + 14;
      return { y: HEADER, h: Math.ceil(bottom - HEADER) };
    },
    marks: async () => [
      { sel: ".export-presets", n: 1, at: "tl", radius: 14 },
      { sel: "#export-from", n: 2, at: "tr", out: true },
      { sel: "#export-preview", n: 3, at: "tl", radius: 12 },
    ],
  },
  {
    name: "export-make",
    viewport: { width: 390, height: 1500 },
    async setup(page) {
      await go(page, "export");
      await page.fill("#export-notes", "Ask about the lows before lunch");
      await page.evaluate(() => document.querySelector("#export-notes").closest("label").scrollIntoView({ block: "start" }));
      await page.evaluate(() => document.querySelector("#views").scrollBy(0, -70));
    },
    clip: async (page) => {
      const top = (await rect(page, ".export-h", { nth: 1 })).top - 10;
      const bottom = (await rect(page, "#export-csv-btn")).bottom + 18;
      return { y: top, h: Math.ceil(bottom - top) };
    },
    marks: async () => [
      { sel: "#export-notes", n: 1, at: "tr", out: true },
      { sel: "#export-print-btn", n: 2, at: "tl", radius: 14 },
      { sel: ".export-columns", n: 3, at: "tr", out: true, radius: 12 },
      { sel: "#export-csv-btn", n: 4, at: "tl", radius: 14 },
    ],
  },
  {
    // The printed report, shown as a page (A4 width, the browser's print view) rather than on a phone.
    name: "report-page",
    viewport: { width: 794, height: 1123 },
    markIn: "#print-summary",
    sameInDark: true, // paper is white whatever the phone's setting
    async setup(page) {
      await page.addStyleTag({ content: "html,body{background:#fff !important} #print-summary{padding:30px 38px !important}" });
      await page.evaluate(() => {
        window.print = () => {};
        localStorage.setItem("rht-appointment-notes", "Ask about the lows before lunch");
      });
      await go(page, "export");
      await page.click("#export-print-btn");
      await page.emulateMedia({ media: "print" });
      await sleep(400);
    },
    clip: async () => ({ y: 0, h: 800 }),
    marks: async (page) => [
      { sel: "#print-summary h1", n: 1, at: "tl", pad: 3, radius: 6 },
      { sel: "#print-summary .rep-box", n: 2, at: "tr", out: true, radius: 6 },
      { sel: "#print-summary .rep-kv", n: 3, at: "tl", pad: 2, radius: 4 },
      { sel: "#print-summary .print-graph", n: 4, at: "tr", out: true, radius: 6 },
    ],
  },
];

function toWebp(png, webp) {
  execFileSync("python3", ["-c", `from PIL import Image; Image.open(${JSON.stringify(png)}).convert("RGB").save(${JSON.stringify(webp)}, "WEBP", quality=82, method=6)`]);
}

const wanted = process.argv.slice(2);
const sizes = {};
const browser = await launch();
for (const scheme of ["light", "dark"]) {
  const phone = await openApp(browser, { scheme });
  for (const shot of SHOTS) {
    if (wanted.length && !wanted.includes(shot.name)) continue;
    if (shot.sameInDark && scheme === "dark") {
      copyFileSync(path.join(OUT, `${shot.name}.webp`), path.join(OUT, `${shot.name}-dark.webp`));
      sizes[shot.name] = sizes[shot.name] || {};
      console.log(`dark  ${shot.name}-dark.webp  (same as light)`);
      continue;
    }
    // A picture that needs its own window size (the printed report) gets its own browser context.
    const own = shot.viewport ? await openApp(browser, { scheme, ...shot.viewport }) : null;
    const { page } = own || phone;
    const width = shot.viewport ? shot.viewport.width : WIDTH;
    try {
      await shot.setup(page);
      await sleep(250);
      const { y, h } = await shot.clip(page);
      const y0 = Math.max(0, y);
      const marks = await shot.marks(page);
      await mark(page, marks, { x0: 0, y0, x1: width, y1: y0 + h }, shot.markIn || "body");
      const png = path.join(TMP, `${shot.name}-${scheme}.png`);
      await page.screenshot({ path: png, clip: { x: 0, y: y0, width, height: h } });
      await unmark(page);
      const file = `${shot.name}${scheme === "dark" ? "-dark" : ""}.webp`;
      toWebp(png, path.join(OUT, file));
      sizes[shot.name] = { w: width * 2, h: Math.round(h * 2), marks: marks.length };
      console.log(`${scheme.padEnd(5)} ${file}  ${width * 2}x${Math.round(h * 2)}`);
    } catch (err) {
      console.error(`FAILED ${shot.name} (${scheme}): ${err.message}`);
      process.exitCode = 1;
    }
    if (own) await own.context.close();
  }
  await phone.context.close();
}
await browser.close();
rmSync(TMP, { recursive: true, force: true });

if (!wanted.length) {
  const body = Object.entries(sizes).map(([k, v]) => `  ${JSON.stringify(k)}: { w: ${v.w}, h: ${v.h}, marks: ${v.marks} },`).join("\n");
  writeFileSync(
    path.join(ROOT, "src", "guide", "figures.js"),
    `// Written by scripts/guide-screenshots.mjs. Each picture's pixel size (so the guide can reserve its space) and\n// how many numbered markers it carries (tests/guide.spec.js checks the caption lists the same number).\nexport const FIGURES = {\n${body}\n};\n`,
  );
  console.log("wrote src/guide/figures.js");
}
