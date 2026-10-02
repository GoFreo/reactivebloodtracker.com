// Client side of the Libre 2 Plus sync. The actual LibreLinkUp login happens in
// netlify/functions/cgm-sync.js (the follower account's password never reaches
// the browser); this just sends the sync passcode and gets readings back.

const PASSCODE_KEY = "rht-cgm-passcode";
export const CGM_LAST_SYNC_KEY = "rht-cgm-last-sync";

// Remembering the passcode is opt-in and device-local. Storage can throw
// (private browsing, blocked site data), so every access is guarded.
export function getSavedPasscode() {
  try {
    return localStorage.getItem(PASSCODE_KEY) || "";
  } catch {
    return "";
  }
}

export function savePasscode(passcode) {
  try {
    if (passcode) localStorage.setItem(PASSCODE_KEY, passcode);
    else localStorage.removeItem(PASSCODE_KEY);
  } catch {
    // Not fatal — the user just has to type it next time.
  }
}

// Resolves to { readings: [{value, unit, timestamp}], sensor } or throws an
// Error whose message is safe to show directly to Scott. `sensor` (see
// extractSensorInfo in cgm-sync.js) is null when the server didn't report one.
export async function fetchCgmReadings(passcode) {
  let res;
  try {
    res = await fetch("/.netlify/functions/cgm-sync", {
      method: "POST",
      headers: { "x-cgm-passcode": passcode },
    });
  } catch {
    throw new Error("Couldn't reach the sync service — check your internet connection.");
  }
  const body = await res.json().catch(() => null);
  if (!body) throw new Error("CGM sync isn't available here (it only works on the live site).");
  if (res.status === 401) throw new Error("Wrong sync passcode — check it in Settings.");
  if (body.configured === false) throw new Error(body.error);
  if (!res.ok) throw new Error(body.error || `Sync failed (${res.status}).`);
  if (body.error && !body.readings?.length) throw new Error(body.error);
  return { readings: body.readings || [], sensor: body.sensor || null };
}
