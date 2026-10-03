// Makes the explainer video: records the real app (a local production build, loaded with the
// synthetic demo patient, never anyone's real records) inside the phone on video/stage.html, with a
// camera that pushes in on whatever is being explained, an amber box and a short label pointing at it,
// one big phrase at a time beside the phone, and a clear pause when the screen changes.
//
// Run:  npm run build && npm run preview -- --port 4173         (in another terminal)
//       node video/record.mjs                  → the whole video
//       node video/record.mjs --scene=3        → just scene 3, to check it (video/out/scene-3.mp4)
//       node video/record.mjs --shots          → one picture per scene, no video
//       node video/record.mjs --no-web         → the 1080p master only; public/explainer.mp4 (what the site serves) is not touched
//
// Voice (VOICE_ENGINE):
//   say     (default)  the Mac's built-in voice, one clip per sentence (VOICE=Karen, RATE=160). It is flat: its
//                      pitch barely moves (about 1.8 semitones, where natural speech is 2-4) and its pitch
//                      controls do nothing, so this is a stand-in, not the intended voice.
//   kokoro             Kokoro, a small open neural voice that runs on this Mac, one clip per sentence
//                      (KOKORO_VOICE=af_heart, KOKORO_SPEED=0.97). Needs video/tts-kokoro.py's one-time setup.
//   files              your own recordings: video/voice/01-*.mp3 ... 08-*.mp3 (any audio format), one per
//                      scene in the order of video/narration-script.md. The picture is timed to the audio.
//   Every engine only has to produce a clip per sentence or per scene; the picture is timed to the audio.
//
// Recorded at 1920x1080. A close-up stays sharp because the camera in video/stage.html is driven frame by
// frame from script, so the browser re-draws the app at every step of a push-in instead of stretching a
// snapshot (a 4K capture was tried and was no sharper, and it made the moves choppy).
//
// Outputs: video/out/reactive-blood-tracker-explainer.mp4 (the 1080p master, not in git) and, for the site,
// public/explainer.mp4 (720p) with public/explainer-poster.jpg.

import { chromium } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FAKE_NOW, TIMEZONE, demoData, localSettings, seedIndexedDB } from "./demo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BUILD = path.join(HERE, "build");
const OUT = path.join(HERE, "out");
const VOICE_DIR = process.env.VOICE_DIR || path.join(HERE, "voice");
const APP_URL = "http://localhost:4173/";
const ENGINE = process.env.VOICE_ENGINE || "say";
const VOICE = process.env.VOICE || "Karen";
const RATE = process.env.RATE || "160";
const KOKORO_VOICE = process.env.KOKORO_VOICE || "af_heart";
const KOKORO_SPEED = process.env.KOKORO_SPEED || "0.97";
const SHOTS = process.argv.includes("--shots");
const NO_WEB = process.argv.includes("--no-web"); // make the master only: leave public/explainer.mp4 (what the site serves) alone
const ONLY = (process.argv.find((a) => a.startsWith("--scene=")) || "").split("=")[1];

const LINE_GAP_MS = 420; // breath between sentences
const SCENE_GAP_MS = 800; // a clear pause when the screen changes (the cut adds about a second more)
const LEAD_IN_MS = 500; // a beat of picture before the voice starts a scene

mkdirSync(BUILD, { recursive: true });
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMs = (file) => Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) * 1000);

