import { glucoseSources, saveGlucoseReading, listGlucoseReadings } from "./glucose.js";
import { saveFoodEntry, listFoodEntries, parseFoodWithAI } from "./food.js";
import { saveDiaryNote, listDiaryNotes } from "./diary.js";
import {
  getReminderSettings,
  saveReminderSettings,
  notificationSupportStatus,
  requestNotificationPermission,
  shouldShowReminderBanner,
} from "./reminders.js";
import { mergeTimeline, renderReadingsList, renderReadingsGraph } from "./timeline.js";
import { compareRecentFirst } from "./db.js";
import { downloadCSV, printSummary, importCSV } from "./export.js";
import {
  getThresholds,
  saveThresholds,
  classifyReading,
  explainClassification,
  isBelowFloor,
  floorInUnit,
  convertUnit,
} from "./thresholds.js";
import { getFoodSuggestions, shortLabel } from "./foodSuggestions.js";
import { getDateFormat, saveDateFormat, formatDate } from "./dateformat.js";
import { getSoundEnabled, saveSoundEnabled, playTone } from "./sound.js";
import { connectAndFetchReadings, isBluetoothAvailable } from "./bluetoothGlucose.js";
import { lookupBarcode, productToFoodText } from "./nutrition.js";
import { readPhotoTimestamps, toStorableBlob } from "./photoImport.js";
import { fetchCgmReadings, getSavedPasscode, savePasscode, CGM_LAST_SYNC_KEY } from "./libreLinkUp.js";
import {
  findUnexplainedExcursions,
  describeExcursion,
  getSpikeSettings,
  saveSpikeSettings,
} from "./spikeDetection.js";

