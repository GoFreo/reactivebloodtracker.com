// Client side of the Dexcom ONE+ connection. The OAuth secret and every call to
// Dexcom live in netlify/functions/dexcom.js; this keeps the resulting tokens on
// this device only (like every other piece of this app's data) and sends them
// along with each sync.

const TOKENS_KEY = "rht-dexcom-tokens";
const STATE_KEY = "rht-dexcom-state";
export const DEXCOM_LAST_SYNC_KEY = "rht-dexcom-last-sync";
export const DEXCOM_CALLBACK_PATH = "/dexcom-callback";

function read(key, storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function write(key, value, storage = globalThis.localStorage) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked — the connection just won't survive a reload.
  }
}

export function getDexcomConnection() {
  const c = read(TOKENS_KEY);
  return c?.refreshToken ? c : null;
}

export function disconnectDexcom() {
  write(TOKENS_KEY, null);
  write(DEXCOM_LAST_SYNC_KEY, null);
}

async function callFunction(payload) {
  let res;
  try {
    res = await fetch("/.netlify/functions/dexcom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the Dexcom service — check your internet connection.");
  }
  const body = await res.json().catch(() => null);
  if (!body) throw new Error("Dexcom isn't available here (it only works on the live site).");
  if (body.configured === false) throw new Error(body.error);
  if (!res.ok) {
    const err = new Error(body.error || `Dexcom request failed (${res.status}).`);
    err.reconnect = Boolean(body.reconnect);
    throw err;
  }
  return body;
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Step 1: send the user to Dexcom's own sign-in page. The random `state` is
// remembered for this tab so the return trip can prove it started here (stops
// another site tricking the app into saving someone else's Dexcom connection).
export async function startDexcomConnect() {
  const state = randomState();
  write(STATE_KEY, state, sessionStorage);
  const { url } = await callFunction({ action: "login-url", state });
  window.location.assign(url);
}

// Step 2: Dexcom sends the user back to /dexcom-callback?code=…&state=…
// Returns the saved connection, or throws a message safe to show the user.
export async function completeDexcomConnect(params) {
  const expected = read(STATE_KEY, sessionStorage);
  write(STATE_KEY, null, sessionStorage);
  if (params.get("error")) throw new Error("Dexcom connection was cancelled or not allowed.");
  const code = params.get("code");
  if (!code || !expected || params.get("state") !== expected) {
    throw new Error("That Dexcom sign-in didn't start from this app — tap Connect Dexcom again.");
  }
  const { tokens, env } = await callFunction({ action: "exchange", code });
  const connection = { ...tokens, env, connectedAt: new Date().toISOString() };
  write(TOKENS_KEY, connection);
  return connection;
}

// Returns { readings, transmitterId, env }. Saves rotated tokens straight away —
// Dexcom refresh tokens are single-use, so losing a new one means reconnecting.
// A "reconnect" error clears the stored connection so Settings shows Connect again.
export async function fetchDexcomReadings(since) {
  const connection = getDexcomConnection();
  if (!connection) throw new Error("Dexcom isn't connected.");
  try {
    const body = await callFunction({
      action: "sync",
      since: since || null,
      tokens: { accessToken: connection.accessToken, refreshToken: connection.refreshToken, expiresAt: connection.expiresAt },
    });
    if (body.tokens) write(TOKENS_KEY, { ...connection, ...body.tokens, env: body.env });
    return { readings: body.readings || [], transmitterId: body.transmitterId || null, env: body.env };
  } catch (err) {
    if (err.reconnect) disconnectDexcom();
    throw err;
  }
}
