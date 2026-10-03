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
import { connectAndFetchReadings, isBluetoothAvailable, canReconnectSilently, BT_AUTO_FLAG_URL } from "./bluetoothGlucose.js";
import { lookupBarcode, productToFoodText } from "./nutrition.js";
import { readPhotoTimestamps, toStorableBlob } from "./photoImport.js";
import { shrinkForStorage } from "./imageForAI.js";
import { fetchCgmReadings, getSavedPasscode, savePasscode, CGM_LAST_SYNC_KEY } from "./libreLinkUp.js";
import {
  getDexcomConnection, startDexcomConnect, completeDexcomConnect, fetchDexcomReadings, disconnectDexcom,
  DEXCOM_LAST_SYNC_KEY, DEXCOM_CALLBACK_PATH,
} from "./dexcom.js";
import { mealOutcome, formatAfter, OUTCOME_HOURS } from "./mealOutcome.js";
import { DEVICE_LIGHTS, getSyncStatus, recordSyncResult, forgetSyncResult, lightFor, LIGHT_WORDS } from "./syncStatus.js";
import { itemCarbs, mealTotals, mealToText, productToItem, emptyItem, cleanItems, PORTIONS, portionGrams } from "./mealBuilder.js";
import { hasAccepted, getProfile, acceptWelcome, acceptedAt, CONDITION_LABELS } from "./welcome.js";
import { listSavedMeals, saveMeal, deleteSavedMeal, mealToBuilderItems } from "./savedMeals.js";
import { lookupFood, STAGE_TEXT, syncFoodBank, pushToFoodBank, deleteFromFoodBank, foodBankAvailable } from "./foodBank.js";
import { READING_FILTERS, filterEntries, filterCounts, normaliseFilter } from "./readingsFilter.js";
import { DEVICE_TYPES, DEVICE_STATUSES, listDevices, addDevice, updateDevice, retireDevice, deviceLabel, activeDeviceOfType, recordLibreSensorIfNew, recordSensorIfNew } from "./devices.js";
import {
  saveMyFood, deleteMyFood, listMyFoods, rememberFromItems, exportMyFoods, importMyFoods,
} from "./myFoods.js";
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
  home: "Reactive Blood Tracker",
  readings: "Readings",
  diary: "Add diary note",
  export: "Export report",
  "food-guidance": "Food Guidance",
  "my-foods": "My foods",
  help: "Help & sources",
  settings: "Settings",
};

const READINGS_MODE_KEY = "rht-readings-mode";
const READINGS_FILTER_KEY = "rht-readings-filter";

const viewTitle = document.getElementById("view-title");

// Date and time under the title, on every page (uses the Settings date format).
const headerNow = document.getElementById("header-now");
function updateHeaderNow() {
  headerNow.textContent = formatDate(new Date().toISOString());
}
updateHeaderNow();
setInterval(updateHeaderNow, 30000);
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

  // Changing view mid-scan shouldn't leave the camera running (Home and My foods
  // each have a scanner) — but don't force-load the scanner module just to check.
  if (barcodeModulePromise) barcodeModulePromise.then((m) => m.stopScanning());
  document.getElementById("barcode-scanner").hidden = true;
  document.getElementById("myfood-scanner").hidden = true;

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
    renderDexcomStatus();
  } else if (name === "help") {
    renderHelpSetup();
  } else if (name === "my-foods") {
    renderMyFoods();
    refreshFoodBank();
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
  renderDeviceLights(); // a green light turns amber as time passes
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

// A phone turned sideways (landscape, wide but short): List and Graph show
// side by side - graph on the left, list on the right - instead of one at a
// time. Meals stays full width. Portrait, tablets and desktop are unchanged
// (max-height keeps it to phones; whether bigger screens split too is Scott's call).
const SPLIT_QUERY = window.matchMedia("(orientation: landscape) and (min-width: 560px) and (max-height: 600px)");
let lastReadingsMode = "list";

function setReadingsMode(mode, merged) {
  lastReadingsMode = mode;
  const listEl = document.getElementById("timeline-list");
  const graphWrap = document.getElementById("readings-graph-wrap");
  const split = SPLIT_QUERY.matches && mode !== "meals";
  document.getElementById("view-readings").classList.toggle("split", split);
  const showList = mode === "list" || split;
  const showGraph = mode === "graph" || split;
  for (const btn of document.querySelectorAll("#readings-view-toggle button")) {
    btn.classList.toggle("active", split ? btn.dataset.mode !== "meals" : btn.dataset.mode === mode);
  }
  const galleryEl = document.getElementById("meal-gallery");
  listEl.hidden = !showList;
  document.getElementById("readings-filter").hidden = !showList;
  graphWrap.hidden = !showGraph;
  galleryEl.hidden = mode !== "meals";
  if (showGraph) renderGraph();
  if (showList) renderFilteredList(listEl, merged);
  if (mode === "meals") renderMealGallery(galleryEl);
}

// Rotating the phone re-lays Readings straight away, without a reload.
SPLIT_QUERY.addEventListener("change", () => {
  if (!document.getElementById("view-readings").hidden) setReadingsMode(lastReadingsMode, lastMerged);
});

// List mode: filter chips (with counts) above the list. The last choice is
// remembered on this device; "All" is the default, matching the old behaviour.
// Only the newest entries are drawn at first: a year of Libre data is ~35,000
// readings, and drawing them all took seconds and ~190,000 page elements
// (measured 2026-09-28). "Show more" adds another page; changing filter resets.
const LIST_PAGE = 200;
let lastMerged = [];
let listLimit = LIST_PAGE;
function renderFilteredList(listEl, merged) {
  if (merged !== lastMerged) listLimit = LIST_PAGE;
  lastMerged = merged;
  const active = normaliseFilter(localStorage.getItem(READINGS_FILTER_KEY));
  const counts = filterCounts(merged);
  const chips = document.getElementById("readings-filter");
  chips.innerHTML = "";
  for (const f of READING_FILTERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.filter = f.key;
    btn.className = f.key === active ? "chip active" : "chip";
    btn.setAttribute("aria-pressed", String(f.key === active));
    btn.textContent = `${f.label} ${counts[f.key]}`;
    btn.addEventListener("click", () => {
      localStorage.setItem(READINGS_FILTER_KEY, f.key);
      listLimit = LIST_PAGE;
      renderFilteredList(listEl, lastMerged);
    });
    chips.appendChild(btn);
  }
  const shown = filterEntries(merged, active);
  if (merged.length && !shown.length) {
    listEl.innerHTML = '<p class="timeline-empty">Nothing of this kind logged yet. Tap "All" to see everything.</p>';
  } else {
    renderReadingsList(listEl, shown.slice(0, listLimit));
    if (shown.length > listLimit) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "secondary-btn show-more";
      more.textContent = `Show ${Math.min(LIST_PAGE, shown.length - listLimit)} more (${shown.length - listLimit} older)`;
      more.addEventListener("click", () => {
        listLimit += LIST_PAGE;
        renderFilteredList(listEl, lastMerged);
      });
      listEl.appendChild(more);
    }
  }
}

