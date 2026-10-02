// Readings → List filter. A Libre sync adds ~48 readings per 12 hours, which
// buries finger-pricks, meals and notes; these chips let the list show one kind
// at a time. Pure functions so they're testable without a browser. Entries are
// the merged timeline (each has `_kind`: glucose / food / diary).

import { isCgmSource } from "./cgmSources.js";

const isCgm = (e) => e._kind === "glucose" && isCgmSource(e.sourceId);

export const READING_FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "meter", label: "Finger-prick", test: (e) => e._kind === "glucose" && !isCgm(e) },
  { key: "cgm", label: "CGM", test: isCgm },
  { key: "food", label: "Food", test: (e) => e._kind === "food" },
  { key: "diary", label: "Notes", test: (e) => e._kind === "diary" },
];

function find(key) {
  return READING_FILTERS.find((f) => f.key === key) || READING_FILTERS[0];
}

// An unknown or stale key (e.g. from an older version) falls back to "all".
export function normaliseFilter(key) {
  return find(key).key;
}

export function filterEntries(entries, key) {
  const f = find(key);
  return f.key === "all" ? entries : entries.filter(f.test);
}

export function filterCounts(entries) {
  const counts = {};
  for (const f of READING_FILTERS) counts[f.key] = f.key === "all" ? entries.length : entries.filter(f.test).length;
  return counts;
}
