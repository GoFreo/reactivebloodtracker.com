// First-run welcome: a plain-language "what this app is and isn't" with an
// acknowledgement checkbox, plus a small optional profile. Stored on this device
// only. TERMS_VERSION changes when the wording changes materially, so everyone
// sees the new version once. Not legal advice: have a lawyer review the wording
// before the app goes public (see HANDOVER.md).

export const TERMS_VERSION = "2026-09-28";
const ACCEPT_KEY = "rht-accepted-terms";
const PROFILE_KEY = "rht-profile";

export const CONDITIONS = ["reactive", "post-bariatric", "type1", "type2", "gestational", "other"];

function store(storage) {
  return storage || globalThis.localStorage;
}

export function hasAccepted(storage) {
  try {
    const a = JSON.parse(store(storage).getItem(ACCEPT_KEY) || "null");
    return a?.version === TERMS_VERSION;
  } catch {
    return false;
  }
}

export function getProfile(storage) {
  try {
    return JSON.parse(store(storage).getItem(PROFILE_KEY) || "null") || { name: "", condition: "reactive", careTeam: "" };
  } catch {
    return { name: "", condition: "reactive", careTeam: "" };
  }
}

// Returns { ok } or { ok: false, error }. The checkbox is required; the rest is optional.
export function acceptWelcome({ accepted, name, condition, careTeam }, storage) {
  if (!accepted) return { ok: false, error: "Tick the box to confirm you understand, then continue." };
  const profile = {
    name: String(name || "").trim().slice(0, 60),
    condition: CONDITIONS.includes(condition) ? condition : "other",
    careTeam: String(careTeam || "").trim().slice(0, 200),
  };
  store(storage).setItem(PROFILE_KEY, JSON.stringify(profile));
  store(storage).setItem(ACCEPT_KEY, JSON.stringify({ version: TERMS_VERSION, acceptedAt: new Date().toISOString() }));
  return { ok: true, profile };
}
