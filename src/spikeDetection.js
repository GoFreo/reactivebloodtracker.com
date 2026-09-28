// "Why did your sugar spike?" — Scott's idea (2026-09-28). Finds clear rises and
// drops in CGM data that have nothing logged before them, so the app can *ask*
// about them. Descriptive only: it reports what the readings did and asks a
// question — it never judges the number or suggests what to do (CLAUDE.md,
// "Descriptive, not prescriptive").
//
// Pure functions, no DOM or storage — main.js owns the UI and persistence.

import { convertUnit } from "./thresholds.js";

const SETTINGS_KEY = "rht-spike-settings";

// Starting values Scott agreed to (2026-09-28); all editable in Settings.
export const DEFAULT_SPIKE_SETTINGS = {
  enabled: true,
  riseAmount: 2.0, // mmol/L
  dropAmount: 2.0, // mmol/L
  windowMinutes: 60, // the change has to happen within this long
  lookbackMinutes: 120, // nothing logged this long before a rise = unexplained
};

// A reactive drop usually follows a meal by 2–4 hours, so a drop looks further
// back than a rise before calling it unexplained — otherwise every post-meal
// crash would be flagged even though the meal is right there in the log.
export const DROP_LOOKBACK_MINUTES = 240;

// Only look at recent history, so the first sync of a long backlog doesn't
// bury Home under a week of old questions.
export const RECENT_DAYS = 7;

export function getSpikeSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SPIKE_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SPIKE_SETTINGS };
  } catch {
    return { ...DEFAULT_SPIKE_SETTINGS };
  }
}

export function saveSpikeSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not fatal — defaults apply next time.
  }
}

// Continuous-sensor readings only: finger-pricks are too sparse to show a
// rise-over-an-hour shape, and mixing the two sources would compare blood
// against interstitial values that genuinely differ.
export function cgmSeries(glucose) {
  return glucose
    .filter((g) => g.sourceId === "librelinkup")
    .map((g) => ({ t: new Date(g.timestamp).getTime(), v: convertUnit(Number(g.value), g.unit, "mmol/L") }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

// Returns [{ id, type: "rise"|"drop", startT, startValue, peakT, peakValue }].
// A reading "triggers" when it has moved by at least the set amount from the
// lowest (rise) / highest (drop) reading in the preceding window. Consecutive
// triggers that overlap become one event, with the most extreme reading as its
// peak — one climb is one question, not twelve.
export function detectExcursions(series, settings = DEFAULT_SPIKE_SETTINGS) {
  const windowMs = settings.windowMinutes * 60000;
  const events = [];
  for (const type of ["rise", "drop"]) {
    const amount = type === "rise" ? settings.riseAmount : settings.dropAmount;
    let current = null;
    for (let i = 0; i < series.length; i++) {
      const p = series[i];
      let base = null;
      for (let j = i - 1; j >= 0 && p.t - series[j].t <= windowMs; j--) {
        const q = series[j];
        if (!base || (type === "rise" ? q.v < base.v : q.v > base.v)) base = q;
      }
      if (!base) continue;
      const change = type === "rise" ? p.v - base.v : base.v - p.v;
      if (change + 1e-9 < amount) continue;

      if (current && base.t <= current.peakT) {
        const moreExtreme = type === "rise" ? p.v > current.peakValue : p.v < current.peakValue;
        if (moreExtreme) {
          current.peakT = p.t;
          current.peakValue = p.v;
        }
      } else {
        current = { type, startT: base.t, startValue: base.v, peakT: p.t, peakValue: p.v };
        events.push(current);
      }
    }
  }
  for (const e of events) e.id = `${e.type}-${new Date(e.startT).toISOString()}`;
  return events.sort((a, b) => b.startT - a.startT);
}

// Events worth asking about: recent, nothing logged in the lookback before
// them, and not already answered (a diary entry tagged with the event's id)
// or dismissed.
export function findUnexplainedExcursions({ glucose, food, diary, settings = getSpikeSettings(), dismissedIds = [], now = Date.now() }) {
  if (!settings.enabled) return [];
  const answered = new Set(diary.filter((d) => d.excursionId).map((d) => d.excursionId));
  const dismissed = new Set(dismissedIds);
  const toTimes = (entries) => entries.map((e) => new Date(e.timestamp).getTime()).filter(Number.isFinite);
  const context = toTimes([...food, ...diary.filter((d) => !d.excursionId)]);
  // A spike followed by a crash is usually one episode: once the rise has been
  // answered (any answer), the drop after it is covered too — don't ask twice.
  const answeredRises = toTimes(diary.filter((d) => d.excursionId?.startsWith("rise-")));
  const cutoff = now - RECENT_DAYS * 86400000;

  return detectExcursions(cgmSeries(glucose), settings).filter((e) => {
    if (e.peakT < cutoff || answered.has(e.id) || dismissed.has(e.id)) return false;
    const lookbackMs = (e.type === "rise" ? settings.lookbackMinutes : DROP_LOOKBACK_MINUTES) * 60000;
    const explainers = e.type === "drop" ? [...context, ...answeredRises] : context;
    return !explainers.some((t) => t >= e.startT - lookbackMs && t <= e.peakT);
  });
}

// Plain-language summary used on the Home card and in the diary marker.
export function describeExcursion(e, formatTime) {
  const verb = e.type === "rise" ? "rose" : "dropped";
  const from = e.startValue.toFixed(1);
  const to = e.peakValue.toFixed(1);
  return `Your glucose ${verb} from ${from} to ${to} mmol/L between ${formatTime(e.startT)} and ${formatTime(e.peakT)}`;
}