// ---------------------------------------------------------------------------------------------
// The script. Keep in step with video/narration-script.md (Version B).
// Each scene: the sentences spoken, and what the picture does while they are spoken.
// ctx.line(i) waits for sentence i to begin; ctx.at(i, f) waits f (0..1) of the way through it.
// ---------------------------------------------------------------------------------------------
const SCENES = [
  {
    id: "hook",
    lines: [
      "After a meal, your blood sugar climbs. Then, an hour or two later, it crashes.",
      "That crash is almost impossible to describe to a doctor from memory.",
      "Reactive Blood Tracker puts it on the record.",
    ],
    async before(c) {
      await c.openGraph();
    },
    async act(c) {
      await c.line(0);
      await c.focus("#readings-graph-container svg", { label: "One day", zoom: 1.7 });
      await c.at(0, 0.28);
      await c.focus(".graph-extremum-peak", { nth: 0, pad: 70, label: "Up", zoom: 2.3 });
      await c.at(0, 0.62);
      await c.focus(".graph-extremum-trough", { pad: 80, label: "Crash", zoom: 2.3 });
      await c.line(1);
      await c.unfocus();
      await c.say("Almost impossible to describe <em>from memory.</em>");
      await c.line(2);
      await c.sayOut();
      await c.card({ text: "Glucose, food and notes in one place, so you and your doctors can see why sugar went high or low." });
    },
  },
  {
    id: "log",
    chapter: "1 · Log it",
    lines: ["Log a reading, a meal, or a note in seconds.", "There's no account. Your records stay on your phone."],
    async before(c) {
      await c.hideCard();
      await c.go("home");
    },
    async act(c) {
      await c.line(0);
      await c.focus("#glucose-form", { label: "A reading", zoom: 1.45 });
      await c.at(0, 0.38);
      await c.scrollTo("#food-form");
      await c.focus("#food-form", { label: "A meal", zoom: 1.35 });
      await c.at(0, 0.72);
      await c.scrollTo(".secondary-links");
      await c.focus(".secondary-links", { label: "A note", zoom: 1.7 });
      await c.line(1);
      await c.unfocus();
      await c.say("No account.<br><em>Stays on your phone.</em>");
    },
  },
  {
    id: "asks",
    chapter: "2 · It asks",
    lines: [
      "People forget to log things.",
      "Sensors don't.",
      "When your sensor shows a sudden rise or drop with nothing logged, the app simply asks: what happened?",
      "Two chocolate biscuits? A whisky after the footy? Whatever the answer, it goes on the record.",
    ],
    async before(c) {
      await c.go("home");
    },
    async act(c) {
      await c.line(0);
      await c.say("People forget.");
      await c.line(1);
      await c.say("<em>Sensors don't.</em>");
      await c.line(2);
      await c.sayOut();
      await c.focus("#spike-prompts .spike-summary", { pad: 14, label: "It noticed", zoom: 1.9 });
      await c.at(2, 0.55);
      await c.focus("#spike-prompts .spike-actions", { pad: 10, label: "What happened?", zoom: 1.7 });
      await c.line(3);
      await c.tap('#spike-prompts .spike-card button[data-answer="yes"]');
      await c.focus("#spike-prompts .spike-explain-form", { pad: 10, label: "You answer", zoom: 1.6 });
      await c.type("#spike-prompts .spike-explain-text", "Two chocolate biscuits", 70);
      await c.at(3, 0.78);
      await c.unfocus();
      await c.tap('#spike-prompts .spike-explain-form button[type="submit"]');
    },
  },
  {
    id: "graph",
    chapter: "3 · The graph",
    lines: [
      "Then the graph shows the whole story.",
      "Here, toast and honey for breakfast sent glucose past nine. Two hours later, it fell below the low line.",
      "Every peak and trough is labelled. Finger-prick checks are the diamonds. Meals sit along the bottom.",
      "And the Meals view shows what each meal did over the next five hours.",
    ],
    async before(c) {
      await c.openGraph();
    },
    async act(c) {
      await c.line(0);
      await c.focus("#readings-graph-container svg", { label: "24 hours", zoom: 1.7 });
      await c.line(1);
      await c.focus("path.graph-prick", { nth: 1, pad: 60, label: "Past nine", zoom: 2.4 });
      await c.at(1, 0.55);
      await c.focus("rect.graph-crossing-low", { pad: 60, label: "Below the low line", zoom: 2.1 });
      await c.line(2);
      await c.focus(".graph-extremum-peak", { nth: 0, pad: 55, label: "Peak", zoom: 2.4 });
      await c.at(2, 0.4);
      await c.focus("path.graph-prick.warn-low", { pad: 50, label: "Finger-prick", zoom: 2.5 });
      await c.at(2, 0.72);
      await c.focus("path.graph-meal", { nth: 0, pad: 55, label: "Meal", zoom: 2.5 });
      await c.line(3);
      await c.unfocus();
      await c.tap('#readings-view-toggle [data-mode="meals"]');
      await sleep(500);
      await c.scrollTo("#meal-gallery > :nth-child(4)", "start");
      await c.focus("#meal-gallery > :nth-child(4)", { pad: 12, label: "Five hours on", zoom: 1.7 });
    },
  },
  {
    id: "food",
    chapter: "4 · Food",
    lines: [
      "Logging food is quick. Type it, snap it, or scan the barcode, and the label's carbs fill in.",
      "Build a meal from ingredients, then pick a portion: a quarter, a half, or a whole serve.",
    ],
    async before(c) {
      await c.go("home");
      await c.scrollTo("#food-form", "center", true);
    },
    async act(c) {
      await c.line(0);
      await c.type("#food-text", "Toast with honey, black coffee", 40);
      await c.focus("#food-camera-btn", { pad: 14, label: "Snap it", zoom: 2.4 });
      await c.at(0, 0.4);
      await c.focus("#food-barcode-btn", { pad: 14, label: "Scan it", zoom: 2.4 });
      await c.at(0, 0.58);
      await c.unfocus();
      await c.cutTo(async () => {
        await c.go("my-foods");
        await c.fill("#myfood-barcode", "9310645419336");
      });
      await c.tap("#myfood-lookup-btn");
      await sleep(700);
      await c.scrollTo("#myfood-carbs");
      await c.focus("#myfood-form .myfood-numbers", { pad: 14, label: "Carbs from the label", zoom: 1.9 });
      await c.line(1);
      await c.unfocus();
      // The builder opens with a saved meal loaded while the screen is hidden; what is shown is the portion.
      await c.cutTo(async () => {
        await c.go("home");
        await c.clearText("#food-text");
        await c.scrollTo("#food-form", "center", true);
        await c.inApp(() => document.querySelector("#meal-builder > summary").click());
        await sleep(400);
        await c.inApp(() => document.querySelector("#saved-meals button").click());
        await sleep(400);
        await c.scrollTo("#meal-items", "center", true);
      });
      await c.focus("#meal-items .meal-item:nth-child(1)", { pad: 12, label: "Pick a portion", zoom: 1.8 });
      await c.at(1, 0.6);
      await c.tap("#meal-items .mi-portions button:nth-of-type(2)");
      await sleep(400);
      await c.focus("#meal-total", { pad: 14, label: "The total", zoom: 2.2 });
    },
  },
  {
    id: "devices",
    chapter: "5 · Devices",
    lines: ["One Sync button brings in your FreeStyle Libre and your Accu-Chek meter, with Dexcom on the way.", "All your devices, on one timeline."],
    async before(c) {
      await c.go("home");
      await c.clearText("#food-text");
      await c.closeMealBuilder();
      await c.scrollTo("#home-sync-btn", "center", true);
    },
    async act(c) {
      await c.line(0);
      await c.focus("#home-sync-btn", { pad: 12, label: "Sync", zoom: 2.2 });
      await c.at(0, 0.3);
      await c.ripple("#home-sync-btn");
      await c.at(0, 0.45);
      await c.focus("#device-lights", { pad: 14, label: "Every device", zoom: 2.4 });
      await c.at(0, 0.8);
      await c.unfocus();
      await c.line(1);
      await c.say("<em>One</em> timeline.");
    },
  },
  {
    id: "doctor",
    chapter: "6 · Your doctor",
    lines: [
      "When it's time to see your doctor, print a clean report: the graph, every reading, every meal, for the dates you choose.",
      "Nothing leaves your phone unless you send it.",
    ],
    async before(c) {
      await c.sayOut();
      await c.go("export");
    },
    async act(c) {
      await c.line(0);
      await c.focus(".export-presets", { pad: 12, label: "Choose the dates", zoom: 1.9 });
      await c.at(0, 0.28);
      await c.focus("#export-preview", { pad: 12, label: "What's in them", zoom: 1.5 });
      await c.at(0, 0.5);
      await c.showReport();
      await c.focus("#print-summary .rep-kv", { pad: 8, label: "The key numbers", zoom: 1.7 });
      await c.at(0, 0.78);
      await c.scrollReport(560);
      await c.focus("#print-summary table:nth-of-type(2)", { pad: 8, label: "Every low, with what was logged", zoom: 1.7 });
      await c.line(1);
      await c.unfocus();
      await c.say("Nothing leaves your phone <em>unless you send it.</em>");
    },
  },
  {
    id: "close",
    lines: [
      "Reactive Blood Tracker shows you what happened. It never tells you what to eat, or how much insulin to take. That stays between you and your doctors.",
      ["Reactive Blood Tracker dot com.", "reactivebloodtracker.com"],
    ],
    async before(c) {
      await c.sayOut();
    },
    async act(c) {
      await c.line(0);
      await c.card({ text: "Shows you what happened. Never what to eat, or how much insulin to take.", small: "Demonstration data shown. Talk to your own doctor about your readings." });
      await c.line(1);
      await c.card({ text: "Shows you what happened. Never what to eat, or how much insulin to take.", url: "reactivebloodtracker.com", small: "Demonstration data shown. Talk to your own doctor about your readings." });
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Voice: one audio clip per sentence (say) or per scene (files)
// ---------------------------------------------------------------------------------------------
function sayClip(text) {
  const key = createHash("sha1").update(`${VOICE}|${RATE}|${text}`).digest("hex").slice(0, 12);
  const file = path.join(BUILD, `line-${key}.aiff`);
  if (!existsSync(file)) execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", file, text]);
  return { file, ms: probeMs(file) };
}

// Kokoro speaks every sentence that doesn't have a clip yet in one go (loading the model takes a few seconds, so
// it is not started once per sentence), then each clip is measured like any other.
function kokoroClips(texts) {
  const entry = (text) => {
    const key = createHash("sha1").update(`kokoro|${KOKORO_VOICE}|${KOKORO_SPEED}|${text}`).digest("hex").slice(0, 12);
    return { key, text, file: path.join(BUILD, `line-${key}.wav`) };
  };
  const all = texts.map(entry);
  const todo = all.filter((e) => !existsSync(e.file));
  if (todo.length) {
    const list = path.join(BUILD, "kokoro-todo.json");
    writeFileSync(list, JSON.stringify(todo));
    console.log(`Kokoro: speaking ${todo.length} sentence${todo.length === 1 ? "" : "s"} (${KOKORO_VOICE}, speed ${KOKORO_SPEED})...`);
    execFileSync("python3", [path.join(HERE, "tts-kokoro.py"), "--list", list, "--voice", KOKORO_VOICE, "--speed", KOKORO_SPEED], { stdio: "inherit" });
  }
  return new Map(all.map((e) => [e.text, { file: e.file, ms: probeMs(e.file) }]));
}

function sceneAudioFile(index) {
  if (!existsSync(VOICE_DIR)) return null;
  const prefix = String(index + 1).padStart(2, "0");
  const f = readdirSync(VOICE_DIR).find((n) => n.startsWith(`${prefix}-`) || n.startsWith(`${prefix}.`) || n.startsWith(`${prefix}_`));
  return f ? path.join(VOICE_DIR, f) : null;
}

// How long each sentence lasts inside a scene's single recording, so the picture can follow the voice. In order of trust:
//   1. video/voice/timings.json, if it has this scene (its number, as text) with the start of each sentence in ms
//      (e.g. { "3": [0, 2100, 3500, 9800] }): for when the automatic way below gets a recording wrong;
//   2. the longest silences in the recording, taken to be the gaps between sentences;
//   3. each sentence's share of the recording by its length in letters.
function sentenceLengths(sceneIndex, file, lines) {
  const n = lines.length;
  const total = probeMs(file);
  const fromStarts = (starts) => starts.map((s, i) => (i + 1 < starts.length ? starts[i + 1] : total) - s);
  if (n === 1) return [total];

  const sidecar = path.join(VOICE_DIR, "timings.json");
  if (existsSync(sidecar)) {
    const starts = JSON.parse(readFileSync(sidecar, "utf8"))[String(sceneIndex + 1)];
    if (starts) {
      if (starts.length !== n) throw new Error(`video/voice/timings.json has ${starts.length} sentence starts for scene ${sceneIndex + 1}, which has ${n} sentences`);
      return fromStarts(starts);
    }
  }

  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
  const gaps = [];
  let from = null;
  for (const m of log.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const t = Math.round(Number(m[2]) * 1000);
    if (m[1] === "start") from = t;
    else if (from !== null) {
      gaps.push({ from, to: t, len: t - from });
      from = null;
    }
  }
  // Only a pause with speech on both sides can sit between two sentences.
  const between = gaps.filter((g) => g.from > 200 && g.to < total - 200);
  if (between.length >= n - 1) {
    const starts = [0, ...between.sort((a, b) => b.len - a.len).slice(0, n - 1).sort((a, b) => a.from - b.from).map((g) => g.to)];
    console.log(`  scene ${sceneIndex + 1} audio: sentences start at ${starts.map((s) => (s / 1000).toFixed(1)).join(", ")} s (from the pauses in the recording)`);
    return fromStarts(starts);
  }
  console.log(`  scene ${sceneIndex + 1} audio: found ${between.length} pauses for ${n} sentences, so the picture follows the sentences by their length`);
  const weights = lines.map((l) => Math.max(20, l.spoken.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((total * w) / sum));
}

// For every scene: [{ spoken, shown, ms, file }] (file only on the first line of a "files" scene).
function planVoice() {
  const kokoro = ENGINE === "kokoro" ? kokoroClips(SCENES.flatMap((s) => s.lines.map((l) => (Array.isArray(l) ? l[0] : l)))) : null;
  return SCENES.map((scene, si) => {
    const lines = scene.lines.map((l) => (Array.isArray(l) ? { spoken: l[0], shown: l[1] } : { spoken: l, shown: l }));
    if (ENGINE === "files") {
      const file = sceneAudioFile(si);
      if (!file) throw new Error(`VOICE_ENGINE=files but no recording for scene ${si + 1} found in video/voice/ (name it ${String(si + 1).padStart(2, "0")}-something.mp3)`);
      const ms = sentenceLengths(si, file, lines);
      return lines.map((l, i) => ({ ...l, ms: ms[i], file: i === 0 ? file : null }));
    }
    return lines.map((l) => ({ ...l, ...(kokoro ? kokoro.get(l.spoken) : sayClip(l.spoken)) }));
  });
}

// ---------------------------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------------------------
async function main() {
  const plan = planVoice();
  const spokenMs = plan.flat().reduce((a, c) => a + c.ms, 0);
  const voiceNote = ENGINE === "say" ? ` (${VOICE}, ${RATE} wpm)` : ENGINE === "kokoro" ? ` (${KOKORO_VOICE}, speed ${KOKORO_SPEED})` : "";
  console.log(`Voice: ${ENGINE}${voiceNote}. About ${(spokenMs / 1000).toFixed(0)} s of speech in ${SCENES.length} scenes.`);

  const W = 1920, H = 1080;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    timezoneId: TIMEZONE,
    locale: "en-AU",
    serviceWorkers: "block",
    recordVideo: { dir: BUILD, size: { width: W, height: H } },
  });
  await context.clock.install({ time: FAKE_NOW });
  await context.addInitScript((settings) => {
    if (!location.href.startsWith("http://localhost:4173")) return;
    for (const [k, v] of Object.entries(settings)) localStorage.setItem(k, v);
  }, localSettings);
  // A made-up product for the barcode scene (a made-up brand): the picture shows how the screen works.
  await context.route("**/world.openfoodfacts.org/api/v2/product/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: 1, product: { product_name: "Rolled Oats Quick", brands: "Example Mills", nutriments: { sugars_100g: 1.1, carbohydrates_100g: 60.4 }, serving_quantity: "40" } }) }),
  );

  const stage = await context.newPage();
  const t0 = Date.now();
  await stage.goto(pathToFileURL(path.join(HERE, "stage.html")).href);
  await stage.evaluate(() => window.stage.card({}));
  await stage.locator("#app").evaluate((f, url) => (f.src = url), APP_URL);
  const frame = () => stage.frames().find((f) => f.url().startsWith(APP_URL));
  const app = stage.frameLocator("#app");
  await app.locator("#view-home").waitFor({ state: "attached" });
  await seedIndexedDB(frame(), demoData(ROOT));
  await frame().evaluate(() => location.reload());
  await app.locator("#latest-reading").waitFor({ state: "visible" });
  await sleep(1800);
  // print() must never open a dialog while filming.
  await frame().evaluate(() => {
    window.print = () => {};
  });

  // ---- helpers the scenes use ----
  const S = (fn, arg) => stage.evaluate(fn, arg);
  const measure = (sel, nth = 0) =>
    frame().evaluate(([s, n]) => {
      const el = document.querySelectorAll(s)[n];
      if (!el) throw new Error(`no element for ${s}`);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, [sel, nth]);
  // Where an element is once it has stopped moving: a smooth scroll or a new line of text must not leave the box behind.
  const rectOf = async (sel, nth = 0) => {
    let prev = await measure(sel, nth);
    for (let i = 0; i < 14; i++) {
      await sleep(120);
      const now = await measure(sel, nth);
      if (Math.abs(now.x - prev.x) < 0.5 && Math.abs(now.y - prev.y) < 0.5 && Math.abs(now.h - prev.h) < 0.5) return now;
      prev = now;
    }
    return prev;
  };

  let posterAt = null; // when the title card first appeared, in ms since the recording began
  const ctxBase = {
    // Run a function inside the app's own page.
    inApp: (fn, arg) => frame().evaluate(fn, arg),
    async focus(sel, opts = {}) {
      await sleep(80);
      const r = typeof sel === "string" ? await rectOf(sel, opts.nth || 0) : sel;
      await S(([r, o]) => window.stage.focus(r, o), [r, opts]);
    },
    unfocus: () => S(() => window.stage.unfocus()),
    say: (big, small = "") => S(([b, s]) => window.stage.say(b, s), [big, small]),
    sayOut: () => S(() => window.stage.sayOut()),
    // The first card with words on it is the poster: a still of the title is a better first picture than a close-up.
    card: async (o) => {
      await S((o) => window.stage.card(o), o);
      if (posterAt == null && o && o.text) posterAt = Date.now() - t0;
    },
    hideCard: () => S(() => window.stage.hideCard()),
    // Smooth by default (it is part of the picture); `instant` jumps, for use while the screen is hidden by a cut.
    async scrollTo(sel, block = "center", instant = false) {
      await frame().evaluate(([s, b, i]) => document.querySelector(s).scrollIntoView({ behavior: i ? "auto" : "smooth", block: b }), [sel, block, instant]);
      await sleep(instant ? 150 : 850);
    },
    async go(view) {
      await frame().evaluate((v) => document.querySelector(`[data-nav="${v}"]`).click(), view);
      await app.locator(`#view-${view}`).waitFor({ state: "visible" });
      await frame().evaluate(() => document.querySelector("#views").scrollTo(0, 0));
      await sleep(400);
    },
    async openGraph() {
      await ctxBase.go("readings");
      await frame().evaluate(() => {
        document.querySelector('#readings-view-toggle [data-mode="graph"]').click();
        document.querySelector('#graph-range-toggle [data-hours="24"]').click();
      });
      await sleep(700);
    },
    // A soft ring where a finger would tap, since the recording shows no pointer.
    async ripple(sel) {
      await frame().evaluate((s) => {
        const el = document.querySelector(s);
        const r = el.getBoundingClientRect();
        const d = document.createElement("div");
        Object.assign(d.style, {
          position: "fixed", left: `${r.left + r.width / 2 - 26}px`, top: `${r.top + r.height / 2 - 26}px`, width: "52px", height: "52px",
          borderRadius: "50%", zIndex: 99999, pointerEvents: "none", background: "rgba(255,184,28,.30)", border: "3px solid rgba(255,184,28,.95)",
          transition: "transform .7s ease-out, opacity .7s ease-out",
        });
        document.body.appendChild(d);
        requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = "scale(1.9)"; d.style.opacity = "0"; }));
        setTimeout(() => d.remove(), 900);
      }, sel);
    },
    async tap(sel) {
      await frame().evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: "smooth", block: "center" }), sel);
      await sleep(500);
      await ctxBase.ripple(sel);
      await sleep(260);
      await frame().evaluate((s) => document.querySelector(s).click(), sel);
      await sleep(350);
    },
    async type(sel, text, delay = 60) {
      await app.locator(sel).first().pressSequentially(text, { delay });
    },
    fill: (sel, text) => app.locator(sel).first().fill(text),
    clearText: (sel) => app.locator(sel).first().fill(""),
    closeMealBuilder: () => frame().evaluate(() => (document.querySelector("#meal-builder").open = false)),
    // Swap the screen under a quick dip to teal.
    async cutTo(change) {
      await S(() => window.stage.cutOn());
      await sleep(320);
      await change();
      await sleep(250);
      await S(() => window.stage.cutOff());
      await sleep(420);
    },
    // The printed report is normally only for the printer; show it on screen the way a print preview would.
    async showReport() {
      await ctxBase.tap("#export-print-btn");
      await frame().evaluate(() => {
        const s = document.createElement("style");
        s.textContent = "#print-summary{display:block!important;position:fixed;inset:0;overflow:auto;background:#fff;color:#111;z-index:9999;padding:14px;font-size:10px;zoom:.62}#print-summary table{width:100%;border-collapse:collapse}#print-summary th,#print-summary td{border:1px solid #999;padding:5px 8px;text-align:left;font-size:11px}#print-summary h1{font-size:24px;margin:0 0 2px}#print-summary h2{font-size:16px;margin:16px 0 6px;border-bottom:2px solid #1b6e6a}#print-summary .rep-kv th{width:34%;background:#f0f0f0}#print-summary .rep-box{border:2px solid #1b6e6a;border-radius:6px;padding:6px 10px;margin:8px 0}#print-summary .print-graph{max-width:520px}#print-summary .rep-hint,#print-summary .rep-notes{font-size:11px}";
        document.head.appendChild(s);
      });
      await sleep(900);
    },
    scrollReport: (px) => frame().evaluate((p) => document.getElementById("print-summary").scrollBy({ top: p, behavior: "smooth" }), px),
  };

  // ---- the timeline ----
  const schedule = []; // narration clips and when they began
  let tStart = null; // when the first scene's picture began, so the wait at the start can be trimmed
  const scenes = SCENES.map((scene, i) => ({ scene, i })).filter(({ i }) => !ONLY || String(i + 1) === ONLY);
  for (const [n, { scene, i }] of scenes.entries()) {
    console.log(`scene ${i + 1}: ${scene.id}`);
    const lines = plan[i];
    const starts = lines.map(() => {
      let resolve;
      const p = new Promise((r) => (resolve = r));
      return { p, resolve, at: 0 };
    });
    const ctx = {
      ...ctxBase,
      line: (k) => starts[k].p,
      at: async (k, f) => {
        await starts[k].p;
        const wait = starts[k].at + lines[k].ms * f - Date.now();
        if (wait > 0) await sleep(wait);
      },
    };

    // Change the screen under a cut (the first scene needs none: it follows the title card).
    if (n === 0) {
      await scene.before?.(ctx);
    } else {
      await ctxBase.unfocus();
      await ctxBase.cutTo(async () => {
        await S(() => window.stage.sayOut());
        await scene.before?.(ctx);
      });
    }
    await S((c) => window.stage.chapter(c), scene.chapter || "");
    if (n === 0) {
      await S(() => window.stage.hideCard());
      tStart = Date.now() - t0;
    }
    await sleep(LEAD_IN_MS);

    const speak = (async () => {
      for (const [k, l] of lines.entries()) {
        await S((t) => window.stage.subtitle(t), l.shown);
        const now = Date.now();
        starts[k].at = now;
        // "say" has a clip per sentence; "files" has one recording per scene, placed once at its start.
        if (l.file) schedule.push({ file: l.file, at: now - t0 });
        starts[k].resolve();
        await sleep(l.ms + (ENGINE === "files" ? 0 : LINE_GAP_MS));
      }
      await S((t) => window.stage.subtitle(t), "");
    })();
    const acting = scene.act(ctx).catch((err) => console.error(`  scene ${i + 1} action failed: ${err.message}`));
    await Promise.all([speak, acting]);
    if (SHOTS) {
      await sleep(1400);
      await stage.screenshot({ path: path.join(OUT, `shot-${String(i + 1).padStart(2, "0")}.png`) });
    }
    await sleep(SCENE_GAP_MS);
  }
  await S((t) => window.stage.subtitle(t), "");
  await sleep(1200);
  const end = Date.now() - t0;

  const video = stage.video();
  await context.close();
  await browser.close();
  if (SHOTS) return;

  // ---- put picture and sound together ----
  const webm = await video.path();
  const clips = schedule.filter((s) => s.file);
  const trim = Math.max(0, (tStart || 0) - 250); // drop the wait at the start
  const total = (end - trim) / 1000;
  const inputs = clips.flatMap((s) => ["-i", s.file]);
  const filters = clips.map((s, k) => `[${k}:a]aresample=48000,adelay=${Math.max(0, s.at - trim)}|${Math.max(0, s.at - trim)}[a${k}]`).join(";");
  const mix = `${clips.map((_, k) => `[a${k}]`).join("")}amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,apad[aout]`;
  const narration = path.join(BUILD, "narration.wav");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", `${filters};${mix}`, "-map", "[aout]", "-t", String(total), "-ac", "2", narration]);

  const master = path.join(OUT, ONLY ? `scene-${ONLY}.mp4` : "reactive-blood-tracker-explainer.mp4");
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-ss", String(trim / 1000), "-i", webm, "-i", narration,
    "-map", "0:v", "-map", "1:a", "-t", String(total),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "25", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", master,
  ]);
  for (const f of readdirSync(BUILD)) if (f.endsWith(".webm")) rmSync(path.join(BUILD, f));

  if (ONLY || NO_WEB) {
    console.log(`Done: ${master} (${total.toFixed(1)} s)`);
    return;
  }
  // What the site serves: a lean 720p copy (about a third of the size), plus a poster frame.
  const web = path.join(ROOT, "public", "explainer.mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", master, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", web]);
  const poster = path.join(ROOT, "public", "explainer-poster.jpg");
  const posterT = posterAt == null ? 3 : Math.max(0, (posterAt - trim) / 1000 + 1.3); // once the card has faded in
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(posterT), "-i", web, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "4", poster]);
  console.log(`Done: ${master} (${total.toFixed(1)} s)\nWeb copy: ${web}\nPoster: ${poster}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
