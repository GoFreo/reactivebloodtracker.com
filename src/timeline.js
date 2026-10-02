import { classifyReading, explainClassification, convertUnit, getThresholds } from "./thresholds.js";
import { isCgmSource } from "./cgmSources.js";
import { compareRecentFirst } from "./db.js";
import { formatDate } from "./dateformat.js";
import { smoothSeries, findPeaksAndTroughs, findThresholdCrossings } from "./graphAnalysis.js";

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
    if (isCgmSource(entry.sourceId)) return `🩸 Glucose · CGM${entry.sourceId === "dexcom" ? " (Dexcom)" : ""}`;
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
// A CGM gap longer than this is drawn as "no data" rather than a straight line
// across it — LibreLinkUp history arrives every ~15 min, so 45 min means at
// least two readings are genuinely missing (phone out of range, sensor warm-up).
export const CGM_GAP_MS = 45 * 60000;

const isCgm = (g) => isCgmSource(g.sourceId);

// Splits a time-sorted series into runs wherever consecutive points are further
// apart than `gapMs`. Returns { runs: [[p...]], gaps: [{from, to}] }.
export function splitAtGaps(points, gapMs = CGM_GAP_MS) {
  const runs = [];
  const gaps = [];
  let run = [];
  for (const p of points) {
    const prev = run[run.length - 1];
    if (prev && p.t - prev.t > gapMs) {
      runs.push(run);
      gaps.push({ from: prev.t, to: p.t });
      run = [];
    }
    run.push(p);
  }
  if (run.length) runs.push(run);
  return { runs, gaps };
}

