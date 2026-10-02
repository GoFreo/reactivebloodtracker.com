import { entryBody, buildGraphHTML } from "./timeline.js";
import { saveGlucoseReading } from "./glucose.js";
import { saveFoodEntry } from "./food.js";
import { saveDiaryNote } from "./diary.js";
import { formatDate } from "./dateformat.js";

function toCSVField(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// Columns 1-3 (Type/When/Detail) are the original human-readable export —
// unchanged, since that's what's already been shared/printed. Columns 4+ are
// additive, structured, and exist only so importCSV() below can reconstruct
// entries losslessly — a plain viewer (Excel, a nurse) can ignore them.
const HEADER = ["Type", "When", "Detail", "Timestamp", "Value", "Unit", "Note", "Text"];

export function buildCSV(entries) {
  const rows = [HEADER.map(toCSVField).join(",")];
  for (const entry of entries) {
    rows.push(
      [
        entry._kind,
        formatDate(entry.timestamp),
        entryBody(entry),
        entry.timestamp,
        entry._kind === "glucose" ? entry.value : "",
        entry._kind === "glucose" ? entry.unit : "",
        entry._kind === "glucose" ? entry.note || "" : "",
        entry._kind === "food" || entry._kind === "diary" ? entry.text || "" : "",
      ]
        .map(toCSVField)
        .join(",")
    );
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

// Minimal RFC-4180-ish parser: handles quoted fields, doubled-quote escaping,
// and commas/newlines inside quotes — matches exactly what toCSVField above
// produces, which is the only input this ever needs to read back.
function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Re-imports a file this app exported (the "Mac/phone transfer" workaround —
// see HANDOVER.md 2026-09-14: a web app can't detect a cabled phone, so the
// real path is export-on-one-device, hand the file over, import-on-the-other).
// Skips rows that look like an exact duplicate of something already in `existing`
// so importing the same file twice doesn't double up entries.
export async function importCSV(text, existing = { glucose: [], food: [], diary: [] }) {
  const rows = parseCSVRows(text);
  if (!rows.length) return { imported: 0, skipped: 0 };
  const header = rows[0];
  const idx = Object.fromEntries(HEADER.map((h) => [h, header.indexOf(h)]));
  if (idx.Type === -1 || idx.Timestamp === -1) {
    throw new Error("This file doesn't look like an export from this app (missing Type/Timestamp columns).");
  }

  const isDuplicate = (kind, timestamp, key) =>
    (existing[kind] || []).some((e) => e.timestamp === timestamp && (kind === "glucose" ? e.value === key : e.text === key));

  let imported = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const type = row[idx.Type];
    const timestamp = row[idx.Timestamp];
    if (!type || !timestamp) continue;

    if (type === "glucose") {
      const value = Number(row[idx.Value]);
      if (Number.isNaN(value) || isDuplicate("glucose", timestamp, value)) {
        skipped++;
        continue;
      }
      await saveGlucoseReading({ value, unit: row[idx.Unit] || "mmol/L", timestamp, note: row[idx.Note] || "" });
      imported++;
    } else if (type === "food") {
      const text = row[idx.Text] || "";
      if (isDuplicate("food", timestamp, text)) {
        skipped++;
        continue;
      }
      await saveFoodEntry({ text, photoBlob: null, timestamp, aiResult: null });
      imported++;
    } else if (type === "diary") {
      const text = row[idx.Text] || "";
      if (isDuplicate("diary", timestamp, text)) {
        skipped++;
        continue;
      }
      await saveDiaryNote({ text, timestamp });
      imported++;
    }
  }
  return { imported, skipped };
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
//
// `allGlucose`/`allFood` are the FULL, unfiltered logs (not just `entries`,
// which is already cut down to the chosen from/to range) — the graph snapshot
// is deliberately always "the last 7 days ending now", same as the app's own
// default view, regardless of what historical range was picked for the table
// below it. Showing a graph for an arbitrary past date range raised more
// complexity (the chart's own "now" axis label, title, etc.) than it was
// worth for a report whose main content is already the full table.
export function printSummary(entries, { from, to }, allGlucose = [], allFood = []) {
  const container = document.getElementById("print-summary");
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e._kind)}</td><td>${escapeHtml(formatDate(e.timestamp))}</td><td>${escapeHtml(entryBody(e))}</td></tr>`
    )
    .join("");
  const unit = localStorage.getItem("rht-default-unit") || "mmol/L";
  const graphHtml = buildGraphHTML(allGlucose, { unit, hours: 24 * 7, food: allFood });
  container.innerHTML = `
    <h1>Glucose &amp; Food Summary</h1>
    <p>${escapeHtml(from)} to ${escapeHtml(to)}</p>
    <h2>Last 7 days</h2>
    <div class="print-graph">${graphHtml}</div>
    <table><thead><tr><th>Type</th><th>When</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>
  `;
  window.print();
}
