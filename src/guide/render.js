// Turns the Guide's source text into what readers see: citation tokens become small numbered
// links, and the numbered Sources page at the back is built from the same list.
//
// Pure functions with no DOM or storage, so tests/guide.spec.js can run them in Node.
//
// In the guide text, a citation is written [[source-id]] or [[id-one,id-two]]. Numbers are given
// by order of first appearance in the document, so the first source a reader meets is "1" and the
// back page reads in the order they met them. Citing an id that isn't in sources.js throws, so a
// typo can't ship as a dead footnote.

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const TOKEN = /\[\[([a-z0-9-]+(?:\s*,\s*[a-z0-9-]+)*)\]\]/g;

// Returns { html, order, numberOf, cites }:
//   order    source ids in the order they first appear
//   numberOf Map id -> number (1-based)
//   cites    Map id -> the element ids of each place that source is cited (for the back-links)
export function renderGuide(html, sources) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const numberOf = new Map();
  const cites = new Map();
  const order = [];

  const out = html.replace(TOKEN, (_, list) => {
    const links = list.split(",").map((raw) => {
      const id = raw.trim();
      const src = byId.get(id);
      if (!src) throw new Error(`The guide cites a source that isn't in sources.js: "${id}"`);
      if (!numberOf.has(id)) {
        order.push(id);
        numberOf.set(id, order.length);
        cites.set(id, []);
      }
      const n = numberOf.get(id);
      const anchor = `cite-${n}-${cites.get(id).length + 1}`;
      cites.get(id).push(anchor);
      return `<a href="#src-${n}" class="fn-link" id="${anchor}" data-src="${n}" aria-label="Source ${n}: ${escapeHtml(src.title)}">${n}</a>`;
    });
    return `<sup class="fn">${links.join('<span class="fn-sep">,</span>')}</sup>`;
  });

  return { html: out, order, numberOf, cites };
}

// The numbered list at the back. Each entry says what the guide used it for and links back to
// every place it was cited, so a reader can go from a number to the source and back again.
export function buildSourcesHTML({ order, cites }, sources, accessed) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const items = order.map((id, i) => {
    const s = byId.get(id);
    const n = i + 1;
    const back = cites
      .get(id)
      .map((anchor, k) => `<a href="#${anchor}" class="g-back" data-cite="${anchor}" aria-label="Back to place ${k + 1} where source ${n} is cited">↩ ${k + 1}</a>`)
      .join(" ");
    const when = s.date && s.date !== "undated" ? ` · ${escapeHtml(s.date)}` : "";
    return (
      `<li id="src-${n}" class="g-source" value="${n}">` +
      `<div class="g-source-title"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></div>` +
      `<div class="g-source-meta">${escapeHtml(s.publisher)}${when}</div>` +
      `<div class="g-source-used"><strong>Used for:</strong> ${escapeHtml(s.usedFor)}</div>` +
      `<div class="g-source-back">Cited in the text at ${back}</div>` +
      `</li>`
    );
  });
  return (
    `<p class="g-note">Numbers match the small raised numbers in the text. Each source was opened and read on ${escapeHtml(accessed)}. ` +
    `Listing a source is not an endorsement by its authors, and where these pages change, the original is the one to trust.</p>` +
    `<ol class="g-sources">${items.join("")}</ol>`
  );
}

// Chapters are <details class="g-chapter" id="ch-..." data-teaser="..."><summary>Title</summary>.
// The contents list at the top is built from them so it can't fall out of step with the text.
export function tocFromHtml(html) {
  const out = [];
  const re = /<details class="g-chapter" id="([a-z0-9-]+)"(?: data-teaser="([^"]*)")?[^>]*>\s*<summary>([\s\S]*?)<\/summary>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ id: m[1], teaser: m[2] || "", title: m[3].replace(/<[^>]+>/g, "").trim() });
  }
  return out;
}

export function buildTocHTML(toc) {
  return (
    `<nav class="g-toc" aria-label="Guide contents"><ol>` +
    toc
      .map(
        (c, i) =>
          `<li><a href="#${c.id}" class="g-toc-link" data-chapter="${c.id}"><span class="g-toc-num">${i + 1}</span>` +
          `<span class="g-toc-text"><span class="g-toc-title">${escapeHtml(c.title)}</span>` +
          (c.teaser ? `<span class="g-toc-teaser">${escapeHtml(c.teaser)}</span>` : "") +
          `</span></a></li>`
      )
      .join("") +
    `</ol></nav>`
  );
}

// Every [[id]] used in a text, in order (with repeats). For tests and tooling.
export function citedIds(html) {
  const ids = [];
  for (const m of html.matchAll(TOKEN)) for (const id of m[1].split(",")) ids.push(id.trim());
  return ids;
}

// Replaces <figure class="g-figure" data-fig="name" data-alt="..."> with the same figure holding the
// picture: a light and a dark version (the phone's setting picks one), sized so the page doesn't jump.
// A figure that hasn't been generated by scripts/guide-screenshots.mjs throws, so it can't ship broken.
export function renderFigures(html, figures) {
  return html.replace(/<figure class="g-figure" data-fig="([a-z0-9-]+)" data-alt="([^"]*)"( data-wide)?>/g, (_, name, alt, wide) => {
    const f = figures[name];
    if (!f) throw new Error(`The guide shows a figure that hasn't been generated: "${name}"`);
    return (
      `<figure class="g-figure${wide ? " g-wide" : ""}"><picture>` +
      `<source media="(prefers-color-scheme: dark)" srcset="/guide/${name}-dark.webp">` +
      `<img src="/guide/${name}.webp" alt="${alt}" width="${f.w}" height="${f.h}" loading="lazy" decoding="async">` +
      `</picture>`
    );
  });
}

const CREDITS_HTML =
  `<h3>Credits and acknowledgements</h3>` +
  `<ul class="g-list">` +
  `<li>Barcode product data comes from <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">Open Food Facts</a> and its contributors, under the Open Database Licence (ODbL).</li>` +
  `<li>FreeStyle Libre, FreeStyle LibreLink and LibreLinkUp are trademarks of Abbott. Dexcom and Dexcom ONE+ are trademarks of Dexcom, Inc. Accu-Chek is a trademark of Roche. Other names belong to their owners.</li>` +
  `<li>This app is independent. It is not made, endorsed or supported by Abbott, Dexcom, Roche, Open Food Facts, or any of the organisations whose pages are listed here.</li>` +
  `</ul>`;

// Builds the whole guide from the chapter files: figures filled in, citations numbered, and the
// Sources chapter added at the back. Returns { html, toc, order } (order = source ids as numbered).
export function composeGuide(chaptersHtml, sources, figures, accessed) {
  const { html: cited, order, cites } = renderGuide(renderFigures(chaptersHtml, figures), sources);
  const sourcesChapter =
    `<details class="g-chapter" id="ch-sources" data-teaser="Where every fact came from, numbered to match the small numbers in the text.">` +
    `<summary>Sources and acknowledgements</summary><div class="g-body">` +
    buildSourcesHTML({ order, cites }, sources, accessed) +
    CREDITS_HTML +
    `</div></details>`;
  const html = `${cited}\n${sourcesChapter}`;
  return { html, toc: tocFromHtml(html), order };
}
