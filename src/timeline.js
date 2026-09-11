export function mergeTimeline({ glucose = [], food = [], diary = [] }) {
  const merged = [
    ...glucose.map((g) => ({ ...g, _kind: "glucose" })),
    ...food.map((f) => ({ ...f, _kind: "food" })),
    ...diary.map((d) => ({ ...d, _kind: "diary" })),
  ];
  merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return merged;
}

function formatTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function entryLabel(entry) {
  if (entry._kind === "glucose") return "🩸 Glucose";
  if (entry._kind === "food") return "🍽️ Food";
  if (entry._kind === "diary") return "📝 Diary";
  return "";
}

export function entryBody(entry) {
  if (entry._kind === "glucose") {
    const note = entry.note ? ` — ${entry.note}` : "";
    return `${entry.value} ${entry.unit}${note}`;
  }
  if (entry._kind === "food") {
    const parts = [];
    if (entry.text) parts.push(entry.text);
    if (entry.photoBlob) parts.push("📷 photo attached");
    if (entry.aiResult && entry.aiResult.foodName) {
      parts.push(`AI: ${entry.aiResult.foodName} (${entry.aiResult.confidencePercent ?? "?"}% confidence)`);
    }
    return parts.join(" — ") || "(no description)";
  }
  if (entry._kind === "diary") {
    return entry.text;
  }
  return "";
}

export function renderTimeline(container, entries) {
  if (!entries.length) {
    container.innerHTML =
      '<p class="timeline-empty">Nothing logged yet. Use the tabs below to add a glucose reading, food, or a note.</p>';
    return;
  }
  container.innerHTML = "";
  for (const entry of entries) {
    const el = document.createElement("div");
    el.className = "timeline-entry";

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    const label = document.createElement("span");
    label.textContent = entryLabel(entry);
    const time = document.createElement("span");
    time.textContent = formatTime(entry.timestamp);
    meta.append(label, time);

    const body = document.createElement("div");
    body.className = "entry-body";
    body.textContent = entryBody(entry);

    el.append(meta, body);
    container.appendChild(el);
  }
}
