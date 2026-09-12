# Reactive Hypoglycemia Tracker — Handover

## Status: 🟡 pre-code, waiting on research handoff

**Objective:** A mobile-first personal tool for reactive hypoglycemia, grounded in Scott's own
medical evidence, `DVA New Master`'s medical-evidence material, and existing open-source JS/Python
approaches — with an AI-assisted section once a dedicated Anthropic key is wired in.

## 2026-09-12 — Claude (project created)

### Completed
- Folder created, git initialised (no commits yet — ask Scott before making the first one).
- `CLAUDE.md` written (session-starter, folder-boundary rule, reading order, Cowork-link note).
- `research/` created as the landing zone for the Cowork research handoff; `.gitignore` added
  (blocks `.env`/keys/`node_modules`/`__pycache__` from ever being committed, ahead of the
  Anthropic key that's coming).
- Added to `SCOTT-START-HERE.html` (new "Reactive Hypoglycemia Tracker" card, Health tag),
  `PROJECT-REGISTRY.md` (section 13 + quick-reference row + cross-refs in sections 4 and 5), and
  `MASTER_HANDOVER.md`'s Active projects table.
- Checked whether the Cowork research session (session ID `cse_01SH3uMcFJ2Kt4E9nejDK31F`, per
  Scott) is directly reachable from a Claude Code session — it isn't (not a listed peer session).
  Confirmed the handoff has to happen through a file, not a live link.
- Scott granted folder access to `DVA Research/` and `DVA New Master/` and asked which are
  actually needed. Confirmed: `DVA New Master/` is the right one — active, well-organised medical
  archive (`Medical Records`, `Medical History`, `Doctors Reports`, `X-Rays to Show`, its own
  `HANDOVER.md`/`CLAUDE.md`/`INDEX.md`), and per root `PROJECT-REGISTRY.md` section 4 already
  contains `Medical History/Hospital_Doctor_Cheat_Sheet_Blackout_Episodes.txt`, which documents a
  hypoglycemia finding (BGL 2.7 during a blackout episode) — directly relevant. `DVA Research/` is
  **not** needed: checked its actual contents (`ls`) and it's ADF pay-rates and claims-remuneration
  PDFs, unrelated to medical evidence — confirms the registry's standing note that it's a probable
  stale/duplicate folder, deferred since 2026-09-07. Also worth knowing: Scott has a local **DVA
  Evidence Manager** tool (`http://localhost:8765`, Desktop shortcut `DVA Evidence Manager.webloc`)
  that does full-text/OCR search across `DVA New Master/` with smart medical categories — likely a
  faster way for the Cowork research session (or a future session here) to locate hypoglycemia-
  relevant documents than browsing the raw folder tree.
- **Research handoff received (2026-09-12).** The Cowork research session produced a full brief
  ("Reactive Hypoglycemia-Aware Glucose & Food Tracker") and pasted it directly into chat rather
  than dropping a file into `research/` — saved verbatim to
  `research/2026-09-12-research-brief-glucose-food-tracker.md` so it isn't lost.

### Open / Next
- **Research received — no longer waiting on Cowork.** Full brief covers: glucose input (manual
  entry v1; official LibreLinkUp polling once the Libre 2 Plus is active; Nightscout/xDrip+
  deferred), food logging (photo via Claude vision + native mobile dictation, both needing a
  visible confidence indicator and correction flow — never presented as fact silently), a
  4-persona testing plan, reusing SparkyFitness (open-source, GitHub) for food-database plumbing
  instead of building that from scratch, and an architecture recommendation matching SfumatoART's
  own pattern (Vite PWA + Netlify functions proxying the Anthropic key + IndexedDB local-first
  storage). Read the saved brief for full detail — this is a summary, not a substitute.
- **Four open decisions from the brief (§11), assessed:**
  1. Exact finger-prick meter model — not blocking; the brief's own v1 recommendation is manual
     entry regardless of meter.
  2. Comfortable with official LibreLinkUp sharing — not urgent yet; Libre 2 Plus is still
     "pending supply," v1 starts with manual entry either way.
  3. Anthropic API budget — no figure from Scott yet; proceeding on a personal-use-volume
     assumption (a handful of photo/voice calls a day) unless told otherwise.
  4. **Surgery timeline — genuinely needs Scott, can't default this one.** Does the GP/anaesthetist
     export report need to exist by a specific date? Changes build order (report-first vs.
     logging-first).
- Not yet started: no `package.json`, no Vite scaffold, no Netlify functions — this handover and
  the saved brief are the full state so far. Recommended next step: a Claude Code session opened
  directly in this folder (the `SCOTT-START-HERE.html` card already set up for it) to do the
  actual scaffolding — keeps npm/git/dev-server preview cleanly rooted here rather than
  continuing via cross-project absolute paths from the SfumatoART worktree this setup was done in.
- Scott will generate a dedicated Anthropic API key for this project once the AI section is
  actually being built — not needed yet.
- Worth a conscious call with Scott (not assumed): `PROJECT-REGISTRY.md` section 5 ("Personal
  Dashboard," parked, lists blood-sugar monitoring as a must-include) and section 4 ("DVA Folder,"
  which flagged 2026-09-07 that its medical file was meant to feed a new program) may overlap with
  this project. Surfaced, not merged — his call.
- Two items from the registry's own "NEW PROJECT CHECKLIST" are Scott's own manual steps, not done
  here: creating a claude.ai Project for this work (if he wants that layer) and uploading key files
  to it. Not required for the Claude Code side to work, just noted so the checklist isn't silently
  half-done.

### Do not overwrite
- `research/2026-09-12-research-brief-glucose-food-tracker.md` — Cowork's original output, saved
  verbatim. Treat as a source document; put corrections or updates in this HANDOVER.md instead of
  editing the brief itself.

## 2026-09-12 — Scott's scope additions (same day, after reviewing the brief above)

Scott added three requirements directly in chat — not from the Cowork brief, layered on top of it:

1. **Diary/journal.** A free-text log kept alongside the structured glucose and food entries — for
   notes, context, how he was feeling, anything not captured by a structured field. **Add to v1
   scope**, not deferred.
2. **Reminder system (audible and/or visual)**, to prompt him to (a) actually do a finger-prick
   test and (b) check/interact with his CGM sensor, on some schedule. **Add to v1 scope.**
   - Worth clarifying, not blocking: the saved brief (§3.2) found the Libre 2/2 Plus needs an NFC
     tap only once, to pair — after that it streams via Bluetooth automatically, no repeat
     tapping. Scott's own phrasing ("tap... to get the data from there") suggests he may be
     expecting repeated scans — could be a different/older device, a safety-margin habit, or just
     not yet aware of the auto-streaming behaviour. Don't assume either way; ask him directly when
     build-scoping starts. Design the reminder system to cover both a "do a manual test" reminder
     and a "check the sensor" reminder regardless — costs nothing to support both.
   - Build note: this is a PWA (per §7's architecture pick) — OS-level push notifications on an
     iOS home-screen PWA have historically been limited/version-gated. Needs a concrete check
     against Scott's actual iOS version before relying on push alone; an in-app/badge fallback may
     be needed either way.
3. **Equipment is supplied via ADACare** (Scott's DVA-approved supplier), based on the DVA product
   list plus whatever the doctor has prescribed. This resolves part of brief §11.1 (exact meter
   model): it's a knowable fact (check ADACare's supply paperwork / ask them), not an open research
   question — just not confirmed yet.
   - **New architecture requirement, Scott's own framing:** equipment changes over time (DVA
     product list updates, doctor changes the prescription, a device goes obsolete) — the app's
     glucose-data-source layer needs to be built as a pluggable/extensible concept from the start
     (an abstraction over "where a reading comes from"), not hardcoded to whichever meter/CGM is
     first supported. First-class design constraint for whenever scaffolding starts, not something
     bolted on later.

Not yet actioned in code — captured here for whoever scopes the actual build.

### Follow-up (same day) — Scott's answers + one more addition

- **Equipment/Bluetooth (re: point 3 above):** Scott doesn't know the technical details of what
  ADACare will actually supply, and that's fine — not something he needs to track. His preference,
  plainly stated: **use Bluetooth if the supplied device supports it**, since that's obviously
  better than manual entry. Confirms the plan already in the brief and above: check the actual
  device once it's in hand, prefer Bluetooth when available, manual entry is always the fallback
  regardless (v1 isn't blocked by not knowing the model yet).
- **Push-notification dependency (re: reminder build note above):** Scott confirmed ("yes") he
  understands reminders behave differently depending on whether he has the phone on him vs. is at
  home — treat this as a real platform behaviour to verify during build, not something to design
  around blindly now.
- **New: preload common food/nutrition data.** Scott wants the app to already know about common
  items (soft drinks, sugared vs non-sugared, cereals, carbohydrates, etc.) rather than treating
  every logged food as something to work out from scratch — saves time during logging. **This
  doesn't need new research** — brief §6 already identified solid free sources for exactly this
  (Open Food Facts for packaged/barcode Australian goods, AUSNUT for generic Australian foods,
  SparkyFitness as prior art that's already wired these in). Confirmed as v1 scope, not a new
  research task.
- **Reconfirmed: the Cowork-handoff mechanism is already in place and reusable.** Scott asked again
  whether he and a Cowork/chat session need a new handoff file each time, or whether "the two work
  together" automatically. Answer, restated plainly for the record: no automatic link exists (see
  `CLAUDE.md`'s "How the Cowork research session links up" section) — but nothing new needs to be
  built for it. The recipe for any future research round: open a chat/Cowork session, tell it to
  read this `HANDOVER.md` first, do the research, then save its findings as a new dated file in
  `research/` — same pattern as the first handoff. No new setup required each time.

## 2026-09-12 — Recovery check (Claude app hung, Scott force-quit)

Right after the entry above was written, the Claude app locked up and Scott had to force-close it.
Checked immediately after, from a separate session (SfumatoART's worktree, cross-project access
explicitly granted by Scott for this one check): **nothing lost.**
- This `HANDOVER.md` reads complete and coherent through the entry above — no sign of a mid-write
  truncation.
- `research/2026-09-12-research-brief-glucose-food-tracker.md` (22KB) and `research/README.md` both
  intact.
- `git status` — still zero commits, all four items (`.gitignore`, `CLAUDE.md`, `HANDOVER.md`,
  `research/`) untracked, exactly as the "Completed" section above describes. Nothing to reconcile.

Conclusion: the freeze was a UI/app-level hang, not a data-loss event — Write/Edit-style file saves
had already completed before the lockup. Safe to pick this project back up exactly where the entry
above leaves it; no re-work needed.

## 2026-09-12 — Corrected brief (v2) received; build phase started

Scott shared a revised brief from Cowork: `research/2026-09-12-research-brief-glucose-food-tracker-v2.md`.
**Do not overwrite either brief file** — v1 stays as the original record, v2 is the corrected one to
build from. Diffed the two; the only substantive change is important:

- **License correction on SparkyFitness.** v1 called it a "strong candidate to fork." v2 corrects
  this: it's under a **custom non-commercial license**, not MIT — explicitly forbids commercial
  use. Since §1 of the brief states Scott's long-term intent to possibly sell this, **this build
  must not copy/fork any SparkyFitness source.** Study its architecture for ideas only; write
  original code for anything shipped. Re-check its LICENSE file at build time in case terms change.
- Open Food Facts has official installable packages (`@openfoodfacts/openfoodfacts-nodejs`,
  `openfoodfacts` on PyPI) — permissively licensed, safe to actually depend on.
- cgmquantify/Glucose360 (Python, glycemic-variability metrics) and Nightscout's `cgm-remote-monitor`
  (Node, MIT) confirmed as real, installable/cloneable — not just concepts — for later if needed.

**Scott's go-ahead (same session, in chat):** build as autonomously as possible, mobile-first,
design tooling optional/my call, Cowork stays the research channel for any open-source-library
questions that come up mid-build. He's stepping away and checking in periodically, not blocking on
each step.

### Plan for this build pass (v1 scope, per brief §10 + Scott's 3 additions from the entry above)
- Vite vanilla-JS PWA, same pattern as SfumatoART (Netlify + serverless function proxying the
  Anthropic key once Scott provides one; IndexedDB local-first storage).
- Manual glucose entry now; glucose-source layer built as a pluggable abstraction (Scott's explicit
  requirement) so LibreLinkUp/Bluetooth can slot in later without a rewrite.
- Food logging: text/dictation entry first (native mobile STT is a browser-level concern, not
  something to fake in v1), photo entry wired to a Netlify function stub (can't call Claude for
  real until Scott's dedicated API key exists — build the plumbing, not a live call).
- Diary/journal free-text log (Scott's addition #1).
- Reminder scaffolding (Scott's addition #2) — local/in-app first; iOS PWA push is unreliable per
  brief §3.2 build note, needs a real device check later, not solvable by guessing now.
- Simple chronological timeline (food + glucose + diary together) rather than a correlation graph —
  matches "keep v1 descriptive" (brief §5/§8) and avoids over-building before real data exists.
- No prescriptive/advisory logic anywhere (regulatory + safety guardrail, brief §5/§8).
- Skipping a separate design-tool pass for this round — going straight to a working mobile-first UI
  in code so there's something real to try; can loop in design tooling later if Scott wants a polish
  pass. His call, not treating this as final.

### Built and verified (same session)
**Status: 🟢 working v1 — first commit made.** Vite vanilla-JS PWA scaffolded and running
(`npm install` done, `npm run dev` on :5173, `npm run build` clean). Tested end-to-end in a mobile
viewport (375×812): saved a glucose reading, a food entry (text), and a diary note — all three
appear correctly merged and time-sorted on the Timeline. Settings (glucose-source list, reminder
toggle/time, notification-permission button, mmol/L↔mg/dL unit) and Export (CSV + printable
summary) all wired and checked.

**Structure:**
- `index.html` + `src/style.css` — single-page app, bottom tab nav (Timeline / Glucose / Food /
  Diary / Export / Settings), light+dark via `prefers-color-scheme`, safe-area insets for iOS.
- `src/db.js` — small IndexedDB wrapper (3 stores: glucose, food, diary).
- `src/glucose.js` — the pluggable glucose-source registry Scott asked for (`glucoseSources[]`,
  currently just `manual`) plus save/list.
- `src/food.js` — save/list + `parseFoodWithAI()`, which calls `/.netlify/functions/ai-proxy` and
  degrades honestly to `{configured: false, error}` rather than breaking — correct today (no key
  yet) and correct later (a plain `vite` dev server has no functions endpoint even once a key
  exists; needs `netlify dev` or a real deploy to test the live call).
- `src/diary.js`, `src/timeline.js` (merge + render, `entryBody()` shared with export), `src/
  export.js` (CSV + `printSummary()`), `src/reminders.js` (in-app-only check, explicitly not
  relying on background push).
- `netlify/functions/ai-proxy.js` — Claude vision/text food-parsing proxy, model
  `claude-haiku-4-5-20251001` (cheap/fast — brief's own open question #3 flagged API cost as
  unresolved, so defaulting cheap rather than to Sonnet/Opus). Returns `{configured:false}` with no
  key set; never throws to the client.
- No nutrition-database lookups (Open Food Facts/AUSNUT) wired yet — not in the brief's §10 v1 list,
  correlation is food-timing-vs-glucose, not calorie counting. Fast-follow if Scott wants it.
- Deliberately did **not** add any low/normal/high glucose color-coding or threshold logic — that
  would be Claude inventing a clinical judgment, which is exactly what brief §5/§8 says v1 must not
  do. Timeline shows the raw number only. If Scott (or his doctor) wants a visual flag later, that's
  a fast follow built around a value *he* sets, not one guessed here.

**One bug found and fixed during testing:** the printable-summary export originally used
`window.open()` to show the report in a new window/tab. That's unreliable for a PWA running
standalone on an iPhone home screen (no normal browser chrome for a new window) and can be caught
by ordinary popup blockers. Replaced with an in-page `#print-summary` element + a `@media print`
CSS rule + a direct `window.print()` call — works the same everywhere, no popup permission needed.
Verified the fix by monkey-patching `window.print` in the console rather than actually triggering
the OS print dialog (which, correctly, blocks everything until a human deals with it — fine on
Scott's phone, not something safe to trigger from an automated test).

**First git commit made** (was previously blocked pending Scott's go-ahead — now given, in chat,
2026-09-12: "work as autonomously as you can"). Not pushed anywhere (no remote configured).

### Open / Next (build phase)
- **Not yet live-testable:** AI food parsing needs Scott's dedicated Anthropic key (still not
  generated, per earlier entry) plus either `netlify dev` locally or a real Netlify deploy — a plain
  `vite` dev server can't reach `/.netlify/functions/*`.
- **§4.3 clarifying-question loop: now built.** When Claude's parse comes back with a
  `clarifyingQuestion`, the Food screen shows it with an answer box; submitting re-calls the AI with
  the original text plus the Q&A appended, and repeats if another question comes back. Verified with
  a mocked AI response (low-confidence "mixed pasta dish" → answered "tomato-based" → refined to
  82% confidence, question cleared) since there's still no live key to test the real call. Saved
  food entries correctly carry the *final* (post-clarification) result, not the first guess.
- **Not built yet, deferred from this pass, not forgotten:**
  - Real app icons (shipped a simple placeholder SVG in `public/icon.svg` — installs fine on
    Android/desktop; iOS `apple-touch-icon` support for SVG is inconsistent across iOS versions, so
    the home-screen icon may look plain on Scott's phone until real PNG icons are made — cosmetic
    only, doesn't block using the app).
  - LibreLinkUp polling, Bluetooth meter source (both explicitly deferred in the brief; the
    `glucoseSources` registry is ready for them).
  - Apple Health / Google Health Connect sync (brief §3.3).
- **Still genuinely needs Scott, not decided here:** the surgery-timeline question from the entry
  above (does the GP/anaesthetist export report need to exist by a specific date). Also worth his
  call whenever convenient, not blocking: exact ADACare meter model once it arrives, Anthropic
  budget ballpark.
- Next actions when picking this back up: either keep building (real icons, nutrition-database
  lookups) or pause here and let Scott try the v1 slice first — his call when he checks back in.

### Real data started (2026-09-12, same session) — read this before touching `data/`
Scott started actually using this as a real log the same day it was scaffolded, ahead of an
upcoming nurse visit — a real day's glucose/food sequence, with more readings added through the
day. The app itself isn't deployed anywhere yet (no Netlify site, nothing on his phone), so there
was nowhere durable to log it *in the app*. Handled it as a **local, gitignored `data/` folder**
in this project instead:
- `data/2026-09-12.md` — source of truth, one row per reading/event, meant to be appended to
  through the day (more readings, or new dates as new `data/YYYY-MM-DD.md` files).
- `data/2026-09-12-log.csv` and `data/2026-09-12-log.html` — generated from the `.md`, sent to
  Scott directly (`.html` is print-to-PDF-able) for the nurse. Regenerate both after every append.
- **`data/` is gitignored — never commit anything in it.** This is Scott's real health data; it
  doesn't belong in git history the way the app's own source code does.
- This is a stopgap, not the intended architecture. Brief §7 and Scott's own "health data
  shouldn't default to a shared cloud database" preference both point to this living in the app's
  own IndexedDB on his phone once it's actually deployed — `data/` exists only because that's not
  built/deployed yet. Once it is, the real next step is importing today's `data/*.md` entries into
  the app rather than continuing the file-based log indefinitely.
- **Cross-doc handover pass done (2026-09-12, same session).** Scott asked for this explicitly:
  everything from today recorded and consistent across files, not just in this one.
  - `CLAUDE.md`: added "Privacy & data-sharing principles" (local-by-default, export-only sharing,
    per-person isolation if ever multi-user — Scott's own words, confirmed in chat) and the
    Phase 1/Phase 2 product-scope section from the entry above.
  - Root `PROJECT-REGISTRY.md` (section 13 + quick-reference row) and `MASTER_HANDOVER.md`
    (Active projects table) both updated from "pre-code" to today's actual working-v1 state —
    they were stale, describing the state from before this session's build work.
  - `SCOTT-START-HERE.html`: added a green "🩸 Open the App" button next to the existing black
    "Ask Claude to Build/Fix" one, matching the SfumatoART/Ukulele card pattern. Added
    `vite.config.js` (`server.host = true`) and restarted the dev server so it's reachable at
    `http://172.16.1.70:5173` over LAN WiFi — **temporary**, only works while Scott's Mac and the
    dev server are both on and his phone is on the same network. Real phone access from anywhere
    needs an actual deploy (Netlify, same pattern as SfumatoART) — asked Scott, not done
    unilaterally, since deploy has always been his call on other projects.
- **Deployed to Netlify (2026-09-12, same session).** Live at
  `https://reactive-hypoglycemia-tracker.netlify.app` (team `smfraser60`, site id
  `0b9a9624-13b7-4441-8056-0807f9cbbf7c`) — created and deployed via the Netlify Claude-Desktop
  connector (`netlify-project-services-updater` → `create-new-project`, then
  `netlify-deploy-services-updater` → `deploy-site`, which handed back a scoped
  `npx @netlify/mcp` command run locally to actually upload/build). Verified live: 200s on the
  page and both assets. `SCOTT-START-HERE.html`'s "Open the App" button now points here instead
  of the earlier LAN-IP stopgap — works from anywhere now, not just Scott's home WiFi.
  - **AI key still not set** — that's Scott's own step (Netlify dashboard → Site settings →
    Environment variables → `ANTHROPIC_API_KEY`), never something to do on his behalf even if he
    pastes the value in chat. See `CLAUDE.md`'s "AI / Anthropic key" section for the full Phase 1
    (his own key) vs Phase 2 (bring-your-own-key, if this ever goes public) model — confirmed by
    Scott the same session, several messages, now consolidated there.
- **Mobile design pass (2026-09-12, same session).** Scott asked for a genuinely better, calmer
  visual design (his current CSS is "plain functional"). Drafted 7 mobile mockup screens via
  Claude Design's canvas — Timeline (with a "latest reading" hero card), a redesigned quick-add
  bottom sheet, Glucose entry, Food entry (showing the AI clarify-question loop as a chat bubble,
  not a form), Diary, Export, and Settings — published at
  `https://claude.ai/code/artifact/9b701ac7-5d68-443b-ab2b-e076651be8ee`. **Could not confirm
  saving is enabled in that preview** (no capability roster came back) — treat it as view/export
  only until checked. **One real UX change proposed, not yet built in the real app:** bottom nav
  simplified from 6 tabs to 4 (Timeline, a central "+" quick-add opening a sheet with
  Glucose/Food/Diary, Export, Settings) — fewer, larger, calmer targets. Kept the current teal
  accent (`#1b6e6a`) and the same light/dark-via-`prefers-color-scheme` approach already in
  `src/style.css`; extended it with a softer warm-neutral background, custom SVG icons in place of
  emoji, and a confidence-bar + chat-bubble treatment for the AI clarify flow.
  **Not yet implemented in the real codebase** — this is a design reference for Scott to review
  first; next step (his call) is either "build this into `index.html`/`src/style.css` as-is" or
  iterate on the mockups first.
- **HawkScan (automated security scan) couldn't run**, not skipped by choice: no `hawk` CLI, no
  Docker, no `HAWK_API_KEY` in this environment, and `hawk init` needs an interactive browser login
  this session can't do. Manual care taken instead in the code that's there: user text/photos never
  go into `innerHTML`/`document.write` unescaped (`escapeHtml()` in `export.js`, `textContent` in
  `timeline.js`), the Anthropic key stays server-side in the Netlify function and is gitignored, no
  secrets committed. Worth an actual HawkScan pass once `hawk` is set up and there's a real deployed
  target to point it at.
