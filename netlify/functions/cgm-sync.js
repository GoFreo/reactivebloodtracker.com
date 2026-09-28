// Pulls Scott's Libre 2 Plus readings from LibreLinkUp (Abbott's follower/sharing
// service) and hands them straight back to the app — nothing is stored here; the
// app saves them on-device in IndexedDB like every other reading (CLAUDE.md
// privacy rule 1: local by default, no server-side database).
//
// LibreLinkUp has no official public API. The endpoints/headers below match the
// community client most people use (timoschlueter/nightscout-librelink-up,
// checked 2026-09-28: version "4.16.0", sha256 account-id header, per-region
// hosts). Abbott has broken third-party clients before by requiring a newer
// `version` — if syncing suddenly fails with a version error, set
// LIBRELINKUP_VERSION in Netlify to whatever that project currently uses,
// no code change needed.
//
// Required Netlify env vars (Scott sets these himself — never entered by Claude):
//   LIBRELINKUP_EMAIL, LIBRELINKUP_PASSWORD — the *follower* account from the
//     LibreLinkUp app, not the main Libre app login
//   CGM_SYNC_PASSCODE — at least 8 characters; the app must send it with every
//     sync. Without this, anyone who found this URL could read Scott's glucose.
// Optional: LIBRELINKUP_REGION (default "au"), LIBRELINKUP_VERSION.

import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_VERSION = "4.16.0";
const MIN_PASSCODE_LENGTH = 8;
const MGDL_PER_MMOL = 18.0182;

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

function hostFor(region) {
  return `https://api-${String(region).toLowerCase()}.libreview.io`;
}

// Compare as fixed-length hashes so neither the length nor the content of the
// real passcode leaks through response timing.
export function passcodeMatches(supplied, expected) {
  const a = createHash("sha256").update(String(supplied ?? "")).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

// LibreLinkUp timestamps look like "9/28/2026 1:15:30 PM". FactoryTimestamp is
// UTC (Timestamp is the sensor's local clock) — parse explicitly as UTC rather
// than trusting `new Date(string)`, which would read it in the server's zone.
export function parseFactoryTimestamp(str) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i.exec(String(str).trim());
  if (!m) return null;
  let [, month, day, year, hour, minute, second, ampm] = m;
  hour = Number(hour) % 12;
  if (ampm.toUpperCase() === "PM") hour += 12;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minute), Number(second)));
}

// Turns a /graph response's data into app-ready readings (mmol/L, ISO time,
// oldest first, de-duplicated — the "current" measurement often repeats the
// newest graph point). Readings outside a plausible range are dropped rather
// than saved, same safety stance as bluetoothGlucose.js.
export function toReadings(graphData) {
  const points = [...(graphData?.graphData || [])];
  const current = graphData?.connection?.glucoseMeasurement;
  if (current) points.push(current);

  const seen = new Set();
  const readings = [];
  for (const p of points) {
    const date = parseFactoryTimestamp(p.FactoryTimestamp);
    const mgdl = Number(p.ValueInMgPerDl);
    if (!date || !Number.isFinite(mgdl)) continue;
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

function baseHeaders(version) {
  return {
    "Content-Type": "application/json",
    product: "llu.ios",
    version,
    "cache-control": "no-cache",
  };
}

async function login(email, password, region, version) {
  let host = hostFor(region);
  // A login at the wrong region answers with {redirect: true, region}. Follow it
  // once so a wrong LIBRELINKUP_REGION guess doesn't need a manual fix.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${host}/llu/auth/login`, {
      method: "POST",
      headers: baseHeaders(version),
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (body?.data?.redirect && body.data.region) {
      host = hostFor(body.data.region);
      continue;
    }
    if (body?.status === 4) {
      throw new Error("LibreLinkUp wants its terms accepted first — open the LibreLinkUp app on your phone, accept them, then sync again.");
    }
    if (body?.status === 920) {
      throw new Error("LibreLinkUp rejected this app version — LIBRELINKUP_VERSION needs updating (see cgm-sync.js).");
    }
    const token = body?.data?.authTicket?.token;
    const userId = body?.data?.user?.id;
    if (!res.ok || !token || !userId) {
      throw new Error("LibreLinkUp login failed — check the follower email/password saved in Netlify.");
    }
    return { host, token, accountId: createHash("sha256").update(userId).digest("hex") };
  }
  throw new Error("LibreLinkUp kept redirecting between regions.");
}

async function authedGet(session, path, version) {
  const res = await fetch(`${session.host}${path}`, {
    headers: { ...baseHeaders(version), Authorization: `Bearer ${session.token}`, "account-id": session.accountId },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`LibreLinkUp request failed (${res.status}).`);
  return body?.data;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const expected = process.env.CGM_SYNC_PASSCODE;
  const email = process.env.LIBRELINKUP_EMAIL;
  const password = process.env.LIBRELINKUP_PASSWORD;
  if (!expected || !email || !password) {
    return json(200, { configured: false, error: "CGM sync isn't set up yet in Netlify (needs the LibreLinkUp login and a sync passcode)." });
  }
  if (expected.length < MIN_PASSCODE_LENGTH) {
    return json(200, { configured: false, error: `The sync passcode saved in Netlify is too short — use at least ${MIN_PASSCODE_LENGTH} characters.` });
  }
  if (!passcodeMatches(event.headers["x-cgm-passcode"], expected)) {
    // Small fixed delay slows down anyone guessing passcodes against this URL.
    await new Promise((r) => setTimeout(r, 1000));
    return json(401, { error: "Wrong sync passcode." });
  }

  const version = process.env.LIBRELINKUP_VERSION || DEFAULT_VERSION;
  try {
    const session = await login(email, password, process.env.LIBRELINKUP_REGION || "au", version);
    const connections = await authedGet(session, "/llu/connections", version);
    const patient = Array.isArray(connections) ? connections[0] : null;
    if (!patient?.patientId) {
      return json(200, { configured: true, readings: [], error: "No shared sensor found — check the LibreLinkUp invite was accepted." });
    }
    const graph = await authedGet(session, `/llu/connections/${patient.patientId}/graph`, version);
    return json(200, { configured: true, readings: toReadings(graph) });
  } catch (err) {
    return json(502, { error: err.message || "LibreLinkUp request failed" });
  }
};
