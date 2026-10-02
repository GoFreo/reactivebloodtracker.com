import { test, expect } from "@playwright/test";
import {
  hostFor,
  buildLoginUrl,
  parseDexcomTime,
  toDexcomTime,
  queryWindow,
  egvsToReadings,
  latestTransmitterId,
  handler,
} from "../netlify/functions/dexcom.js";

// Pure server-side logic plus the handler with Dexcom's endpoints stubbed —
// no real Dexcom account is touched from a test run.
test.describe("Dexcom sync (server logic)", () => {
  test("hosts per environment; unknown environments are refused", () => {
    expect(hostFor("sandbox")).toBe("https://sandbox-api.dexcom.com");
    expect(hostFor("EU")).toBe("https://api.dexcom.eu");
    expect(hostFor(undefined)).toBe("https://sandbox-api.dexcom.com");
    expect(hostFor("au")).toBeNull();
  });

  test("login link carries exactly what Dexcom's OAuth page needs", () => {
    const url = new URL(
      buildLoginUrl({ env: "sandbox", clientId: "abc", redirectUri: "https://reactivebloodtracker.com/dexcom-callback", state: "s".repeat(16) })
    );
    expect(url.origin + url.pathname).toBe("https://sandbox-api.dexcom.com/v3/oauth2/login");
    expect(url.searchParams.get("client_id")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://reactivebloodtracker.com/dexcom-callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("offline_access");
    expect(url.searchParams.get("state")).toBe("s".repeat(16));
  });

  test("systemTime without a zone is read as UTC, not the server's local time", () => {
    expect(parseDexcomTime("2026-10-03T01:15:00").toISOString()).toBe("2026-10-03T01:15:00.000Z");
    expect(parseDexcomTime("2026-10-03T01:15:00Z").toISOString()).toBe("2026-10-03T01:15:00.000Z");
    expect(parseDexcomTime("2026-10-03T11:15:00+10:00").toISOString()).toBe("2026-10-03T01:15:00.000Z");
    expect(parseDexcomTime("nonsense")).toBeNull();
    expect(parseDexcomTime(null)).toBeNull();
    expect(toDexcomTime("2026-10-03T01:15:00.123Z")).toBe("2026-10-03T01:15:00");
  });

  test("first sync looks back 7 days from Dexcom's newest data, not from now", () => {
    const dataEnd = new Date("2026-10-03T00:00:00Z");
    const w = queryWindow({ dataEnd, since: null, now: new Date("2026-10-03T03:00:00Z") });
    expect(w.end.toISOString()).toBe("2026-10-03T00:01:00.000Z");
    expect(w.start.toISOString()).toBe("2026-09-26T00:01:00.000Z");
  });

  test("later syncs start an hour before the last saved reading, capped at 30 days", () => {
    const dataEnd = new Date("2026-10-03T00:00:00Z");
    const recent = queryWindow({ dataEnd, since: "2026-10-02T20:00:00Z", now: dataEnd });
    expect(recent.start.toISOString()).toBe("2026-10-02T19:00:00.000Z");
    const old = queryWindow({ dataEnd, since: "2026-01-01T00:00:00Z", now: dataEnd });
    expect(old.start.toISOString()).toBe("2026-09-03T00:01:00.000Z");
  });

  test("converts mg/dL to mmol/L, sorts oldest first, drops null/implausible/duplicate records", () => {
    const readings = egvsToReadings({
      records: [
        { systemTime: "2026-10-03T01:20:00", value: 72, transmitterId: "T2" },
        { systemTime: "2026-10-03T01:15:00", value: 99, transmitterId: "T2" },
        { systemTime: "2026-10-03T01:15:00", value: 99 },
        { systemTime: "2026-10-03T01:25:00", value: null, status: "low" },
        { systemTime: "2026-10-03T01:30:00", value: 5000 },
        { systemTime: "garbage", value: 90 },
      ],
    });
    expect(readings).toEqual([
      { value: 5.5, unit: "mmol/L", timestamp: "2026-10-03T01:15:00.000Z" },
      { value: 4, unit: "mmol/L", timestamp: "2026-10-03T01:20:00.000Z" },
    ]);
    expect(egvsToReadings(null)).toEqual([]);
  });

  test("latest transmitter id comes from the newest record", () => {
    expect(
      latestTransmitterId({
        records: [
          { systemTime: "2026-10-03T01:20:00", transmitterId: "NEW" },
          { systemTime: "2026-10-01T01:20:00", transmitterId: "OLD" },
        ],
      })
    ).toBe("NEW");
    expect(latestTransmitterId({ records: [] })).toBeNull();
  });
});

test.describe("Dexcom sync (handler, Dexcom stubbed)", () => {
  const realFetch = globalThis.fetch;
  const saved = {};
  const calls = [];

  test.beforeEach(() => {
    for (const k of ["DEXCOM_CLIENT_ID", "DEXCOM_CLIENT_SECRET", "DEXCOM_ENV", "DEXCOM_REDIRECT_URI"]) saved[k] = process.env[k];
    process.env.DEXCOM_CLIENT_ID = "client-1";
    process.env.DEXCOM_CLIENT_SECRET = "secret-1";
    delete process.env.DEXCOM_ENV;
    delete process.env.DEXCOM_REDIRECT_URI;
    calls.length = 0;
  });

  test.afterEach(() => {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const post = (body) => handler({ httpMethod: "POST", body: JSON.stringify(body), headers: {} });
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  function stubDexcom(routes) {
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      calls.push({ path: u.pathname, init, url: u });
      const route = routes[u.pathname];
      if (!route) throw new Error(`unexpected ${u.pathname}`);
      return route(u, init);
    };
  }

  test("reports exactly which Netlify values are missing, never their values", async () => {
    delete process.env.DEXCOM_CLIENT_SECRET;
    const res = await post({ action: "login-url", state: "x".repeat(16) });
    const body = JSON.parse(res.body);
    expect(body.configured).toBe(false);
    expect(body.error).toContain("DEXCOM_CLIENT_SECRET");
    expect(body.error).not.toContain("client-1");
  });

  test("the client secret never appears in a login link", async () => {
    const res = await post({ action: "login-url", state: "x".repeat(16) });
    const body = JSON.parse(res.body);
    expect(body.env).toBe("sandbox");
    expect(body.url).toContain("client_id=client-1");
    expect(body.url).not.toContain("secret-1");
  });

  test("a code is exchanged for tokens with the secret sent form-encoded", async () => {
    stubDexcom({
      "/v3/oauth2/token": () => reply(200, { access_token: "A1", refresh_token: "R1", expires_in: 7200, token_type: "Bearer" }),
    });
    const res = await post({ action: "exchange", code: "code-1" });
    const body = JSON.parse(res.body);
    expect(body.tokens.accessToken).toBe("A1");
    expect(body.tokens.refreshToken).toBe("R1");
    const sent = new URLSearchParams(calls[0].init.body);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("client_secret")).toBe("secret-1");
    expect(sent.get("redirect_uri")).toBe("https://reactivebloodtracker.com/dexcom-callback");
  });

  const dataRoutes = {
    "/v3/users/self/dataRange": () => reply(200, { egvs: { end: { systemTime: "2026-10-03T00:00:00" } } }),
    "/v3/users/self/egvs": () => reply(200, { records: [{ systemTime: "2026-10-02T23:55:00", value: 90, transmitterId: "TX9" }] }),
  };

  test("a still-valid access token is used as is — single-use refresh tokens aren't spent", async () => {
    stubDexcom(dataRoutes);
    const res = await post({
      action: "sync",
      tokens: { accessToken: "A1", refreshToken: "R1", expiresAt: new Date(Date.now() + 3600000).toISOString() },
    });
    const body = JSON.parse(res.body);
    expect(body.readings).toEqual([{ value: 5, unit: "mmol/L", timestamp: "2026-10-02T23:55:00.000Z" }]);
    expect(body.transmitterId).toBe("TX9");
    expect(body.tokens).toBeUndefined();
    expect(calls.some((c) => c.path === "/v3/oauth2/token")).toBe(false);
    expect(calls[0].init.headers.Authorization).toBe("Bearer A1");
  });

  test("an expired access token is refreshed first and the new pair handed back", async () => {
    stubDexcom({
      ...dataRoutes,
      "/v3/oauth2/token": () => reply(200, { access_token: "A2", refresh_token: "R2", expires_in: 7200 }),
    });
    const res = await post({ action: "sync", tokens: { accessToken: "A1", refreshToken: "R1", expiresAt: "2020-01-01T00:00:00Z" } });
    const body = JSON.parse(res.body);
    expect(body.tokens.refreshToken).toBe("R2");
    expect(new URLSearchParams(calls[0].init.body).get("refresh_token")).toBe("R1");
    expect(calls[1].init.headers.Authorization).toBe("Bearer A2");
  });

  test("a refresh Dexcom rejects asks the user to reconnect", async () => {
    stubDexcom({ "/v3/oauth2/token": () => reply(400, { error: "invalid_grant" }) });
    const res = await post({ action: "sync", tokens: { refreshToken: "R1", expiresAt: "2020-01-01T00:00:00Z" } });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.reconnect).toBe(true);
    expect(body.error).toContain("reconnect Dexcom");
  });
});
