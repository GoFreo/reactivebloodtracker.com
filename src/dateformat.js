const KEY = "rht-date-format";

// "auto" (default) follows the phone/browser's own locale, same as before this
// setting existed. Scott's explicit ask (2026-09-14): when travelling, his
// phone's region can silently switch and re-order dates with it — he wants a
// format he can lock in the app itself, independent of that. Every place in
// this app that renders a date should go through formatDate() below, not call
// toLocaleString() directly, so the lock actually holds everywhere at once.
export function getDateFormat() {
  return localStorage.getItem(KEY) || "auto";
}

export function saveDateFormat(format) {
  localStorage.setItem(KEY, format);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function formatDate(timestamp, { withTime = true } = {}) {
  const d = new Date(timestamp);
  const format = getDateFormat();

  if (format === "auto") {
    return withTime
      ? d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })
      : d.toLocaleDateString();
  }

  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const datePart = format === "mdy" ? `${month}/${day}/${year}` : format === "ymd" ? `${year}-${month}-${day}` : `${day}/${month}/${year}`;
  if (!withTime) return datePart;
  return `${datePart}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
