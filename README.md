# Reactive

A mobile-first glucose, food and diary tracker, built first for **reactive hypoglycemia**, where the
danger is the crash that follows a spike, not the spike itself. Live at
[reactivebloodtracker.com](https://reactivebloodtracker.com).

It pulls every glucose source into one timeline: finger-prick meters, Libre CGM data via LibreLinkUp,
and more to come. It lines those readings up against what you ate, so you and your specialist can see
what happened before each high and each low.

> **Descriptive, not prescriptive.** The app shows what your own readings did. It never tells you
> what or how much to eat, and never suggests insulin doses. It is a personal record, not medical
> advice. Always follow your own clinician's guidance.

## Features

- **Quick entry on Home:** glucose, food (text, photo, barcode) and diary notes.
- **Glucose sources, in a pluggable registry** (`src/glucose.js`):
  - Manual entry
  - Accu-Chek Guide Me over Web Bluetooth (Chrome on Mac or Android)
  - Libre 2 Plus via LibreLinkUp (server-side, passcode-protected)
- **"Why did your sugar spike?"** Unexplained rises and drops on CGM data prompt a quick question;
  answers are kept for the doctor's report.
- **Readings** in three views:
  - **List:** everything in time order.
  - **Graph:** CGM line with data gaps shaded, finger-pricks as distinct markers, meals along the
    bottom.
  - **Meals:** each meal with the before, peak and lowest readings over the next 5 hours.
- **AI food parsing** (Claude) with a visible confidence level and a clarifying question when unsure.
- **Your own warning thresholds.** The low threshold can be raised but never set below the ADA's
  3.9 mmol/L.
- **Export:** CSV, and a printable summary for appointments. **Import:** CSV.
- **Private by default:** all data lives on your device (IndexedDB). Nothing is uploaded unless you
  choose to.

## Tech

Vite + vanilla JavaScript PWA, Netlify hosting and functions, Playwright tests across Chrome, Safari,
iPhone and Android profiles.

```bash
npm install
npm run dev      # local dev server
npm test         # builds the production bundle and runs the full test suite
npm run build    # production build into dist/
node scripts/render-icons.mjs   # regenerate PNG icons after editing public/icon.svg
```

Server-side settings (Netlify environment variables, set in the Netlify dashboard, never in code):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | AI food parsing (`netlify/functions/ai-proxy.js`) |
| `LIBRELINKUP_EMAIL`, `LIBRELINKUP_PASSWORD` | LibreLinkUp follower account for CGM sync |
| `CGM_SYNC_PASSCODE` | Passcode the app must send to use CGM sync (8+ characters) |

Deploy with `--skip-functions-cache`. See `HANDOVER.md` for why.

## Project notes

- `CLAUDE.md`: working rules, scope, and the privacy and "descriptive, not prescriptive" principles.
- `HANDOVER.md`: current status ("At a glance") and dated history.
- `research/`: research briefs that shaped the design.

## Roadmap

Meal builder (ingredients and barcodes) → opt-in encrypted sharing with family and clinicians →
low-glucose alerts to chosen people → exercise → Dexcom G7 → public release with bring-your-own
Anthropic key.
