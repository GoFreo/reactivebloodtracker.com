// Readings → Compare (Scott, 2026-10-03): the Libre, the Dexcom and the
// finger-prick meter on one graph, plus how close each sensor came to each
// finger-prick. The finger-prick is the reference at that moment. Prompted by
// a night where the Libre alarmed low and the Dexcom didn't; this lets the
// data say which sensor tracks him more closely, rather than a guess.
//
// Descriptive only: it reports agreement with the meter. It doesn't say which
// device to use; that is Scott's (and his doctor's) call.
import { convertUnit, getThresholds } from "./thresholds.js";
import { CGM_SOURCE_IDS, CGM_SOURCE_LABELS, isCgmSource } from "./cgmSources.js";

// A sensor value counts at a finger-prick's moment if two sensor readings
// bracket it no more than this far apart (drawn as a straight line between
// them), or failing that, one reading is within NEAREST_MS of it.
const BRACKET_MS = 30 * 60000;
const NEAREST_MS = 10 * 60000;

// "Close agreement": within 0.8 mmol/L (15 mg/dL) when the finger-prick is
// under 5.6 mmol/L (100 mg/dL), otherwise within 15%. The "15/15" band used in
// glucose-meter accuracy standards (ISO 15197), stricter than the 20/20 band
// often quoted for CGMs.
const CLOSE_ABS_MMOL = 15 / 18.0182;
const CLOSE_PCT = 0.15;
const CLOSE_SWITCH_MMOL = 100 / 18.0182;

export const isReferenceReading = (g) => !isCgmSource(g.sourceId);

const toMmol = (g) => convertUnit(Number(g.value), g.unit || "mmol/L", "mmol/L");

