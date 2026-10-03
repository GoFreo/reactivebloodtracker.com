import { test, expect } from "@playwright/test";
import { summariseRange, buildReportHTML, buildPreviewHTML, fmtGlucose } from "../src/report.js";
import { buildCSV } from "../src/export.js";
import { mergeTimeline, entryBody } from "../src/timeline.js";

// formatDate() reads the date-format setting from localStorage; Node has none, so give it an empty one.
test.beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {} }, configurable: true, writable: true });
});

// Every time is built in the machine's own time zone, so day counts don't depend on where the test runs.
const at = (h, m = 0, day = 30) => new Date(2026, 8, day, h, m).toISOString();
let seq = 0;
const reading = (when, value, sourceId = "librelinkup", extra = {}) => ({ id: `r${seq++}`, type: "glucose", value, unit: "mmol/L", timestamp: when, sourceId, note: "", ...extra });
const FROM = new Date(2026, 8, 30, 0, 0, 0);
const TO = new Date(2026, 8, 30, 23, 59, 59);
const THRESHOLDS = { low: 4, high: 10, unit: "mmol/L" };

// A morning: breakfast at 07:00, a rise to 9, a crash to 3.6 around 09:45, a finger-prick at 09:50, a note at 09:40.
function morning() {
  const libre = [];
  const curve = [5.4, 5.6, 6.8, 8.2, 9.0, 8.1, 6.6, 5.2, 4.4, 3.9, 3.6, 3.8, 4.3, 5.0, 5.4];
  curve.forEach((v, i) => libre.push(reading(at(7 + Math.floor((i * 15) / 60), (i * 15) % 60), v)));
  return {
    glucose: [...libre, reading(at(9, 50), 3.4, "bluetooth-meter"), reading(at(8, 5), 8.6, "manual")],
    food: [{ id: "f1", type: "food", text: "Two slices of toast with honey", timestamp: at(7, 0), carbsTotal: 38 }],
    diary: [{ id: "d1", type: "diary", text: "Shaky and sweaty", timestamp: at(9, 40) }],
  };
}

