// Dexcom ONE+ readings via Dexcom's official API (OAuth 2.0, v3 —
// developer.dexcom.com, checked 2026-10-03). This function exists only because
// the OAuth client secret must never reach the browser: it builds the Dexcom
// sign-in link, swaps the one-time code for tokens, and fetches readings.
// Nothing is stored here — the tokens go back to the user's own device and are
// sent with each sync, so the server never keeps a standing key to anyone's
// glucose (CLAUDE.md privacy rule 1; also keeps per-person isolation free once
// the app is public).
//
// No sync passcode (unlike cgm-sync.js): Dexcom itself is the gate. A token only
// exists if that person signed in at Dexcom and approved this app, and it only
// reads *their own* data.
//
// Netlify env vars (Scott sets these himself — never entered by Claude):
//   DEXCOM_CLIENT_ID, DEXCOM_CLIENT_SECRET — from developer.dexcom.com → My Apps
// Optional:
//   DEXCOM_ENV — "sandbox" (default: Dexcom's simulated test users only),
//     "us", "eu" (Dexcom's outside-US server — Australia), or "jp". Change only
//     once Dexcom approves Limited Access.
//   DEXCOM_REDIRECT_URI — must exactly match the one registered with Dexcom.

const DEFAULT_REDIRECT_URI = "https://reactivebloodtracker.com/dexcom-callback";
const MGDL_PER_MMOL = 18.0182;
const DAY_MS = 24 * 3600 * 1000;
// First sync looks back this far; Dexcom refuses windows over 30 days.
const FIRST_SYNC_DAYS = 7;
const MAX_WINDOW_DAYS = 30;

const HOSTS = {
  sandbox: "https://sandbox-api.dexcom.com",
  us: "https://api.dexcom.com",
  eu: "https://api.dexcom.eu",
  jp: "https://api.dexcom.jp",
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

export function hostFor(env) {
  return HOSTS[String(env || "sandbox").toLowerCase()] || null;
}

export function buildLoginUrl({ env, clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "offline_access",
    state,
  });
  return `${hostFor(env)}/v3/oauth2/login?${params}`;
}

