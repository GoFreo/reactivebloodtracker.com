// Renders public/icon.svg into the PNG icons phones actually use. iOS ignores
// SVG for home-screen icons (apple-touch-icon must be PNG), and Android's
// maskable icons get cropped to a circle, so they need extra margin.
// Run after changing icon.svg:  node scripts/render-icons.mjs
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svg = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");
// Maskable: shrink the artwork into the central 80% "safe zone", keep full-bleed background.
const maskable = svg.replace(
  /(<rect[^>]*\/>)([\s\S]*)(<\/svg>)/,
  '$1<g transform="translate(96 96) scale(0.78) translate(-96 -96)">$2</g>$3'
);

const targets = [
  { file: "icon-180.png", size: 180, src: svg }, // apple-touch-icon
  { file: "icon-192.png", size: 192, src: svg },
  { file: "icon-512.png", size: 512, src: svg },
  { file: "icon-maskable-512.png", size: 512, src: maskable },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, src } of targets) {
  await page.setViewportSize({ width: size, height: size });
  const sized = src.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0">${sized}</body></html>`);
  await page.locator("svg").screenshot({ path: fileURLToPath(new URL(`../public/${file}`, import.meta.url)) });
  console.log("wrote", file);
}
await browser.close();
