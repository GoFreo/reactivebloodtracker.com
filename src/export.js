import { entryBody } from "./timeline.js";

function toCSVField(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildCSV(entries) {
  const rows = [["Type", "When", "Detail"].map(toCSVField).join(",")];
  for (const entry of entries) {
    rows.push([entry._kind, new Date(entry.timestamp).toLocaleString(), entryBody(entry)].map(toCSVField).join(","));
  }
  return rows.join("\n");
}

export function downloadCSV(entries, filename = "glucose-food-export.csv") {
  const blob = new Blob([buildCSV(entries)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// Renders into a hidden #print-summary element and calls window.print() directly,
// rather than window.open()-ing a new window: a PWA running standalone on an
// iPhone home screen has no normal browser chrome to put a new window in, and
// popup blockers can catch window.open() even in a regular browser tab. Printing
// the current document with a `@media print` rule works everywhere.
export function printSummary(entries, { from, to }) {
  const container = document.getElementById("print-summary");
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e._kind)}</td><td>${escapeHtml(new Date(e.timestamp).toLocaleString())}</td><td>${escapeHtml(entryBody(e))}</td></tr>`
    )
    .join("");
  container.innerHTML = `
    <h1>Glucose &amp; Food Summary</h1>
    <p>${escapeHtml(from)} to ${escapeHtml(to)}</p>
    <table><thead><tr><th>Type</th><th>When</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>
  `;
  window.print();
}
