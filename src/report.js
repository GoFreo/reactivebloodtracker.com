// The doctor's report, and the live summary on the Export screen.
//
// Pure functions (no DOM, no storage) so tests/report.spec.js can run them in Node. Everything here is
// descriptive: it counts, averages and lists, and shows what was logged near each low. It never says
// whether a number is good or bad and never suggests what to do ("Descriptive, not prescriptive").
// All values are worked out in mmol/L and converted for display at the very end.

import { convertUnit } from "./thresholds.js";
import { isCgmSource, CGM_SOURCE_LABELS } from "./cgmSources.js";
import { findThresholdCrossings } from "./graphAnalysis.js";
import { mealOutcome, formatAfter } from "./mealOutcome.js";
import { compareRows, summarise } from "./sensorCompare.js";
import { splitAtGaps } from "./timeline.js";
import { formatDate } from "./dateformat.js";

const MIN = 60000;
const MEAL_LOOKBACK_MIN = 300; // a low is described with the latest meal in the 5 hours before it, matching Meals
const NOTE_BEFORE_MIN = 90; // notes from this long before a low...
const NOTE_AFTER_MIN = 30; // ...to this long after it
const PRICK_NEAR_MIN = 30; // a finger-prick this close to a low is mentioned beside it

export const SOURCE_LABELS = {
  ...CGM_SOURCE_LABELS,
  "bluetooth-meter": "Accu-Chek meter",
  manual: "Typed in",
};

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const toMmol = (g) => convertUnit(Number(g.value), g.unit || "mmol/L", "mmol/L");
const ts = (e) => new Date(e.timestamp).getTime();