// Dexcom's systemTime is UTC but written without a zone ("2026-10-03T01:15:00").
// `new Date()` would read that as the *server's* local time, so mark it UTC first.
export function parseDexcomTime(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(str);
  const d = new Date(hasZone ? str : `${str}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Dexcom wants plain UTC "YYYY-MM-DDThh:mm:ss" for startDate/endDate.
export function toDexcomTime(date) {
  return new Date(date).toISOString().slice(0, 19);
}

// Which slice of time to ask for. Anchored on the newest data Dexcom actually
// has (its dataRange end), not "now": Dexcom holds app-uploaded readings back
// 1 hour in the US and 3 hours elsewhere, and sandbox users' data sits in the
// past entirely. Starts just after what's already saved, overlapping by an hour
// so nothing at the edge is missed (duplicates are skipped by the app).
export function queryWindow({ dataEnd, since, now = new Date() }) {
  const end = new Date(Math.min(new Date(dataEnd || now).getTime() + 60000, now.getTime() + 60000));
  const earliest = end.getTime() - MAX_WINDOW_DAYS * DAY_MS;
  const sinceMs = since ? new Date(since).getTime() - 3600000 : NaN;
  const startMs = Number.isFinite(sinceMs) ? Math.max(sinceMs, earliest) : end.getTime() - FIRST_SYNC_DAYS * DAY_MS;
  if (startMs >= end.getTime()) return null;
  return { start: new Date(startMs), end };
}

// Dexcom EGV records → app readings (mmol/L, ISO UTC, oldest first). Dexcom
// always reports mg/dL. Records with no numeric value are dropped, as are
// implausible ones — same safety stance as the Libre and Bluetooth sources.
export function egvsToReadings(body) {
  const seen = new Set();
  const readings = [];
  for (const r of body?.records || []) {
    const date = parseDexcomTime(r?.systemTime);
    const mgdl = Number(r?.value);
    if (!date || r?.value === null || !Number.isFinite(mgdl)) continue;
    const mmol = Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;
    if (!(mmol > 1 && mmol < 40)) continue;
    const timestamp = date.toISOString();
    if (seen.has(timestamp)) continue;
    seen.add(timestamp);
    readings.push({ value: mmol, unit: "mmol/L", timestamp });
  }
  readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return readings;
}

// The sensor's transmitter id from the newest record (ONE+ sensors carry their
// own transmitter, so a new id means a new sensor) — for the device register.
export function latestTransmitterId(body) {
  const records = [...(body?.records || [])].filter((r) => r?.transmitterId);
  records.sort((a, b) => String(a.systemTime).localeCompare(String(b.systemTime)));
  return records.at(-1)?.transmitterId || null;
}

function tokensFrom(body, now = Date.now()) {
  if (!body?.access_token || !body?.refresh_token) return null;
  const expiresIn = Number(body.expires_in) || 7200;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now + expiresIn * 1000).toISOString(),
  };
}

async function tokenRequest(host, fields) {
  const res = await fetch(`${host}/v3/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  const body = await res.json().catch(() => ({}));
  const tokens = tokensFrom(body);
  if (!res.ok || !tokens) {
    const err = new Error(
      res.status === 400 || res.status === 401
        ? "Dexcom no longer accepts this connection — reconnect Dexcom in Settings → My devices."
        : `Dexcom sign-in failed (${res.status}).`
    );
    err.reconnect = res.status === 400 || res.status === 401;
    throw err;
  }
  return tokens;
}

async function apiGet(host, path, accessToken) {
  const res = await fetch(`${host}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    const err = new Error("unauthorised");
    err.unauthorised = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Dexcom request failed (${res.status}).`);
  return res.json();
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;
  const env = String(process.env.DEXCOM_ENV || "sandbox").toLowerCase();
  const host = hostFor(env);
  const redirectUri = process.env.DEXCOM_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  if (!clientId || !clientSecret) {
    const missing = [!clientId && "DEXCOM_CLIENT_ID", !clientSecret && "DEXCOM_CLIENT_SECRET"].filter(Boolean);
    return json(200, { configured: false, error: `Dexcom isn't set up yet in Netlify — missing a value for: ${missing.join(", ")}.` });
  }
  if (!host) return json(200, { configured: false, error: `DEXCOM_ENV must be sandbox, us, eu or jp (it's "${env}").` });

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Bad request." });
  }

  try {
    if (input.action === "login-url") {
      if (typeof input.state !== "string" || input.state.length < 16) return json(400, { error: "Bad request." });
      return json(200, { configured: true, env, url: buildLoginUrl({ env, clientId, redirectUri, state: input.state }) });
    }

    if (input.action === "exchange") {
      if (typeof input.code !== "string" || !input.code) return json(400, { error: "Bad request." });
      const tokens = await tokenRequest(host, {
        client_id: clientId,
        client_secret: clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      return json(200, { configured: true, env, tokens });
    }

    if (input.action === "sync") {
      let tokens = input.tokens;
      if (!tokens?.refreshToken) return json(400, { error: "Bad request." });
      // Dexcom refresh tokens are single-use, so only refresh when the access
      // token has actually run out — every refresh is a chance for the new
      // token to be lost in transit, which would force a reconnect.
      let refreshed = false;
      const refresh = async () => {
        tokens = await tokenRequest(host, {
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type: "refresh_token",
        });
        refreshed = true;
      };
      const expiresAt = new Date(tokens.expiresAt || 0).getTime();
      if (!tokens.accessToken || !(expiresAt > Date.now() + 60000)) await refresh();

      const getWithRetry = async (path) => {
        try {
          return await apiGet(host, path, tokens.accessToken);
        } catch (err) {
          if (!err.unauthorised) throw err;
          if (refreshed) {
            const e = new Error("Dexcom refused the request — reconnect Dexcom in Settings → My devices.");
            e.reconnect = true;
            throw e;
          }
          await refresh();
          return apiGet(host, path, tokens.accessToken);
        }
      };

      const range = await getWithRetry("/v3/users/self/dataRange");
      const dataEnd = parseDexcomTime(range?.egvs?.end?.systemTime);
      if (!dataEnd) return json(200, { configured: true, env, readings: [], transmitterId: null, tokens: refreshed ? tokens : undefined });
      const window = queryWindow({ dataEnd, since: input.since });
      if (!window) return json(200, { configured: true, env, readings: [], transmitterId: null, tokens: refreshed ? tokens : undefined });
      const egvs = await getWithRetry(
        `/v3/users/self/egvs?startDate=${toDexcomTime(window.start)}&endDate=${toDexcomTime(window.end)}`
      );
      return json(200, {
        configured: true,
        env,
        readings: egvsToReadings(egvs),
        transmitterId: latestTransmitterId(egvs),
        dataEnd: dataEnd.toISOString(),
        tokens: refreshed ? tokens : undefined,
      });
    }

    return json(400, { error: "Bad request." });
  } catch (err) {
    return json(err.reconnect ? 401 : 502, { error: err.message || "Dexcom request failed", reconnect: Boolean(err.reconnect) });
  }
};