// Dynamically imported on first use — ZXing (the barcode decoder) adds ~500KB
// before compression, and most visits never touch the scanner. No reason to
// make every page load pay for it upfront.
let barcodeModulePromise = null;
function getBarcodeModule() {
  if (!barcodeModulePromise) barcodeModulePromise = import("./barcode.js");
  return barcodeModulePromise;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const VIEW_TITLES = {
  home: "Home",
  readings: "Readings",
  diary: "Add diary note",
  export: "Export report",
  "food-guidance": "Food Guidance",
  settings: "Settings",
};

const READINGS_MODE_KEY = "rht-readings-mode";

const viewTitle = document.getElementById("view-title");
const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

function nowForDatetimeLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toDatetimeLocal(ms) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function localDateStr(d) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseOrNull(str) {
  if (str === "" || str == null) return null;
  const n = Number(str);
  return Number.isNaN(n) ? null : n;
}

function showView(name) {
  for (const view of views) {
    view.hidden = view.dataset.view !== name;
  }
  for (const btn of navButtons) {
    btn.classList.toggle("active", btn.dataset.nav === name);
  }
  viewTitle.textContent = VIEW_TITLES[name] || "";

  if (name !== "home") {
    // leaving Home mid-scan shouldn't leave the camera running — but don't
    // force-load the scanner module just to check if it was ever started.
    if (barcodeModulePromise) barcodeModulePromise.then((m) => m.stopScanning());
    document.getElementById("barcode-scanner").hidden = true;
  }

  if (name === "home") {
    document.getElementById("glucose-time").value = nowForDatetimeLocal();
    document.getElementById("food-time").value = nowForDatetimeLocal();
    resetFoodAiState();
    refreshHome();
  } else if (name === "diary") {
    document.getElementById("diary-time").value = nowForDatetimeLocal();
  } else if (name === "readings") {
    refreshReadings();
  } else if (name === "settings") {
    loadThresholdSettings();
  }
}

for (const el of document.querySelectorAll("[data-nav]")) {
  el.addEventListener("click", () => showView(el.dataset.nav));
}

let cachedGlucose = [];
let cachedFood = [];
let cachedDiary = [];

async function refreshAllCaches() {
  [cachedGlucose, cachedFood, cachedDiary] = await Promise.all([
    listGlucoseReadings(),
    listFoodEntries(),
    listDiaryNotes(),
  ]);
}

async function refreshHome() {
  await refreshAllCaches();
  updateReminderBanner();
  renderLatestReading();
  renderFoodSuggestions();
  renderSpikePrompts();
}

async function refreshReadings() {
  await refreshAllCaches();
  const merged = mergeTimeline({ glucose: cachedGlucose, food: cachedFood, diary: cachedDiary });
  const mode = localStorage.getItem(READINGS_MODE_KEY) || "list";
  setReadingsMode(mode, merged);
}

const GRAPH_RANGE_KEY = "rht-graph-range-hours";

function setReadingsMode(mode, merged) {
  const listEl = document.getElementById("timeline-list");
  const graphWrap = document.getElementById("readings-graph-wrap");
  for (const btn of document.querySelectorAll("#readings-view-toggle button")) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
  if (mode === "graph") {
    listEl.hidden = true;
    graphWrap.hidden = false;
    renderGraph();
  } else {
    graphWrap.hidden = true;
    listEl.hidden = false;
    renderReadingsList(listEl, merged);
  }
}

function renderGraph() {
  const hours = Number(localStorage.getItem(GRAPH_RANGE_KEY)) || 24;
  for (const btn of document.querySelectorAll("#graph-range-toggle button")) {
    btn.classList.toggle("active", Number(btn.dataset.hours) === hours);
  }
  renderReadingsGraph(document.getElementById("readings-graph-container"), cachedGlucose, {
    unit: localStorage.getItem("rht-default-unit") || "mmol/L",
    hours,
  });
}

for (const btn of document.querySelectorAll("#graph-range-toggle button")) {
  btn.addEventListener("click", () => {
    localStorage.setItem(GRAPH_RANGE_KEY, btn.dataset.hours);
    renderGraph();
  });
}

for (const btn of document.querySelectorAll("#readings-view-toggle button")) {
  btn.addEventListener("click", () => {
    localStorage.setItem(READINGS_MODE_KEY, btn.dataset.mode);
    document.getElementById("readings-mode-list").checked = btn.dataset.mode === "list";
    document.getElementById("readings-mode-graph").checked = btn.dataset.mode === "graph";
    refreshReadings();
  });
}

let reminderBannerWasShown = false;
function updateReminderBanner() {
  const banner = document.getElementById("reminder-banner");
  const shouldShow = shouldShowReminderBanner(cachedGlucose);
  if (shouldShow && !reminderBannerWasShown) {
    playTone("reminder"); // only on the hidden→shown transition, not every refresh
  }
  reminderBannerWasShown = shouldShow;
  banner.hidden = !shouldShow;
  if (shouldShow) banner.textContent = "Reminder: no glucose reading logged yet today.";
}

// "4 min ago" style freshness — computed once at render time (this app refreshes
// on every save/nav anyway), not a live-ticking clock; a setInterval for this
// would be real complexity for a personal app that's rarely left open and idle.
function formatRelativeTime(timestamp) {
  const diffMin = Math.round((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return formatDate(timestamp);
}

// Change since the previous reading, converted into the latest reading's own
// unit first so a mixed mmol/L-then-mg/dL history still compares correctly.
function formatDelta(latest, previous) {
  if (!previous) return "";
  const prevInLatestUnit = convertUnit(previous.value, previous.unit, latest.unit);
  const delta = Math.round((latest.value - prevInLatestUnit) * 10) / 10;
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function renderLatestReading() {
  const card = document.getElementById("latest-reading");
  const infoBtn = document.getElementById("latest-reading-info-btn");
  const explanation = document.getElementById("latest-reading-explanation");
  if (!cachedGlucose.length) {
    card.hidden = true;
    explanation.hidden = true;
    return;
  }
  const sorted = [...cachedGlucose].sort(compareRecentFirst);
  const latest = sorted[0];
  card.hidden = false;
  document.getElementById("latest-reading-value").textContent = latest.value;
  document.getElementById("latest-reading-unit").textContent = ` ${latest.unit}`;
  document.getElementById("latest-reading-delta").textContent = formatDelta(latest, sorted[1]);
  document.getElementById("latest-reading-when").textContent = formatRelativeTime(latest.timestamp);

  card.classList.remove("warn-low", "warn-high", "warn-in-range");
  const cls = classifyReading(latest.value, latest.unit);
  explanation.hidden = true;
  explanation.textContent = "";
  if (cls) {
    card.classList.add(`warn-${cls}`);
    infoBtn.hidden = false;
    infoBtn.onclick = () => {
      explanation.hidden = !explanation.hidden;
      explanation.textContent = explainClassification(latest.value, latest.unit);
    };
  } else {
    infoBtn.hidden = true;
  }
}

function renderFoodSuggestions() {
  const container = document.getElementById("food-suggestions");
  container.innerHTML = "";
  for (const s of getFoodSuggestions(cachedFood)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = shortLabel(s.text);
    chip.title = s.text;
    chip.addEventListener("click", () => {
      const textarea = document.getElementById("food-text");
      textarea.value = s.text;
      textarea.focus();
    });
    container.appendChild(chip);
  }
}

// --- Glucose form ---
const glucoseForm = document.getElementById("glucose-form");
glucoseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = document.getElementById("glucose-value").value;
  const unit = document.getElementById("glucose-unit").value;
  await saveGlucoseReading({
    value,
    unit,
    timestamp: new Date(document.getElementById("glucose-time").value).toISOString(),
    note: document.getElementById("glucose-note").value,
  });
  const cls = classifyReading(Number(value), unit);
  if (cls === "low" || cls === "high") playTone(cls);
  glucoseForm.reset();
  document.getElementById("glucose-unit").value = localStorage.getItem("rht-default-unit") || "mmol/L";
  document.getElementById("glucose-time").value = nowForDatetimeLocal();
  await refreshHome();
});

// --- Food form ---
const foodForm = document.getElementById("food-form");
const foodPhotoInput = document.getElementById("food-photo");
const foodPhotoPreview = document.getElementById("food-photo-preview");
const foodAiResultEl = document.getElementById("food-ai-result");
const foodClarifyEl = document.getElementById("food-clarify");
const foodClarifyQuestionEl = document.getElementById("food-clarify-question");
const foodClarifyAnswerInput = document.getElementById("food-clarify-answer");
let currentFoodPhotoBlob = null;
let currentAiResult = null;
let foodParseContextText = "";

function resetFoodAiState() {
  currentAiResult = null;
  foodParseContextText = "";
  foodAiResultEl.hidden = true;
  foodClarifyEl.hidden = true;
}

// Renders one AI parse result and, if Claude asked a clarifying question (brief
// §4.3 — "the single most important UX pattern"), shows the follow-up box so
// Scott can answer and get a refined estimate rather than a one-shot guess.
function renderAiResult(result) {
  currentAiResult = result;
  if (result.configured === false) {
    foodAiResultEl.textContent = `AI parsing not available yet: ${result.error}\n\nYour entry will still save — you can fill in details yourself.`;
    foodClarifyEl.hidden = true;
    return;
  }
  const lines = [`${result.foodName} — ${result.confidencePercent}% confidence`];
  if (result.portionEstimate) lines.push(`Portion: ${result.portionEstimate}`);
  if (result.assumptions) lines.push(`Assumptions: ${result.assumptions}`);
  foodAiResultEl.textContent = lines.join("\n");

  if (result.clarifyingQuestion) {
    foodClarifyQuestionEl.textContent = `Claude asks: ${result.clarifyingQuestion}`;
    foodClarifyAnswerInput.value = "";
    foodClarifyEl.hidden = false;
  } else {
    foodClarifyEl.hidden = true;
  }
}

foodPhotoInput.addEventListener("change", () => {
  const file = foodPhotoInput.files[0];
  currentFoodPhotoBlob = file || null;
  resetFoodAiState();
  if (file) {
    foodPhotoPreview.src = URL.createObjectURL(file);
    foodPhotoPreview.hidden = false;
  } else {
    foodPhotoPreview.hidden = true;
  }
});

document.getElementById("food-camera-btn").addEventListener("click", () => foodPhotoInput.click());

const barcodeScannerEl = document.getElementById("barcode-scanner");
const barcodeVideoEl = document.getElementById("barcode-video");
const barcodeStatusEl = document.getElementById("barcode-status");

document.getElementById("food-barcode-btn").addEventListener("click", async () => {
  barcodeStatusEl.textContent = "Loading scanner…";
  barcodeScannerEl.hidden = false;
  const { startScanning, isCameraAvailable } = await getBarcodeModule();
  if (!isCameraAvailable()) {
    barcodeScannerEl.hidden = true;
    foodAiResultEl.hidden = false;
    foodAiResultEl.textContent = "Camera access isn't available in this browser — describe the item above instead.";
    foodClarifyEl.hidden = true;
    return;
  }
  barcodeStatusEl.textContent = "Point the camera at the barcode…";
  await startScanning(barcodeVideoEl, {
    onDetected: async (code) => {
      barcodeStatusEl.textContent = `Found ${code} — looking it up…`;
      const product = await lookupBarcode(code);
      barcodeScannerEl.hidden = true;
      if (product.found) {
        document.getElementById("food-text").value = productToFoodText(product);
      } else {
        foodAiResultEl.hidden = false;
        foodAiResultEl.textContent = product.error;
        foodClarifyEl.hidden = true;
      }
    },
    onError: (err) => {
      barcodeStatusEl.textContent = `Camera error: ${err.message}`;
    },
  });
});

document.getElementById("barcode-cancel-btn").addEventListener("click", async () => {
  const { stopScanning } = await getBarcodeModule();
  stopScanning();
  barcodeScannerEl.hidden = true;
});

// Batch import: photos taken on the phone, moved to the Mac by AirDrop or
// iCloud Photos (a website can't reach into a phone's camera roll itself),
// each becoming its own food entry dated by when the photo was actually
// taken — not run through AI automatically, same manual "Parse with AI" step
// as every other food entry, so a whole day's import can't rack up API calls
// or cost without Scott choosing that per entry.
const photoImportInput = document.getElementById("food-photo-import-input");
const photoImportStatus = document.getElementById("food-photo-import-status");

document.getElementById("food-photo-import-btn").addEventListener("click", () => photoImportInput.click());

photoImportInput.addEventListener("change", async () => {
  const files = photoImportInput.files;
  if (!files.length) return;
  photoImportStatus.hidden = false;
  photoImportStatus.textContent = `Reading ${files.length} photo${files.length === 1 ? "" : "s"}…`;
  const ordered = await readPhotoTimestamps(files);
  let imported = 0;
  let failed = 0;
  for (const { file, timestamp } of ordered) {
    try {
      const blob = await toStorableBlob(file);
      await saveFoodEntry({ text: "", photoBlob: blob, timestamp: timestamp.toISOString(), aiResult: null });
      imported++;
    } catch (err) {
      console.error("Photo import: one file failed to save", err); // one bad photo shouldn't lose the rest of the batch
      failed++;
    }
  }
  photoImportInput.value = "";
  const first = ordered[0]?.timestamp;
  const last = ordered[ordered.length - 1]?.timestamp;
  photoImportStatus.textContent =
    `Imported ${imported} photo${imported === 1 ? "" : "s"}` +
    (failed ? `, ${failed} failed to save` : "") +
    (first && last ? `, dated ${formatRelativeTime(first.toISOString())} to ${formatRelativeTime(last.toISOString())}` : "") +
    ` — open Readings to add descriptions or run Parse with AI on each.`;
  await refreshHome();
});

document.getElementById("food-parse-btn").addEventListener("click", async () => {
  const text = document.getElementById("food-text").value.trim();
  if (!text && !currentFoodPhotoBlob) {
    foodAiResultEl.hidden = false;
    foodAiResultEl.textContent = "Add a description or a photo first.";
    foodClarifyEl.hidden = true;
    return;
  }
  foodParseContextText = text;
  foodAiResultEl.hidden = false;
  foodAiResultEl.textContent = "Asking Claude…";
  foodClarifyEl.hidden = true;
  renderAiResult(await parseFoodWithAI({ text: foodParseContextText, photoBlob: currentFoodPhotoBlob }));
});

foodClarifyAnswerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("food-clarify-submit").click();
  }
});

