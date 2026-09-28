import { test, expect } from "@playwright/test";
import { filterEntries, filterCounts, normaliseFilter } from "../src/readingsFilter.js";

const entries = [
  { _kind: "glucose", sourceId: "librelinkup", value: 5.1 },
  { _kind: "glucose", sourceId: "librelinkup", value: 5.3 },
  { _kind: "glucose", sourceId: "bluetooth-meter", value: 4.8 },
  { _kind: "glucose", sourceId: "manual", value: 6.0 },
  { _kind: "glucose", value: 6.2 }, // older entries may have no sourceId: count as finger-prick
  { _kind: "food", text: "toast" },
  { _kind: "diary", text: "shaky" },
];

test.describe("readings filter (pure logic)", () => {
  test("each filter keeps only its kind", () => {
    expect(filterEntries(entries, "all")).toHaveLength(7);
    expect(filterEntries(entries, "cgm").map((e) => e.value)).toEqual([5.1, 5.3]);
    expect(filterEntries(entries, "meter").map((e) => e.value)).toEqual([4.8, 6.0, 6.2]);
    expect(filterEntries(entries, "food")).toEqual([{ _kind: "food", text: "toast" }]);
    expect(filterEntries(entries, "diary")).toHaveLength(1);
  });

  test("counts match the filters", () => {
    expect(filterCounts(entries)).toEqual({ all: 7, meter: 3, cgm: 2, food: 1, diary: 1 });
  });

  test("unknown or missing keys fall back to all", () => {
    expect(normaliseFilter(null)).toBe("all");
    expect(normaliseFilter("insulin")).toBe("all");
    expect(normaliseFilter("cgm")).toBe("cgm");
    expect(filterEntries(entries, "nonsense")).toHaveLength(7);
  });
});