// Calendar days from..to inclusive (local time).
function daysBetween(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

const localDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// Everything the summary needs, from the full logs and a date range.
//   from / to   Date objects (inclusive)
//   thresholds  { low, high, unit } as saved in Settings (either may be null)
export function summariseRange({ glucose = [], food = [], diary = [], from, to, thresholds = { low: null, high: null, unit: "mmol/L" } }) {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const inRange = (e) => ts(e) >= fromMs && ts(e) <= toMs;

  const g = glucose.filter(inRange).filter((e) => Number.isFinite(toMmol(e)));
  const meals = food.filter(inRange).sort((a, b) => ts(a) - ts(b));
  const notes = diary.filter(inRange).sort((a, b) => ts(a) - ts(b));

  const bySource = {};
  for (const e of g) bySource[e.sourceId || "manual"] = (bySource[e.sourceId || "manual"] || 0) + 1;

  // Sensor numbers come from ONE sensor (the one with most readings). Two sensors worn together are
  // never averaged into one line: the gap between them would pass for glucose variability.
  const sensorCounts = Object.entries(bySource).filter(([s]) => isCgmSource(s)).sort((a, b) => b[1] - a[1]);
  const sensorSource = sensorCounts.length ? sensorCounts[0][0] : null;
  const points = g
    .filter((e) => e.sourceId === sensorSource)
    .map((e) => ({ t: ts(e), v: toMmol(e), raw: e }))
    .sort((a, b) => a.t - b.t);

  const lowMmol = thresholds.low != null ? convertUnit(thresholds.low, thresholds.unit, "mmol/L") : null;
  const highMmol = thresholds.high != null ? convertUnit(thresholds.high, thresholds.unit, "mmol/L") : null;

  let sensor = null;
  if (points.length) {
    const n = points.length;
    const mean = points.reduce((a, p) => a + p.v, 0) / n;
    const sd = Math.sqrt(points.reduce((a, p) => a + (p.v - mean) ** 2, 0) / n);
    const lo = points.reduce((m, p) => (p.v < m.v ? p : m), points[0]);
    const hi = points.reduce((m, p) => (p.v > m.v ? p : m), points[0]);
    const below = lowMmol == null ? null : points.filter((p) => p.v < lowMmol).length / n;
    const above = highMmol == null ? null : points.filter((p) => p.v > highMmol).length / n;
    sensor = {
      source: sensorSource,
      n,
      mean,
      sd,
      cv: mean ? (sd / mean) * 100 : null,
      min: { v: lo.v, t: lo.t },
      max: { v: hi.v, t: hi.t },
      below,
      above,
      between: below == null && above == null ? null : 1 - (below || 0) - (above || 0),
    };
  }

  // Low spells: continuous raw readings under the low line, never bridging a sensor gap.
  const lows = [];
  let highSpells = 0;
  if (points.length && (lowMmol != null || highMmol != null)) {
    const spans = [];
    for (const run of splitAtGaps(points).runs) {
      spans.push(...findThresholdCrossings(run, { low: lowMmol, high: highMmol, unit: "mmol/L" }, "mmol/L"));
    }
    for (const s of spans) {
      if (s.type === "high") {
        highSpells++;
        continue;
      }
      const inSpan = points.filter((p) => p.t >= s.startT && p.t <= s.endT);
      const extremeT = (inSpan.find((p) => p.v === s.extreme) || inSpan[0]).t;
      // A finger-prick from a little before the spell to a little after it, nearest the lowest reading.
      const prickNear = g
        .filter((e) => !isCgmSource(e.sourceId) && ts(e) >= s.startT - PRICK_NEAR_MIN * MIN && ts(e) <= s.endT + PRICK_NEAR_MIN * MIN)
        .sort((a, b) => Math.abs(ts(a) - extremeT) - Math.abs(ts(b) - extremeT))[0];
      const meal = [...meals].reverse().find((m) => ts(m) <= s.startT && s.startT - ts(m) <= MEAL_LOOKBACK_MIN * MIN);
      lows.push({
        startT: s.startT,
        endT: s.endT,
        extreme: s.extreme,
        minutes: Math.round((s.endT - s.startT) / MIN),
        readings: inSpan.length,
        source: sensorSource,
        meal: meal ? { text: meal.text || "", minutesBefore: Math.round((s.startT - ts(meal)) / MIN), carbs: meal.carbsTotal ?? null } : null,
        notes: notes
          .filter((d) => ts(d) >= s.startT - NOTE_BEFORE_MIN * MIN && ts(d) <= s.endT + NOTE_AFTER_MIN * MIN)
          .map((d) => ({ text: d.text, t: ts(d) })),
        prick: prickNear ? { v: toMmol(prickNear), t: ts(prickNear) } : null,
      });
    }
  }

  const mealRows = meals.map((m) => ({
    t: ts(m),
    text: m.text || "",
    carbs: m.carbsTotal ?? null,
    outcome: mealOutcome(m.timestamp, glucose),
  }));

  const prickRows = compareRows(glucose, { from: fromMs, to: toMs });

  return {
    from,
    to,
    days: daysBetween(from, to),
    daysWithSensor: new Set(points.map((p) => localDay(p.t))).size,
    counts: {
      glucose: g.length,
      sensor: points.length,
      prick: g.filter((e) => !isCgmSource(e.sourceId)).length,
      meals: meals.length,
      notes: notes.length,
    },
    bySource,
    sensor,
    thresholds: { lowMmol, highMmol, set: lowMmol != null || highMmol != null },
    lows,
    highSpells,
    longestLowMin: lows.reduce((m, l) => Math.max(m, l.minutes), 0),
    lowestLow: lows.length ? lows.reduce((m, l) => (l.extreme < m.extreme ? l : m)) : null,
    meals: mealRows,
    notes: notes.map((d) => ({ t: ts(d), text: d.text })),
    prickRows,
    prickSummary: summarise(prickRows),
  };
}

// ---- display helpers ----
export const fmtGlucose = (mmol, unit) => (unit === "mg/dL" ? String(Math.round(convertUnit(mmol, "mmol/L", "mg/dL"))) : convertUnit(mmol, "mmol/L", "mmol/L").toFixed(1));
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const when = (t) => formatDate(new Date(t).toISOString());
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function deviceLines(summary) {
  const order = ["librelinkup", "dexcom", "bluetooth-meter", "manual"];
  return order
    .filter((s) => summary.bySource[s])
    .map((s) => `${SOURCE_LABELS[s]}: ${plural(summary.bySource[s], isCgmSource(s) ? "reading" : "finger-prick")}`);
}

// The compact box on the Export screen, for whichever dates are chosen.
export function buildPreviewHTML(summary, unit) {
  const { counts, sensor } = summary;
  if (!counts.glucose && !counts.meals && !counts.notes) {
    return `<p class="field-hint">Nothing was logged between these dates yet.</p>`;
  }
  const rows = [];
  rows.push(["Period", `${plural(summary.days, "day")}${summary.daysWithSensor ? `, ${summary.daysWithSensor} with sensor readings` : ""}`]);
  for (const line of deviceLines(summary)) {
    const [k, v] = line.split(": ");
    rows.push([k, v]);
  }
  rows.push(["Meals and notes", `${plural(counts.meals, "meal")}, ${plural(counts.notes, "note")}`]);
  if (sensor) {
    rows.push(["Sensor average", `${fmtGlucose(sensor.mean, unit)} ${unit}`]);
    rows.push(["Sensor lowest", `${fmtGlucose(sensor.min.v, unit)} ${unit}, ${when(sensor.min.t)}`]);
    rows.push(["Sensor highest", `${fmtGlucose(sensor.max.v, unit)} ${unit}, ${when(sensor.max.t)}`]);
    if (summary.thresholds.set) {
      const parts = [];
      if (sensor.below != null) parts.push(`${fmtPct(sensor.below)} below your low line`);
      if (sensor.between != null) parts.push(`${fmtPct(sensor.between)} between`);
      if (sensor.above != null) parts.push(`${fmtPct(sensor.above)} above your high line`);
      rows.push(["Share of readings", parts.join(", ")]);
    }
    if (summary.thresholds.lowMmol != null) {
      rows.push(["Low spells", summary.lows.length ? `${summary.lows.length}${summary.longestLowMin ? `, longest ${formatAfter(summary.longestLowMin)}` : ""}` : "none"]);
    }
  }
  return `<dl class="export-facts">${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
}

const READING_NOTE =
  "Sensor readings measure glucose in the fluid under the skin. They trail the blood by a few minutes, and can read differently from a finger-prick, most of all when glucose is changing quickly, in the first day of a new sensor, or when something presses on the sensor. Finger-pricks measure glucose in blood.";

// The whole printable report as HTML for #print-summary. `graphHTML` is the 7-day graph (built by the
// caller, since it needs the full logs), `entries` the merged timeline rows inside the range, newest first.
export function buildReportHTML({ summary, unit, entries, graphHTML, profile = {}, appointmentNotes = "", entryRow, madeOn = new Date() }) {
  const S = summary;
  const g = (mmol) => `${fmtGlucose(mmol, unit)}`;
  const th = S.thresholds;
  const lowTxt = th.lowMmol != null ? `${g(th.lowMmol)} ${unit}` : null;
  const highTxt = th.highMmol != null ? `${g(th.highMmol)} ${unit}` : null;

  const kv = [];
  kv.push(["Period", `${formatDate(S.from.toISOString(), { withTime: false })} to ${formatDate(S.to.toISOString(), { withTime: false })} (${plural(S.days, "day")})`]);
  kv.push(["Devices", deviceLines(S).join("; ") || "No glucose readings in this period"]);
  if (S.sensor) {
    kv.push([`${SOURCE_LABELS[S.sensor.source]} sensor average`, `${g(S.sensor.mean)} ${unit} (variation: SD ${g(S.sensor.sd)}, ${Math.round(S.sensor.cv)}% of the average)`]);
    kv.push(["Lowest sensor reading", `${g(S.sensor.min.v)} ${unit} at ${when(S.sensor.min.t)}`]);
    kv.push(["Highest sensor reading", `${g(S.sensor.max.v)} ${unit} at ${when(S.sensor.max.t)}`]);
    kv.push(["Days with sensor readings", `${S.daysWithSensor} of ${S.days}`]);
    if (th.set) {
      const parts = [];
      if (S.sensor.below != null) parts.push(`below ${lowTxt}: ${fmtPct(S.sensor.below)}`);
      if (S.sensor.between != null) parts.push(`between: ${fmtPct(S.sensor.between)}`);
      if (S.sensor.above != null) parts.push(`above ${highTxt}: ${fmtPct(S.sensor.above)}`);
      kv.push(["Share of sensor readings", `${parts.join("; ")} (these lines are set in the app by the person it belongs to)`]);
    } else {
      kv.push(["Warning lines", "None set in the app, so lows and highs are not marked"]);
    }
    if (th.lowMmol != null) kv.push(["Low spells", S.lows.length ? `${S.lows.length}; longest ${S.longestLowMin ? formatAfter(S.longestLowMin) : "a single reading"}; lowest ${g(S.lowestLow.extreme)} ${unit}` : "none"]);
  }
  kv.push(["Finger-pricks", `${S.counts.prick}`]);
  kv.push(["Meals and notes logged", `${plural(S.counts.meals, "meal")}, ${plural(S.counts.notes, "note")}`]);

  const sections = [];
  const who = [profile.name, profile.condition].filter(Boolean).join(", ");
  sections.push(`<h1>Glucose &amp; food report</h1>
    <p class="rep-sub">${who ? `${escapeHtml(who)} · ` : ""}Made ${escapeHtml(formatDate(madeOn.toISOString()))} by Reactive Blood Tracker</p>`);

  if (appointmentNotes.trim()) {
    sections.push(`<div class="rep-box"><h2>My notes for this appointment</h2><p class="rep-pre">${escapeHtml(appointmentNotes.trim())}</p></div>`);
  }

  sections.push(`<h2>Summary</h2><table class="rep-kv"><tbody>${kv.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("")}</tbody></table>`);
  sections.push(`<h2>Last 7 days</h2><div class="print-graph">${graphHTML}</div>`);

  if (th.lowMmol != null) {
    if (S.lows.length) {
      const rows = S.lows
        .map((l) => {
          const logged = [];
          if (l.meal) logged.push(`Meal ${formatAfter(l.meal.minutesBefore)} before: ${clip(l.meal.text || "(no description)", 90)}${l.meal.carbs != null ? ` (${l.meal.carbs} g carbs)` : ""}`);
          for (const n of l.notes) logged.push(`Note at ${when(n.t)}: ${clip(n.text, 90)}`);
          if (l.prick) logged.push(`Finger-prick ${g(l.prick.v)} ${unit} at ${when(l.prick.t)}`);
          return `<tr><td>${escapeHtml(when(l.startT))}</td><td>${escapeHtml(g(l.extreme))} ${escapeHtml(unit)}</td><td>${escapeHtml(l.readings === 1 ? "1 reading" : `${formatAfter(l.minutes)} (${l.readings} readings)`)}</td><td>${logged.length ? logged.map(escapeHtml).join("<br>") : "Nothing logged"}</td></tr>`;
        })
        .join("");
      sections.push(`<h2>Low spells</h2><p class="rep-hint">Stretches where the ${escapeHtml(SOURCE_LABELS[S.sensor.source])} sensor read below ${escapeHtml(lowTxt)}, with whatever was logged around them.</p>
        <table><thead><tr><th>Started</th><th>Lowest</th><th>Length</th><th>Logged around it</th></tr></thead><tbody>${rows}</tbody></table>`);
    } else if (S.sensor) {
      sections.push(`<h2>Low spells</h2><p class="rep-hint">The sensor did not read below ${escapeHtml(lowTxt)} in this period.</p>`);
    }
  }

  if (S.meals.length) {
    const rows = S.meals
      .slice()
      .reverse()
      .map((m) => {
        const o = m.outcome;
        const cell = (x) => (x == null ? "—" : escapeHtml(x));
        return `<tr><td>${escapeHtml(when(m.t))}</td><td>${escapeHtml(clip(m.text || "(no description)", 110))}</td><td>${m.carbs != null ? `${escapeHtml(String(m.carbs))} g` : "—"}</td><td>${cell(o && o.before != null ? `${g(o.before)}` : null)}</td><td>${cell(o ? `${g(o.peak.value)} (${formatAfter(o.peak.afterMin)})` : null)}</td><td>${cell(o ? `${g(o.lowest.value)} (${formatAfter(o.lowest.afterMin)})` : null)}</td></tr>`;
      })
      .join("");
    sections.push(`<h2>Meals and what followed</h2><p class="rep-hint">Glucose in ${escapeHtml(unit)}: the reading just before each meal, then the highest and lowest in the next 5 hours with how long after the meal each came. This reports the readings; it does not judge the meal.</p>
      <table><thead><tr><th>When</th><th>What</th><th>Carbs</th><th>Before</th><th>Highest in 5 h</th><th>Lowest in 5 h</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (S.prickRows.length && Object.keys(S.prickSummary).length) {
    const sensors = Object.keys(S.prickSummary);
    const head = sensors.map((s) => `<th>${escapeHtml(SOURCE_LABELS[s] || s)}</th>`).join("");
    const rows = S.prickRows
      .map((r) => {
        const cells = sensors
          .map((s) => {
            const m = r.sensors[s];
            return `<td>${m ? `${escapeHtml(g(m.v))} (${m.diff >= 0 ? "+" : "−"}${escapeHtml(g(Math.abs(m.diff)))})` : "—"}</td>`;
          })
          .join("");
        return `<tr><td>${escapeHtml(when(r.t))}</td><td>${escapeHtml(g(r.prick))}</td>${cells}</tr>`;
      })
      .join("");
    const lines = sensors
      .map((s) => {
        const m = S.prickSummary[s];
        return `${SOURCE_LABELS[s] || s}: average difference ${g(m.meanAbs)} ${unit} (${Math.round(m.mard)}%), close to the finger-prick ${m.close} of ${m.n} times`;
      })
      .join("; ");
    sections.push(`<h2>Finger-pricks and the sensor</h2><p class="rep-hint">${escapeHtml(lines)}. Each sensor value is its reading at the moment of the finger-prick; brackets show the difference from the finger-prick.</p>
      <table><thead><tr><th>When</th><th>Finger-prick</th>${head}</tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (S.notes.length) {
    sections.push(`<h2>Notes and symptoms</h2><ul class="rep-notes">${S.notes.map((n) => `<li><strong>${escapeHtml(when(n.t))}</strong> ${escapeHtml(n.text)}</li>`).join("")}</ul>`);
  }

  sections.push(`<h2>Every entry</h2>
    <table><thead><tr><th>Type</th><th>When</th><th>Detail</th></tr></thead><tbody>${entries.map(entryRow).join("")}</tbody></table>`);

  sections.push(`<h2>How to read this report</h2>
    <p class="rep-hint">${escapeHtml(READING_NOTE)}</p>
    <p class="rep-hint">Low and high spells use the warning lines set in the app. Averages and shares use sensor readings only, from one sensor, and count readings rather than minutes. This report records what was logged and measured. It does not diagnose and it does not suggest treatment. Please read it with your doctor.</p>`);

  return sections.join("\n");
}
