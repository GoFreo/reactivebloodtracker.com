# Demo data — what it is, how to load it, what it's for

Generated 2026-10-01, built directly against the real entry shapes in
`src/glucose.js`, `src/food.js`, `src/diary.js`, `src/mealBuilder.js` and
`src/export.js` (read from the live project to make sure this actually
matches what the app stores — not a guess). Three days (28–30 Sep 2026,
Melbourne time), ending the day before today, so it reads as recent history
rather than obviously fake dates.

## The story it tells

This isn't random numbers — it's built to show the actual clinical pattern
the app exists for: Day 1 and Day 2 each have a carb-heavy breakfast, a sharp
glucose spike ~45–60 min later, a reactive low ~2–3 hours after that, a
diary note describing the symptoms, a fingerstick confirmation at the low,
and a correction. Day 3 is a deliberately well-managed contrast day — lower-GI
breakfast, no lows — so the video can show the graph looking genuinely
different on a good day vs. a bad one, side by side.

It also touches every logging path the app has:
- **Manual entries** (`sourceId: "manual"`) — fasting readings on waking.
- **Bluetooth meter entries** (`sourceId: "bluetooth-meter"`) — Accu-Chek
  fingerstick confirmations, including the "wait for the CGM arrow to go
  flat, then prick" comparison habit from the research brief.
- **CGM entries** (`sourceId: "librelinkup"`) — the dense trace that shows
  the spike/drop shape.
- **Barcode-scanned food** — packaged items with `carbsPer100g`/`barcode`/
  `servingSizeG`, one of them at a half-serve portion (the portion-fraction
  picker in `mealBuilder.js`, relevant given Scott's own portion sizing).
- **AI photo estimates** — both a low-confidence one (restaurant stir-fry,
  with the clarifying question the AI is told to ask rather than guess) and
  high-confidence ones (familiar home-cooked meals), so the video can show
  the app being honest about uncertainty rather than always looking
  confident.
- **Dictated (voice) entries** — plain text, no AI parse.
- **Family co-authoring** — entries whose text says "Logged by Marg" /
  "Logged by Kelly", showing today's real mechanism: anyone with the app
  open can log a meal, there's just no per-person login yet (see the
  "what's real vs. what's planned" note below).
- **Diary notes tied to a reactive episode** — with `excursionId`/`answer`
  extras, matching the shape `spikeDetection.js`'s unexplained-excursion
  prompt writes.

## Two files, two purposes

### `demo-data.csv` — usable today, no code changes

This is in the app's own existing export/import format (the exact header
`export.js` produces: `Type,When,Detail,Timestamp,Value,Unit,Note,Text`).
It can be loaded through the app's **existing Import CSV feature** right now
— nothing needs to be built for this one.

**Limitation (from reading `importCSV()` itself, not a guess):** the
importer always saves glucose as `sourceId: "manual"` and food entries as
plain text — it doesn't reconstruct device tags, barcode items, or AI
results, because the CSV format was designed for a lossless round-trip of
what the *app itself* exports, and the app's export only ever writes plain
text/value columns. Good for showing the timeline, the graph shape, and the
printed report. Not able to show device-source tagging or itemised meals.

### `demo-data-full-fidelity.json` — every field, for the richer demo

One array per store (`glucose`, `food`, `diary`), each entry exactly as
`saveGlucoseReading()`/`saveFoodEntry()`/`saveDiaryNote()` would write it —
`sourceId`, `items[]`, `aiResult`, diary `extra` fields all present. This is
what you'd want on screen to show barcode scanning, portion sizing, and
multi-device source tags in the video.

There's no existing "import JSON" feature to load this with (only the CSV
path exists), so loading it needs a few lines run once, in the browser
console, while the real deployed app is open — using the app's own already-
exported functions, not new app code:

```js
import("/src/glucose.js").then(({ saveGlucoseReading }) =>
  import("/src/food.js").then(({ saveFoodEntry }) =>
    import("/src/diary.js").then(async ({ saveDiaryNote }) => {
      const data = await (await fetch("/demo-data-full-fidelity.json")).json();
      for (const e of data.glucose) await saveGlucoseReading(e);
      for (const e of data.food) await saveFoodEntry(e);
      for (const e of data.diary) await saveDiaryNote(e);
      console.log("Demo data loaded.");
    })
  )
);
```

I haven't wired this into the app or touched any live file — it's a
console snippet for a one-off demo load, same spirit as the existing
`proposed-patches/` convention of leaving a yes/no decision to you and
Claude Code rather than changing the shipped app myself. If you'd like a
proper "Load demo data" dev-only button instead, that's a small, safe ask
for Claude Code.

## What's real vs. what's still planned

Everything in this dataset uses only what's actually built today
(`manual`, `bluetooth-meter`, `librelinkup` sources; no per-person login).
The video script below deliberately frames family co-authoring as "anyone
on the shared install can log a meal today" rather than claiming separate
logins or live alerts exist — those (roles, encrypted sharing, "tell my
family if I go low", Dexcom G7) are still on `HANDOVER.md`'s agreed build
order, not built yet. Worth keeping the video honest about that distinction
so it doesn't promise something not shipped yet.
