import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MIN = 60000;

// Puts a morning of records straight into the app's own database: a Libre sensor with a crash, a meal
// before it, a note during it and a finger-prick from the meter. Everything is "today", so the default
// last-30-days range holds it.
async function seedMorning(page) {
  const base = new Date();
  base.setHours(7, 0, 0, 0);
  const at = (mins) => new Date(base.getTime() + mins * MIN).toISOString();
  const curve = [5.4, 5.6, 6.8, 8.2, 9.0, 8.1, 6.6, 5.2, 4.4, 3.9, 3.6, 3.8, 4.3, 5.0, 5.4];
  const glucose = [
    ...curve.map((v, i) => ({ id: `l${i}`, type: "glucose", sourceId: "librelinkup", value: v, unit: "mmol/L", note: "", timestamp: at(i * 15) })),
    { id: "p1", type: "glucose", sourceId: "bluetooth-meter", value: 3.4, unit: "mmol/L", note: "", timestamp: at(170) },
  ];
  const food = [{ id: "f1", type: "food", text: "Two slices of toast with honey", timestamp: at(0), photoBlob: null, aiResult: null }];
  const diary = [{ id: "d1", type: "diary", text: "Shaky and sweaty", timestamp: at(160) }];
  await page.evaluate(
    ({ glucose, food, diary }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("rht-db", 1);
        req.onupgradeneeded = () => {
          for (const s of ["glucose", "food", "diary"]) {
            if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: "id" }).createIndex("timestamp", "timestamp");
          }
        };
        req.onsuccess = () => {
          const tx = req.result.transaction(["glucose", "food", "diary"], "readwrite");
          for (const [name, rows] of [["glucose", glucose], ["food", food], ["diary", diary]]) for (const r of rows) tx.objectStore(name).put(r);
          tx.oncomplete = resolve;
          tx.onerror = reject;
        };
        req.onerror = reject;
      }),
    { glucose, food, diary },
  );
}

const openExport = async (page) => {
  await page.locator("#view-home button[data-nav='export']").click();
  await expect(page.locator("#view-export")).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  // The browser's own print dialog would block a test run, so printing is only recorded.
  await page.addInitScript(() => {
    window.print = () => {
      window.__printed = true;
    };
    localStorage.setItem("rht-thresholds", JSON.stringify({ low: 4, high: 10, unit: "mmol/L" }));
  });
});

