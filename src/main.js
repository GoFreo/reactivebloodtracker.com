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
import { mergeTimeline, renderTimeline } from "./timeline.js";
import { downloadCSV, printSummary } from "./export.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const VIEW_TITLES = {
  timeline: "Timeline",
  glucose: "Add glucose reading",
  food: "Add food",
  diary: "Add diary note",
  export: "Export report",
  settings: "Settings",
};

const viewTitle = document.getElementById("view-title");
const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

function nowForDatetimeLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localDateStr(d) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function showView(name) {
  for (const view of views) {
    view.hidden = view.dataset.view !== name;
  }
  for (const btn of navButtons) {
    btn.classList.toggle("active", btn.dataset.nav === name);
  }
  viewTitle.textContent = VIEW_TITLES[name] || "";

  if (name === "glucose") {
    document.getElementById("glucose-time").value = nowForDatetimeLocal();
  } else if (name === "food") {
    document.getElementById("food-time").value = nowForDatetimeLocal();
    resetFoodAiState();
  } else if (name === "diary") {
    document.getElementById("diary-time").value = nowForDatetimeLocal();
  } else if (name === "timeline") {
    refreshTimeline();
  }
}

for (const btn of navButtons) {
  btn.addEventListener("click", () => showView(btn.dataset.nav));
}

let cachedGlucose = [];
let cachedFood = [];
let cachedDiary = [];

async function refreshTimeline() {
  [cachedGlucose, cachedFood, cachedDiary] = await Promise.all([
    listGlucoseReadings(),
    listFoodEntries(),
    listDiaryNotes(),
  ]);
  const merged = mergeTimeline({ glucose: cachedGlucose, food: cachedFood, diary: cachedDiary });
  renderTimeline(document.getElementById("timeline-list"), merged);
  updateReminderBanner();
}

function updateReminderBanner() {
  const banner = document.getElementById("reminder-banner");
  if (shouldShowReminderBanner(cachedGlucose)) {
    banner.hidden = false;
    banner.textContent = "Reminder: no glucose reading logged yet today.";
  } else {
    banner.hidden = true;
  }
}

// --- Glucose form ---
const glucoseForm = document.getElementById("glucose-form");
glucoseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveGlucoseReading({
    value: document.getElementById("glucose-value").value,
    unit: document.getElementById("glucose-unit").value,
    timestamp: new Date(document.getElementById("glucose-time").value).toISOString(),
    note: document.getElementById("glucose-note").value,
  });
  glucoseForm.reset();
  showView("timeline");
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
  await saveFoodEntry({
    text: document.getElementById("food-text").value,
    photoBlob: currentFoodPhotoBlob,
    timestamp: new Date(document.getElementById("food-time").value).toISOString(),
    aiResult: currentAiResult && currentAiResult.configured !== false ? currentAiResult : null,
  });
  foodForm.reset();
  foodPhotoPreview.hidden = true;
  currentFoodPhotoBlob = null;
  resetFoodAiState();
  showView("timeline");
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
  showView("timeline");
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

// --- Settings ---
function renderGlucoseSources() {
  const container = document.getElementById("glucose-source-list");
  container.innerHTML = "";
  for (const source of glucoseSources) {
    const el = document.createElement("div");
    el.className = "source-item";
    el.innerHTML = `<span>${source.label}</span><span>${source.isAvailable() ? "Active" : "Not available"}</span>`;
    container.appendChild(el);
  }
  document.getElementById("glucose-source-hint").textContent =
    glucoseSources.length > 1 ? "" : "Only manual entry is set up so far — a Bluetooth meter or LibreLinkUp source can be added later without changing how readings are stored.";
}

const reminderEnabled = document.getElementById("reminder-enabled");
const reminderTime = document.getElementById("reminder-time");
const notificationStatusEl = document.getElementById("notification-status");

function loadReminderSettings() {
  const settings = getReminderSettings();
  reminderEnabled.checked = settings.enabled;
  reminderTime.value = settings.time;
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

// --- Init ---
renderGlucoseSources();
loadReminderSettings();
refreshTimeline();
