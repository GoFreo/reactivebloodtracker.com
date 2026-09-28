import { test, expect } from "@playwright/test";
import { hasAccepted, acceptWelcome, getProfile, TERMS_VERSION } from "../src/welcome.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test.describe("welcome (pure logic)", () => {
  test("the box must be ticked; profile is optional and tidied", () => {
    const s = fakeStorage();
    expect(hasAccepted(s)).toBe(false);
    expect(acceptWelcome({ accepted: false }, s).ok).toBe(false);
    expect(hasAccepted(s)).toBe(false);
    const r = acceptWelcome({ accepted: true, name: "  Scott ", condition: "nonsense", careTeam: "Dr Foley" }, s);
    expect(r.ok).toBe(true);
    expect(getProfile(s)).toEqual({ name: "Scott", condition: "other", careTeam: "Dr Foley" });
    expect(hasAccepted(s)).toBe(true);
  });

  test("a new wording version asks again", () => {
    const s = fakeStorage();
    s.setItem("rht-accepted-terms", JSON.stringify({ version: "2020-01-01" }));
    expect(hasAccepted(s)).toBe(false);
    s.setItem("rht-accepted-terms", JSON.stringify({ version: TERMS_VERSION }));
    expect(hasAccepted(s)).toBe(true);
  });
});

test.describe("welcome screen (first run)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("first open: the opening stays up with two choices; Get started leads to the agreement", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#splash .splash-title")).toContainText("Reactive Blood Tracker");
    await page.waitForTimeout(2500); // past the normal splash fade
    await expect(page.locator("#splash-start")).toBeVisible();
    await expect(page.locator("#glucose-value")).not.toBeFocused(); // no keyboard on first open
    await page.locator("#splash-start-btn").click();
    const welcome = page.locator("#welcome");
    await expect(welcome).toBeVisible();
    await expect(page.locator("#welcome-form")).toBeVisible();
    await expect(page.locator("#welcome-continue")).toBeDisabled();
    await page.locator("#welcome-name").fill("Scott");
    await page.locator("#welcome-condition").selectOption("post-bariatric");
    await page.locator("#welcome-accept").check();
    await page.locator("#welcome-continue").click();
    await expect(welcome).toBeHidden();
    await page.reload();
    await expect(page.locator("#welcome")).toBeHidden();
    await expect(page.locator("#splash-start")).toBeHidden();
  });

  test("What does it do? shows the overview, then Next leads to the agreement", async ({ page }) => {
    await page.goto("/");
    await page.locator("#splash-about-btn").click();
    await expect(page.locator("#welcome-about")).toBeVisible();
    await expect(page.locator("#welcome-form")).toBeHidden();
    await expect(page.locator("#welcome-about")).toContainText("What the app does");
    await page.locator("#welcome-about-next").click();
    await expect(page.locator("#welcome-form")).toBeVisible();
    await expect(page.locator("#welcome-about")).toBeHidden();
  });

  test("Read Help first opens Help; the opening returns next time until accepted", async ({ page }) => {
    await page.goto("/");
    await page.locator("#splash-start-btn").click();
    await page.locator("#welcome-read-help").click();
    await expect(page.locator("#view-help")).toBeVisible();
    await expect(page.locator("#view-help")).toContainText("what this app is, and isn't");
    await page.reload();
    await expect(page.locator("#splash-start")).toBeVisible();
  });
});

test.describe("help page", () => {
  test("reachable from Home, with the limits, the meter-vs-Libre note and sources", async ({ page }) => {
    await page.goto("/");
    await page.locator('#view-home button[data-nav="help"]').click();
    const help = page.locator("#view-help");
    await expect(help).toContainText("does not diagnose");
    await expect(help).toContainText("Why the Libre and a finger-prick disagree");
    await expect(help).toContainText("call 000");
    await expect(help.locator(".sources a")).toHaveCount(19);
    await help.locator("#help-show-welcome").click();
    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("#welcome-accept")).toBeChecked();
  });
});

test.describe("help: your setup", () => {
  test("shows when the conditions were accepted and how the app is set up, and can be changed", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("rht-profile", JSON.stringify({ name: "Scott", condition: "post-bariatric", careTeam: "My GP" }));
      localStorage.setItem("rht-accepted-terms", JSON.stringify({ version: "2026-09-28", acceptedAt: "2026-09-28T12:00:00.000Z" }));
    });
    await page.reload();
    await page.locator('#view-home button[data-nav="help"]').click();
    const setup = page.locator("#help-setup");
    await expect(setup).toContainText("Conditions accepted");
    await expect(setup).toContainText("Scott");
    await expect(setup).toContainText("Lows after weight-loss surgery");
    await expect(setup).toContainText("My GP");
    await page.locator("#help-change-setup").click();
    await page.locator("#welcome-condition").selectOption("type2");
    await page.locator("#welcome-continue").click();
    await expect(setup).toContainText("Type 2 diabetes");
  });
});