// Meals tab: each logged meal with what glucose did over the next 5 hours.
// Object URLs for photo thumbnails are revoked on every re-render so browsing
// back and forth doesn't leak memory on a phone.
let mealPhotoUrls = [];
const MAX_MEALS_SHOWN = 60;

function renderMealGallery(container) {
  for (const url of mealPhotoUrls) URL.revokeObjectURL(url);
  mealPhotoUrls = [];
  const meals = [...cachedFood].sort(compareRecentFirst).slice(0, MAX_MEALS_SHOWN);
  if (!meals.length) {
    container.innerHTML = '<p class="timeline-empty">No meals logged yet. Add food on Home, and each meal will show here with what your glucose did afterwards.</p>';
    return;
  }
  const t = getThresholds();
  const lowLine = t.low != null ? convertUnit(t.low, t.unit, "mmol/L") : null;
  container.innerHTML = "";
  for (const meal of meals) {
    const card = document.createElement("article");
    card.className = "meal-card";
    const outcome = mealOutcome(meal.timestamp, cachedGlucose);
    const wentLow = outcome && lowLine != null && outcome.lowest.value < lowLine;
    if (wentLow) card.classList.add("went-low");

    if (meal.photoBlob) {
      const url = URL.createObjectURL(meal.photoBlob);
      mealPhotoUrls.push(url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.className = "meal-photo";
      card.appendChild(img);
    }
    const body = document.createElement("div");
    body.className = "meal-body";
    const title = document.createElement("p");
    title.className = "meal-title";
    title.textContent = meal.items?.length
      ? meal.items.map((i) => i.name).join(", ")
      : meal.text || meal.aiResult?.foodName || "Meal (photo)";
    const when = document.createElement("p");
    when.className = "meal-when";
    when.textContent = formatDate(meal.timestamp);
    body.append(title, when);
    if (meal.items?.length && meal.carbsTotal != null) {
      const carbs = document.createElement("p");
      carbs.className = "meal-carbs";
      const n = meal.items.length;
      carbs.textContent = `🧺 ${meal.carbsTotal} g carbs from ${n} ingredient${n > 1 ? "s" : ""}`;
      body.appendChild(carbs);
    }

    const stats = document.createElement("dl");
    stats.className = "meal-stats";
    const addStat = (label, value, cls = "") => {
      const wrap = document.createElement("div");
      if (cls) wrap.className = cls;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrap.append(dt, dd);
      stats.appendChild(wrap);
    };
    if (outcome) {
      addStat("Before", outcome.before != null ? `${outcome.before}` : "–");
      addStat("Peak", `${outcome.peak.value}`, "");
      addStat("Lowest", `${outcome.lowest.value}`, wentLow ? "stat-low" : "");
      body.appendChild(stats);
      const note = document.createElement("p");
      note.className = "meal-note";
      note.textContent =
        `mmol/L · peak ${formatAfter(outcome.peak.afterMin)} after, lowest ${formatAfter(outcome.lowest.afterMin)} after` +
        (wentLow ? ` · below your low of ${lowLine.toFixed(1)}` : "") +
        (outcome.source === "cgm" ? " · Libre" : " · from finger-pricks, may miss the true peak or low");
      body.appendChild(note);
    } else {
      const note = document.createElement("p");
      note.className = "meal-note";
      note.textContent = `No glucose readings in the ${OUTCOME_HOURS} hours after this meal.`;
      body.appendChild(note);
    }
    card.appendChild(body);
    container.appendChild(card);
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
    food: cachedFood,
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

// --- Meal builder (ingredients → carbs total; logic in mealBuilder.js) ---
const mealBuilderEl = document.getElementById("meal-builder");
const mealItemsEl = document.getElementById("meal-items");
const mealTotalEl = document.getElementById("meal-total");
let mealItems = [];

const MEAL_FIELDS = [
  { key: "grams", label: "Grams", cls: "mi-grams" },
  { key: "carbsPer100g", label: "Per 100g", cls: "mi-per100" },
  { key: "carbsGrams", label: "Carbs g", cls: "mi-carbs" },
];

function updateMealTotal() {
  const named = mealItems.filter((i) => (i.name || "").trim());
  if (!named.length) {
    mealTotalEl.textContent = "";
    return;
  }
  const t = mealTotals(named);
  let msg = `Total: ${t.carbs} g carbs`;
  if (t.sugars != null) msg += ` · ${t.sugars} g sugars`;
  if (t.missing.length) msg += ` · not counting ${t.missing.join(", ")} (no carb figures yet)`;
  mealTotalEl.textContent = msg;
  // Each row's computed carbs, shown as the Carbs g placeholder so a typed value still wins.
  mealItemsEl.querySelectorAll(".meal-item").forEach((row, idx) => {
    const c = itemCarbs(mealItems[idx]);
    row.querySelector(".mi-carbs input").placeholder = c != null ? String(c) : "–";
  });
}

function renderMealItems() {
  const names = document.getElementById("myfood-names");
  names.innerHTML = "";
  for (const f of listMyFoods()) {
    const opt = document.createElement("option");
    opt.value = f.name;
    names.appendChild(opt);
  }
  mealItemsEl.innerHTML = "";
  mealItems.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "meal-item";
    const nameLabel = document.createElement("label");
    nameLabel.className = "mi-name";
    nameLabel.textContent = "Ingredient";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = item.name;
    nameInput.placeholder = "e.g. rolled oats, or pick a saved food";
    nameInput.setAttribute("list", "myfood-names");
    nameInput.addEventListener("input", () => {
      item.name = nameInput.value;
      updateMealTotal();
    });
    // Picking one of My foods fills its label figures and serving size (no scan needed).
    nameInput.addEventListener("change", () => {
      const saved = listMyFoods().find((f) => f.name === nameInput.value.trim());
      if (!saved) return;
      Object.assign(item, productToItem({ ...saved, brand: "" }), { grams: item.grams, carbsGrams: item.carbsGrams });
      renderMealItems();
      mealItemsEl.querySelectorAll(".meal-item")[mealItems.indexOf(item)]?.querySelector(".mi-grams input")?.focus();
    });
    nameLabel.appendChild(nameInput);
    row.appendChild(nameLabel);
    for (const f of MEAL_FIELDS) {
      const label = document.createElement("label");
      label.className = f.cls;
      label.textContent = f.label;
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "decimal";
      input.min = "0";
      input.step = "any";
      input.value = item[f.key] ?? "";
      input.addEventListener("input", () => {
        item[f.key] = input.value;
        updateMealTotal();
      });
      label.appendChild(input);
      row.appendChild(label);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mi-remove";
    remove.setAttribute("aria-label", `Remove ${item.name || "ingredient"}`);
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      mealItems.splice(idx, 1);
      renderMealItems();
    });
    row.appendChild(remove);
    const serving = Number(item.servingSizeG);
    if (serving > 0) {
      // After a gastric sleeve a pack "serve" is often too much; these set the grams
      // to a fraction of the pack's own serving size.
      const portions = document.createElement("div");
      portions.className = "mi-portions";
      const label = document.createElement("span");
      label.textContent = `Serve ${serving} g:`;
      portions.appendChild(label);
      for (const p of PORTIONS) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = p.label;
        b.addEventListener("click", () => {
          item.grams = String(portionGrams(serving, p.fraction));
          row.querySelector(".mi-grams input").value = item.grams;
          for (const other of portions.querySelectorAll("button")) other.classList.toggle("active", other === b);
          updateMealTotal();
        });
        portions.appendChild(b);
      }
      row.appendChild(portions);
    }
    mealItemsEl.appendChild(row);
  });
  updateMealTotal();
}