document.getElementById("food-clarify-submit").addEventListener("click", async () => {
  const answer = foodClarifyAnswerInput.value.trim();
  if (!answer || !currentAiResult?.clarifyingQuestion) return;
  foodParseContextText = `${foodParseContextText}\n\nQ: ${currentAiResult.clarifyingQuestion}\nA: ${answer}`;
  foodAiResultEl.textContent = "Asking Claude…";
  foodClarifyEl.hidden = true;
  renderAiResult(await parseFoodWithAI({ text: foodParseContextText, photoBlob: currentFoodPhotoBlob }));
});

foodForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    // Rebuilding a plain Blob from the photo's own bytes, rather than storing
    // the File object straight from the input, avoids a real WebKit/Safari
    // IndexedDB bug — "Error preparing Blob/File data to be stored in object
    // store" — confirmed 2026-09-15 (see photoImport.js and HANDOVER.md). This
    // is very likely the actual cause behind food photos silently failing to
    // save on iPhone before now, not user error.
    const storablePhoto = currentFoodPhotoBlob ? await toStorableBlob(currentFoodPhotoBlob) : null;
    await saveFoodEntry({
      text: document.getElementById("food-text").value,
      photoBlob: storablePhoto,
      timestamp: new Date(document.getElementById("food-time").value).toISOString(),
      aiResult: currentAiResult && currentAiResult.configured !== false ? currentAiResult : null,
    });
    foodForm.reset();
    foodPhotoPreview.hidden = true;
    currentFoodPhotoBlob = null;
    resetFoodAiState();
    document.getElementById("food-time").value = nowForDatetimeLocal();
    await refreshHome();
  } catch (err) {
    console.error("Food entry failed to save", err);
    foodAiResultEl.hidden = false;
    foodClarifyEl.hidden = true;
    foodAiResultEl.textContent = `Couldn't save this entry: ${err.message}. Try again — if it keeps happening with a photo attached, try without the photo.`;
  }
});

