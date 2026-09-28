import { defineConfig, devices } from "@playwright/test";

// Runs against a real production build+preview (not the dev server) so this is a
// true pre-deploy smoke check, not just "does it work with Vite's dev tooling."
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    // The app registers a real service worker (src/main.js). WebKit's Playwright
    // implementation has a known quirk where an active SW can intercept fetches
    // before page.route() sees them — Chromium doesn't have this problem, which
    // is exactly why testing only on Chromium missed it. Blocking SW registration
    // for the test context keeps this a test of the app's own logic, not an
    // accidental test of SW/route interaction that has nothing to do with it.
    serviceWorkers: "block",
    // Every test starts with the first-run welcome already accepted, so it doesn't
    // cover the page. tests/welcome.spec.js clears this to test the welcome itself.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:4173",
          localStorage: [{ name: "rht-accepted-terms", value: JSON.stringify({ version: "2026-09-28", acceptedAt: "2026-09-28T00:00:00Z" }) }],
        },
      ],
    },
  },
  // Covers the real spread of devices Scott actually uses/wants this verified on:
  // Chromium engine stands in for Windows/Mac/Android Chrome, WebKit for Safari on
  // Mac and iOS. Not a substitute for trying it on an actual phone, but a real,
  // repeatable check across both rendering engines and both desktop/mobile viewports.
  projects: [
    { name: "Desktop Chrome (Mac/PC)", use: { ...devices["Desktop Chrome"] } },
    { name: "Desktop Safari (Mac)", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Safari (iPhone)", use: { ...devices["iPhone 14"] } },
    { name: "Mobile Chrome (Android)", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
