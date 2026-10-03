// Written by scripts/guide-screenshots.mjs. Each picture's pixel size (so the guide can reserve its space) and
// how many numbered markers it carries (tests/guide.spec.js checks the caption lists the same number).
export const FIGURES = {
  "home-top": { w: 780, h: 560, marks: 6 },
  "home-glucose": { w: 780, h: 1066, marks: 6 },
  "home-food": { w: 780, h: 1384, marks: 8 },
  "meal-builder": { w: 780, h: 1346, marks: 6 },
  "barcode-lookup": { w: 780, h: 1110, marks: 6 },
  "graph-24h": { w: 780, h: 954, marks: 7 },
  "meals-view": { w: 780, h: 406, marks: 5 },
  "compare-view": { w: 780, h: 1278, marks: 4 },
  "devices-list": { w: 780, h: 670, marks: 3 },
  "thresholds": { w: 780, h: 878, marks: 4 },
  "spike-prompt": { w: 780, h: 480, marks: 6 },
  "export-dates": { w: 780, h: 1838, marks: 3 },
  "export-make": { w: 780, h: 1574, marks: 4 },
  "report-page": { w: 1588, h: 1600, marks: 4 },
};
