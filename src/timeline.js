import { classifyReading, explainClassification, convertUnit } from "./thresholds.js";
import { compareRecentFirst } from "./db.js";
import { formatDate } from "./dateformat.js";

export function mergeTimeline({ glucose = [], food = [], diary = [] }) {
  const merged = [
    ...glucose.map((g) => ({ ...g, _kind: "glucose" })),
    ...food.map((f) => ({ ...f, _kind: "food" })),
    ...diary.map((d) => ({ ...d, _kind: "diary" })),
  ];
  merged.sort(compareRecentFirst);
  return merged;
}

function formatTime(ts) {
  return formatDate(ts);
}

function entryLabel(entry) {
  if (entry._kind === "glucose") {
    // Tag where a reading came from so CGM and finger-prick values can be told
    // apart at a glance — they genuinely differ (interstitial vs blood, lag).
    if (entry.sourceId === "librelinkup") return "🩸 Glucose · CGM";
    if (entry.sourceId === "bluetooth-meter") return "🩸 Glucose · Meter";
    return "🩸 Glucose";
  }
  if (entry._kind === "food") return "🍽️ Food";
  if (entry._kind === "diary") return "📝 Diary";
  return "";
}

export function entryBody(entry) {
  if (entry._kind === "glucose") {
    const note = entry.note ? ` — ${entry.note}` : "";
    return `${entry.value} ${entry.unit}${note}`;
  }
  if (entry._kind === "food") {
    const parts = [];
    if (entry.text) parts.push(entry.text);
    if (entry.photoBlob) parts.push("📷 photo attached");
    if (entry.aiResult && entry.aiResult.foodName) {
      parts.push(`AI: ${entry.aiResult.foodName} (${entry.aiResult.confidencePercent ?? "?"}% confidence)`);
    }
    return parts.join(" — ") || "(no description)";
  }
  if (entry._kind === "diary") {
    return entry.text;
  }
  return "";
}

// Renders one glucose entry's warning affordance: a colored class on the card
// plus a small (i) button that explains why, on demand — never shown as an
// unexplained color alone. No-ops (returns "") until thresholds are set.
function warningClass(entry) {
  if (entry._kind !== "glucose") return "";
  const cls = classifyReading(entry.value, entry.unit);
  return cls ? ` warn-${cls}` : "";
}

export function renderReadingsList(container, entries) {
  if (!entries.length) {
    container.innerHTML =
      '<p class="timeline-empty">Nothing logged yet. Use Home to add a glucose reading, food, or a note.</p>';
    return;
  }
  container.innerHTML = "";
  for (const entry of entries) {
    const el = document.createElement("div");
    el.className = `timeline-entry${warningClass(entry)}`;

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    const label = document.createElement("span");
    label.textContent = entryLabel(entry);
    const time = document.createElement("span");
    time.textContent = formatTime(entry.timestamp);
    meta.append(label, time);

    const body = document.createElement("div");
    body.className = "entry-body";
    body.textContent = entryBody(entry);

    el.append(meta, body);

    if (entry._kind === "glucose" && classifyReading(entry.value, entry.unit)) {
      const infoBtn = document.createElement("button");
      infoBtn.type = "button";
      infoBtn.className = "warn-info-btn";
      infoBtn.textContent = "ⓘ why";
      const explanation = document.createElement("p");
      explanation.className = "warn-explanation";
      explanation.hidden = true;
      explanation.textContent = explainClassification(entry.value, entry.unit);
      infoBtn.addEventListener("click", () => {
        explanation.hidden = !explanation.hidden;
      });
      el.append(infoBtn, explanation);
    }

    container.appendChild(el);
  }
}

// Kept as an alias — existing callers (tests, older code) that expect
// renderTimeline keep working; new code should call renderReadingsList.
export const renderTimeline = renderReadingsList;

export const GRAPH_RANGES = [
  { label: "2h", hours: 2 },
  { label: "4h", hours: 4 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
];

function rangeLabel(hours) {
  return GRAPH_RANGES.find((r) => r.hours === hours)?.label || `${hours}h`;
}

// Simple hand-rolled SVG line chart — no charting library. This app's own
// design principle is descriptive-not-fancy correlation, so a plain line
// with colored points is enough; a dependency isn't justified for this.
export function renderReadingsGraph(container, glucoseEntries, { unit = "mmol/L", hours = 24 } = {}) {
  const cutoff = Date.now() - hours * 3600000;
  const points = glucoseEntries
    .filter((g) => new Date(g.timestamp).getTime() >= cutoff)
    .map((g) => ({ t: new Date(g.timestamp).getTime(), v: convertUnit(g.value, g.unit, unit), raw: g }))
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) {
    container.innerHTML = `<p class="timeline-empty">Need at least 2 readings in the last ${rangeLabel(hours)} to draw a graph. Add more readings, or try a wider range above.</p>`;
    return;
  }

  const W = 320;
  const H = 160;
  const PAD = 24;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const values = points.map((p) => p.v);
  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }
  const vSpan = (maxV - minV) * 1.15;
  minV -= (maxV - minV) * 0.075 || 0.5;

  const x = (t) => PAD + ((t - minT) / (maxT - minT || 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - minV) / (vSpan || 1)) * (H - PAD * 2);

  const linePoints = points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const dots = points
    .map((p) => {
      const cls = classifyReading(p.raw.value, p.raw.unit);
      return `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" class="graph-dot${cls ? ` warn-${cls}` : ""}" />`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="readings-graph" role="img" aria-label="Glucose readings over the last ${rangeLabel(hours)}">
      <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" class="graph-axis" />
      <polyline points="${linePoints}" class="graph-line" fill="none" />
      ${dots}
    </svg>
    <p class="field-hint">Last ${rangeLabel(hours)}, in ${unit}. Colors reflect the thresholds set in Settings, when set.</p>
  `;
}
