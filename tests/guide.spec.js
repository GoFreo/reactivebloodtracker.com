import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, ACCESSED } from "../src/guide/sources.js";
import { FIGURES } from "../src/guide/figures.js";
import { renderGuide, renderFigures, buildSourcesHTML, tocFromHtml, citedIds, composeGuide } from "../src/guide/render.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAPTER_DIR = path.join(ROOT, "src", "guide", "chapters");
const chapterFiles = readdirSync(CHAPTER_DIR).filter((f) => f.endsWith(".html")).sort();
const chapters = chapterFiles.map((f) => ({ file: f, html: readFileSync(path.join(CHAPTER_DIR, f), "utf8") }));
const ALL = chapters.map((c) => c.html).join("\n");

// ---------------------------------------------------------------------------------------------
// The text of the guide, checked without a browser
// ---------------------------------------------------------------------------------------------
test.describe("guide content", () => {
  test("every citation names a source that exists, and every source is cited somewhere", () => {
    const ids = new Set(SOURCES.map((s) => s.id));
    const cited = new Set(citedIds(ALL));
    for (const id of cited) expect(ids.has(id), `cited but not in sources.js: ${id}`).toBe(true);
    for (const id of ids) expect(cited.has(id), `in sources.js but never cited: ${id}`).toBe(true);
  });

  test("each source has a unique id, a secure link, a publisher and a note on what it was used for", () => {
    const seen = new Set();
    for (const s of SOURCES) {
      expect(seen.has(s.id), `duplicate id ${s.id}`).toBe(false);
      seen.add(s.id);
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.title.length, s.id).toBeGreaterThan(5);
      expect(s.publisher.length, s.id).toBeGreaterThan(2);
      expect(s.usedFor.length, s.id).toBeGreaterThan(20);
    }
    expect(ACCESSED).toMatch(/\d{4}/);
  });

  test("a mistyped citation is refused instead of shipping as a dead footnote", () => {
    expect(() => renderGuide("<p>Hello[[no-such-source]]</p>", SOURCES)).toThrow(/isn't in sources.js/);
  });

  test("numbers follow the order sources first appear, and a repeat keeps its number", () => {
    const a = SOURCES[3].id;
    const b = SOURCES[1].id;
    const { html, order, numberOf, cites } = renderGuide(`<p>x[[${a}]] y[[${b}]] z[[${a},${b}]]</p>`, SOURCES);
    expect(order).toEqual([a, b]);
    expect(numberOf.get(a)).toBe(1);
    expect(numberOf.get(b)).toBe(2);
    expect(cites.get(a)).toEqual(["cite-1-1", "cite-1-2"]);
    expect(cites.get(b)).toEqual(["cite-2-1", "cite-2-2"]);
    expect(html).toContain('href="#src-1"');
    expect(html).toContain('id="cite-2-2"');
    expect(html).not.toContain("[[");
  });

  test("the Sources page lists every source once, in numbered order, with a way back to each citation", () => {
    const { order, cites } = renderGuide(ALL, SOURCES);
    const html = buildSourcesHTML({ order, cites }, SOURCES, ACCESSED);
    expect(order.length).toBe(SOURCES.length);
    expect((html.match(/<li id="src-\d+"/g) || []).length).toBe(SOURCES.length);
    for (const [id, anchors] of cites) {
      expect(anchors.length, id).toBeGreaterThan(0);
      for (const a of anchors) expect(html).toContain(`data-cite="${a}"`);
    }
    expect(html).toContain("Used for:");
  });

  test("chapters are tidy: balanced tags, unique ids, a teaser and a title each", () => {
    const ids = new Set();
    for (const { file, html } of chapters) {
      expect((html.match(/<details/g) || []).length, `${file} opens`).toBe((html.match(/<\/details>/g) || []).length);
      expect(html.trimStart().startsWith('<details class="g-chapter"'), `${file} starts with a chapter`).toBe(true);
    }
    const toc = tocFromHtml(ALL);
    expect(toc.length).toBe(chapters.length);
    for (const c of toc) {
      expect(ids.has(c.id), `duplicate chapter id ${c.id}`).toBe(false);
      ids.add(c.id);
      expect(c.title.length, c.id).toBeGreaterThan(3);
      expect(c.teaser.length, c.id).toBeGreaterThan(10);
    }
  });

  test("every figure exists in light and dark, has alt text, and its caption lists as many callouts as the picture has markers", () => {
    const figs = [...ALL.matchAll(/<figure class="g-figure" data-fig="([^"]+)" data-alt="([^"]*)"(?: data-wide)?>([\s\S]*?)<\/figure>/g)];
    expect(figs.length).toBeGreaterThan(5);
    // Every figure tag must have been matched, so a misordered attribute can't hide one from these checks.
    expect((ALL.match(/data-fig="/g) || []).length).toBe(figs.length);
    for (const [, name, alt, body] of figs) {
      expect(FIGURES[name], `figure ${name} is in figures.js`).toBeTruthy();
      expect(alt.length, `${name} alt text`).toBeGreaterThan(40);
      for (const suffix of ["", "-dark"]) {
        expect(existsSync(path.join(ROOT, "public", "guide", `${name}${suffix}.webp`)), `${name}${suffix}.webp`).toBe(true);
      }
      const callouts = (body.match(/<ol class="g-callouts">([\s\S]*?)<\/ol>/) || [, ""])[1];
      expect((callouts.match(/<li>/g) || []).length, `${name}: callouts in the caption vs markers on the picture`).toBe(FIGURES[name].marks);
    }
    // And no unused picture is left behind in figures.js.
    for (const name of Object.keys(FIGURES)) expect(ALL.includes(`data-fig="${name}"`), `${name} is used`).toBe(true);
  });

  test("a figure that hasn't been generated is refused", () => {
    expect(() => renderFigures('<figure class="g-figure" data-fig="nope" data-alt="x">', FIGURES)).toThrow(/hasn't been generated/);
  });

  test("the whole guide composes: Sources chapter added, nothing left unrendered", () => {
    const { html, toc, order } = composeGuide(ALL, SOURCES, FIGURES, ACCESSED);
    expect(html).not.toContain("[[");
    expect(html).not.toContain('data-fig="');
    expect(toc.at(-1).id).toBe("ch-sources");
    expect(order.length).toBe(SOURCES.length);
    expect(html).toContain("Open Food Facts");
  });

  test("stays descriptive: no dosing, no portion or 'safe amount' advice", () => {
    // Sentences that say the app does NOT do these things are fine, so only un-negated ones are checked.
    const sentences = ALL.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
    const negated = /\b(never|not|no|nor|without)\b|n't\b/i;
    const text = sentences.filter((s) => !negated.test(s)).join(" ");
    const banned = [
      /\byou should (eat|avoid|take|inject|have|drink|cut)\b/i,
      /\b\d+(\.\d+)?\s*units?\s+of\s+(rapid|fast|long|insulin)/i,
      /\bsafe (amount|portion|dose|serving)\b/i,
      /\bbolus\b/i,
      /\bdiagnos(e|ed) you\b/i,
      /\bwe recommend (that )?you (eat|take|inject)\b/i,
    ];
    for (const re of banned) expect(text, String(re)).not.toMatch(re);
  });
});

// ---------------------------------------------------------------------------------------------
// The guide in the app
// ---------------------------------------------------------------------------------------------
const openHelp = async (page) => {
  await page.goto("/");
  await page.locator('.secondary-links [data-nav="help"]').click();
  await expect(page.locator("#view-help")).toBeVisible();
  await expect(page.locator("#guide-root .g-chapter").first()).toBeAttached();
};

test.describe("guide in the app", () => {
  test("Help builds the guide on first open: a contents list, every chapter, and the Sources at the back", async ({ page }) => {
    await openHelp(page);
    const toc = page.locator("#guide-root .g-toc-link");
    await expect(toc).toHaveCount(chapters.length + 1); // the chapters plus Sources
    await expect(toc.first()).toContainText("Why use this");
    await expect(page.locator("#guide-root .g-chapter").last()).toHaveAttribute("id", "ch-sources");
    await expect(page.locator("#guide-root .g-source")).toHaveCount(SOURCES.length);
    // The always-visible safety text is still there, ahead of the guide.
    await expect(page.locator("#view-help")).toContainText("does not");
    await expect(page.locator("#view-help")).toContainText("call 000");
  });

  test("the guide is its own download: Home doesn't fetch it until Help opens", async ({ page }) => {
    const chunks = [];
    page.on("request", (r) => /\/assets\/(guide|content)-/.test(r.url()) && chunks.push(r.url()));
    await page.goto("/");
    await expect(page.locator("#view-home")).toBeVisible();
    expect(chunks).toEqual([]);
    await page.locator('.secondary-links [data-nav="help"]').click();
    await expect(page.locator("#guide-root .g-chapter").first()).toBeAttached();
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("a chapter opens, and Go deeper opens inside it", async ({ page }) => {
    await openHelp(page);
    const chapter = page.locator("#ch-accuracy");
    await expect(chapter).not.toHaveJSProperty("open", true);
    await chapter.locator("> summary").click();
    await expect(chapter).toHaveJSProperty("open", true);
    const deeper = chapter.locator("details.g-deeper").first();
    await expect(deeper.locator(".g-deeper-body")).toBeHidden();
    await deeper.locator("> summary").click();
    await expect(deeper.locator(".g-deeper-body")).toBeVisible();
    await expect(chapter).toContainText("falling fast");
  });

  test("a small number opens the Sources at that entry, and the arrow takes you back", async ({ page }) => {
    await openHelp(page);
    await page.evaluate(() => document.querySelectorAll("#guide-root details").forEach((d) => (d.open = true)));
    const first = page.locator("#ch-why a.fn-link").first();
    const n = await first.getAttribute("data-src");
    await page.evaluate(() => (document.querySelector("#ch-sources").open = false));
    await first.click();
    await expect(page.locator("#ch-sources")).toHaveJSProperty("open", true);
    const entry = page.locator(`#src-${n}`);
    await expect(entry).toBeVisible();
    await expect(entry.locator(".g-source-used")).toContainText("Used for:");
    await expect(entry.locator("a").first()).toHaveAttribute("target", "_blank");
    await entry.locator("a.g-back").first().click();
    await expect(page.locator("#ch-why a.fn-link").first()).toBeInViewport();
  });

  test("search narrows the chapters and says what it found", async ({ page }) => {
    await openHelp(page);
    await page.locator(".g-search").fill("vitamin C");
    await expect(page.locator(".g-search-status")).toContainText("mention");
    await expect(page.locator("#ch-accuracy")).toBeVisible();
    await expect(page.locator("#ch-glossary")).toBeHidden();
    await page.locator(".g-search").fill("zzzzqq");
    await expect(page.locator(".g-search-status")).toContainText("Nothing in the guide");
    await page.locator(".g-search").fill("");
    await expect(page.locator("#ch-glossary")).toBeVisible();
  });

  test("pictures load and carry their alt text; a dark phone gets the dark picture", async ({ page }) => {
    await openHelp(page);
    await page.locator("#ch-graph > summary").click();
    const img = page.locator("#ch-graph .g-figure img").first();
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute("alt", /graph/i);
    await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(100);
    expect(await img.evaluate((el) => el.currentSrc)).toMatch(/graph-24h\.webp$/);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => img.evaluate((el) => el.currentSrc)).toMatch(/graph-24h-dark\.webp$/);
  });

  test("the tour page points to the full guide", async ({ page }) => {
    await page.goto("/");
    await page.locator('.secondary-links [data-nav="tour"]').click();
    await expect(page.locator("#view-tour")).toBeVisible();
    await expect(page.locator("#view-tour .tour-more-top button")).toContainText("full guide");
    await page.locator("#view-tour .tour-more:not(.tour-more-top) button").click();
    await expect(page.locator("#view-help")).toBeVisible();
  });
});