// Draws the Readings graph. CGM (Libre) readings are a continuous line broken
// at data gaps, which are shaded and labelled rather than bridged. Finger-prick
// readings (typed or from the Accu-Chek) are drawn as distinct diamonds on top,
// so any difference between the two devices is visible, not hidden. Meals sit
// as small markers along the bottom so a spike or crash can be read against
// what was eaten. Descriptive only: no judgement beyond the user's own thresholds.
// DOM-free: returns the graph's HTML as a string, so it can go into a live
// container (renderReadingsGraph, below) or the printable report (export.js)
// without needing a real document to render into.
export function buildGraphHTML(glucoseEntries, { unit = "mmol/L", hours = 24, food = [] } = {}) {
  const now = Date.now();
  const cutoff = now - hours * 3600000;
  const toPoint = (g) => ({ t: new Date(g.timestamp).getTime(), v: convertUnit(g.value, g.unit, unit), raw: g });
  const inRange = glucoseEntries.filter((g) => new Date(g.timestamp).getTime() >= cutoff);
  const cgm = inRange.filter(isCgm).map(toPoint).sort((a, b) => a.t - b.t);
  const pricks = inRange.filter((g) => !isCgm(g)).map(toPoint).sort((a, b) => a.t - b.t);
  const meals = food.map((f) => new Date(f.timestamp).getTime()).filter((t) => t >= cutoff && t <= now);

  if (cgm.length + pricks.length < 2) {
    return `<p class="timeline-empty">Need at least 2 readings in the last ${rangeLabel(hours)} to draw a graph. Add more readings, or try a wider range above.</p>`;
  }

  const W = 340;
  const H = 190;
  const L = 30; // room for value labels
  const R = 10;
  const T = 12;
  const B = 34; // room for meal markers + time labels
  const all = [...cgm, ...pricks];
  // Time axis spans the whole chosen range, ending now: empty stretches show
  // as empty, instead of the chart silently stretching to fit the data.
  const minT = Math.min(cutoff, ...all.map((p) => p.t));
  const maxT = now;
  const values = all.map((p) => p.v);
  const thresholds = getThresholds();
  const lowLine = thresholds.low != null ? convertUnit(thresholds.low, thresholds.unit, unit) : null;
  const highLine = thresholds.high != null ? convertUnit(thresholds.high, thresholds.unit, unit) : null;
  let minV = Math.min(...values, ...(lowLine != null ? [lowLine] : []));
  let maxV = Math.max(...values, ...(highLine != null ? [highLine] : []));
  const padV = Math.max((maxV - minV) * 0.1, unit === "mmol/L" ? 0.5 : 9);
  minV = Math.max(0, minV - padV);
  maxV += padV;

  const x = (t) => L + ((t - minT) / (maxT - minT || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - minV) / (maxV - minV || 1)) * (H - T - B);
  const f1 = (n) => n.toFixed(1);

  // Each sensor gets its own runs: wearing a Libre and a Dexcom at once, one
  // combined line would zigzag between the two sensors' slightly different
  // values. Gaps are shaded only where *no* sensor had data.
  const runs = [];
  for (const source of new Set(cgm.map((p) => p.raw.sourceId))) {
    runs.push(...splitAtGaps(cgm.filter((p) => p.raw.sourceId === source)).runs);
  }
  const { gaps } = splitAtGaps(cgm);
  const gapRects = gaps
    .map((g) => {
      const x1 = x(g.from);
      const w = Math.max(x(g.to) - x1, 1);
      const label = w > 34 ? `<text x="${f1(x1 + w / 2)}" y="${T + 11}" class="graph-gap-label" text-anchor="middle">no data</text>` : "";
      return `<rect x="${f1(x1)}" y="${T}" width="${f1(w)}" height="${H - T - B}" class="graph-gap" />${label}`;
    })
    .join("");

  // Each run is smoothed on its own so the rolling average never bridges a
  // sensor gap (Scott's graph-redesign spec, 2026-09-28): a flowing average
  // line, raw points faint behind it, peaks labelled above / troughs below.
  const MIN_LABEL_GAP_PX = 26; // keep labels from colliding — skip one too close to the last of its kind
  let lastPeakLabelX = -Infinity;
  let lastTroughLabelX = -Infinity;
  const rawDots = [];
  const smoothLines = [];
  const extremaMarks = [];
  const allCrossings = [];
  for (const run of runs) {
    for (const p of run) rawDots.push(`<circle cx="${f1(x(p.t))}" cy="${f1(y(p.v))}" r="1.3" class="graph-raw-dot" />`);

    if (run.length === 1) {
      smoothLines.push(`<circle cx="${f1(x(run[0].t))}" cy="${f1(y(run[0].v))}" r="1.8" class="graph-cgm-dot" />`);
    } else {
      const smoothed = smoothSeries(run, 30);
      smoothLines.push(`<polyline points="${smoothed.map((p) => `${f1(x(p.t))},${f1(y(p.v))}`).join(" ")}" class="graph-line" fill="none" />`);

      for (const e of findPeaksAndTroughs(smoothed, { prominence: 1.5 })) {
        const ex = x(e.t);
        if (e.type === "peak" && ex - lastPeakLabelX < MIN_LABEL_GAP_PX) continue;
        if (e.type === "trough" && ex - lastTroughLabelX < MIN_LABEL_GAP_PX) continue;
        if (e.type === "peak") lastPeakLabelX = ex;
        else lastTroughLabelX = ex;
        const ey = y(e.v);
        const labelY = e.type === "peak" ? ey - 6 : ey + 11;
        extremaMarks.push(
          `<circle cx="${f1(ex)}" cy="${f1(ey)}" r="2.2" class="graph-extremum graph-extremum-${e.type}" />` +
            `<text x="${f1(ex)}" y="${f1(labelY)}" text-anchor="middle" class="graph-extremum-label">${f1(e.v)}</text>`
        );
      }
    }

    allCrossings.push(...findThresholdCrossings(run, getThresholds(), unit));
  }
  const cgmLines = smoothLines.join("");
  const rawCgmDots = rawDots.join("");
  const extremaMarkup = extremaMarks.join("");

  // Without any CGM data, join finger-pricks with a thin line as before, so a
  // meter-only user still sees a trend.
  const prickLine =
    !cgm.length && pricks.length > 1
      ? `<polyline points="${pricks.map((p) => `${f1(x(p.t))},${f1(y(p.v))}`).join(" ")}" class="graph-prick-line" fill="none" />`
      : "";
  const prickMarks = pricks
    .map((p) => {
      const cls = classifyReading(p.raw.value, p.raw.unit);
      const cx = x(p.t);
      const cy = y(p.v);
      return `<path d="M${f1(cx)} ${f1(cy - 5)}L${f1(cx + 5)} ${f1(cy)}L${f1(cx)} ${f1(cy + 5)}L${f1(cx - 5)} ${f1(cy)}Z" class="graph-dot graph-prick${cls ? ` warn-${cls}` : ""}"><title>${p.raw.value} ${p.raw.unit} finger-prick</title></path>`;
    })
    .join("");

  const lowRule =
    lowLine != null
      ? `<line x1="${L}" y1="${f1(y(lowLine))}" x2="${W - R}" y2="${f1(y(lowLine))}" class="graph-low-rule" /><text x="${W - R}" y="${f1(y(lowLine) - 3)}" text-anchor="end" class="graph-axis-label">your low ${f1(lowLine)}</text>`
      : "";
  const highRule =
    highLine != null
      ? `<line x1="${L}" y1="${f1(y(highLine))}" x2="${W - R}" y2="${f1(y(highLine))}" class="graph-high-rule" /><text x="${W - R}" y="${f1(y(highLine) - 3)}" text-anchor="end" class="graph-axis-label">your high ${f1(highLine)}</text>`
      : "";

  // Shaded bands wherever the CGM line actually crossed low or high — drawn
  // under everything else, like the no-data gaps. A short crossing still
  // gets at least a sliver so it isn't invisible (Scott: "a short low matters").
  const crossingRects = allCrossings
    .map((c) => {
      const x1 = x(c.startT);
      const w = Math.max(x(c.endT) - x1, 2);
      return `<rect x="${f1(x1)}" y="${T}" width="${f1(w)}" height="${H - T - B}" class="graph-crossing graph-crossing-${c.type}" />`;
    })
    .join("");

  const mealY = H - B + 8;
  const mealMarks = meals
    .map((t) => `<path d="M${f1(x(t))} ${mealY}l4 7h-8z" class="graph-meal"><title>Meal logged</title></path>`)
    .join("");

  const vTicks = [minV + (maxV - minV) * 0.1, (minV + maxV) / 2, maxV - (maxV - minV) * 0.1]
    .map((v) => `<text x="${L - 4}" y="${f1(y(v) + 3)}" text-anchor="end" class="graph-axis-label">${unit === "mmol/L" ? f1(v) : Math.round(v)}</text>`)
    .join("");
  const timeLabel = (t) => {
    const d = new Date(t);
    return hours <= 24 ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
  };
  const tTicks = `<text x="${L}" y="${H - 6}" class="graph-axis-label">${timeLabel(minT)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="graph-axis-label">now</text>`;

  const legend = [
    cgm.length ? '<span class="lg lg-cgm"></span>Smoothed average (Libre)' : "",
    cgm.length ? '<span class="lg lg-raw"></span>Raw reading' : "",
    pricks.length ? '<span class="lg lg-prick"></span>Finger-prick' : "",
    gaps.length ? '<span class="lg lg-gap"></span>No data' : "",
    meals.length ? '<span class="lg lg-meal"></span>Meal' : "",
    allCrossings.some((c) => c.type === "low") ? '<span class="lg lg-low"></span>Below your low' : "",
    allCrossings.some((c) => c.type === "high") ? '<span class="lg lg-high"></span>Above your high' : "",
  ]
    .filter(Boolean)
    .map((item) => `<span class="graph-legend-item">${item}</span>`)
    .join("");

  const crossingsList = buildCrossingsList(allCrossings, unit);

  return `
    <svg viewBox="0 0 ${W} ${H}" class="readings-graph" role="img" aria-label="Glucose readings over the last ${rangeLabel(hours)}">
      ${gapRects}
      ${crossingRects}
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="graph-axis" />
      ${vTicks}
      ${lowRule}
      ${highRule}
      ${rawCgmDots}
      ${cgmLines}
      ${prickLine}
      ${prickMarks}
      ${extremaMarkup}
      ${mealMarks}
      ${tTicks}
    </svg>
    <div class="graph-legend">${legend}</div>
    <p class="field-hint">Last ${rangeLabel(hours)}, in ${unit}. The Libre reads fluid under the skin and runs a few minutes behind a finger-prick, so the two won't always match, especially during a fast rise or drop.</p>
    ${crossingsList}
  `;
}

// Live UI entry point: renders buildGraphHTML() into a real container.
export function renderReadingsGraph(container, glucoseEntries, options) {
  container.innerHTML = buildGraphHTML(glucoseEntries, options);
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function timeOnly(t) {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// The list under the graph Scott's spec asks for: every low/high crossing in
// the current range, most recent first, with its extreme value and duration —
// a crossing shorter than 15 minutes is still listed in full, not rounded away.
export function buildCrossingsList(crossings, unit) {
  if (!crossings.length) return "";
  const sorted = [...crossings].sort((a, b) => b.startT - a.startT);
  const items = sorted
    .map((c) => {
      const label = c.type === "low" ? "Low" : "High";
      const extremeLabel = c.type === "low" ? "lowest" : "highest";
      const value = unit === "mmol/L" ? c.extreme.toFixed(1) : Math.round(c.extreme);
      return `<li class="graph-crossing-item graph-crossing-item-${c.type}"><strong>${label}</strong> — ${value} ${unit} ${extremeLabel}, ${formatDuration(c.endT - c.startT)} (${timeOnly(c.startT)}–${timeOnly(c.endT)})</li>`;
    })
    .join("");
  return `<ul class="graph-crossings-list">${items}</ul>`;
}