// Sorted { t, v } series in mmol/L for one source.
export function seriesFor(glucose, sourceId) {
  return glucose
    .filter((g) => g.sourceId === sourceId)
    .map((g) => ({ t: new Date(g.timestamp).getTime(), v: toMmol(g) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

// The sensor's value at time `t`, or null if it has no reading close enough.
export function valueAt(series, t) {
  let lo = 0;
  let hi = series.length - 1;
  if (hi < 0) return null;
  // Binary search for the last point at or before t.
  let before = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) {
      before = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const a = before >= 0 ? series[before] : null;
  const b = before + 1 < series.length ? series[before + 1] : null;
  if (a && a.t === t) return a.v;
  if (a && b && b.t - a.t <= BRACKET_MS) return a.v + ((t - a.t) / (b.t - a.t)) * (b.v - a.v);
  const near = [a, b].filter((p) => p && Math.abs(p.t - t) <= NEAREST_MS).sort((p, q) => Math.abs(p.t - t) - Math.abs(q.t - t));
  return near.length ? near[0].v : null;
}

export function isClose(sensorMmol, prickMmol) {
  const d = Math.abs(sensorMmol - prickMmol);
  return prickMmol < CLOSE_SWITCH_MMOL ? d <= CLOSE_ABS_MMOL + 1e-9 : d <= prickMmol * CLOSE_PCT + 1e-9;
}

// One row per finger-prick in [from, to], newest first, with each sensor's
// value at that moment. Everything in mmol/L; the view converts for display.
export function compareRows(glucose, { from = -Infinity, to = Infinity } = {}) {
  const sources = CGM_SOURCE_IDS.filter((s) => glucose.some((g) => g.sourceId === s));
  const series = Object.fromEntries(sources.map((s) => [s, seriesFor(glucose, s)]));
  return glucose
    .filter(isReferenceReading)
    .map((g) => ({ t: new Date(g.timestamp).getTime(), prick: toMmol(g), raw: g }))
    .filter((r) => r.t >= from && r.t <= to && Number.isFinite(r.prick))
    .sort((a, b) => b.t - a.t)
    .map((r) => {
      const sensors = {};
      for (const s of sources) {
        const v = valueAt(series[s], r.t);
        sensors[s] = v == null ? null : { v, diff: v - r.prick, close: isClose(v, r.prick) };
      }
      const withValue = sources.filter((s) => sensors[s]);
      const closest = withValue.length > 1
        ? withValue.reduce((best, s) => (Math.abs(sensors[s].diff) < Math.abs(sensors[best].diff) ? s : best))
        : null;
      return { ...r, sensors, closest };
    });
}

// Per sensor: how many finger-pricks it could be compared with, the average
// gap, the average percentage gap (MARD), whether it tends to read high or
// low (bias), and how often it was in close agreement.
export function summarise(rows) {
  const out = {};
  for (const row of rows) {
    for (const [s, m] of Object.entries(row.sensors)) {
      if (!m) continue;
      out[s] ||= { n: 0, absSum: 0, pctSum: 0, biasSum: 0, close: 0, closestCount: 0 };
      const o = out[s];
      o.n++;
      o.absSum += Math.abs(m.diff);
      o.pctSum += Math.abs(m.diff) / row.prick;
      o.biasSum += m.diff;
      if (m.close) o.close++;
      if (row.closest === s) o.closestCount++;
    }
  }
  for (const o of Object.values(out)) {
    o.meanAbs = o.absSum / o.n;
    o.mard = (o.pctSum / o.n) * 100;
    o.bias = o.biasSum / o.n;
    o.closePct = (o.close / o.n) * 100;
  }
  return out;
}

const SOURCE_CLASS = { librelinkup: "libre", dexcom: "dexcom" };
const label = (s) => CGM_SOURCE_LABELS[s] || s;

// DOM-free: the Compare tab's whole content as HTML.
export function buildCompareHTML(glucose, { unit = "mmol/L", hours = 24, now = Date.now() } = {}) {
  const from = now - hours * 3600000;
  const conv = (mmol) => convertUnit(mmol, "mmol/L", unit);
  const fmt = (mmol) => (unit === "mmol/L" ? conv(mmol).toFixed(1) : String(Math.round(conv(mmol))));
  const fmtDiff = (mmol) => `${mmol >= 0 ? "+" : "−"}${fmt(Math.abs(mmol))}`;
  const inRange = glucose.filter((g) => {
    const t = new Date(g.timestamp).getTime();
    return t >= from && t <= now;
  });
  const sources = CGM_SOURCE_IDS.filter((s) => inRange.some((g) => g.sourceId === s));
  const rows = compareRows(glucose, { from, to: now });

  // --- Graph: each sensor as its own unsmoothed line, finger-pricks on top. ---
  const W = 340;
  const H = 200;
  const L = 30;
  const R = 10;
  const T = 12;
  const B = 24;
  const series = Object.fromEntries(sources.map((s) => [s, seriesFor(inRange, s)]));
  const pricks = inRange.filter(isReferenceReading).map((g) => ({ t: new Date(g.timestamp).getTime(), v: toMmol(g) }));
  const allV = [...Object.values(series).flat(), ...pricks].map((p) => p.v);
  let graph = `<p class="timeline-empty">No sensor or finger-prick readings in this range.</p>`;
  if (allV.length) {
    const th = getThresholds();
    const lowMmol = th.low != null ? convertUnit(th.low, th.unit, "mmol/L") : null;
    let minV = Math.min(...allV, ...(lowMmol != null ? [lowMmol] : []));
    let maxV = Math.max(...allV);
    const pad = Math.max((maxV - minV) * 0.1, 0.5);
    minV = Math.max(0, minV - pad);
    maxV += pad;
    const x = (t) => L + ((t - from) / (now - from || 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - minV) / (maxV - minV || 1)) * (H - T - B);
    const f1 = (n) => n.toFixed(1);
    const lines = sources
      .map((s) => {
        const pts = series[s];
        // Break the line where the sensor had no data for over 45 minutes.
        const parts = [];
        let cur = [];
        for (const p of pts) {
          if (cur.length && p.t - cur[cur.length - 1].t > 45 * 60000) {
            parts.push(cur);
            cur = [];
          }
          cur.push(p);
        }
        if (cur.length) parts.push(cur);
        return parts
          .map((part) =>
            part.length === 1
              ? `<circle cx="${f1(x(part[0].t))}" cy="${f1(y(part[0].v))}" r="1.8" class="cmp-dot cmp-${SOURCE_CLASS[s]}" />`
              : `<polyline points="${part.map((p) => `${f1(x(p.t))},${f1(y(p.v))}`).join(" ")}" class="cmp-line cmp-${SOURCE_CLASS[s]}" fill="none" />`
          )
          .join("");
      })
      .join("");
    const prickMarks = pricks
      .map((p) => {
        const cx = x(p.t);
        const cy = y(p.v);
        return `<path d="M${f1(cx)} ${f1(cy - 5)}L${f1(cx + 5)} ${f1(cy)}L${f1(cx)} ${f1(cy + 5)}L${f1(cx - 5)} ${f1(cy)}Z" class="graph-dot graph-prick"><title>Finger-prick ${fmt(p.v)} ${unit}</title></path>`;
      })
      .join("");
    const ticks = [minV + (maxV - minV) * 0.1, (minV + maxV) / 2, maxV - (maxV - minV) * 0.1]
      .map((v) => `<text x="${L - 4}" y="${f1(y(v) + 3)}" text-anchor="end" class="graph-axis-label">${fmt(v)}</text>`)
      .join("");
    const start = new Date(from);
    const startLabel = hours <= 24 ? start.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : start.toLocaleDateString([], { day: "numeric", month: "short" });
    const lowRule = lowMmol != null
      ? `<line x1="${L}" y1="${f1(y(lowMmol))}" x2="${W - R}" y2="${f1(y(lowMmol))}" class="graph-low-rule" /><text x="${W - R}" y="${f1(y(lowMmol) - 3)}" text-anchor="end" class="graph-axis-label">your low ${fmt(lowMmol)}</text>`
      : "";
    graph = `
      <svg viewBox="0 0 ${W} ${H}" class="readings-graph" role="img" aria-label="Sensors compared with finger-pricks">
        <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="graph-axis" />
        ${ticks}${lowRule}${lines}${prickMarks}
        <text x="${L}" y="${H - 6}" class="graph-axis-label">${startLabel}</text>
        <text x="${W - R}" y="${H - 6}" text-anchor="end" class="graph-axis-label">now</text>
      </svg>
      <div class="graph-legend">
        ${sources.map((s) => `<span class="graph-legend-item"><span class="lg cmp-lg-${SOURCE_CLASS[s]}"></span>${label(s)}</span>`).join("")}
        ${pricks.length ? '<span class="graph-legend-item"><span class="lg lg-prick"></span>Finger-prick</span>' : ""}
      </div>`;
  }

  // --- Summary per sensor ---
  const sum = summarise(rows);
  const summarySources = sources.filter((s) => sum[s]);
  let summary;
  if (!rows.length) {
    summary = `<p class="field-hint">No finger-pricks in this range. Do a finger-prick when the sensors disagree or an alarm goes off, and it will be compared here.</p>`;
  } else if (!summarySources.length) {
    summary = `<p class="field-hint">${rows.length} finger-prick${rows.length === 1 ? "" : "s"}, but no sensor reading close enough in time to compare. Dexcom readings arrive about 3 hours late outside the US, so a recent finger-prick may only be comparable later.</p>`;
  } else {
    summary = `
      <table class="cmp-summary">
        <thead><tr><th></th>${summarySources.map((s) => `<th class="cmp-head-${SOURCE_CLASS[s]}">${label(s)}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><th>Finger-pricks compared</th>${summarySources.map((s) => `<td>${sum[s].n}</td>`).join("")}</tr>
          <tr><th>Average difference</th>${summarySources.map((s) => `<td>${fmt(sum[s].meanAbs)} ${unit}</td>`).join("")}</tr>
          <tr><th>Average % difference (MARD)</th>${summarySources.map((s) => `<td>${sum[s].mard.toFixed(0)}%</td>`).join("")}</tr>
          <tr><th>Tends to read</th>${summarySources.map((s) => `<td>${Math.abs(sum[s].bias) < 0.15 ? "about right" : `${sum[s].bias > 0 ? "high" : "low"} by ${fmt(Math.abs(sum[s].bias))}`}</td>`).join("")}</tr>
          <tr><th>Close to the finger-prick</th>${summarySources.map((s) => `<td>${sum[s].close} of ${sum[s].n} (${sum[s].closePct.toFixed(0)}%)</td>`).join("")}</tr>
          ${summarySources.length > 1 ? `<tr><th>Closest of the sensors</th>${summarySources.map((s) => `<td>${sum[s].closestCount} time${sum[s].closestCount === 1 ? "" : "s"}</td>`).join("")}</tr>` : ""}
        </tbody>
      </table>
      ${rows.length < 10 ? `<p class="field-hint">Only ${rows.length} finger-prick${rows.length === 1 ? "" : "s"} so far: treat this as a first look. About 10 or more, including some near your low, give a fairer picture.</p>` : ""}`;
  }

  // --- Each finger-prick ---
  const rowHTML = rows
    .map((r) => {
      const d = new Date(r.t);
      const when = `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}<br>${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      const cells = sources
        .map((s) => {
          const m = r.sensors[s];
          if (!m) return `<td class="cmp-none">no reading</td>`;
          const cls = [m.close ? "cmp-close" : "cmp-far", r.closest === s ? "cmp-best" : ""].filter(Boolean).join(" ");
          return `<td class="${cls}">${fmt(m.v)} <small>(${fmtDiff(m.diff)})</small></td>`;
        })
        .join("");
      return `<tr><th>${when}</th><td class="cmp-prick">${fmt(r.prick)}</td>${cells}</tr>`;
    })
    .join("");
  const table = rows.length && sources.length
    ? `<h3>Each finger-prick</h3>
       <table class="cmp-rows">
         <thead><tr><th>When</th><th>Finger-prick</th>${sources.map((s) => `<th class="cmp-head-${SOURCE_CLASS[s]}">${label(s)}</th>`).join("")}</tr></thead>
         <tbody>${rowHTML}</tbody>
       </table>
       <p class="field-hint">In brackets: how far the sensor was from the finger-prick. Green means close agreement (within ${unit === "mmol/L" ? "0.8 mmol/L" : "15 mg/dL"}, or 15% when the finger-prick is above ${unit === "mmol/L" ? "5.6 mmol/L" : "100 mg/dL"}). A ✓ marks whichever sensor was closer, even if neither was close.</p>`
    : "";

  return `
    ${graph}
    <h3>How close each sensor was</h3>
    ${summary}
    ${table}
    <p class="field-hint">A finger-prick is the best measure at that moment. Sensors read the fluid under the skin, which runs 5 to 15 minutes behind the blood, so some difference is normal, especially when glucose is moving fast. Lying on a sensor overnight can also show a false low on that sensor only.</p>`;
}