// --- Diary form ---
const diaryForm = document.getElementById("diary-form");
diaryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveDiaryNote({
    text: document.getElementById("diary-text").value,
    timestamp: new Date(document.getElementById("diary-time").value).toISOString(),
  });
  diaryForm.reset();
  showView("home");
});

// --- Export form ---
const exportForm = document.getElementById("export-form");
document.getElementById("export-from").value = localDateStr(new Date(Date.now() - 30 * 86400000));
document.getElementById("export-to").value = localDateStr(new Date());

exportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const from = document.getElementById("export-from").value;
  const to = document.getElementById("export-to").value;
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);

  const [glucose, food, diary] = await Promise.all([listGlucoseReadings(), listFoodEntries(), listDiaryNotes()]);
  const merged = mergeTimeline({ glucose, food, diary }).filter((entry) => {
    const t = new Date(entry.timestamp);
    return t >= fromDate && t <= toDate;
  });

  if (e.submitter?.id === "export-csv-btn") {
    downloadCSV(merged, `glucose-food-export-${from}-to-${to}.csv`);
  } else {
    printSummary(merged, { from, to });
  }
});

// --- Import ---
document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const statusEl = document.getElementById("import-status");
  if (!file) return;
  statusEl.textContent = "Importing…";
  try {
    const text = await file.text();
    await refreshAllCaches();
    const { imported, skipped } = await importCSV(text, { glucose: cachedGlucose, food: cachedFood, diary: cachedDiary });
    statusEl.textContent = `Imported ${imported} entr${imported === 1 ? "y" : "ies"}${skipped ? `, skipped ${skipped} already here` : ""}.`;
    await refreshAllCaches();
  } catch (err) {
    statusEl.textContent = `Import failed: ${err.message}`;
  } finally {
    e.target.value = "";
  }
});

