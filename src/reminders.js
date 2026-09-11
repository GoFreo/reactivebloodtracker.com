const SETTINGS_KEY = "rht-reminder-settings";

export function getReminderSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, time: "12:00" };
  } catch {
    return { enabled: false, time: "12:00" };
  }
}

export function saveReminderSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function notificationSupportStatus() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

// In-app-only check: reminders enabled, today's reminder time has passed, and
// nothing logged yet today. Deliberately not relying on background push — see
// HANDOVER.md: iOS home-screen PWA push is unreliable and needs a real-device
// check before this app can lean on it.
export function shouldShowReminderBanner(glucoseReadings) {
  const settings = getReminderSettings();
  if (!settings.enabled) return false;

  const now = new Date();
  const [h, m] = settings.time.split(":").map(Number);
  const reminderTime = new Date(now);
  reminderTime.setHours(h, m, 0, 0);
  if (now < reminderTime) return false;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const loggedToday = glucoseReadings.some((r) => new Date(r.timestamp) >= todayStart);
  return !loggedToday;
}
