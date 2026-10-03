// Makes the explainer video: records the real app (a local production build,
// loaded with the synthetic demo data — never Scott's real records) inside the
// phone frame of video/stage.html, narrates it with macOS's Australian voice,
// and joins picture and sound into an MP4 with ffmpeg.
//
// Run:  npm run build && npm run preview -- --port 4173   (in another terminal)
//       node video/record.mjs            → video/out/reactive-blood-tracker-explainer.mp4 (1080p master, not in git)
//                                          + public/explainer.mp4 and public/explainer-poster.jpg (what the site serves)
//       node video/record.mjs --shots    → screenshots of each scene only, no video
//
// Narration is one audio clip per sentence, and each sentence's subtitle is shown
// the moment its clip is scheduled, so picture, subtitles and voice stay in step.

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FAKE_NOW, TIMEZONE, demoData, localSettings, seedIndexedDB } from "./demo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BUILD = path.join(HERE, "build");
const OUT = path.join(HERE, "out");
const APP_URL = "http://localhost:4173/";
const VOICE = process.env.VOICE || "Karen"; // en_AU
const RATE = process.env.RATE || "172";
const SHOTS = process.argv.includes("--shots");
const GAP_MS = 350; // pause between sentences

mkdirSync(BUILD, { recursive: true });
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- narration ----------
function clipFor(text) {
  const key = createHash("sha1").update(`${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 12);
  const file = path.join(BUILD, `line-${key}.aiff`);
  if (!existsSync(file)) execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", file, text]);
  const secs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
  return { file, ms: Math.round(secs * 1000) };
}

// ---------- scenes ----------
// `say` reads text literally, so a few lines spell words the way they should sound.
const SCENES = [
  {
    eyebrow: "",
    headline: "",
    lines: [
      ["This is Reactive Blood Tracker.", null],
      ["It's an app for people whose blood sugar swings. It was built first for reactive hypoglycaemia, where a meal sends glucose up, and an hour or two later, it crashes.", null],
      ["That crash is hard to describe to a doctor from memory. This app puts it on the record.", null],
      ["Everything you'll see uses made-up demonstration data, not a real patient.", null],
    ],
    async act({ stage, line, app, frame }) {
      await stage.evaluate(() => window.stage.card({ text: "Glucose, food and notes in one place, so you and your doctors can see why sugar went high or low." }));
      await line(2);
      await stage.evaluate(() => window.stage.scene("Reactive Blood Tracker", "Built to catch the crash, not just the spike."));
      await stage.evaluate(() => window.stage.hideCard());
      await frame().evaluate(() => location.reload()); // plays the opening animation
    },
  },
  {
    eyebrow: "1 · Open it",
    headline: "No account. Your records stay on your phone.",
    lines: [
      ["It opens from your phone's home screen, like any other app.", null],
      ["There's no account to create, and your records stay on your own phone, unless you choose to share them.", null],
      ["Home shows your latest reading, with quick ways to log a glucose reading, a meal, or a note.", null],
    ],
    async act({ line, app }) {
      await line(2);
      await scrollTo(app, "#glucose-form");
      await sleep(2200);
      await scrollTo(app, "#food-form");
      await sleep(2200);
      await scrollTo(app, "#latest-reading", "start");
    },
  },
  {
    eyebrow: "2 · It asks",
    headline: "People forget. Sensors don't.",
    lines: [
      ["People forget to log things. Sensors don't.", null],
      ["When the sensor shows a rise or a drop with nothing logged before it, the app asks what happened.", null],
      ["A couple of biscuits, a whisky after the footy, or just a sensor glitch. Whatever the answer, it goes on the record.", null],
    ],
    async act({ line, app }) {
      await scrollTo(app, "#spike-prompts .spike-card");
      await line(1);
      await sleep(2500);
      await tap(app, '#spike-prompts .spike-card button[data-answer="yes"]');
      await sleep(400);
      await app.locator("#spike-prompts .spike-explain-text").first().pressSequentially("Two chocolate biscuits", { delay: 70 });
      await line(2);
      await sleep(5200);
      await tap(app, '#spike-prompts .spike-explain-form button[type="submit"]');
    },
  },
  {
    eyebrow: "3 · See the pattern",
    headline: "A spike, then a crash.",
    lines: [
      ["The graph is where it comes together.", null],
      ["Here's one day. Toast and honey for breakfast sent glucose up past nine. About two hours later, it fell below the low line.", null],
      ["Each peak and trough is labelled. Low spells are shaded, and listed underneath. Finger-prick checks show as diamonds, and meals sit as markers along the bottom.", null],
    ],
    async act({ line, app }) {
      await tap(app, 'button.nav-btn[data-nav="readings"]');
      await sleep(600);
      await tap(app, '#readings-view-toggle button[data-mode="graph"]');
      await sleep(400);
      await tap(app, '#graph-range-toggle button[data-hours="24"]');
      await line(2);
      await sleep(5500);
      await scrollTo(app, "#readings-graph-container .graph-crossings, #readings-graph-container ul, #readings-graph-container");
      await sleep(2500);
      await scrollTo(app, "#readings-view-toggle", "start");
    },
  },
  {
    eyebrow: "3 · See the pattern",
    headline: "Three days, side by side.",
    lines: [
      ["Over three days, the pattern is plain to see. Two crashes, both after carb-heavy breakfasts, and one calm day, after a smaller breakfast of yoghurt and berries.", null],
    ],
    async act({ app }) {
      await sleep(600);
      await tap(app, '#graph-range-toggle button[data-hours="168"]');
    },
  },
  {
    eyebrow: "4 · What each meal did",
    headline: "Every meal, five hours on.",
    lines: [
      ["The Meals view shows what each meal did over the next five hours: where glucose started, how high it went, and how low it fell afterwards.", null],
    ],
    async act({ app }) {
      await tap(app, '#readings-view-toggle button[data-mode="meals"]');
      await sleep(3500);
      await scrollTo(app, "#meal-gallery > :nth-child(4)");
      await sleep(2500);
      await scrollTo(app, "#meal-gallery > :nth-child(7)");
    },
  },
  {
    eyebrow: "5 · Logging food",
    headline: "Type it, snap it, or scan it.",
    lines: [
      ["Logging food is quick. Type or say what you ate, photograph the plate, or scan a barcode, and the label's carbs fill in for you.", null],
      ["Build a meal from ingredients, and pick a portion: a quarter, a half, or a whole serve.", null],
      ["When it estimates from a photo, it says plainly when it isn't sure, instead of guessing.", null],
    ],
    async act({ line, app }) {
      await tap(app, 'button.nav-btn[data-nav="home"]');
      await sleep(500);
      await scrollTo(app, "#food-form");
      await sleep(400);
      await app.locator("#food-text").click();
      await app.locator("#food-text").pressSequentially("Toast with honey, black coffee", { delay: 60 });
      await line(1);
      await tap(app, "#meal-builder > summary");
      await sleep(700);
      await tap(app, "#saved-meals button");
      await sleep(900);
      await scrollTo(app, "#meal-items");
      await sleep(1200);
      await tap(app, "#meal-items .mi-portions button:nth-of-type(2)");
      await sleep(1500);
      await scrollTo(app, "#meal-total");
    },
  },
  {
    eyebrow: "6 · Your devices",
    headline: "One Sync button for every device.",
    lines: [
      ["Readings come from the devices you already use.", null],
      ["One Sync button pulls in a FreeStyle Libre sensor, and an Accu-Chek meter over Bluetooth. Dexcom sensors connect through Dexcom's own sign-in, and that's being switched on now.", null],
      ["Each sensor is recorded with its start date, which helps when one fails and needs replacing.", null],
    ],
    async act({ line, app }) {
      await app.locator("#food-text").fill("");
      await app.locator("#meal-builder").evaluate((d) => (d.open = false));
      await scrollTo(app, "#home-sync-btn");
      await line(1);
      await ripple(app, "#home-sync-btn");
      await sleep(3200);
      await tap(app, 'button.nav-btn[data-nav="settings"]');
      await sleep(500);
      await scrollTo(app, "#device-list", "start");
      await sleep(4500);
      await scrollTo(app, "#dexcom-status");
      await line(2);
      await sleep(800);
      await scrollTo(app, "#device-list", "start");
    },
  },
  {
    eyebrow: "7 · For your doctor",
    headline: "A clean report for the doctor.",
    lines: [
      ["When it's time to see the doctor, the app prints a clean report: the graph, and every reading, meal and note, for the dates you choose.", null],
      ["Nothing leaves your phone unless you decide to send it.", null],
    ],
    async act({ app, frame }) {
      await frame().evaluate(() => {
        window.print = () => {};
        document.querySelector('[data-nav="export"]').click();
      });
      await sleep(900);
      await app.locator("#export-from").fill("2026-09-28");
      await app.locator("#export-to").fill("2026-09-30");
      await sleep(400);
      await tap(app, "#export-print-btn");
      await sleep(500);
      // The report is normally only visible to the printer; show it on screen
      // the way a print preview would.
      await frame().evaluate(() => {
        const s = document.createElement("style");
        s.textContent = "#print-summary{display:block!important;position:fixed;inset:0;overflow:auto;background:#fff;color:#111;z-index:9999;padding:16px;font-size:12px}";
        document.head.appendChild(s);
      });
      await sleep(4500);
      for (let i = 0; i < 2; i++) {
        await frame().evaluate(() => document.getElementById("print-summary").scrollBy({ top: 380, behavior: "smooth" }));
        await sleep(2200);
      }
    },
  },
  {
    eyebrow: "",
    headline: "",
    lines: [
      ["Reactive Blood Tracker shows what happened. It never tells you what to eat, or how much insulin to take. That stays between you and your doctors.", null],
      ["Reactive Blood Tracker. At reactive blood tracker dot com.", "Reactive Blood Tracker: reactivebloodtracker.com"],
    ],
    async act({ stage }) {
      await stage.evaluate(() =>
        window.stage.card({
          text: "Shows what happened. Never what to eat, or how much insulin to take.",
          url: "reactivebloodtracker.com",
          small: "Demonstration data shown. Talk to your own doctor about your readings.",
        })
      );
    },
  },
];

// ---------- in-app helpers ----------
async function scrollTo(app, selector, block = "center") {
  await app.locator(selector).first().evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
  await sleep(700);
}

// A soft ring where a finger would tap, since the recording shows no pointer.
async function ripple(app, selector) {
  await app.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "fixed", left: `${r.left + r.width / 2 - 24}px`, top: `${r.top + r.height / 2 - 24}px`,
      width: "48px", height: "48px", borderRadius: "50%", zIndex: 99999, pointerEvents: "none",
      background: "rgba(27,110,106,.28)", border: "3px solid rgba(27,110,106,.85)",
      transition: "transform .6s ease-out, opacity .6s ease-out",
    });
    document.body.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = "scale(1.7)"; d.style.opacity = "0"; }));
    setTimeout(() => d.remove(), 800);
  });
}

async function tap(app, selector) {
  const loc = app.locator(selector).first();
  await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(450);
  await ripple(app, selector);
  await sleep(220);
  await loc.click();
}

// ---------- recording ----------
async function main() {
  const clips = SCENES.map((s) => s.lines.map(([spoken, shown]) => ({ spoken, shown: shown || spoken, ...clipFor(spoken) })));
  const total = clips.flat().reduce((a, c) => a + c.ms + GAP_MS, 0);
  console.log(`Narration: ${clips.flat().length} sentences, ${(total / 1000).toFixed(1)} s`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ...(SHOTS ? {} : { recordVideo: { dir: BUILD, size: { width: 1920, height: 1080 } } }),
    timezoneId: TIMEZONE,
    locale: "en-AU",
    serviceWorkers: "block",
    colorScheme: "light",
  });
  await context.clock.install({ time: FAKE_NOW });
  await context.addInitScript((settings) => {
    if (location.port !== "4173") return;
    for (const [k, v] of Object.entries(settings)) localStorage.setItem(k, v);
  }, localSettings);

  const stage = await context.newPage();
  const t0 = Date.now();
  await stage.goto(pathToFileURL(path.join(HERE, "stage.html")).href);
  await stage.evaluate(() => window.stage.card({}));
  await stage.locator("#app").evaluate((f, url) => (f.src = url), APP_URL);
  const frame = () => stage.frames().find((f) => f.url().startsWith(APP_URL));
  const app = stage.frameLocator("#app");
  await app.locator("#view-home").waitFor({ state: "attached" });

  // Load the demo records straight into the app's own IndexedDB, then reload.
  const data = demoData(ROOT);
  await seedIndexedDB(frame(), data);
  await frame().evaluate(() => location.reload());
  await app.locator("#latest-reading").waitFor({ state: "visible" });
  await sleep(1500);

  const schedule = [];
  for (const [si, scene] of SCENES.entries()) {
    if (SHOTS) {
      console.log(`scene ${si + 1}`);
    }
    if (scene.eyebrow) await stage.evaluate(([e, h]) => window.stage.scene(e, h), [scene.eyebrow, scene.headline]);
    const started = scene.lines.map(() => {
      let resolve;
      const p = new Promise((r) => (resolve = r));
      return { p, resolve };
    });
    const line = (i) => started[i].p;
    const speak = (async () => {
      for (const [i, c] of clips[si].entries()) {
        await stage.evaluate((t) => window.stage.subtitle(t), c.shown);
        schedule.push({ file: c.file, at: Date.now() - t0 });
        started[i].resolve();
        await sleep(c.ms + GAP_MS);
      }
    })();
    const acting = scene.act({ stage, line, app, frame }).catch((err) => console.error(`scene ${si + 1} action failed:`, err.message));
    await Promise.all([speak, acting]);
    if (SHOTS) await stage.screenshot({ path: path.join(OUT, `shot-${String(si + 1).padStart(2, "0")}.png`) });
  }
  await stage.evaluate(() => window.stage.subtitle(""));
  await sleep(2000);
  const end = Date.now() - t0;

  const video = stage.video();
  await context.close();
  await browser.close();
  if (SHOTS) return;

  const webm = await video.path();
  // Narration track: every sentence placed at the moment its subtitle appeared.
  const inputs = schedule.flatMap((s) => ["-i", s.file]);
  const filters = schedule.map((s, i) => `[${i}:a]aresample=48000,adelay=${s.at}|${s.at}[a${i}]`).join(";");
  const mix = `${schedule.map((_, i) => `[a${i}]`).join("")}amix=inputs=${schedule.length}:normalize=0,apad[aout]`;
  const narration = path.join(BUILD, "narration.wav");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", `${filters};${mix}`, "-map", "[aout]", "-t", String(end / 1000), "-ac", "2", narration]);

  const mp4 = path.join(OUT, "reactive-blood-tracker-explainer.mp4");
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", webm, "-i", narration,
    "-map", "0:v", "-map", "1:a", "-t", String(end / 1000),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "160k", mp4,
  ]);
  for (const f of readdirSync(BUILD)) if (f.endsWith(".webm")) rmSync(path.join(BUILD, f));

  // The 1080p file above is the master (kept out of git). What the site serves is a lean
  // 720p copy, about a third of the size, so it starts quickly on a phone's mobile data and
  // doesn't weigh down the repository. Text and the chart stay sharp at that size.
  const web = path.join(ROOT, "public", "explainer.mp4");
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", mp4,
    "-vf", "scale=1280:720:flags=lanczos",
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-movflags", "+faststart", web,
  ]);
  // Poster frame: the title card, shown before anyone presses play.
  const poster = path.join(ROOT, "public", "explainer-poster.jpg");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "6", "-i", web, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "4", poster]);
  console.log(`Done: ${mp4} (${(end / 1000).toFixed(1)} s)\nWeb copy: ${web}\nPoster: ${poster}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