function addMealItem(item = emptyItem()) {
  mealItems.push(item);
  renderMealItems();
  const rows = mealItemsEl.querySelectorAll(".meal-item");
  const last = rows[rows.length - 1];
  // A scanned product already has its name, so the next thing to fill is the amount.
  last?.querySelector(item.name ? ".mi-grams input" : ".mi-name input")?.focus();
}

document.getElementById("meal-add-item-btn").addEventListener("click", () => addMealItem());
mealBuilderEl.addEventListener("toggle", () => {
  if (mealBuilderEl.open && !mealItems.length) addMealItem();
});

// Saved meals: chips at the top of the builder load a saved meal's ingredients
// (then portions can be changed as usual); the row under the total saves one.
function renderSavedMeals() {
  const wrap = document.getElementById("saved-meals");
  wrap.innerHTML = "";
  const meals = listSavedMeals();
  if (!meals.length) return;
  const label = document.createElement("span");
  label.className = "saved-meals-label";
  label.textContent = "Your saved meals:";
  wrap.appendChild(label);
  for (const m of meals) {
    const chip = document.createElement("span");
    chip.className = "saved-meal";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "saved-meal-load";
    load.textContent = m.name;
    load.addEventListener("click", () => {
      mealItems = mealToBuilderItems(m);
      renderMealItems();
      document.getElementById("save-meal-name").value = m.name;
      document.getElementById("save-meal-status").textContent = `Loaded ${m.name}. Change anything for today; it's only saved back if you tap Save meal.`;
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "saved-meal-del";
    del.setAttribute("aria-label", `Delete saved meal ${m.name}`);
    del.textContent = "✕";
    del.addEventListener("click", () => {
      if (!confirm(`Delete the saved meal "${m.name}"?`)) return;
      deleteSavedMeal(m.name);
      renderSavedMeals();
    });
    chip.append(load, del);
    wrap.appendChild(chip);
  }
}

document.getElementById("save-meal-btn").addEventListener("click", () => {
  const r = saveMeal(document.getElementById("save-meal-name").value, cleanItems(mealItems));
  document.getElementById("save-meal-status").textContent = r.ok ? `Saved "${r.meal.name}". It's at the top of the builder next time.` : r.error;
  if (r.ok) renderSavedMeals();
});

mealBuilderEl.addEventListener("toggle", () => {
  if (mealBuilderEl.open) renderSavedMeals();
});

function resetMealBuilder() {
  mealItems = [];
  renderMealItems();
  mealBuilderEl.open = false;
  document.getElementById("save-meal-name").value = "";
  document.getElementById("save-meal-status").textContent = "";
}

const barcodeResultEl = document.getElementById("barcode-result");
const SOURCE_TEXT = { device: "from your foods", bank: "from your food bank", online: "from the public database" };
const productName = (p) => (p.brand ? `${p.brand} ${p.name}` : p.name);
function showScanResult(el, text, kind = "") {
  el.textContent = text;
  el.className = `scan-result${kind ? ` scan-${kind}` : ""}`;
  el.hidden = false;
}
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
  barcodeStatusEl.textContent = "Looking for a barcode — hold it 10–20 cm from the camera, in good light.";
  barcodeResultEl.hidden = true;
  await startScanning(barcodeVideoEl, {
    onDetected: async (code) => {
      navigator.vibrate?.(60);
      barcodeScannerEl.hidden = true;
      showScanResult(barcodeResultEl, `✓ Code ${code} received — ${STAGE_TEXT.device}`);
      const product = await lookupFood(code, lookupBarcode, (stage) =>
        showScanResult(barcodeResultEl, `✓ Code ${code} received — ${STAGE_TEXT[stage]}`)
      );
      if (product.found && mealBuilderEl.open) {
        // Building a meal: the product becomes an ingredient row instead of replacing the description.
        // An untouched blank row (the one opening the builder adds) is replaced rather than left behind.
        const last = mealItems[mealItems.length - 1];
        if (last && !last.name && !last.grams && !last.carbsPer100g && !last.carbsGrams) mealItems.pop();
        addMealItem(productToItem(product));
        showScanResult(barcodeResultEl, `✓ Added ${productName(product)} (${SOURCE_TEXT[product.source]}). Now enter how much you had.`, "ok");
      } else if (product.found) {
        document.getElementById("food-text").value = productToFoodText(product);
        showScanResult(barcodeResultEl, `✓ ${productName(product)} (${SOURCE_TEXT[product.source]}), filled in above.`, "ok");
      } else {
        showScanResult(
          barcodeResultEl,
          `✗ ${code} isn't in your foods, the food bank or the public database. Describe it above, or add it once in 🗂 My foods from the pack.`,
          "miss"
        );
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
      const blob = await toStorableBlob(await shrinkForStorage(file)); // dates were read from the original above
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
    const storablePhoto = currentFoodPhotoBlob ? await toStorableBlob(await shrinkForStorage(currentFoodPhotoBlob)) : null;
    const items = cleanItems(mealItems);
    const notes = document.getElementById("food-text").value;
    await saveFoodEntry({
      text: items.length ? mealToText(items, notes) : notes,
      items,
      carbsTotal: items.length ? mealTotals(items).carbs : null,
      photoBlob: storablePhoto,
      timestamp: new Date(document.getElementById("food-time").value).toISOString(),
      aiResult: currentAiResult && currentAiResult.configured !== false ? currentAiResult : null,
    });
    // Scanned ingredients with figures (including ones corrected from the pack) are
    // remembered in My foods, so the next scan of that product uses them.
    if (items.length) {
      const remembered = rememberFromItems(items);
      if (foodBankAvailable()) for (const f of remembered) pushToFoodBank(f); // best effort; the phone keeps its copy
    }
    foodForm.reset();
    resetMealBuilder();
    barcodeResultEl.hidden = true;
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
    printSummary(merged, { from, to }, glucose, food);
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
// Covers *either* source now (2026-10-02, unified sync): previously this hid
// itself entirely without Bluetooth, which meant it never showed at all on
// Safari/iPhone even though Libre sync works there — generalized so an
// iPhone-only user still gets the same at-a-glance reassurance.
function updateSyncBadge() {
  const badge = document.getElementById("sync-status-badge");
  const text = document.getElementById("sync-status-badge-text");
  const lastSync = [BLUETOOTH_LAST_SYNC_KEY, CGM_LAST_SYNC_KEY, DEXCOM_LAST_SYNC_KEY]
    .map((k) => localStorage.getItem(k))
    .filter(Boolean)
    .sort()
    .at(-1); // ISO timestamps sort correctly as strings
  badge.hidden = false;
  badge.classList.remove("synced", "stale");
  if (!lastSync) {
    text.textContent = "Not synced yet";
    return;
  }
  const diffHr = (Date.now() - new Date(lastSync).getTime()) / 3600000;
  badge.classList.add(diffHr < 6 ? "synced" : "stale");
  text.textContent = `Synced ${formatRelativeTime(lastSync)}`;
}

// --- My devices (Scott's spec, 2026-09-28 22:43) ---
const lastFour = (serial) => (serial ? `…${serial.slice(-4)}` : "unknown serial");

function renderDeviceList() {
  const container = document.getElementById("device-list");
  const list = listDevices();
  if (!list.length) {
    container.innerHTML = '<p class="field-hint">No devices recorded yet — add one below, or connect/sync once and this app will offer to record it for you.</p>';
    return;
  }
  container.innerHTML = "";
  for (const d of list) {
    const row = document.createElement("div");
    row.className = "source-item device-item";
    const dateAdded = formatDate(d.dateAdded, { withTime: false });
    row.innerHTML = `
      <div class="device-info">
        <strong>${deviceLabel(d.type)}</strong>${d.nickname ? ` — ${d.nickname}` : ""}
        <span class="field-hint">${lastFour(d.serial)} · added ${dateAdded}</span>
      </div>
      <select class="device-status" data-id="${d.id}">
        ${DEVICE_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("")}
      </select>
    `;
    row.querySelector(".device-status").value = d.status;
    row.querySelector(".device-status").addEventListener("change", (e) => {
      retireDevice(d.id, e.target.value);
      renderDeviceList();
    });
    container.appendChild(row);
  }
}

const deviceTypeSelect = document.getElementById("device-type");
for (const t of DEVICE_TYPES) {
  const opt = document.createElement("option");
  opt.value = t.id;
  opt.textContent = t.label;
  deviceTypeSelect.appendChild(opt);
}

document.getElementById("device-add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  addDevice({
    type: deviceTypeSelect.value,
    serial: document.getElementById("device-serial").value,
    nickname: document.getElementById("device-nickname").value,
  });
  e.target.reset();
  renderDeviceList();
});

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
  const connectHint = document.getElementById("bluetooth-connect-hint");
  if (isBluetoothAvailable()) {
    connectHint.hidden = false;
    hint.textContent = "";
  } else {
    connectHint.hidden = true;
    hint.textContent =
      "Bluetooth needs Chrome (on your Mac or an Android phone) — Safari/iPhone doesn't support Web Bluetooth at all, an Apple platform limit, not something this app can work around.";
  }
}

// One Sync step for the Bluetooth meter. Runs *first*, straight from the Sync
// tap (Scott, 2026-10-03: the Accu-Chek only broadcasts for a few seconds after
// it's switched on, and the old order — Libre's network round-trip, then a
// "turn it on, tap Continue" prompt, then the picker — used that window up).
// Home's hint says to switch the meter on before tapping Sync. Returns a
// one-line summary for the unified status message; never throws.
async function syncBluetoothStep(onStatus) {
  try {
    const { readings, serial, deviceName } = await connectAndFetchReadings({
      onStatus,
      confirmPicker: () => waitForManualStep("Couldn't reconnect to your meter by itself. Tap Continue to choose it from the list."),
    });

    // Right-device check (Scott's spec, 2026-09-28 22:43): only meaningful
    // when both sides actually have a serial to compare — an unknown serial
    // (device doesn't expose it, or this connection wasn't granted access to
    // it) can't be checked, so don't block the sync over something unknowable.
    const registered = activeDeviceOfType("bluetooth-meter");
    if (serial && registered?.serial && serial !== registered.serial) {
      const proceedAnyway = confirm(
        `This is meter ${lastFour(serial)}, not your saved meter ${lastFour(registered.serial)} (${registered.nickname || "Accu-Chek Guide Me"}). Use it anyway?`
      );
      if (!proceedAnyway) return "Meter: cancelled — a different meter than your saved one.";
    } else if (serial && !registered) {
      // First connection with a readable serial: offer to record it, rather
      // than silently saving it unasked (unlike Libre sensors, which Scott's
      // spec says to auto-record — a meter can be shared/borrowed, so asking
      // first is the safer default here).
      if (confirm(`Save this as your registered ${deviceName || "Accu-Chek Guide Me"} (serial ${lastFour(serial)})?`)) {
        addDevice({ type: "bluetooth-meter", serial });
        renderDeviceList();
      }
    }

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
    localStorage.setItem(BLUETOOTH_LAST_SYNC_KEY, new Date().toISOString());
    showBtAutoTip();
    return `Meter: ${imported} new reading${imported === 1 ? "" : "s"}${skipped ? `, ${skipped} already saved` : ""}.`;
  } catch (err) {
    if (err.message === "skipped.") return "Meter: skipped.";
    return `Meter: failed — ${err.message}`;
  }
}

// Pauses the unified sync for a manual physical step (only the Bluetooth
// meter needs this today), resolving true on Continue, false on Skip.
function waitForManualStep(message) {
  return new Promise((resolve) => {
    const el = document.getElementById("home-sync-manual-step");
    document.getElementById("home-sync-manual-prompt").textContent = message;
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const continueBtn = document.getElementById("home-sync-continue-btn");
    const skipBtn = document.getElementById("home-sync-skip-btn");
    function onContinue() {
      cleanup();
      resolve(true);
    }
    function onSkip() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      continueBtn.removeEventListener("click", onContinue);
      skipBtn.removeEventListener("click", onSkip);
      el.hidden = true;
    }
    continueBtn.addEventListener("click", onContinue);
    skipBtn.addEventListener("click", onSkip);
  });
}

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

// Pauses the unified sync to ask for the Libre passcode — Home asks right
// there itself when none is saved (or the saved one is wrong), instead of
// sending the user off to Settings (fixed 2026-09-28: Scott tapped Sync CGM
// and was never asked, so nothing reached the server). Resolves to the typed
// passcode, or null if skipped — the sequence moves on to the next device
// either way, it just doesn't stall waiting forever.
const homeCgmPass = document.getElementById("home-cgm-pass");
function waitForCgmPasscode(message, onStatus) {
  return new Promise((resolve) => {
    homeCgmPass.hidden = false;
    onStatus(message);
    const passEl = document.getElementById("home-cgm-passcode");
    passEl.value = "";
    homeCgmPass.scrollIntoView({ behavior: "smooth", block: "center" });
    passEl.focus();
    function onSubmit(e) {
      e.preventDefault();
      const typed = passEl.value.trim();
      if (!typed) return;
      cgmPasscodeEl.value = typed;
      cgmRememberEl.checked = document.getElementById("home-cgm-remember").checked;
      persistCgmPasscodeChoice();
      cleanup();
      resolve(typed);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function cleanup() {
      homeCgmPass.removeEventListener("submit", onSubmit);
      document.getElementById("home-cgm-pass-cancel").removeEventListener("click", onCancel);
      homeCgmPass.hidden = true;
    }
    homeCgmPass.addEventListener("submit", onSubmit);
    document.getElementById("home-cgm-pass-cancel").addEventListener("click", onCancel);
  });
}

// One Sync step for Libre/LibreLinkUp — no manual action needed (just the
// passcode, if not already saved), so this runs first in the unified
// sequence. Retries once with a freshly-typed passcode if the saved one was
// wrong, same behaviour as before unification. Returns a one-line summary;
// never throws.
async function syncLibreStep(onStatus) {
  let passcode = cgmPasscodeEl.value.trim() || getSavedPasscode();
  if (!passcode) {
    passcode = await waitForCgmPasscode("Enter your Libre sync passcode to sync.", onStatus);
    if (!passcode) return "Libre: skipped.";
  }
  while (true) {
    onStatus("Syncing with LibreLinkUp…");
    try {
      const { readings, sensor } = await fetchCgmReadings(passcode);
      // Auto-record a new Libre sensor into the device register (Scott's
      // spec: "record each new sensor automatically" — unlike the Bluetooth
      // meter, this doesn't ask first, since a sensor change is routine, not
      // a borrowed/different-device situation to catch).
      const newDevice = recordLibreSensorIfNew(sensor);
      if (newDevice) renderDeviceList();
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
      try {
        localStorage.setItem(CGM_LAST_SYNC_KEY, new Date().toISOString());
      } catch {}
      await refreshAllCaches();
      return `Libre: ${imported} new reading${imported === 1 ? "" : "s"}${skipped ? `, ${skipped} already saved` : ""}.${newDevice ? ` New sensor recorded (${lastFour(newDevice.serial)}).` : ""}`;
    } catch (err) {
      if (/passcode/i.test(err.message)) {
        // A wrong saved passcode would otherwise fail the same way every time.
        cgmPasscodeEl.value = "";
        savePasscode("");
        passcode = await waitForCgmPasscode(`${err.message.replace(/ — check it in Settings\.?/, "")} Please type it again.`, onStatus);
        if (!passcode) return "Libre: skipped.";
        continue;
      }
      return `Libre: failed — ${err.message}`;
    }
  }
}

// --- Dexcom ONE+ via Dexcom's official API (OAuth; netlify/functions/dexcom.js) ---
let dexcomMessage = "";

function renderDexcomStatus() {
  const connection = getDexcomConnection();
  const statusEl = document.getElementById("dexcom-status");
  document.getElementById("dexcom-connect-btn").hidden = Boolean(connection);
  document.getElementById("dexcom-disconnect-btn").hidden = !connection;
  let text = connection
    ? `Connected ${formatDate(connection.connectedAt)}${connection.env === "sandbox" ? " — Dexcom test mode: simulated readings only, nothing is saved" : ""}.`
    : "Not connected.";
  if (dexcomMessage) text = `${dexcomMessage} ${text}`;
  statusEl.textContent = text;
}

document.getElementById("dexcom-connect-btn").addEventListener("click", async (e) => {
  e.target.disabled = true;
  dexcomMessage = "Opening Dexcom sign-in…";
  renderDexcomStatus();
  try {
    await startDexcomConnect(); // navigates away on success
  } catch (err) {
    dexcomMessage = err.message;
    renderDexcomStatus();
    e.target.disabled = false;
  }
});

document.getElementById("dexcom-disconnect-btn").addEventListener("click", () => {
  if (!confirm("Disconnect Dexcom on this device? Readings already saved stay. To fully withdraw access, also remove this app in your Dexcom account.")) return;
  disconnectDexcom();
  forgetSyncResult("dexcom");
  renderDeviceLights();
  dexcomMessage = "Disconnected.";
  renderDexcomStatus();
});

// One Sync step for Dexcom — nothing physical needed, so it runs alongside
// Libre before the Bluetooth meter's manual prompt. Returns null when Dexcom
// isn't connected (most users won't have one, so it stays out of the status
// line entirely). Never throws.
async function syncDexcomStep(onStatus) {
  if (!getDexcomConnection()) return null;
  onStatus("Syncing with Dexcom…");
  try {
    await refreshAllCaches();
    const saved = cachedGlucose.filter((g) => g.sourceId === "dexcom");
    const since = saved.map((g) => g.timestamp).sort().at(-1) || null;
    const { readings, transmitterId, env } = await fetchDexcomReadings(since);
    if (env === "sandbox") {
      // Dexcom's sandbox only has made-up test users — never mix those into
      // the real record. Reporting the count proves the connection works.
      return `Dexcom (test mode): connection works, ${readings.length} simulated reading${readings.length === 1 ? "" : "s"} received, not saved.`;
    }
    const newDevice = recordSensorIfNew("dexcom-one-plus", transmitterId ? { serial: transmitterId } : null);
    if (newDevice) renderDeviceList();
    const savedTimes = new Set(saved.map((g) => new Date(g.timestamp).getTime()));
    let imported = 0;
    for (const r of readings) {
      if (savedTimes.has(new Date(r.timestamp).getTime())) continue;
      await saveGlucoseReading({ value: r.value, unit: r.unit, timestamp: r.timestamp, note: "", sourceId: "dexcom" });
      imported++;
    }
    const skipped = readings.length - imported;
    try {
      localStorage.setItem(DEXCOM_LAST_SYNC_KEY, new Date().toISOString());
    } catch {}
    await refreshAllCaches();
    return `Dexcom: ${imported} new reading${imported === 1 ? "" : "s"}${skipped ? `, ${skipped} already saved` : ""}.${newDevice ? ` New sensor recorded (${lastFour(newDevice.serial)}).` : ""}`;
  } catch (err) {
    renderDexcomStatus();
    return `Dexcom: failed — ${err.message}`;
  }
}

// --- Device status lights (Scott, 2026-10-03) ---
// One light per device the person actually uses: Libre once a passcode is
// saved or it has synced, Dexcom once connected, the meter where Bluetooth
// works or it has synced before. Tapping a light says what it means.
let syncingLight = null;

function deviceInUse(key, status) {
  if (status[key]) return true;
  if (key === "libre") return Boolean(getSavedPasscode());
  if (key === "dexcom") return Boolean(getDexcomConnection());
  if (key === "meter") return isBluetoothAvailable() && Boolean(activeDeviceOfType("bluetooth-meter"));
  return false;
}

function lightDetail(label, entry, light) {
  if (light === "syncing") return `${label}: syncing now…`;
  if (light === "grey") return `${label}: not set up yet. Use Sync devices once to start.`;
  const when = formatRelativeTime(entry.at);
  if (light === "red") return `${label}: last sync failed ${when} — ${entry.message}`;
  const ok = formatRelativeTime(entry.lastOkAt || entry.at);
  return light === "green" ? `${label}: working, last synced ${ok}.` : `${label}: last synced ${ok}. Tap Sync devices to update.`;
}

// Syncs from before the lights existed only left a "last synced" time: count
// those as a working sync then, so a device that synced this morning isn't grey.
const LAST_SYNC_KEYS = { libre: CGM_LAST_SYNC_KEY, dexcom: DEXCOM_LAST_SYNC_KEY, meter: BLUETOOTH_LAST_SYNC_KEY };

function statusWithHistory() {
  const status = getSyncStatus();
  for (const [key, storageKey] of Object.entries(LAST_SYNC_KEYS)) {
    if (status[key]) continue;
    let at = null;
    try {
      at = localStorage.getItem(storageKey);
    } catch {}
    if (at) status[key] = { ok: true, at, lastOkAt: at, message: "" };
  }
  return status;
}

function renderDeviceLights() {
  const container = document.getElementById("device-lights");
  const detail = document.getElementById("device-light-detail");
  const status = statusWithHistory();
  container.innerHTML = "";
  for (const { key, label } of DEVICE_LIGHTS) {
    if (!deviceInUse(key, status) && syncingLight !== key) continue;
    const light = lightFor(status[key], { syncing: syncingLight === key });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `device-light light-${light}`;
    btn.dataset.device = key;
    btn.setAttribute("aria-label", `${label}: ${LIGHT_WORDS[light]}`);
    btn.title = LIGHT_WORDS[light];
    btn.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="name"></span>';
    btn.querySelector(".name").textContent = label;
    btn.addEventListener("click", () => {
      const text = lightDetail(label, status[key], light);
      const showing = !detail.hidden && detail.dataset.device === key;
      detail.hidden = showing;
      detail.dataset.device = key;
      detail.textContent = text;
    });
    container.appendChild(btn);
  }
}
renderDeviceLights();
document.getElementById("home-sync-meter-hint").hidden = !isBluetoothAvailable();

// --- "Skip Chrome's device list" guidance (Scott, 2026-10-03) ---
// A website can't switch on Chrome's flag itself, so after a meter has synced
// (and in Settings) the app explains the three steps, and only while the flag
// is still off in this browser.
const BT_AUTO_TIP_KEY = "rht-bt-auto-tip-dismissed";

function showBtAutoTip() {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(BT_AUTO_TIP_KEY) === "1";
  } catch {}
  document.getElementById("home-bt-auto-tip").hidden = dismissed || canReconnectSilently();
}

function renderBtAutoSettings() {
  const show = isBluetoothAvailable();
  document.getElementById("settings-bt-auto").hidden = !show;
  if (!show) return;
  const on = canReconnectSilently();
  document.getElementById("settings-bt-auto-on").hidden = !on;
  document.getElementById("settings-bt-auto-off").hidden = on;
}
renderBtAutoSettings();

for (const btn of document.querySelectorAll(".bt-auto-copy")) {
  btn.addEventListener("click", async () => {
    const note = btn.closest(".bt-auto, #settings-bt-auto-off").querySelector(".bt-auto-copied");
    try {
      await navigator.clipboard.writeText(BT_AUTO_FLAG_URL);
      note.textContent = "Copied. Paste it into Chrome's address bar and press Enter.";
    } catch {
      note.textContent = `Couldn't copy here. Type this into the address bar: ${BT_AUTO_FLAG_URL}`;
    }
  });
}

document.getElementById("home-bt-auto-dismiss").addEventListener("click", () => {
  try {
    localStorage.setItem(BT_AUTO_TIP_KEY, "1");
  } catch {}
  document.getElementById("home-bt-auto-tip").hidden = true;
});

// --- Unified sync (Scott's spec, 2026-10-02): one button, not one per
// device. Libre runs first (nothing physical needed); the Bluetooth meter
// runs second, with its own manual-action prompt, so Scott isn't left
// holding an already-woken meter while Libre's network round-trip finishes.
// Replaces the separate "Sync CGM"/"Sync meter" buttons entirely, not an
// addition alongside them.
async function runUnifiedSync(btn, statusEl) {
  btn.disabled = true;
  statusEl.textContent = "";
  try {
    // Each step's own result is shown the moment it finishes, not held back
    // until the whole sequence ends — the Bluetooth step that may follow can
    // pause for minutes waiting on a manual action, and Scott shouldn't lose
    // the Libre result (or a passcode-prompt skip) off-screen until then.
    let done = "";
    const onStatus = (msg) => (statusEl.textContent = done ? `${done} ${msg}` : msg);
    // Each step lights its device: pulsing while it runs, then green/red from
    // its one-line summary. Skips and "different meter" cancels aren't
    // recorded, so they never turn a working device's light red.
    const lit = async (key, run) => {
      syncingLight = key;
      renderDeviceLights();
      try {
        const summary = await run();
        if (summary) {
          const failed = summary.match(/: failed — (.*)$/);
          if (failed) recordSyncResult(key, { ok: false, message: failed[1] });
          else if (!/skipped|cancelled/.test(summary)) recordSyncResult(key, { ok: true, message: summary });
        }
        return summary;
      } finally {
        syncingLight = null;
        renderDeviceLights();
      }
    };
    const add = (result) => {
      if (!result) return;
      done = done ? `${done} ${result}` : result;
      statusEl.textContent = done;
    };
    // Meter first: Chrome only opens its device list straight after a tap, and
    // the meter's broadcast window is short (see syncBluetoothStep).
    if (isBluetoothAvailable()) add(await lit("meter", () => syncBluetoothStep(onStatus)));
    add(await lit("libre", () => syncLibreStep(onStatus)));
    if (getDexcomConnection()) add(await lit("dexcom", () => syncDexcomStep(onStatus)));
    updateSyncBadge();
    await refreshHome();
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("home-sync-btn").addEventListener("click", () =>
  runUnifiedSync(document.getElementById("home-sync-btn"), document.getElementById("home-sync-status"))
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
renderDeviceList();
renderGlucoseSources();
loadReminderSettings();
updateSyncBadge();
// showView (not a bare refreshHome) because Home is the landing view and needs
// its datetime-local fields defaulted to "now" before anyone can submit either
// form — those fields are `required`, so leaving them blank silently blocks
// the browser's native form submission with no visible error.
showView("home");

// Opening animation (droplet lands on the spring) on every load, then Home —
// not a loading gate (the app underneath is already rendered), just a moment of
// calm identity before landing in the data.
// Long enough for the drop-and-bounce plus the name to land; tap to skip.
// Reduced-motion users get a static screen, so it can go sooner.
const splashEl = document.getElementById("splash");
const hideSplash = () => splashEl.classList.add("hidden");
// Set by the first-run code at the end of this file; module code runs top to
// bottom before any timer fires, so the timers below see the final value.
let firstRun = false;
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
setTimeout(() => { if (!firstRun) hideSplash(); }, reducedMotion ? 700 : 2100);
splashEl.addEventListener("click", () => { if (!firstRun) hideSplash(); });

// --- My foods (logic in myFoods.js; stored on this device only) ---
const myFoodForm = document.getElementById("myfood-form");
const myFoodFields = {
  barcode: document.getElementById("myfood-barcode"),
  name: document.getElementById("myfood-name"),
  carbs: document.getElementById("myfood-carbs"),
  sugars: document.getElementById("myfood-sugars"),
  serving: document.getElementById("myfood-serving"),
};
const myFoodStatus = document.getElementById("myfood-status");
const myFoodLookupStatus = document.getElementById("myfood-lookup-status");
const myFoodScanner = document.getElementById("myfood-scanner");
const myFoodScanStatus = document.getElementById("myfood-scan-status");

function fillMyFoodForm(food) {
  myFoodFields.barcode.value = food.barcode ?? myFoodFields.barcode.value;
  myFoodFields.name.value = food.name ?? "";
  myFoodFields.carbs.value = food.carbsPer100g ?? "";
  myFoodFields.sugars.value = food.sugarsPer100g ?? "";
  myFoodFields.serving.value = food.servingSizeG ?? "";
}

async function lookUpMyFoodBarcode(code) {
  myFoodFields.barcode.value = code;
  myFoodStatus.textContent = "";
  myFoodLookupStatus.textContent = `✓ Code ${code} received — ${STAGE_TEXT.device}`;
  const p = await lookupFood(code, lookupBarcode, (stage) => {
    myFoodLookupStatus.textContent = `✓ Code ${code} received — ${STAGE_TEXT[stage]}`;
  });
  if (p.found) {
    fillMyFoodForm({ name: p.brand ? `${p.brand} ${p.name}` : p.name, carbsPer100g: p.carbsPer100g, sugarsPer100g: p.sugarsPer100g, servingSizeG: p.servingSizeG });
    myFoodLookupStatus.textContent =
      p.source === "device" ? "Already in My foods. Change anything and save to update it."
      : p.source === "bank" ? "Already in your food bank (now on this phone too). Change anything and save to update it."
      : "Found online. Check the figures against the pack, then save.";
  } else {
    fillMyFoodForm({ name: "", carbsPer100g: "", sugarsPer100g: "", servingSizeG: "" });
    myFoodLookupStatus.textContent = "Not found online. Type the name and the pack's per 100 g figures, then save.";
  }
  myFoodFields.name.focus();
}

function renderMyFoods() {
  const foods = listMyFoods();
  document.getElementById("myfood-list-heading").textContent = `Saved (${foods.length})`;
  const list = document.getElementById("myfood-list");
  list.innerHTML = "";
  if (!foods.length) {
    list.innerHTML = '<p class="timeline-empty">Nothing saved yet. Scan a product above to start your list.</p>';
    return;
  }
  for (const f of foods) {
    const row = document.createElement("div");
    row.className = "myfood-row";
    const text = document.createElement("button");
    text.type = "button";
    text.className = "myfood-open";
    const name = document.createElement("span");
    name.className = "myfood-name";
    name.textContent = f.name;
    const figs = document.createElement("span");
    figs.className = "myfood-figs";
    const carbs = f.carbsPer100g != null ? `${f.carbsPer100g} g carbs` : "carbs not set";
    const sugars = f.sugarsPer100g != null ? ` · ${f.sugarsPer100g} g sugars` : "";
    const serve = f.servingSizeG ? ` · serve ${f.servingSizeG} g` : "";
    figs.textContent = `${carbs}${sugars} per 100 g${serve} · ${f.barcode}`;
    text.append(name, figs);
    text.addEventListener("click", () => {
      fillMyFoodForm(f);
      myFoodLookupStatus.textContent = "Editing a saved product.";
      myFoodStatus.textContent = "";
      myFoodForm.scrollIntoView({ block: "start" });
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mi-remove";
    del.setAttribute("aria-label", `Delete ${f.name}`);
    del.textContent = "✕";
    del.addEventListener("click", () => {
      if (!confirm(`Remove ${f.name} from My foods?`)) return;
      deleteMyFood(f.barcode);
      if (foodBankAvailable()) deleteFromFoodBank(f.barcode);
      renderMyFoods();
    });
    row.append(text, del);
    list.appendChild(row);
  }
}

myFoodForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const result = saveMyFood({
    barcode: myFoodFields.barcode.value,
    name: myFoodFields.name.value,
    carbsPer100g: myFoodFields.carbs.value,
    sugarsPer100g: myFoodFields.sugars.value,
    servingSizeG: myFoodFields.serving.value,
  });
  if (!result.ok) {
    myFoodStatus.textContent = result.error;
    return;
  }
  myFoodStatus.textContent = `Saved ${result.food.name} on this phone. Scan the next one.`;
  if (foodBankAvailable()) {
    const name = result.food.name;
    pushToFoodBank(result.food).then((r) => {
      if (!myFoodStatus.textContent.startsWith(`Saved ${name}`)) return;
      myFoodStatus.textContent = r.ok ? `Saved ${name} on this phone and in the food bank. Scan the next one.` : `Saved ${name} on this phone. ${r.error}`;
    });
  }
  myFoodLookupStatus.textContent = "";
  for (const field of Object.values(myFoodFields)) field.value = "";
  renderMyFoods();
});

document.getElementById("myfood-clear-btn").addEventListener("click", () => {
  for (const field of Object.values(myFoodFields)) field.value = "";
  myFoodStatus.textContent = "";
  myFoodLookupStatus.textContent = "";
});

document.getElementById("myfood-lookup-btn").addEventListener("click", () => {
  const code = myFoodFields.barcode.value.replace(/\s/g, "");
  if (!/^\d{6,14}$/.test(code)) {
    myFoodLookupStatus.textContent = "Type the 6 to 14 digits under the barcode first.";
    return;
  }
  lookUpMyFoodBarcode(code);
});

document.getElementById("myfood-scan-btn").addEventListener("click", async () => {
  myFoodScanStatus.textContent = "Loading scanner…";
  myFoodScanner.hidden = false;
  const { startScanning, isCameraAvailable } = await getBarcodeModule();
  if (!isCameraAvailable()) {
    myFoodScanner.hidden = true;
    myFoodLookupStatus.textContent = "Camera access isn't available here. Type the numbers under the barcode instead.";
    return;
  }
  myFoodScanStatus.textContent = "Looking for a barcode — hold it 10–20 cm from the camera, in good light.";
  await startScanning(document.getElementById("myfood-video"), {
    onDetected: (code) => {
      navigator.vibrate?.(60);
      myFoodScanner.hidden = true;
      lookUpMyFoodBarcode(code);
    },
    onError: (err) => {
      myFoodScanStatus.textContent = `Camera error: ${err.message}`;
    },
  });
});

document.getElementById("myfood-scan-cancel").addEventListener("click", async () => {
  const { stopScanning } = await getBarcodeModule();
  stopScanning();
  myFoodScanner.hidden = true;
});

document.getElementById("myfood-export-btn").addEventListener("click", () => {
  const blob = new Blob([exportMyFoods()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-foods-${localDateStr(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("myfood-import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const result = importMyFoods(await file.text());
  document.getElementById("myfood-import-status").textContent = result.ok
    ? `Restored ${result.added} product${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} that didn't look right` : ""}.`
    : result.error;
  e.target.value = "";
  renderMyFoods();
});

async function refreshFoodBank() {
  const el = document.getElementById("myfood-bank-status");
  if (!foodBankAvailable()) {
    el.textContent = "Food bank: off. Save the sync passcode in Settings (the Libre one) to share this list across your devices.";
    return;
  }
  el.textContent = "Food bank: syncing…";
  const r = await syncFoodBank();
  el.textContent = r.ok
    ? `Food bank: ${r.total} product${r.total === 1 ? "" : "s"}, in sync${r.changed ? ` (${r.changed} new or updated on this phone)` : ""}.`
    : `Food bank: ${r.error}`;
  if (r.ok && r.changed) renderMyFoods();
}

// --- Welcome / acknowledgement (logic in welcome.js) ---
const welcomeEl = document.getElementById("welcome");
const welcomeAccept = document.getElementById("welcome-accept");
const welcomeContinue = document.getElementById("welcome-continue");

function openWelcome() {
  const p = getProfile();
  document.getElementById("welcome-name").value = p.name;
  document.getElementById("welcome-condition").value = p.condition;
  document.getElementById("welcome-care").value = p.careTeam;
  welcomeAccept.checked = hasAccepted();
  welcomeContinue.disabled = !welcomeAccept.checked;
  document.getElementById("welcome-about").hidden = true;
  document.getElementById("welcome-form").hidden = false;
  welcomeEl.hidden = false;
}

welcomeAccept.addEventListener("change", () => {
  welcomeContinue.disabled = !welcomeAccept.checked;
});

document.getElementById("welcome-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const r = acceptWelcome({
    accepted: welcomeAccept.checked,
    name: document.getElementById("welcome-name").value,
    condition: document.getElementById("welcome-condition").value,
    careTeam: document.getElementById("welcome-care").value,
  });
  if (r.ok) welcomeEl.hidden = true;
});

document.getElementById("welcome-read-help").addEventListener("click", () => {
  welcomeEl.hidden = true;
  showView("help");
});
document.getElementById("help-show-welcome").addEventListener("click", openWelcome);

// First run: the opening (droplet on the spring) stays up with two choices
// instead of fading: "What does it do?" (a short overview) or "Get started"
// (straight to the agreement). Scott's design, 2026-09-28. Reading Help first
// is allowed; the whole sequence comes back next open until it's accepted.
const welcomeForm = document.getElementById("welcome-form");
const welcomeAbout = document.getElementById("welcome-about");
function showWelcomeStep(step) {
  welcomeAbout.hidden = step !== "about";
  welcomeForm.hidden = step !== "accept";
  if (step === "accept") openWelcome();
  else welcomeEl.hidden = false;
}
document.getElementById("welcome-about-next").addEventListener("click", () => showWelcomeStep("accept"));
if (!hasAccepted()) {
  firstRun = true;
  splashEl.setAttribute("aria-hidden", "false");
  document.getElementById("splash-start").hidden = false;
  document.getElementById("splash-about-btn").addEventListener("click", () => { hideSplash(); showWelcomeStep("about"); });
  document.getElementById("splash-start-btn").addEventListener("click", () => { hideSplash(); showWelcomeStep("accept"); });
}

// --- "Add to Home Screen" tip ---
// Opened from a home-screen icon, the app already runs full screen (manifest
// display: standalone). A website can't hide Safari's own address bar, so on a
// phone in the browser we show a one-time tip instead.
(function installTip() {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  const phone = window.matchMedia?.("(max-width: 700px)").matches && "ontouchstart" in window;
  let dismissed = false;
  try { dismissed = localStorage.getItem("rht-install-tip-dismissed") === "1"; } catch {}
  if (standalone || !phone || dismissed) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  document.getElementById("install-tip-how").textContent = ios
    ? "tap Share (the square with an arrow), then Add to Home Screen."
    : "open the browser menu (⋮), then Add to Home screen or Install app.";
  const tip = document.getElementById("install-tip");
  tip.hidden = false;
  document.getElementById("install-tip-close").addEventListener("click", () => {
    tip.hidden = true;
    try { localStorage.setItem("rht-install-tip-dismissed", "1"); } catch {}
  });
})();

// Help → "Your setup": what was agreed and when, and how the app is set up,
// with one button to change it (reopens the agreement screen, pre-filled).
function renderHelpSetup() {
  const list = document.getElementById("help-setup-list");
  const p = getProfile();
  const when = acceptedAt();
  const rows = [
    ["Conditions accepted", when ? formatDate(when) : "Not yet"],
    ["Name", p.name || "Not given"],
    ["Tracking", CONDITION_LABELS[p.condition] || CONDITION_LABELS.other],
    ["Who helps you", p.careTeam || "Not given"],
  ];
  list.innerHTML = "";
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    list.append(dt, dd);
  }
}
document.getElementById("help-change-setup").addEventListener("click", openWelcome);
document.getElementById("welcome-form").addEventListener("submit", () => {
  if (!document.getElementById("view-help").hidden) renderHelpSetup();
});

// Dexcom's sign-in sends the user back to /dexcom-callback?code=…&state=….
// Swap the code for tokens, then show the result in Settings → Dexcom. The URL
// is cleaned straight away so the one-time code isn't left in history.
if (window.location.pathname === DEXCOM_CALLBACK_PATH) {
  const params = new URLSearchParams(window.location.search);
  history.replaceState(null, "", "/");
  dexcomMessage = "Finishing Dexcom connection…";
  showView("settings");
  document.getElementById("dexcom-status").scrollIntoView({ block: "center" });
  completeDexcomConnect(params)
    .then((c) => {
      dexcomMessage = c.env === "sandbox"
        ? "Dexcom connected (test mode). Tap Sync devices on Home to check it."
        : "Dexcom connected. Tap Sync devices on Home to pull your readings.";
    })
    .catch((err) => {
      dexcomMessage = err.message;
    })
    .finally(renderDexcomStatus);
}