const BLUETOOTH_LAST_SYNC_KEY = "rht-bluetooth-last-sync";

// "Connected" would overstate what this app does — connectAndFetchReadings opens
// the link, pulls stored records, then disconnects (see bluetoothGlucose.js); there
// is no persistent connection to reflect. "Last synced" is the honest version of
// the same at-a-glance reassurance: is my data current, not is a link held open.
function updateBluetoothBadge() {
  const badge = document.getElementById("bluetooth-status-badge");
  const text = document.getElementById("bluetooth-status-badge-text");
  if (!isBluetoothAvailable()) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.classList.remove("synced", "stale");
  const lastSync = localStorage.getItem(BLUETOOTH_LAST_SYNC_KEY);
  if (!lastSync) {
    text.textContent = "Meter not synced yet";
    return;
  }
  const diffHr = (Date.now() - new Date(lastSync).getTime()) / 3600000;
  badge.classList.add(diffHr < 6 ? "synced" : "stale");
  text.textContent = `Synced ${formatRelativeTime(lastSync)}`;
}

// --- Settings ---
function renderGlucoseSources() {
  const container = document.getElementById("glucose-source-list");
  container.innerHTML = "";
  for (const source of glucoseSources) {
    const el = document.createElement("div");
    el.className = "source-item";
    el.innerHTML = `<span>${source.label}</span><span>${source.isAvailable() ? "Available" : "Not available here"}</span>`;
    container.appendChild(el);
  }
  const hint = document.getElementById("glucose-source-hint");
  const btn = document.getElementById("bluetooth-connect-btn");
  const connectHint = document.getElementById("bluetooth-connect-hint");
  const homeBtn = document.getElementById("home-bluetooth-connect-btn");
  if (isBluetoothAvailable()) {
    btn.hidden = false;
    connectHint.hidden = false;
    hint.textContent = "";
    homeBtn.hidden = false;
  } else {
    btn.hidden = true;
    connectHint.hidden = true;
    hint.textContent =
      "Bluetooth needs Chrome (on your Mac or an Android phone) — Safari/iPhone doesn't support Web Bluetooth at all, an Apple platform limit, not something this app can work around.";
    homeBtn.hidden = true;
  }
}

