// The Help guide in the browser. Loaded only when someone opens Help (main.js imports it
// dynamically), so the long text, its pictures and its sources cost nothing until then.
//
// The content is built by render.js from chapters/*.html and sources.js; this file puts it on the
// page and makes it work: a contents list, "Go deeper" notes, small numbered citations that jump
// to the Sources page (and back), and a search box. Scrolling is done in code rather than with
// #links, because the app switches screens itself and a hash would fight it.

import { SOURCES, ACCESSED } from "./sources.js";
import { FIGURES } from "./figures.js";
import { composeGuide, buildTocHTML } from "./render.js";

const INTRO_HTML = `
  <div class="g-intro">
    <p><strong>How this guide works.</strong> The first part of each chapter is short and plain. Tap <em>Go deeper</em> for the detail behind it. Small raised numbers, like <span class="fn-example">1</span>, point to the numbered Sources at the back, so you can see where a fact came from and read the original. This is general information, not advice for you. Your own doctor, diabetes educator or dietitian comes first.</p>
    <label class="g-search-label">Search the guide
      <input type="search" class="g-search" placeholder="e.g. vitamin C, calibration, barcode" autocomplete="off" />
    </label>
    <p class="field-hint g-search-status" aria-live="polite"></p>
    <div class="g-actions">
      <button type="button" class="link-btn" data-g-all="open">Open every chapter</button>
      <button type="button" class="link-btn" data-g-all="close">Close all</button>
    </div>
  </div>`;

let mounting = null;

export function mountGuide(root) {
  if (!mounting) mounting = build(root).catch((err) => {
    mounting = null;
    root.innerHTML = '<p class="field-hint">The guide couldn\'t load. Check your connection, then reopen Help.</p>';
    console.error(err);
  });
  return mounting;
}

async function build(root) {
  root.innerHTML = '<p class="field-hint">Loading the guide…</p>';
  const { CHAPTERS_HTML } = await import("./content.js");
  const { html, toc } = composeGuide(CHAPTERS_HTML, SOURCES, FIGURES, ACCESSED);
  root.innerHTML = `${INTRO_HTML}${buildTocHTML(toc)}<div class="g-chapters">${html}</div>`;
  wire(root);
}

// Open every <details> around an element, so it can be seen, then bring it into view.
function reveal(el) {
  for (let n = el; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("g-flash");
  setTimeout(() => el.classList.remove("g-flash"), 1800);
}

function wire(root) {
  root.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (link) {
      // A small number in the text: open the Sources chapter and show that entry.
      if (link.matches("a.fn-link")) {
        e.preventDefault();
        const target = root.querySelector(`#src-${link.dataset.src}`);
        if (target) reveal(target);
        return;
      }
      // "↩ 2" in the Sources: go back to the place it was cited.
      if (link.matches("a.g-back")) {
        e.preventDefault();
        const target = root.querySelector(`#${CSS.escape(link.dataset.cite)}`);
        if (target) reveal(target);
        return;
      }
      // The contents list.
      if (link.matches("a.g-toc-link")) {
        e.preventDefault();
        const target = root.querySelector(`#${CSS.escape(link.dataset.chapter)}`);
        if (target) {
          target.open = true;
          target.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        return;
      }
    }
    const all = e.target.closest("[data-g-all]");
    if (all) {
      const open = all.dataset.gAll === "open";
      for (const d of root.querySelectorAll("details.g-chapter")) d.open = open;
    }
  });

  const input = root.querySelector(".g-search");
  const status = root.querySelector(".g-search-status");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    const chapters = root.querySelectorAll("details.g-chapter");
    for (const ch of chapters) {
      const hit = !q || ch.textContent.toLowerCase().includes(q);
      ch.hidden = !hit;
      if (hit) shown++;
      if (q.length >= 3) ch.open = hit;
    }
    for (const li of root.querySelectorAll(".g-toc li")) {
      const target = root.querySelector(`#${CSS.escape(li.querySelector("a").dataset.chapter)}`);
      li.hidden = target.hidden;
    }
    status.textContent = q ? (shown ? `${shown} chapter${shown === 1 ? "" : "s"} mention "${input.value.trim()}".` : `Nothing in the guide mentions "${input.value.trim()}".`) : "";
  });
}