test.describe("summariseRange", () => {
  test("counts what was logged, by device, inside the dates", () => {
    const d = morning();
    const outside = reading(at(12, 0, 29), 6.0);
    const s = summariseRange({ ...d, glucose: [...d.glucose, outside], from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.counts.sensor).toBe(15);
    expect(s.counts.prick).toBe(2);
    expect(s.counts.meals).toBe(1);
    expect(s.counts.notes).toBe(1);
    expect(s.bySource).toEqual({ librelinkup: 15, "bluetooth-meter": 1, manual: 1 });
    expect(s.days).toBe(1);
    expect(s.daysWithSensor).toBe(1);
  });

  test("sensor average, lowest and highest come from the sensor only, not finger-pricks", () => {
    const s = summariseRange({ ...morning(), from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.sensor.n).toBe(15);
    expect(s.sensor.min.v).toBe(3.6);
    expect(s.sensor.max.v).toBe(9.0);
    expect(s.sensor.mean).toBeCloseTo(5.69, 1);
    expect(s.sensor.cv).toBeGreaterThan(10);
    // Three readings are under 4.0 (3.9, 3.6 and 3.8) and none are over 10.
    expect(s.sensor.below).toBeCloseTo(3 / 15, 5);
    expect(s.sensor.above).toBe(0);
    expect(s.sensor.between).toBeCloseTo(12 / 15, 5);
  });

  test("a low spell carries the meal before it, the note around it and the nearby finger-prick", () => {
    const s = summariseRange({ ...morning(), from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.lows).toHaveLength(1);
    const low = s.lows[0];
    expect(low.extreme).toBe(3.6);
    expect(low.readings).toBe(3);
    expect(low.meal.text).toContain("toast");
    expect(low.meal.minutesBefore).toBe(135);
    expect(low.meal.carbs).toBe(38);
    expect(low.notes.map((n) => n.text)).toEqual(["Shaky and sweaty"]);
    expect(low.prick.v).toBe(3.4);
    expect(s.lowestLow.extreme).toBe(3.6);
  });

  test("a low lists up to three meals from the five hours before it, nearest first", () => {
    const d = morning();
    // The low starts at 09:15. Five meals sit before it: one is outside the 5-hour window and one is a fourth-nearest.
    d.food = [
      { id: "m0", type: "food", text: "Long-ago supper", timestamp: at(3, 0) }, // 375 min before: outside the window
      { id: "m1", type: "food", text: "Cereal", timestamp: at(5, 30) }, // 225 min before: in the window, but only the nearest three are listed
      { id: "m2", type: "food", text: "Toast with honey", timestamp: at(7, 0), carbsTotal: 38 },
      { id: "m3", type: "food", text: "Banana", timestamp: at(8, 45) },
      { id: "m4", type: "food", text: "Biscuit", timestamp: at(9, 10) },
    ];
    const s = summariseRange({ ...d, from: FROM, to: TO, thresholds: THRESHOLDS });
    const low = s.lows[0];
    expect(low.meals.map((m) => m.text)).toEqual(["Biscuit", "Banana", "Toast with honey"]);
    expect(low.meals[0].minutesBefore).toBeLessThan(low.meals[1].minutesBefore);
    expect(low.meal).toEqual(low.meals[0]); // the single-meal field is the nearest one
    const html = buildReportHTML({
      summary: s,
      unit: "mmol/L",
      entries: [],
      graphHTML: "",
      profile: {},
      appointmentNotes: "",
      entryRow: () => "",
    });
    for (const text of ["Biscuit", "Banana", "Toast with honey"]) expect(html).toContain(text);
    expect(html.split("<h2>Meals and what followed</h2>")[0]).not.toContain("Cereal");
  });

  test("a low with no meal before it lists none", () => {
    const d = morning();
    d.food = [];
    const s = summariseRange({ ...d, from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.lows[0].meals).toEqual([]);
    expect(s.lows[0].meal).toBeNull();
  });

  test("a sensor gap splits one low into two instead of bridging it", () => {
    const glucose = [
      reading(at(1, 0), 3.5),
      reading(at(1, 15), 3.4),
      reading(at(3, 0), 3.3), // 105 minutes later: a gap
      reading(at(3, 15), 3.6),
    ];
    const s = summariseRange({ glucose, from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.lows).toHaveLength(2);
  });

  test("two sensors worn together are never mixed: the one with more readings is used", () => {
    const glucose = [
      reading(at(8, 0), 6.0),
      reading(at(8, 15), 6.1),
      reading(at(8, 30), 6.2),
      reading(at(8, 5), 3.0, "dexcom"),
    ];
    const s = summariseRange({ glucose, from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.sensor.source).toBe("librelinkup");
    expect(s.sensor.min.v).toBe(6.0);
    expect(s.lows).toHaveLength(0);
  });

  test("warning lines in mg/dL are honoured", () => {
    const s = summariseRange({ ...morning(), from: FROM, to: TO, thresholds: { low: 72, high: 180, unit: "mg/dL" } });
    expect(s.thresholds.lowMmol).toBeCloseTo(4.0, 1);
    expect(s.lows).toHaveLength(1);
  });

  test("with no warning lines set, nothing is called low or high", () => {
    const s = summariseRange({ ...morning(), from: FROM, to: TO, thresholds: { low: null, high: null, unit: "mmol/L" } });
    expect(s.thresholds.set).toBe(false);
    expect(s.lows).toEqual([]);
    expect(s.sensor.below).toBeNull();
    expect(s.sensor.between).toBeNull();
  });

  test("meal outcomes and finger-prick comparisons are included", () => {
    const s = summariseRange({ ...morning(), from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.meals[0].outcome.peak.value).toBe(9);
    expect(s.meals[0].outcome.lowest.value).toBe(3.6);
    expect(s.prickRows.length).toBe(2);
    expect(s.prickSummary.librelinkup.n).toBeGreaterThan(0);
  });

  test("an empty period is handled", () => {
    const s = summariseRange({ glucose: [], food: [], diary: [], from: FROM, to: TO, thresholds: THRESHOLDS });
    expect(s.sensor).toBeNull();
    expect(s.lows).toEqual([]);
    expect(buildPreviewHTML(s, "mmol/L")).toContain("Nothing was logged");
  });
});

test.describe("the printed report", () => {
  const build = (over = {}) => {
    const d = morning();
    const summary = summariseRange({ ...d, from: FROM, to: TO, thresholds: over.thresholds || THRESHOLDS });
    const entries = mergeTimeline(d);
    return buildReportHTML({
      summary,
      unit: over.unit || "mmol/L",
      entries,
      graphHTML: '<svg class="readings-graph"></svg>',
      profile: over.profile || {},
      appointmentNotes: over.appointmentNotes || "",
      entryRow: (e) => `<tr><td>${e._kind}</td><td>${e.timestamp}</td><td>${entryBody(e)}</td></tr>`,
      madeOn: new Date("2026-10-03T10:00:00Z"),
    });
  };

  test("has every section a doctor would look for, in a sensible order", () => {
    const html = build();
    const order = ["<h1>Glucose &amp; food report", "<h2>Summary</h2>", "<h2>Last 7 days</h2>", "<h2>Low spells</h2>", "<h2>Meals and what followed</h2>", "<h2>Finger-pricks and the sensor</h2>", "<h2>Notes and symptoms</h2>", "<h2>Every entry</h2>", "<h2>How to read this report</h2>"];
    let at = -1;
    for (const marker of order) {
      const i = html.indexOf(marker);
      expect(i, marker).toBeGreaterThan(at);
      at = i;
    }
  });

  test("the low-spell row says what was logged around it", () => {
    const html = build();
    expect(html).toContain("Two slices of toast with honey");
    expect(html).toContain("38 g carbs");
    expect(html).toContain("Shaky and sweaty");
    expect(html).toContain("Finger-prick 3.4 mmol/L");
    expect(html).toContain("3.6 mmol/L");
  });

  test("shows the person's name and condition, and appointment notes only when given", () => {
    expect(build({ profile: { name: "Pat", condition: "Reactive hypoglycaemia" }, appointmentNotes: "Ask about the 10 am lows" })).toContain("Pat, Reactive hypoglycaemia");
    expect(build({ appointmentNotes: "Ask about the 10 am lows" })).toContain("My notes for this appointment");
    expect(build({ appointmentNotes: "   " })).not.toContain("My notes for this appointment");
  });

  test("anything typed by the person is escaped", () => {
    const d = morning();
    d.diary[0].text = '<img src=x onerror="alert(1)">';
    const summary = summariseRange({ ...d, from: FROM, to: TO, thresholds: THRESHOLDS });
    const html = buildReportHTML({ summary, unit: "mmol/L", entries: [], graphHTML: "", profile: { name: "<b>x</b>" }, appointmentNotes: "<script>alert(2)</script>", entryRow: () => "" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img src=x");
  });

  test("without warning lines it says so, and has no low-spells section", () => {
    const html = build({ thresholds: { low: null, high: null, unit: "mmol/L" } });
    expect(html).toContain("None set in the app");
    expect(html).not.toContain("<h2>Low spells</h2>");
  });

  test("shows numbers in mg/dL when that is the chosen unit", () => {
    const html = build({ unit: "mg/dL" });
    expect(fmtGlucose(3.6, "mg/dL")).toBe("65");
    expect(html).toContain("65 mg/dL");
    // The numbers the report works out are in mg/dL (the "every entry" list shows each entry as it was logged).
    expect(html.split("<h2>Every entry</h2>")[0]).not.toContain("mmol/L");
  });

  test("describes and never advises", () => {
    const text = build().replace(/<[^>]+>/g, " ");
    expect(text).toContain("does not diagnose");
    expect(text).not.toMatch(/you should|we recommend|safe amount|insulin dose/i);
  });
});

test.describe("the preview box", () => {
  test("lists the period, devices and key numbers", () => {
    const s = summariseRange({ ...morning(), from: FROM, to: TO, thresholds: THRESHOLDS });
    const html = buildPreviewHTML(s, "mmol/L");
    expect(html).toContain("1 day");
    expect(html).toContain("Libre");
    expect(html).toContain("15 readings");
    expect(html).toContain("1 meal, 1 note");
    expect(html).toContain("below your low line");
    expect(html).toContain("Low spells");
  });
});

test.describe("CSV", () => {
  test("carries each reading's device so a restored file keeps sensor readings as sensor readings", () => {
    const rows = mergeTimeline({ glucose: [reading(at(8, 0), 6.1), reading(at(9, 0), 5.2, "bluetooth-meter")], food: [], diary: [] });
    const csv = buildCSV(rows);
    const [header, ...lines] = csv.split("\n");
    expect(header).toBe('"Type","When","Detail","Timestamp","Value","Unit","Note","Text","Source","Device"');
    expect(lines.join("\n")).toContain('"librelinkup","Libre"');
    expect(lines.join("\n")).toContain('"bluetooth-meter","Accu-Chek meter"');
  });
});