// Shared by the Settings button and the Home-screen shortcut — same flow,
// just reporting into whichever status line is next to the button pressed.
async function runBluetoothSync(btn, statusEl) {
  btn.disabled = true;
  try {
    const readings = await connectAndFetchReadings({ onStatus: (msg) => (statusEl.textContent = msg) });
    await refreshAllCaches();
    let imported = 0;
    let skipped = 0;
    for (const r of readings) {
      const isDup = cachedGlucose.some((g) => g.timestamp === r.timestamp && g.value === r.value);
      if (isDup) {
        skipped++;
        continue;
      }
      await saveGlucoseReading({ value: r.value, unit: r.unit, timestamp: r.timestamp, note: "", sourceId: "bluetooth-meter" });
      imported++;
    }
    statusEl.textContent = `Done — ${imported} new reading${imported === 1 ? "" : "s"} imported${skipped ? `, ${skipped} already saved` : ""}.`;
    localStorage.setItem(BLUETOOTH_LAST_SYNC_KEY, new Date().toISOString());
    updateBluetoothBadge();
    await refreshHome();
  } catch (err) {
    statusEl.textContent = `Bluetooth connection failed: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("bluetooth-connect-btn").addEventListener("click", () =>
  runBluetoothSync(document.getElementById("bluetooth-connect-btn"), document.getElementById("bluetooth-status"))
);

document.getElementById("home-bluetooth-connect-btn").addEventListener("click", () =>
  runBluetoothSync(document.getElementById("home-bluetooth-connect-btn"), document.getElementById("home-bluetooth-status"))
);

// --- "Why did your sugar spike?" prompts ---
// Dismissals are a UI convenience, not medical data, so they live in
// localStorage; real answers are saved as tagged diary entries (see diary.js)
// so they show on the timeline and in the doctor's export.
const SPIKE_DISMISSED_KEY = "rht-spike-dismissed";
const MAX_SPIKE_CARDS = 3;

function getDismissedSpikes() {
  try {
    return JSON.parse(localStorage.getItem(SPIKE_DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

function dismissSpike(id) {
  try {
    localStorage.setItem(SPIKE_DISMISSED_KEY, JSON.stringify([...getDismissedSpikes(), id].slice(-200)));
  } catch {}
}

function spikeTime(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return localDateStr(d) === localDateStr(new Date()) ? time : `${formatDate(d.toISOString())}`;
}

function renderSpikePrompts() {
  const container = document.getElementById("spike-prompts");
  const events = findUnexplainedExcursions({
    glucose: cachedGlucose,
    food: cachedFood,
    diary: cachedDiary,
    dismissedIds: getDismissedSpikes(),
  });
  container.innerHTML = "";
  // The newest few, shown in time order so a rise appears before the drop that
  // followed it (answering the rise settles both — see spikeDetection.js).
  for (const e of events.slice(0, MAX_SPIKE_CARDS).reverse()) container.appendChild(buildSpikeCard(e));
  if (events.length > MAX_SPIKE_CARDS) {
    const more = document.createElement("p");
    more.className = "spike-more";
    more.textContent = `${events.length - MAX_SPIKE_CARDS} more unexplained change${events.length - MAX_SPIKE_CARDS === 1 ? "" : "s"} after these.`;
    container.appendChild(more);
  }
}

function buildSpikeCard(e) {
  const summary = describeExcursion(e, spikeTime);
  const card = document.createElement("div");
  card.className = `spike-card ${e.type}`;
  card.dataset.excursionId = e.id;
  card.innerHTML = `
    <p class="spike-summary"></p>
    <p class="spike-question">Nothing is logged before it. Do you know why?</p>
    <div class="spike-actions">
      <button type="button" data-answer="yes">Yes, add it</button>
      <button type="button" class="secondary-btn" data-answer="unexplained">No / not sure</button>
      <button type="button" class="secondary-btn" data-answer="glitch">Sensor glitch</button>
      <button type="button" class="secondary-btn" data-answer="dismiss">Dismiss</button>
    </div>
    <form class="spike-explain-form entry-form" hidden>
      <label>
        What was it?
        <input type="text" class="spike-explain-text" placeholder="e.g. chocolate biscuit, small whiskey" required />
      </label>
      <label>
        Roughly when
        <input type="datetime-local" class="spike-explain-time" required />
      </label>
      <button type="submit">Save</button>
    </form>`;
  // textContent, not innerHTML: keeps the summary inert whatever it contains.
  card.querySelector(".spike-summary").textContent = `${summary}.`;
  const form = card.querySelector(".spike-explain-form");
  form.querySelector(".spike-explain-time").value = toDatetimeLocal(e.startT);

  const markAnswered = async (answer, text) => {
    await saveDiaryNote({
      text,
      timestamp: new Date(e.startT).toISOString(),
      excursionId: e.id,
      excursionAnswer: answer,
    });
  };

  card.querySelector(".spike-actions").addEventListener("click", async (ev) => {
    const answer = ev.target.closest("button")?.dataset.answer;
    if (!answer) return;
    if (answer === "yes") {
      form.hidden = false;
      form.querySelector(".spike-explain-text").focus();
      return;
    }
    if (answer === "dismiss") {
      dismissSpike(e.id);
    } else if (answer === "unexplained") {
      await markAnswered("unexplained", `🔎 Unexplained ${e.type}: ${summary.replace(/^Your glucose /, "")}.`);
    } else if (answer === "glitch") {
      await markAnswered("glitch", `📡 Marked as sensor glitch: ${summary.replace(/^Your glucose /, "")}.`);
    }
    await refreshHome();
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const what = form.querySelector(".spike-explain-text").value.trim();
    if (!what) return;
    const when = new Date(form.querySelector(".spike-explain-time").value).toISOString();
    await saveFoodEntry({ text: what, timestamp: when });
    await markAnswered("explained", `✅ Explained ${e.type} (${what}): ${summary.replace(/^Your glucose /, "")}.`);
    await refreshHome();
  });
  return card;
}

const spikeInputs = {
  enabled: document.getElementById("spike-enabled"),
  riseAmount: document.getElementById("spike-rise"),
  dropAmount: document.getElementById("spike-drop"),
  windowMinutes: document.getElementById("spike-window"),
  lookbackMinutes: document.getElementById("spike-lookback"),
};

function loadSpikeSettingsIntoForm() {
  const s = getSpikeSettings();
  spikeInputs.enabled.checked = s.enabled;
  for (const key of ["riseAmount", "dropAmount", "windowMinutes", "lookbackMinutes"]) spikeInputs[key].value = s[key];
}

for (const el of Object.values(spikeInputs)) {
  el.addEventListener("change", () => {
    const current = getSpikeSettings();
    const next = { ...current, enabled: spikeInputs.enabled.checked };
    // Ignore blank or nonsense entries rather than saving them — keeps the last good value.
    for (const key of ["riseAmount", "dropAmount", "windowMinutes", "lookbackMinutes"]) {
      const n = Number(spikeInputs[key].value);
      if (Number.isFinite(n) && n > 0) next[key] = n;
      else spikeInputs[key].value = current[key];
    }
    saveSpikeSettings(next);
  });
}
loadSpikeSettingsIntoForm();

// --- Libre 2 Plus (CGM) sync via LibreLinkUp ---
const cgmPasscodeEl = document.getElementById("cgm-passcode");
const cgmRememberEl = document.getElementById("cgm-remember");
cgmPasscodeEl.value = getSavedPasscode();
cgmRememberEl.checked = Boolean(cgmPasscodeEl.value);

function persistCgmPasscodeChoice() {
  savePasscode(cgmRememberEl.checked ? cgmPasscodeEl.value.trim() : "");
}
cgmRememberEl.addEventListener("change", persistCgmPasscodeChoice);
cgmPasscodeEl.addEventListener("change", persistCgmPasscodeChoice);

// Shared by the Settings button and the Home shortcut, like runBluetoothSync.
async function runCgmSync(btn, statusEl) {
  const passcode = cgmPasscodeEl.value.trim() || getSavedPasscode();
  if (!passcode) {
    statusEl.textContent = "Enter your sync passcode in Settings → Libre 2 Plus (CGM) sync first.";
    return;
  }
  btn.disabled = true;
  statusEl.textContent = "Syncing with LibreLinkUp…";
  try {
    const { readings } = await fetchCgmReadings(passcode);
    await refreshAllCaches();
    let imported = 0;
    let skipped = 0;
    for (const r of readings) {
      const isDup = cachedGlucose.some(
        (g) => g.sourceId === "librelinkup" && new Date(g.timestamp).getTime() === new Date(r.timestamp).getTime()
      );
      if (isDup) {
        skipped++;
        continue;
      }
      await saveGlucoseReading({ value: r.value, unit: r.unit, timestamp: r.timestamp, note: "", sourceId: "librelinkup" });
      imported++;
    }
    statusEl.textContent = `Done — ${imported} new CGM reading${imported === 1 ? "" : "s"}${skipped ? `, ${skipped} already saved` : ""}.`;
    try {
      localStorage.setItem(CGM_LAST_SYNC_KEY, new Date().toISOString());
    } catch {}
    await refreshAllCaches();
    await refreshHome();
  } catch (err) {
    statusEl.textContent = `CGM sync failed: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("cgm-sync-btn").addEventListener("click", () =>
  runCgmSync(document.getElementById("cgm-sync-btn"), document.getElementById("cgm-status"))
);
document.getElementById("home-cgm-sync-btn").addEventListener("click", () =>
  runCgmSync(document.getElementById("home-cgm-sync-btn"), document.getElementById("home-cgm-status"))
);

const reminderEnabled = document.getElementById("reminder-enabled");
const reminderTime = document.getElementById("reminder-time");
const notificationStatusEl = document.getElementById("notification-status");

const soundEnabledEl = document.getElementById("sound-enabled");

function loadReminderSettings() {
  const settings = getReminderSettings();
  reminderEnabled.checked = settings.enabled;
  reminderTime.value = settings.time;
  soundEnabledEl.checked = getSoundEnabled();
  updateNotificationStatus();
}

function updateNotificationStatus() {
  const status = notificationSupportStatus();
  const labels = {
    unsupported: "Browser notifications aren't supported here.",
    granted: "Browser notifications: enabled.",
    denied: "Browser notifications: blocked — check your browser/OS settings.",
    default: "Browser notifications: not yet requested.",
  };
  notificationStatusEl.textContent = labels[status] || "";
}

for (const el of [reminderEnabled, reminderTime]) {
  el.addEventListener("change", () => {
    saveReminderSettings({ enabled: reminderEnabled.checked, time: reminderTime.value });
    updateReminderBanner();
  });
}

soundEnabledEl.addEventListener("change", () => saveSoundEnabled(soundEnabledEl.checked));

document.getElementById("notification-permission-btn").addEventListener("click", async () => {
  await requestNotificationPermission();
  updateNotificationStatus();
});

const UNIT_KEY = "rht-default-unit";
const unitRadios = document.querySelectorAll('input[name="default-unit"]');
const savedUnit = localStorage.getItem(UNIT_KEY) || "mmol/L";
for (const radio of unitRadios) {
  radio.checked = radio.value === savedUnit;
  radio.addEventListener("change", () => {
    if (radio.checked) {
      localStorage.setItem(UNIT_KEY, radio.value);
      document.getElementById("glucose-unit").value = radio.value;
    }
  });
}
document.getElementById("glucose-unit").value = savedUnit;

// --- Threshold settings ---
const thresholdLow = document.getElementById("threshold-low");
const thresholdHigh = document.getElementById("threshold-high");
const thresholdUnit = document.getElementById("threshold-unit");

function loadThresholdSettings() {
  const t = getThresholds();
  thresholdLow.value = t.low ?? "";
  thresholdHigh.value = t.high ?? "";
  thresholdUnit.value = t.unit;
  document.getElementById("threshold-low-hint").hidden = true;
  const mode = localStorage.getItem(READINGS_MODE_KEY) || "list";
  document.getElementById("readings-mode-list").checked = mode === "list";
  document.getElementById("readings-mode-graph").checked = mode === "graph";
  const dateFormat = getDateFormat();
  for (const radio of document.querySelectorAll('input[name="date-format"]')) {
    radio.checked = radio.value === dateFormat;
  }
}

// Scott's rule (2026-09-14): the low threshold may be raised for extra personal
// margin but never lowered past a recognized standard — see thresholds.js.
function saveThresholdsFromInputs() {
  const unit = thresholdUnit.value;
  let low = parseOrNull(thresholdLow.value);
  const hintEl = document.getElementById("threshold-low-hint");

  if (low != null && isBelowFloor(low, unit)) {
    const floor = Number(floorInUnit(unit).toFixed(1));
    hintEl.textContent = `Kept at ${floor} ${unit} — this app won't go below the standard low-glucose alert point. Set it higher any time for extra margin. If your doctor's given you a different number, let me know and we'll revisit this.`;
    hintEl.hidden = false;
    low = floor;
    thresholdLow.value = low;
  } else {
    hintEl.hidden = true;
  }

  saveThresholds({ low, high: parseOrNull(thresholdHigh.value), unit });
  renderLatestReading();
}

for (const el of [thresholdLow, thresholdHigh, thresholdUnit]) {
  el.addEventListener("change", saveThresholdsFromInputs);
}

for (const radio of document.querySelectorAll('input[name="readings-mode"]')) {
  radio.addEventListener("change", () => {
    if (radio.checked) {
      localStorage.setItem(READINGS_MODE_KEY, radio.value);
    }
  });
}

for (const radio of document.querySelectorAll('input[name="date-format"]')) {
  radio.addEventListener("change", () => {
    if (radio.checked) {
      saveDateFormat(radio.value);
      renderLatestReading();
    }
  });
}

// --- Init ---
renderGlucoseSources();
loadReminderSettings();
updateBluetoothBadge();
// showView (not a bare refreshHome) because Home is the landing view and needs
// its datetime-local fields defaulted to "now" before anyone can submit either
// form — those fields are `required`, so leaving them blank silently blocks
// the browser's native form submission with no visible error.
showView("home");

// Brief splash (icon + tagline) on every load, then straight into Home —
// not a loading gate (the app underneath is already rendered), just a moment of
// calm identity before landing in the data.
setTimeout(() => {
  document.getElementById("splash").classList.add("hidden");
}, 900);