test.describe("Export screen", () => {
  test("explains each option, with the dates, a report, a spreadsheet and a restore", async ({ page }) => {
    await page.goto("/");
    await openExport(page);
    const view = page.locator("#view-export");
    await expect(view).toContainText("Nothing is sent anywhere unless you choose to send it");
    await expect(view).toContainText("A report for your doctor");
    await expect(view).toContainText("every low spell with what was logged around it");
    await expect(view).toContainText("Spreadsheet or backup (CSV)");
    await expect(view).toContainText("Restore or move your records");
    await expect(view).toContainText("does not hold food photos");
    await view.locator(".export-columns > summary").click();
    await expect(view.locator(".export-columns")).toContainText("Source, Device");
  });

  test("a live summary of the chosen dates appears before anything is made", async ({ page }) => {
    await page.goto("/");
    await seedMorning(page);
    await openExport(page);
    const preview = page.locator("#export-preview");
    await expect(preview).toContainText("Libre");
    await expect(preview).toContainText("15 readings");
    await expect(preview).toContainText("Accu-Chek meter");
    await expect(preview).toContainText("1 meal, 1 note");
    await expect(preview).toContainText("Sensor lowest");
    await expect(preview).toContainText("3.6 mmol/L");
    await expect(preview).toContainText("below your low line");
    await expect(preview).toContainText("Low spells");
  });

  test("the summary follows the dates; an empty period and a backwards range are explained", async ({ page }) => {
    await page.goto("/");
    await seedMorning(page);
    await openExport(page);
    await page.locator("#export-from").fill("2020-01-01");
    await page.locator("#export-to").fill("2020-01-02");
    await expect(page.locator("#export-preview")).toContainText("Nothing was logged between these dates");
    await page.locator("#export-from").fill("2020-02-01");
    await expect(page.locator("#export-preview")).toContainText("start date that is on or before the end date");
  });

  test("quick ranges set the dates", async ({ page }) => {
    await page.goto("/");
    await seedMorning(page);
    await openExport(page);
    await page.locator('.export-presets [data-days="7"]').click();
    const from = await page.locator("#export-from").inputValue();
    const to = await page.locator("#export-to").inputValue();
    expect((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000).toBe(6);
    await page.locator('.export-presets [data-days="all"]').click();
    await expect(page.locator("#export-from")).toHaveValue(to); // everything logged is from today
    await expect(page.locator("#export-preview")).toContainText("15 readings");
  });

  test("the report has a summary, the low spell with what was logged around it, and the explanations", async ({ page }) => {
    await page.goto("/");
    await seedMorning(page);
    await openExport(page);
    await page.locator("#export-notes").fill("Ask about the lows before lunch");
    await page.locator("#export-print-btn").click();
    const report = page.locator("#print-summary");
    await expect(report.locator("h1")).toHaveText("Glucose & food report");
    await expect(report).toContainText("My notes for this appointment");
    await expect(report).toContainText("Ask about the lows before lunch");
    await expect(report.locator("h2", { hasText: "Summary" })).toHaveCount(1);
    await expect(report.locator("h2", { hasText: "Last 7 days" })).toHaveCount(1);
    await expect(report.locator(".readings-graph")).toHaveCount(1);
    const lows = report.locator("h2", { hasText: "Low spells" });
    await expect(lows).toHaveCount(1);
    await expect(report).toContainText("Two slices of toast with honey");
    await expect(report).toContainText("Shaky and sweaty");
    await expect(report).toContainText("Finger-prick 3.4 mmol/L");
    await expect(report.locator("h2", { hasText: "Meals and what followed" })).toHaveCount(1);
    await expect(report.locator("h2", { hasText: "Finger-pricks and the sensor" })).toHaveCount(1);
    await expect(report.locator("h2", { hasText: "How to read this report" })).toHaveCount(1);
    await expect(report).toContainText("does not diagnose");
    expect(await page.evaluate(() => window.__printed)).toBe(true);
  });

  test("notes for the appointment are kept on this phone", async ({ page }) => {
    await page.goto("/");
    await openExport(page);
    await page.locator("#export-notes").fill("Question about night-time lows");
    await page.reload();
    await openExport(page);
    await expect(page.locator("#export-notes")).toHaveValue("Question about night-time lows");
  });

  test("the CSV names each reading's device, and restoring it keeps sensor readings as sensor readings", async ({ page }) => {
    await page.goto("/");
    await seedMorning(page);
    await openExport(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-csv-btn").click()]);
    const csv = await readFile(await download.path(), "utf-8");
    expect(csv.split("\n")[0]).toContain('"Source","Device"');
    expect(csv).toContain('"librelinkup","Libre"');
    expect(csv).toContain('"bluetooth-meter","Accu-Chek meter"');

    // Wipe and restore from that very file.
    const dir = await mkdtemp(path.join(tmpdir(), "rht-roundtrip-"));
    const file = path.join(dir, "export.csv");
    await writeFile(file, csv, "utf-8");
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("rht-db", 1);
          req.onsuccess = () => {
            const tx = req.result.transaction(["glucose", "food", "diary"], "readwrite");
            for (const s of ["glucose", "food", "diary"]) tx.objectStore(s).clear();
            tx.oncomplete = resolve;
            tx.onerror = reject;
          };
          req.onerror = reject;
        }),
    );
    await page.reload();
    await openExport(page);
    await page.locator("#import-file").setInputFiles(file);
    await expect(page.locator("#import-status")).toContainText("Imported 18 entries");
    await expect(page.locator("#export-preview")).toContainText("Libre");
    await expect(page.locator("#export-preview")).toContainText("15 readings");
    await expect(page.locator("#export-preview")).toContainText("Accu-Chek meter");
    await rm(dir, { recursive: true, force: true });
  });

  test("an older file with no Source column still imports, as typed-in readings", async ({ page }) => {
    const dir = await mkdtemp(path.join(tmpdir(), "rht-old-"));
    const file = path.join(dir, "old.csv");
    await writeFile(
      file,
      ["Type,When,Detail,Timestamp,Value,Unit,Note,Text", '"glucose","x","5.1 mmol/L","2026-09-14T08:00:00.000Z","5.1","mmol/L","",""'].join("\n"),
      "utf-8",
    );
    await page.goto("/");
    await openExport(page);
    await page.locator("#import-file").setInputFiles(file);
    await expect(page.locator("#import-status")).toContainText("Imported 1 entry");
    await rm(dir, { recursive: true, force: true });
  });

  test("Share appears only where the phone can share a file, and sends the CSV", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async (data) => {
        window.__shared = { title: data.title, name: data.files[0].name };
      };
    });
    await page.goto("/");
    await seedMorning(page);
    await openExport(page);
    await expect(page.locator("#export-share-csv")).toBeVisible();
    await page.locator("#export-share-csv").click();
    await expect.poll(() => page.evaluate(() => window.__shared?.name)).toMatch(/^glucose-food-export-.*\.csv$/);
  });

  test("Share stays hidden where the browser can't share files", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => false;
    });
    await page.goto("/");
    await openExport(page);
    await expect(page.locator("#export-share-csv")).toBeHidden();
  });
});
