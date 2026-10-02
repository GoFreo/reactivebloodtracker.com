# Reactive Hypoglycemia Tracker — Handover

## Status: 🟢 live, in daily use, heading public — reactivebloodtracker.com

Read the **At a glance** block below first. Everything after it is dated history (read bottom-up for
detail). **Scope changed 2026-09-28:** public app, bring-your-own Anthropic key, diabetes and insulin
as well as reactive hypoglycemia. See the top of `CLAUDE.md`.

## At a glance — current state as of 2026-09-28 (supersedes the 2026-09-20 block)

**Live:** `reactivebloodtracker.com` serves `main` (always confirm by matching the live
`assets/index-*.js` name against a fresh `dist/`). `main` == `origin/main` on
`github.com/GoFreo/reactivebloodtracker.com`.
**Health:** `npm test` **734 passed / 14 skipped / 0 failed** on `main` as of 2026-10-03 (skips: WebKit
photo-save gaps, the opt-in live food check ×4, the phone-only install-tip test on desktop ×2, and the
Bluetooth-sequence test on WebKit ×2) across 4 browser projects.
**➡️ Dexcom (2026-10-03):** Connect Dexcom is built and live; waiting on Scott to put `DEXCOM_CLIENT_ID` /
`DEXCOM_CLIENT_SECRET` into Netlify, then on Dexcom's Limited Access approval. See the 2026-10-03 entry at the bottom.
**Deploy (manual, from this Mac):** `npm test` → `npm run build` →
`npx netlify-cli deploy --prod --dir=dist --functions=netlify/functions --skip-functions-cache --site=0b9a9624-13b7-4441-8056-0807f9cbbf7c`.
**`--skip-functions-cache` is required.** Without it Netlify has silently shipped a stale function
bundle. Env-var changes only reach functions after a redeploy. Check function logs with
`npx netlify-cli logs --function cgm-sync --since 30m`.

**What the app does now:** Home quick entry (glucose / food / diary); Accu-Chek Guide Me over Web
Bluetooth (Chrome only); **Libre 2 Plus CGM sync via LibreLinkUp** (`netlify/functions/cgm-sync.js`,
passcode-gated, stores nothing server-side); **"why did your sugar spike?" prompts**
(`src/spikeDetection.js`); Readings → List / **Graph** (redesigned 2026-10-02: smoothed average line,
peaks/troughs labelled, shaded low/high threshold-crossing bands + a list, gaps shaded, finger-pricks as
diamonds, meal markers — same graph embedded in the printable report) / **Meals** (5-hour outcome per
meal, `src/mealOutcome.js`); barcode + Open Food Facts; photo import; AI food parsing (Scott's key);
thresholds with the ADA floor; CSV import/export and a printable report; Food Guidance; **animated
opening** (red droplet lands on a spring); red-droplet icon with real PNGs (`scripts/render-icons.mjs`);
device confirmed Dexcom **ONE+** (not G7 as earlier assumed — arrived 2026-10-02, real sync blocked on
Scott's own Dexcom developer registration, see that date's entry).

**✅ SHIPPED 2026-09-30 22:48 (Scott: "ship it") — live bundle `index-BC4Ox0Ns.js`, `main` @ `9b83056` pushed to GitHub, `cgm-sync` answers 401 without a passcode (correct):** on a phone turned
sideways, Readings shows the **graph on the left and the list on the right** at once (list scrolls on
its own; toggles compacted so both fit above the bottom menu at 844×390). Portrait, Meals, tablets and
desktop are unchanged (media query `(orientation: landscape) and (min-width: 560px) and (max-height:
600px)`); rotating re-lays it without a reload. `npm test` **512 passed / 12 skipped / 0 failed** (new
test runs on iPhone + Android projects). `main` untouched. **Needs Scott:** "ship it" (merge →
build → deploy with `--skip-functions-cache`, as above); and whether tablets/desktop should split too.
The graph is small in this layout — the planned graph redesign is the natural follow-up.

**CGM sync status:** all three Netlify values are set (live endpoint answers 401 "Wrong sync passcode"
to a passcode-less probe, which is correct). **Scott has not yet made a sync attempt from his device**
(no calls in the function logs). If it fails, his screen now shows the exact reason.

**Needs Scott:** first real Sync CGM tap (hard-refresh first; his home-screen shortcut may hold an old
copy); Anthropic monthly spend limit; optional Netlify ↔ GitHub continuous deploy.
~~yes/no on proposed-patches/2026-09-20-photo-downscale-and-proxy-caps/~~ — **stale, corrected
2026-10-02:** this was already applied 2026-09-28 (see that date's entry below); the patch folder's own
status line just never got updated to say so. Fixed now; folder left in place as a record.

## 2026-10-02 — Session restart after worktree deletion; bluetooth silent-reconnect applied; test-suite fixes

Picked this up fresh (the old git worktree this project ran from was deleted; working directly in the
origin repo now, at its new iCloud-consolidated path). Read `CLAUDE.md`, this file in full, and the new
memory notes (`batch-questions-keep-working`, `holding-folders-and-sitreps`) — both say: answer logical
questions yourself, log the decision here, don't stall waiting on Scott for things that aren't his to
decide.

**Found and fixed, while catching up:**
- The stale photo-patch note above (already applied, docs just didn't say so).
- **`proposed-patches/2026-10-01-bluetooth-reconnect/`** — a fully-written, reasoned patch (silent
  Bluetooth reconnect via `navigator.bluetooth.getDevices()`, so "Sync meter" doesn't re-show Chrome's
  device picker every time) sitting unapplied, written by a session running in a Linux VM that couldn't
  run this project's real Playwright suite (needs native macOS `rolldown` bindings). Applied it
  (`git apply` — clean), then actually ran the real suite, which the other session explicitly couldn't:
  **the 6 new tests failed** — this Node version (v24) defines a built-in getter-only `navigator` global,
  so `globalThis.navigator = {...}` throws here even though it apparently didn't wherever that session
  verified it standalone. Fixed the test file to stub via `Object.defineProperty` instead (restored in
  `afterEach`). All 24 (6 cases × 4 browser projects) pass now.
- **Unrelated pre-existing test bug, found while verifying the above:** "locking a date format overrides
  the automatic one in the Readings list" was failing on all 4 projects — not caused by the bluetooth
  patch (confirmed: it failed identically before that patch was applied too). Root cause: the test
  computed "today" via `new Date().toISOString().slice(0,10)` (UTC), but `formatDate()`'s locked "ymd"
  format uses local date getters (`getFullYear()`/`getMonth()`/`getDate()`, `src/dateformat.js`) — on
  this machine (Australia/Hobart, UTC+10) the two disagree for part of every day, which is exactly when
  this ran. Fixed to compute "today" from local components, matching what the app itself does.
- **Full suite now: 536 passed / 12 skipped / 0 failed** (up from 510/10/0 at the last "At a glance"
  update — the extra 24 are this session's new bluetooth tests actually passing, with the test-bug fix
  included). Committed and deployed (see below).

**New research brief (v4) saved.** Another `glucose-food-tracker-research-brief.md` had been dropped at
the project root (same pattern as before — not in `research/`). Diffed against the existing v3: new
content this time — a note that Scott's own live Libre 24-hour graphs now show the real dip pattern the
app is meant to catch, useful as real ground-truth to validate the food-correlation logic against,
instead of only synthetic test personas. Saved as `research/2026-10-02-research-brief-glucose-food-tracker-v4.md`.

**Found, not yet actioned — needs a decision, not urgent:** four uncommitted files at the project root
from 2026-10-01, not mentioned anywhere in this file: `demo-data-README.md`, `demo-data-full-fidelity.json`,
`demo-data.csv`, and `video-script-and-production-notes.md` — a well-built synthetic 3-day demo dataset
(built against the real entry shapes in the app's own source, not guessed) plus a matching ~3.5–4 minute
demo-video script, apparently for showing the app to a doctor/DVA/family. Looks like finished, genuinely
useful work that just never got logged or committed. Left in place rather than guessed at — **Scott's
call:** commit these into the repo (they're synthetic demo data, not his real `data/`/`food photos/`), or
they were a one-off and can be swept aside. Flagging rather than deciding, since "is this still wanted"
isn't a logical default I can make for him.

**Not yet done — explicitly next, per the standing "NEXT SESSION STARTS HERE" plan above:** the graph
redesign (smoothed line, peaks/troughs, threshold-crossing shading) and "Report a problem" — both marked
"no Scott input needed," so that's where this session goes next.

**✅ Shipped 2026-09-28 late evening (Scott: "ship it"):** meal builder, Readings filter chips, the pantry test
starter and the barcode 404 fix — merged into `main` (`1085eef`), `npm test` 294 passed / 6 skipped / 0 failed,
deployed with `--skip-functions-cache`, live bundle `index-DlnIf1SS.js` confirmed on reactivebloodtracker.com,
`cgm-sync` answers 401 without a passcode (correct), pushed to GitHub. Branches `meal-builder` and
`readings-filter` are fully merged (safe to delete later).

**✅ My foods + household food bank + portions: SHIPPED 2026-09-28 20:37** (Scott: "ship it"). Merged
(`be32994`), 354 passed, deployed with `--skip-functions-cache`, live bundle `index-DDVhxCaK.js`,
`/.netlify/functions/food-bank` answers 401 without / with a wrong passcode (correct). **Not yet verified:** a
real save to Netlify Blobs — needs Scott's passcode; his first scan at Coles is the test.

**✅ First-run opening + no keyboard on open + "Your setup" in Help: SHIPPED 2026-09-28 22:21** (Scott's design).
Live bundle `index-Ct3LwouD.js`; 510 passed / 10 skipped / 0 failed. Scott: "at this stage it's pretty much all I
can think of" for how he'd use it.

**✅ Header + install tip + passcode drop-down: SHIPPED 2026-09-28 22:05** (Scott's requests). Live bundle
`index-C4wNG0qk.js`; 498 passed / 10 skipped / 0 failed; manifest name "Reactive Blood Tracker".

**✅ Photo patch + smaller saved photos + Libre passcode fix: SHIPPED 2026-09-28 21:58** (Scott: "apply the photo
patch and shrink saved photos too"; then he reported "password input not asked for"). 492 passed / 8 skipped /
0 failed; live bundle `index-C3HAhE-u.js`; `ai-proxy` now answers a malformed body with 400 (patch working);
`cgm-sync`/`food-bank` 401 without a passcode. The photo patch is no longer pending.

**✅ Help & sources + welcome + list paging + saved meals: SHIPPED 2026-09-28 21:02** (Scott: "ship it").
Merged `saved-meals` (which contained `cleanup` and `help-and-welcome`) → `f58136b`; 390 passed / 6 skipped /
0 failed; deployed with `--skip-functions-cache`; live bundle `index-DjqrV9VQ.js`; welcome, Help and saved-meal
markup confirmed on the live page; `food-bank` and `cgm-sync` answer 401 without a passcode. Branches deleted
locally and on GitHub. Scott will see the welcome screen once. **Still open:** lawyer review of the Help and
welcome wording before going public.

**➡️ NEXT SESSION STARTS HERE — Scott's 2026-09-28 22:23 requests, planned not built** (full plan in the dated
entry at the bottom of this file): (1) graph redesign — smoothed line, peaks above / troughs below, low and high
threshold crossings highlighted; (2) "Report a problem" in the app; (3) people who monitor (family, carers,
diabetes educator, endocrinologist); (4) a letter to doctors, drafted in
`research/2026-09-28 DRAFT letter to doctors.md`. Build in that order; (1) and (2) need nothing from Scott. **22:40 — Scott asked again for Settings → "My devices" (add/change a device: Accu-Chek, Libre, Dexcom ONE+, others): promoted to build right after the graph** (backlog item 5 below). *(Device corrected 2026-10-02: Scott confirmed ONE+, not G7, on arrival — see that date's entry.)*

**Agreed build order (next first):** ~~meal builder~~ (built, on its branch) → sharing with roles (owner / co-logger / viewer, encrypted, opt-in) → "tell my family if I
go low" → exercise (iPhone Shortcut route — **confirmed worth building, 2026-10-02:** Scott notes Dexcom's
own app has an Apple Fitness/steps option that "works well" — expected, since it's a native app with
HealthKit access this web app structurally can't have; doesn't change the Shortcut-import route, just
confirms the correlation itself is genuinely useful) → Dexcom ONE+ source (arrived 2026-10-02, not yet built — see that
entry for what it needs from Scott first) → going public
(BYO key + condition profile: reactive / type 1 / type 2 / insulin; insulin **logged only, never a dose
calculator**).

**Polish idea, captured not built (Scott, 2026-10-02):** on the opening/splash screen, a dark-to-light
wave sweeping left-to-right across the whole screen (not just the droplet/spring), staying within the
existing teal palette — no new colours. Not a literal water wave; an artistic "blood flowing / blood
bouncing" brightness effect tying into the app's subject matter and the existing spring-bounce
animation. His own words: "just artistic thought" — exploratory, not a tight spec; whoever builds it
has latitude on the exact motion (an animated linear-gradient sweep across the splash background, in
shades of `--accent`, is the obvious technical route). No urgency attached.

**Deliberately not built — don't add without asking:** portion/"safe amount" advice or any dosing
suggestion; a low threshold below the ADA floor; anything that syncs to a cloud by default; scores
that grade the user; any SparkyFitness source (non-commercial licence).
**Never touch:** `data/` and `food photos/` (Scott's real health data, gitignored). Never enter
credentials or API keys anywhere, in any tool.
**SITREP:** one living artifact, https://claude.ai/artifact/QhRy9XngkyybAL5K5upcFz (republish to it).
**Research:** https://claude.ai/artifact/Ya7Fr1FHxAj1iVfrHwGNNc (ten-app field study, 2026-09-28).

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
  - **AI key added by Scott himself (2026-09-12), in progress.** He added `ANTHROPIC_API_KEY` as a
    Secret env var (same value for all deploy contexts) — verified via the Netlify connector that
    it's actually set (never saw the value itself). Hit a real Anthropic account issue testing it
    live: `"This API key is not scoped to a workspace..."` — his key needs an
    `anthropic-workspace-id` header. Added optional `ANTHROPIC_WORKSPACE_ID` env-var support to
    `ai-proxy.js` for this (sent as a header only if set; redeployed). **Still needs Scott:**
    either generate a new key from inside a specific workspace in console.anthropic.com (simplest,
    no further code changes needed — just replace the `ANTHROPIC_API_KEY` value), or find his
    workspace ID and give it to me to set as `ANTHROPIC_WORKSPACE_ID`. See `CLAUDE.md`'s "AI /
    Anthropic key" section for the full Phase 1 (his own key) vs Phase 2 (bring-your-own-key, if
    this ever goes public) model.
  - **Confirmed working end-to-end (checked 2026-09-14):** `curl -X POST
    https://reactive-hypoglycemia-tracker.netlify.app/.netlify/functions/ai-proxy -H
    "Content-Type: application/json" -d '{"text":"a slice of toast"}'` returns a real
    `configured:true` Claude response (food name, portion estimate, confidence, clarifying
    question) — whatever fix Scott applied between 2026-09-12 and now resolved the workspace-id
    issue. The AI photo/text food-parsing feature is genuinely live, not just plumbing-in-place.
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
  - **Reviewed and fixed before calling it done.** A read-only review pass (background agent, per
    the design skill's own "check complex work afterwards" step) found real issues, all fixed and
    republished to the same link: (1) six CTA/FAB shadows were hardcoded to the light-mode teal's
    RGB instead of a token, so they wouldn't adapt in dark mode — added an `--accent-rgb` token
    pair (light `27,110,106` / dark `79,195,188`) to every artboard's own token set and routed the
    shadows through it; (2) several tap targets were under the 44px minimum the brief itself
    called for — back-chevrons and the mic icon had no hit-area padding, the clarify send button
    was 40px, the clarify answer field and Glucose's unit/time pills were ~30-36px tall, Export's
    date fields were ~41px; all bumped to 44px+; (3) the bottom-nav links in Main/Export/Settings
    only wrapped their icon+label content (~39px) despite the bar looking 82px tall, because the
    container used `align-items:flex-start` — changed each link to `height:82px` so the entire bar
    segment is the real tap target, not just the visible icon; (4) a `--warn-border` token in
    `Food.dc.html` was defined but never used — wired it onto the low-confidence AI-result card's
    border instead of deleting it, since the card is showing exactly that state.
- **Real automated smoke-test suite added (2026-09-12).** Everything up to now had been manual
  clicking-through in the Browser pane — Scott explicitly asked for real, repeatable smoke tests
  before deploys. Added Playwright (`tests/smoke.spec.js`, `playwright.config.js`), `npm test`
  script. 10 tests, all passing against a real production build+preview (not the dev server):
  app shell/nav, glucose entry, diary entry, food entry (AI-unavailable path + the full
  clarify-question loop via a mocked network route — no real Anthropic calls in tests), settings
  (unit propagation, reminder banner), export (CSV content checked, printable summary checked with
  `window.print` stubbed so it can't hang the test run the way it hung manual browser testing
  earlier). This is now a standing pre-deploy gate — see `CLAUDE.md`'s "Testing" section. Grow this
  suite with every new feature; don't let it go stale.
- **Splash screen added (2026-09-12).** Scott's ask: don't land straight in Timeline with no
  identity — icon + brief tagline first. Fixed teal overlay (`#splash` in `index.html`), ~900ms
  hold then a 400ms fade (`src/style.css`, `src/main.js`), reveals the already-rendered app
  underneath — not a real loading gate. Verified the smoke suite still passes with it in place.
- **"Ask Gemini / New Tab / All Tabs" — not this app.** Scott described a confusing "black box"
  screen mentioning these. That's his phone browser's own toolbar (Chrome), not anything in this
  codebase — a website cannot rename or remove another app's UI. Told him **Add to Home Screen**
  opens the PWA standalone with zero browser chrome, which should resolve the confusion entirely.
  Noting this here so a future session doesn't go looking for "Ask Gemini" in the source — it was
  never there.
- **Feature request, deliberately not built yet: multiple meal-timed reminders** (2026-09-12).
  Scott wants reminders tied to each meal through the day (before breakfast, after breakfast, 2nd/
  3rd/4th/5th meal, etc.), not just the single daily on/off + time that exists now
  (`src/reminders.js`). He explicitly said he's still thinking through the exact shape of it — do
  **not** build a multi-reminder UI from a guess at the structure; wait for him to specify it
  further (how many, meal-relative vs fixed times, editable list vs fixed slots) before touching
  `reminders.js`/Settings.
- **Landing page concept drafted (2026-09-12).** Scott asked for a marketing landing page, "between
  you and design." Checked `research/` first for the competitor-analysis task he separately gave
  Cowork — nothing new has landed (still just the two brief versions), so built this from the
  brief's own §9 competitive-landscape table (real researched pros/cons on MySugr, Levels,
  Nutrisense/Signos, generic AI calorie apps) rather than waiting idle or inventing claims.
  Published as a separate design canvas (private, view/export only — same unconfirmed-saving
  caveat as the mobile mockups): `https://claude.ai/code/artifact/be976b72-3e52-4bef-9bff-7445333b385f`.
  Framed honestly as "not yet publicly available" with a mailto CTA (`[your contact email]`
  placeholder — Scott needs to decide what address, if any, before this could ever go live) rather
  than a fake signup form with no backend behind it. **If/when Cowork's competitor research does
  land in `research/`, revisit this page's comparison section against it** — it may have more
  current or detailed findings than the original brief's §9.
- **Product-direction idea, not built (2026-09-12): separate mobile + desktop experiences with
  shared data.** Scott's framing: mobile stays quick-entry (like now); a desktop version (same
  pattern as SfumatoART working better on a computer) could add richer glucose/food trend graphs —
  which is exactly the "descriptive correlation" feature already planned in the "Descriptive, not
  prescriptive" section above, just needs a real home once there's enough logged data to chart.
  **The real open question, not resolved:** "shared data between the two" means syncing between
  Scott's own devices, which is a genuinely bigger architecture piece than exists today — current
  storage is local-only per-device by design (his own privacy principle, `data/*` gitignored, no
  backend). Some form of cross-device sync (even just between his own phone and Mac, never a
  third party) would need real design work, not a quick add-on. Scott called this "food for
  thought," not a build request — don't start architecting sync without him deciding he wants it.
- **Custom domain: reactivebloodtracker.com — HTTPS confirmed working (checked 2026-09-14).**
  Scott registered it ($17/yr, 2026-09-12) and set it as the Netlify project's primary domain
  himself. As of 2026-09-12 the certificate hadn't issued yet (serving Netlify's generic wildcard
  cert). **Now resolved:** `curl -v https://reactivebloodtracker.com/` shows a real cert issued for
  `CN=reactivebloodtracker.com`, verified OK, expiring 2026-12-11, serving HTTP/2 200. The earlier
  caution about not switching references over from the `.netlify.app` URL no longer applies — the
  custom domain is safe to use/link now, Scott's call on whether/when to actually switch
  `SCOTT-START-HERE.html`'s button or anything else over to it.
- **Landing page rebuilt as a real responsive page (2026-09-12), replacing the design-canvas
  draft.** Scott reported the design-canvas version didn't scale properly to different window
  sizes — correct: it was a fixed 1440px-wide mockup, and the canvas tool's own editor chrome
  (fixed artboard frames, expand/fit-vs-fill) isn't the right vehicle for "something I can pull up
  and show a doctor on any device" anyway. Rebuilt from scratch as a plain, directly-published
  Artifact (fluid CSS, `clamp()` type scale, real `@media` breakpoints, no design-canvas editor
  involved) — genuinely responsive at any real window size: `https://claude.ai/code/artifact/7042f69a-fb21-4738-930e-bf0084828741`.
  - Did brief competitive-design research first (levelshealth.com, ouraring.com) rather than
    guessing at "flashy" — landed on an editorial direction distinct from both: near-black/warm-
    stone palette, Newsreader (serif headlines) + IBM Plex Sans/Mono (body/data), and a hero built
    around an actual glucose-response curve (rise → crash → recovery) as the dominant visual —
    genuinely subject-specific, not a stock hero image or generic gradient.
  - Added a small spring-coil detail under the nav logo's drop, per Scott's ask — works fine at
    that slightly-larger logo size; the tiny 60px home-screen app icon stays without it (a literal
    coil doesn't read at that size, confirmed earlier).
  - **Real bugs found and fixed while checking the render before publishing** (per the artifact
    design process's "look once" step): an invalid `height="auto"` SVG attribute (SVG doesn't
    accept that as a presentation attribute the way CSS does) that silently broke the hero chart;
    a `stroke-dashoffset`-based line-draw animation that left the hero's main visual invisible
    until the animation finished — exactly the "hidden until JS/animation completes" anti-pattern
    to avoid, since a fast screenshot, slow load, or PDF export would show nothing there (replaced
    with an always-visible curve + a non-hiding pulse on the marker dot only); an `align-items:
    center` on the two-column hero that created an odd empty-looking gap in the shorter column
    once scrolled to mid-height (changed to `align-items:start`).
  - Softened a specific "$125/yr" competitor-pricing callout to a general "Subscriptions" stat,
    consistent with the same fix already applied to the comparison table — a named competitor's
    exact price, stated as fact with no citation, risks being wrong or stale.
  - Contact CTA still uses a `[your contact email]` placeholder — needs Scott's decision before
    this could ever be shared beyond this private link.
- **Playwright suite expanded to real cross-browser/cross-device coverage (2026-09-12).** Was
  Chromium-only. Scott asked for confidence across Android/iOS/Mac/PC specifically. Added Desktop
  Safari and Mobile Safari (iPhone 14) projects alongside the existing Desktop Chrome and Mobile
  Chrome (Pixel 7) ones — Chromium engine stands in for Chrome/Android, WebKit for Safari/iOS/Mac.
  **This immediately found a real issue**: the clarify-loop test's mocked AI-proxy route was
  silently not intercepted under WebKit specifically — the app's own service worker (registered in
  `src/main.js`) was grabbing the fetch first, a known WebKit-vs-Chromium Playwright difference.
  Not a product bug (the real deployed AI integration was already verified working via curl against
  the live site) but a real test-isolation gap that only cross-engine testing surfaces — fixed with
  `serviceWorkers: "block"` in `playwright.config.js`'s test context. All 40 tests (10 tests × 4
  projects) pass. `npm test` now runs this full matrix by default.
- **HawkScan (automated security scan) couldn't run**, not skipped by choice: no `hawk` CLI, no
  Docker, no `HAWK_API_KEY` in this environment, and `hawk init` needs an interactive browser login
  this session can't do. Manual care taken instead in the code that's there: user text/photos never
  go into `innerHTML`/`document.write` unescaped (`escapeHtml()` in `export.js`, `textContent` in
  `timeline.js`), the Anthropic key stays server-side in the Netlify function and is gitignored, no
  secrets committed. Worth an actual HawkScan pass once `hawk` is set up and there's a real deployed
  target to point it at.

## 2026-09-14 — Undocumented artifact found and logged: competitor UX teardown

Picked this project back up per Scott's standing "check artifacts each time" instruction — found a
"Glucose App Teardown" artifact dated 13 Sep 2026
(`https://claude.ai/code/artifact/a423ccf8-f703-42e9-a3f2-9b47a468802a`) that was never logged here.
Made from a different kind of Claude session (its own closing note says it tried and failed to get
folder access to this project via a device bridge — a limitation this Code session doesn't have),
so the handoff only existed as the artifact link itself. Read in full (it embeds five App Store
screenshots as base64 images, stripped those out to read the actual analysis text).

**Content:** a genuine layout audit comparing five real apps' actual App Store screens (not
marketing sites) — mySugr, Levels, Nutrisense, FreeStyle LibreLink, and Cal AI (photo-food-logging
only, not glucose). Six patterns flagged as worth reusing: (1) LibreLink's one-number/one-band/
one-arrow "right now" screen kept separate from a "today's chart" screen rather than merged into
one crowded view; (2) Nutrisense shading the safe range and recoloring the line/number on leaving
it; (3) Levels labelling the spike value directly on the chart ("+68") instead of making the reader
do the maths; (4) Cal AI's labelled leader-lines drawn on the actual photo before asking for
confirmation — the closest live example of this app's own "show your work, then let the person
correct it" rule (see "Descriptive, not prescriptive" above); (5) one home screen with every input
method one tap away; (6) 7d/14d/30d/90d chips answering "today" and "is this a pattern" on one chart.

**The actual point of the teardown:** all five apps are built for diabetes, where the danger is
highs — lows get a thin line at best, nowhere near the visual weight highs get. This app's danger
runs the opposite way, which is exactly the gap none of the five fill. Recommends giving lows the
same visual treatment (red band/number/down-arrow) — **not implemented, and shouldn't be without
Scott picking the actual threshold value first**, per this file's existing "Descriptive, not
prescriptive" rule reserving clinical-adjacent judgment calls for him, not an invented default.

**Still open:** this sits alongside the 2026-09-12 mobile-mockup review
(`9b701ac7-5d68-443b-ab2b-e076651be8ee`) as unbuilt design input — neither has been turned into the
real `index.html`/`src/style.css` yet. The live site (`reactive-hypoglycemia-tracker.netlify.app`)
is up and verified responding as of this check, so a future session can do the before/after
screenshot comparison the teardown's own closing note asked for, directly, without re-asking Scott
for screenshots.

## 2026-09-14 — Accu-Chek meter connectivity: Scott actively trying to hook it up, research done

Scott has an Accu-Chek meter physically connected to his Mac right now, in what he calls "PC mode,"
and wants the Tracker to read glucose data directly from the meter rather than manual entry. He'd
already looked at Accu-Chek's own apps online and found it hard to tell which one matches his meter.
**Model not yet confirmed** — asked him for the exact name printed on the meter itself (Guide, Guide
Me, Instant, Aviva, Aviva Connect, Performa, Performa Nano, Mobile, etc. all exist and connect
differently); update this entry once known.

**Researched today, real findings, not guesses:**
- **The wired "PC mode" / USB path has no public protocol.** Roche does not publish it — a developer
  who asked directly and offered to sign an NDA was still refused (see sources below). Meters that
  use this path talk to Roche's own Smart Pix reader or Accu-Chek 360° software, not to arbitrary
  third-party apps. Treat "read the raw signal off the wire" for this path as not realistically
  buildable without reverse-engineering — fragile, unofficial, and not something to promise Scott.
- **The Bluetooth path is genuinely different and more promising, if his model has it.** Several
  Accu-Chek meters (Guide, Guide Me, Instant, Aviva Connect) use standard Bluetooth Low Energy and
  the Bluetooth SIG's own standard **Glucose Service** profile — a public spec any BLE client can
  read, independent of Roche. This is confirmed working in the wild (a public Python example reads
  an Accu-Chek meter this way over BLE). If Scott's model has this, the app could read it directly
  via the **Web Bluetooth API** — but only from Chrome (Mac or Android); **Safari/iOS has never
  supported Web Bluetooth**, an Apple platform restriction, not something buildable around. Given
  Scott is on an iPhone day-to-day (per this file's PWA/iOS notes elsewhere), this path would only
  work from his Mac in Chrome, not from his phone.
- **Realistic fallback that works regardless of model, buildable now:** whatever Roche software his
  cable/PC-mode setup already exports to (Smart Pix or Accu-Chek 360°) can save a report/CSV file.
  Adding a "import from file" option to the `glucoseSources` registry in `src/glucose.js` — built
  for exactly this kind of new-source addition — would let Scott load a batch of readings from that
  export instead of typing each one by hand, without needing any undocumented protocol at all.
- Sources checked: [Accu-Chek Smart Pix Software](https://www.accu-cheklatam.com/en/products/apps-software/smart-pix-software) · [RocheDiabetes Care Platform Connectivity Guide (PDF)](https://www.accu-chek.co.uk/hcp/sites/g/files/papvje326/files/2024-05/RocheDiabetes%20Care%20Platform%20Connectivity%20Guide%20-%20December%202023.pdf) · [Accu-Chek Guide Me Meter](https://www.accu-chek.com/products/meters/guide-me) · [Reading Glucose Data from an Accu-Chek Meter using BLE and Python](https://medium.com/@victoradrianjimenez/reading-glucose-data-from-an-accu-chek-meter-using-bluetooth-low-energy-and-python-acf199a7535e) · [Decoding the Accu-Chek Active IR Protocol](https://people.bath.ac.uk/enpsgp/Zaurus/accu-chek.html) (old model, reverse-engineered, illustrates why Roche's protocols are treated as closed).

**Not yet actioned in code** — waiting on the model confirmation from Scott before building anything
(CSV import vs. Web-Bluetooth-on-Mac-only are different features with different scope).

## 2026-09-14 — Meter model confirmed: Accu-Chek Guide Me (correcting an earlier wrong guess)

**Correction, not just an update:** earlier today, from a photo of the meter's rear label (SN/GTIN/MODEL/PIN
fields, Mannheim-Germany manufacturing, a biohazard mark), this file's prior entry guessed the device
was an **Accu-Chek Inform II** — Roche's hospital point-of-care meter, not a personal device. That
guess was inference from indirect label styling, not a confirmed match (the exact GTIN never turned
up in search), and it turned out to be wrong. **Direct confirmation from ADACare (Amy, on a recorded
call with Scott, 2026-09-14) says the device is an Accu-Chek Guide Me** — Scott confirmed "that's
what I've got in my hand." Trust this over the earlier label-based inference; correcting the record
here rather than leaving two contradictory entries standing.

**What this actually means, confirmed via search (not the same device as the wrong earlier guess):**
- Guide Me is a real consumer meter with **two independent connections**: Bluetooth (pairs with
  Roche's own mySugr app) and a **USB port for PC transfer** — this is what Scott saw as "PC mode"
  and the "mini USB jack on the side" he described to the ADACare nurse. Source:
  [Accu-Chek Guide Me — Bluetooth & USB Data Transfer](https://xeteor.com/roche-accu-chek-guide-me-meter-bluetooth-capability/),
  [mySugr: Connect Accu-Chek Guide Me](https://support.mysugr.com/hc/en-us/articles/360004201280-How-to-Connect-Accu-Chek-Guide-Me-with-the-mySugr-app).
- The Bluetooth side is the promising path: Guide/Guide Me meters are documented in the diabetes-tech
  community as using the Bluetooth SIG's standard **Glucose Service** profile (see the earlier
  2026-09-14 entry above citing a public Python BLE example reading an Accu-Chek meter this way) —
  a public spec, independent of needing mySugr or any Roche blessing. If confirmed for this exact
  meter, the Tracker could read it directly via the **Web Bluetooth API** — but only from Chrome
  (Scott's Mac or an Android phone), never from Safari/iOS, which has never implemented Web Bluetooth
  (an Apple platform restriction, unrelated to Roche or this app). Scott is mobile-first on an
  iPhone day-to-day, so this path would only work when he's specifically on his Mac in Chrome.
- The USB/PC-transfer side: real, but no more documented for this specific model than the general
  finding already in the 2026-09-14 entry above (Roche does not publish the wire protocol even to
  developers who ask directly). Don't assume Guide Me's USB side is more open just because the
  device itself turned out to be a normal consumer meter — that hasn't been separately confirmed.
- **Not yet built either path** — this is confirmation of what's possible, not new code. Next step
  when picked up: try pairing the Guide Me with a Chrome browser's own Bluetooth device picker (from
  Scott's Mac) to see whether it actually exposes the standard Glucose Service, before writing any
  Web Bluetooth code against it.

## 2026-09-14 — Libre 2 Plus supply status (from the same ADACare call)

Sensors were dispatched by Abbott on **Monday 2026-09-07**. ADACare followed up Friday 2026-09-11
with no reply, followed up again urgently the morning of this call (2026-09-14) — no tracking number
yet, unusual delay by ADACare's own account (possibly related to Abbott mid-transition between the
Libre 2+/3+ model lines, per the call). ADACare will email Scott (smfraser60@gmail.com, replacing an
earlier contact "Alex" who has left) with a tracking number once Abbott responds. Still "pending
supply," per the standing note elsewhere in this file — no change to build priorities from this, just
a real ETA data point. ADACare's test-strip supply defaults to a 3-month auto-resupply cadence sized
to 3 tests/day unless Scott calls to adjust it up or down — general life-admin context, not something
the app needs to model.

## 2026-09-14 — Major build session: Home screen rebuild, thresholds, Bluetooth, barcode scanning

Scott gave a large batch of product direction in one sitting (an unrelated AID-app screenshot for
UI inspiration, the ADACare phone-call transcript above, then a prioritized "just get it done, I'm
leaving you to it" instruction), then stepped away. This entry captures everything built, tested,
and decided in that session — read it in full before touching Home/Readings/Settings again, since
it supersedes several earlier "not built yet" notes above. `npm test` was green (100/100) at the
end of every step described below, not just at the very end.

### Home screen rebuilt around one working screen (Scott's explicit spec)

Replaced the old Timeline/Glucose/Food tab split with a single Home screen: a "latest reading" card
up top, a glucose quick-entry form, then a food quick-entry form (text + camera + barcode + save)
directly underneath — matches what Scott described in detail ("one big working screen... different
ways of inputting data placed in the correct area"). Nav is now three tabs — **Home · Readings ·
Settings** — with Diary and Export reachable as smaller secondary links from Home rather than
top-level tabs (kept, not dropped — Scott didn't ask to remove either, and Export is what goes to
his nurse). **This supersedes the earlier 2026-09-12 4-tab-+-FAB mobile mockup review
(`9b701ac7-...`) as the actual build direction** — that mockup was never built into real code, and
today's direction came directly from Scott, more specific and further along than the mockup.

**Home screen pieces:**
- Latest-reading card: big number + unit, a **freshness label** ("4 min ago" → "2h ago" → falls
  back to a full date past 24h), and a **trend delta** ("+0.6"/"−0.3") against the previous
  reading — both ideas came from the AID-app screenshot Scott shared; its insulin-dosing specifics
  (carb boluses, units/hour) don't apply here, but the glanceability pattern does. Delta converts
  units first (`convertUnit`) so a mixed mmol/L-then-mg/dL history still compares correctly.
- Food entry got **recent/frequent suggestion chips** (`src/foodSuggestions.js`) — no AI, pure
  local frequency+recency over what's already saved — tap one to reuse a common meal instead of
  retyping it. Matches Scott's "if it becomes a regular thing" ask.
- Camera button restyled from a bare file input into a proper icon button (same underlying AI-photo
  flow, unchanged). **Barcode button is now real** — see below, not a placeholder.
- Every entry (glucose, food) keeps its own independently-editable time field — already true before
  today but reconfirmed as intentional: Scott wants "was this before or after breakfast" to always
  be his own call per entry.

### Readings screen: list/graph toggle + time-range chips

Renamed from Timeline. List view unchanged in substance. Added a **Graph view** — a hand-rolled
inline SVG line chart (no charting library; this app's own descriptive-not-fancy correlation
principle doesn't need one) with **2h/4h/6h/12h/24h/7d range chips** (`GRAPH_RANGES` in
`src/timeline.js`), again from the screenshot Scott shared. Default range is 24h. Display mode
(list vs graph) is a Settings-level choice, persisted, also directly togglable from the Readings
screen itself.

### Glucose warning thresholds — built, with a floor Scott explicitly designed

Settings now has Low/High threshold fields (`src/thresholds.js`), **blank by default** — nothing
gets colored anywhere (Home's latest-reading card, the Readings list's left-border, the graph's dot
colors) until Scott fills them in himself. This is the "give lows the same visual weight as highs"
feature the 2026-09-13 competitor teardown recommended, built the way this file's "Descriptive, not
prescriptive" section already required: the app never invents the clinical number.

**The floor rule (Scott's own explicit design, his driving-limit analogy — "I drive to a 5 limit
even though the real risk starts around 4.6-4.7"):** the **low** threshold can be raised above a
recognized standard for extra personal margin, but this app will not let it go *below* that
standard. Anchored to the ADA's cited hypoglycemia alert value, 3.9 mmol/L / 70 mg/dL (same source
as the earlier meter-research entry above) — chosen because that's the figure already sourced and
shown in the Settings copy, not a new number invented for this. Trying to enter something lower
snaps back to the floor with a visible explanation, not a silent correction. No equivalent ceiling
exists on the **high** side — Scott didn't ask for one, and this app's core danger direction is
lows. `LOW_THRESHOLD_FLOOR` in `thresholds.js` is the one place this would ever need to change
(e.g., if Scott's doctor gives a personal number that's actually *lower* than the generic standard
— a real, unresolved tension, flagged rather than silently decided; ask Scott first if it comes up).
Now also a standing rule in `CLAUDE.md`'s "Descriptive, not prescriptive" section, since it's a
narrow, deliberate exception to that rule, not a precedent to extend without asking him again.

Each glucose card that crosses a threshold gets a colored left border/background plus a small
"ⓘ why" toggle explaining which threshold it crossed — never an unexplained color alone.

### Sound: built-in alarm tones (custom user tones deferred, honestly)

Scott asked for custom user-uploaded alarm tones. Built instead, as a clearly-scoped v1
(`src/sound.js`): three **distinct built-in tones** (Web Audio oscillator beeps, no audio files to
ship) — one for the daily reminder banner's hidden→shown transition, two more (different pitch,
double-beep) for a glucose save that lands low or high. A Settings checkbox turns all of it off.
**Custom uploaded sound files are a real next step, not built** — flagged to Scott directly as
bigger scope (upload, storage, playback UI) than this pass, alongside a genuine platform constraint:
no website can override a phone's own *system* notification sound, so even a custom tone can only
ever play while this app is open, not as a background OS-level alert.

### Date format setting

Settings → Date format: Automatic (follows the phone's own locale, unchanged default) or a locked
DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD (`src/dateformat.js`). Built after Scott clarified this
wasn't the speculative Phase-2 "different users, different countries" feature it first looked
like — his actual case is personal: he wants a format that doesn't silently change when his own
phone's region setting shifts while travelling. Every place in the app that draws a date now routes
through `formatDate()` so the lock actually holds everywhere at once (Home, Readings, Export CSV
and printable summary) — the one thing it **can't** touch is the native `<input type="date">`
picker on the Export screen's From/To fields, the phone's own OS calendar control, not something a
website can restyle.

### Meter identified, corrected, and a real Bluetooth source built against the actual spec

**Correction to the earlier entry above:** the "Accu-Chek Inform II" identification from the
photographed label was a wrong inference (indirect label styling, no confirmed GTIN match) — the
ADACare phone call above confirms the actual device is an **Accu-Chek Guide Me**, a genuine
consumer meter with both Bluetooth (to Roche's mySugr app) and the USB port Scott had noticed.
Trust this over the earlier guess; `CLAUDE.md` has been corrected to match.

Built a real Bluetooth glucose source against this (`src/bluetoothGlucose.js`), added to the
`glucoseSources` registry as `bluetooth-meter`, gated on `"bluetooth" in navigator` (Chrome on
Mac/Android only — Safari/iOS has never implemented Web Bluetooth, an Apple restriction, so this
entry correctly reports "Not available" there). A "Connect via Bluetooth & pull readings" button
in Settings appears only when available; it opens Chrome's own device picker, connects to the
standard Bluetooth SIG **Glucose Service** (0x1808, a public spec — not Roche's undocumented USB
protocol), and pulls the meter's full stored history via the Record Access Control Point, not just
whatever it reads next.

**This is built strictly to the published Bluetooth GATT spec (byte layout confirmed against the
official spec before writing any parsing code — sources cited in the module's own header comment)
but has NOT been run against Scott's actual meter — there's no way to verify that without the
physical device.** Every parsed value is range-checked (1-40 mmol/L) before being offered for
saving, specifically so a spec-reading mistake can't silently produce a wrong glucose number — the
one safety property any future change here must keep. The pure SFLOAT-decoding math has real
unit-test coverage (`tests/bluetoothGlucose.spec.js`, hand-constructed byte arrays matching the
spec) since that's the part that could otherwise fail silently; the actual device-pairing handshake
could not be tested this way and is the genuine next step — **treat the first real connection
attempt as a test, not a known-working feature.**

### Barcode scanning: built for real, not the honest-placeholder message from earlier

Replaced the earlier "isn't built yet" message with an actual scanner: `src/barcode.js` uses ZXing
(`@zxing/browser`) to decode from live camera frames via canvas analysis — deliberately **not** the
native `BarcodeDetector` Shape Detection API, which Safari/iOS still doesn't support and would have
left Scott's own phone without a working scanner. `src/nutrition.js` looks up a decoded barcode
against **Open Food Facts** (free, no API key, already the brief's own §6 recommendation, real
Australian-market coverage) and formats a descriptive line — product name, sugar/carbs per 100g —
into the food-text field. Purely descriptive, per this app's own rule: no portion-size or
"how much is safe" logic anywhere in it.

**Bundle-size catch, fixed same session:** ZXing added ~500KB (pre-gzip) to the main JS bundle
before this was noticed — barcode scanning is a secondary, occasional-use feature, so making every
page load pay for it upfront was wrong. Fixed with a dynamic `import("./barcode.js")` on first tap
instead of a static top-level import; Vite now code-splits it into its own chunk, main bundle back
to ~29KB. Worth remembering as a pattern if another heavy, occasional-use dependency gets added
later — check `npm run build`'s own chunk-size output, it flags this.

**Tested:** the pure lookup/formatting logic (`tests/nutrition.spec.js`, mocked `fetch`, no network
or camera). **Not testable from here, needs Scott's real device:** the actual camera-scan-a-real-
barcode flow — Playwright's headless run has no camera, so the existing test only confirms the
scanner UI opens and closes cleanly, not that a real decode works end-to-end.

### CSV Import (the realistic version of "transfer between devices")

Scott asked for automatic transfer when his phone connects to his Mac — **not possible**, flagged
directly: no website can detect a cabled phone or reach into another device's browser storage, an
inherent web-platform limit, not something buildable around. Built the realistic version instead:
Export's CSV gained extra structured columns (Timestamp/Value/Unit/Note/Text, additive — the
original human-readable Type/When/Detail columns are unchanged) so a new **Import** control on the
Export screen can read a previously-exported file back in losslessly, with duplicate-skipping by
timestamp+value/text (`importCSV` in `src/export.js`). Workflow: export on one device, hand the
file over (AirDrop/email/Files), import on the other.

### Bugs found and fixed this session (all now covered by regression tests)

- **Datetime fields never defaulted on first load.** Init called `refreshHome()` directly instead
  of `showView("home")`, so the required `datetime-local` fields stayed blank until a nav click —
  silently blocked every save attempt on a fresh page load with no visible error. Fixed by routing
  init through `showView("home")`.
- **A recurring CSS specificity gotcha, three separate times** (`.timeline-list`, `.latest-reading`,
  and pre-emptively guarded against for `#barcode-scanner`): an element's own explicit
  `display: flex` has equal specificity to the browser's default `[hidden] { display: none }` and
  wins by coming later in the cascade — setting `.hidden = true` on such an element silently does
  nothing visually. Pattern to remember for any *new* element that (a) gets `display` set
  explicitly in this stylesheet and (b) ever has `hidden` toggled directly on it (not just
  inherited from a hidden ancestor): always pair it with an explicit
  `.the-class[hidden] { display: none; }` rule. Found the first two by actually looking at the
  running app in a browser, not just by tests passing — the Playwright assertions on `.hidden`
  (the JS property) were all green throughout, because they were checking the DOM attribute, not
  the resulting visual state.
- **Same-minute readings picked the wrong one as "latest."** `nowForDatetimeLocal()` zeroes seconds
  (matching the datetime-local input's own minute-only granularity), so two readings logged
  moments apart can share an identical stored timestamp — a plain timestamp sort's stable tiebreak
  then favoured insertion order (oldest-first) over recency. Fixed with `compareRecentFirst()` in
  `src/db.js`, a shared comparator every "most recent" sort in the app now uses, falling back to
  comparing `id` (always millisecond-precise from `makeId()`) when timestamps tie.

### Test suite: grown from 10 to 100

`npm test` now runs 25 test cases × 4 browser projects. New files: `tests/bluetoothGlucose.spec.js`
(pure SFLOAT/byte-layout unit tests, no browser needed) and `tests/nutrition.spec.js` (pure lookup/
formatting, mocked fetch). `tests/smoke.spec.js` grew to cover the rebuilt Home/Readings screens,
the threshold floor rule, the date-format lock, and the barcode scanner's open/close. All 100 pass
as of this entry — run `npm test` before trusting any of the above still holds after further edits.

### Still open — nothing here is silently dropped

- **Country-aware food database** (Open Food Facts + AUSNUT for Australia, "know where I am and
  what foods to expect") — not started. Open Food Facts is confirmed to support country-based
  filtering already, so this is realistic, just separate scope from today's barcode-lookup work.
- **Real PNG app icons** (replacing the placeholder SVG) — not started this session; no image-
  generation tool was available to do this properly, flagged rather than faked with a low-effort
  substitute.
- **Meal-timed multiple reminders** — still waiting on Scott to specify the exact shape (see the
  2026-09-12 entry above); do not guess at this.
- **LibreLinkUp polling** — blocked on the Libre 2 Plus sensor physically arriving (see the
  ADACare-call entry above; still no tracking number as of that call).
- **Apple Health / Google Health Connect sync** — brief §3.3, not started, no new information this
  session.
- ~~Custom domain HTTPS~~ — **resolved, see the corrected 2026-09-12 entry above**: confirmed
  working (valid cert, HTTP/2 200) on a live check later the same day as this entry was written.
- **Landing-page contact email** — still a `[your contact email]` placeholder; Scott now has a
  known email on file (used with ADACare) but publishing a personal address on a public landing
  page is his call to make explicitly, not something to default to quietly.

## 2026-09-14 — Live Bluetooth debugging session with Scott and the real meter

Scott had the actual Guide Me in hand, in genuine pairing mode (confirmed: two-circles + spinner
icon, the correct indicator per mySugr's own docs — his pairing procedure was never the problem).
First real end-to-end test surfaced a real bug, plus one hard platform boundary worth knowing about
before anyone tries to script around it again.

**Bug found and fixed:** `connectAndFetchReadings` in `src/bluetoothGlucose.js` originally called
`requestDevice({ filters: [{ services: ['glucose'] }] })` — Chrome's picker can only filter by
services a device *advertises*, and this meter apparently doesn't advertise the Glucose Service
openly even though it supports it once connected (common for single-purpose BLE health devices).
Changed to `{ acceptAllDevices: true, optionalServices: ['glucose'] }` so the picker shows every
nearby device by name and Scott picks the meter manually — `optionalServices` still grants access
to the Glucose Service after connecting. Settings' Bluetooth section got a matching hint explaining
the picker now shows everything, not a pre-filtered list.

**Deploy tooling has a real gotcha with this project's setup:** the Netlify MCP deploy tool
packages the current working directory as a git repo to upload — and this project lives in a git
**worktree**, which it can't handle (`fatal: not a git repository`, trying to init against the
worktree's `.git` file instead of a real `.git` directory). Workaround used: copy the project
(excluding `.git`/`node_modules`) into a clean scratch folder, `git init` a plain throwaway repo
there, and run the deploy from that copy instead. Worked — deploy succeeded, confirmed live by
checking the served JS bundle directly for the fix. **If a future deploy fails with this exact
error, this is why — same workaround applies.**

**Hard platform boundary, not a bug — don't try to script around this again:** attempted to drive
Scott's real Chrome via the Claude-in-Chrome extension to click "Connect via Bluetooth" and watch
what the native device picker showed. The click correctly reached `requestDevice()` (confirmed: it
returned `"User cancelled the requestDevice() chooser"`), but **Chrome will not let any automated
tool — extension-driven or OS-level — interact with the native Bluetooth/hardware-permission
chooser dialog.** This is deliberate browser security, not a gap in tooling. That dialog can only
ever be operated by the human physically at the keyboard. Confirmed the button and code path are
wired correctly; the actual "does the meter appear in the list" question can only be answered by
Scott clicking it himself and looking.

**Status at time of writing: still not connected.** Scott has retried multiple times with the
meter genuinely in pairing mode; macOS's own System Settings → Bluetooth "Nearby Devices" list also
shows nothing during the same window (searching, but empty) — this was initially read as ruling out
a browser-specific cause, but that reasoning was corrected mid-session: macOS's Settings panel is a
curated consumer list that's known to omit single-purpose BLE peripherals even when they're
genuinely advertising, so an empty list there doesn't actually confirm anything about what Chrome's
own (different, lower-level) scan would see. **Next step, needs Scott at the keyboard:** click
Connect himself while the meter is in pairing mode and report exactly what Chrome's picker shows —
empty entirely, other devices but not the meter, or the meter itself. That result is the one
missing piece needed to know whether this is a device/range issue or something still fixable in
code.

## 2026-09-15 — Food Guidance section, Home hero redesign, and a real custom-domain/deploy problem found

**Built: a "Food Guidance" screen**, reachable from Home via a new "🍎 Food guidance" button next
to Diary note/Export. Three plain-English sections (Everyday eating, Alcohol, Eating out & social
occasions) plus a Sources list crediting the actual published sources (NHS, Mayo Clinic, Cleveland
Clinic, a couple of journal papers on alcohol-potentiated reactive hypoglycaemia, GlucoSense).
Static content, not AI-generated, written up top with the same "general information, not personal
advice, confirm with your own doctor" framing already used for the glucose thresholds — deliberately
on the safe side of this project's "descriptive, not prescriptive" rule (see CLAUDE.md): it's
published general knowledge with citations, not the app judging what Scott personally should eat.
Scott confirmed this was the right shape and the right place for it before it was built.

**Built: Home screen redesign, prompted by Scott sharing a screenshot of an open-source automated
insulin-delivery app's display.** Worth recording plainly what did and didn't carry over, since the
reference app is built for a fundamentally different job (dosing insulin via a pump — IOB, temp
basal, carb-bolus buttons) that has no equivalent in reactive hypoglycemia management:
- The big centered glucose number, freshness label, and delta — **already existed**, just small
  (2rem). Enlarged to 4.5rem and restructured into a centered/stacked hero card
  (`.latest-reading` in `src/style.css`), matching the reference's look without changing any
  underlying logic (`renderLatestReading()` in `src/main.js` untouched — same element IDs, just
  re-laid-out markup).
- The graph + time-range chips (2h/4h/6h/12h/24h/7d) — **already existed** (built 2026-09-14),
  nothing to add.
- Bottom nav with icon+label — **already existed** (Home/Readings/Settings).
- **New:** a small status badge, top-right of the header — `#bluetooth-status-badge` — showing
  meter sync freshness ("Synced 2m ago" / "Meter not synced yet", dot colour-coded). Deliberately
  worded "synced," not "connected": `connectAndFetchReadings()` opens the BLE link, pulls stored
  records, and disconnects (see `bluetoothGlucose.js`) — there's no persistent connection for a
  "connected" dot to honestly reflect. Timestamp written to `localStorage` on a successful pull.
- **Not built yet, needs one more answer from Scott:** a "food button" near the bottom — asked
  whether he meant a shortcut to jump to Home's existing Food section, or a genuinely separate
  Food tab in the bottom nav. Don't guess; the two are structurally different.

Both features tested (104/104 across all 4 browser projects) and visually verified in a live
preview before being called done. Committed to git (`143dca8` for Food Guidance; the Home redesign
commit follows once the food-button question above is answered, so it can go in as one coherent
commit rather than two).

**Found, not yet fixed: `reactivebloodtracker.com` is serving a stale, pre-redesign build, and the
site's own documented `.netlify.app` name has gone dark.** Scott shared a screenshot of a direct
Chrome navigation to `reactivebloodtracker.com` that loaded a page headed "Timeline" with separate
Glucose/Food/Diary/Export/Settings buttons — the *old* architecture, from before the 2026-09-14
"Rebuild Home as one quick-entry screen" redesign (commit `cc9140c`). Checked directly rather than
guessed:
- `dig reactivebloodtracker.com` → resolves fine, served by Netlify, valid HTTPS, HTTP/2 200. The
  earlier "did not match any documents" result (2026-09-14 entry above) was a Google-search-box
  artifact from searching the URL as a query rather than navigating to it directly — not a real
  DNS/cert problem. That's still true; nothing wrong with the domain's plumbing itself.
- `curl -s https://reactivebloodtracker.com` → response body is unmistakably the pre-rebuild HTML
  (`<h1 id="view-title">Timeline</h1>`, a separate `view-glucose` section) — confirms the domain is
  frozen at whatever was live around when it was first pointed (2026-09-12), and has not received
  any deploy since — not the Bluetooth fix, not today's work, nothing.
- `curl -sI https://reactive-hypoglycemia-tracker.netlify.app` → genuine Netlify **404** ("Not
  Found"), meaning that exact subdomain name is not currently claimed by any site — not a cache or
  propagation issue, an actual "no site answers to this name" response.
- Working theory, not yet confirmed: the 2026-09-14 scratch-copy deploy workaround (a plain `git
  init` in a throwaway folder, needed because this project lives in a git worktree the Netlify
  deploy tool can't package directly — see that entry above) most likely created or pushed to a
  **different** Netlify site than the one `reactivebloodtracker.com` is bound to, rather than
  updating the original site (id `0b9a9624-13b7-4441-8056-0807f9cbbf7c`). That would explain both
  symptoms at once: the custom domain never seeing the newer builds, and the original site's
  default subdomain going quiet.
- **Could not confirm the theory via the Netlify MCP tools this session** — `netlify-project-
  services-reader` and `get-netlify-coding-context` both expect an internal `selectSchema`/
  `creationType` discriminator that isn't documented anywhere visible to this session, and every
  guessed value was rejected. Didn't force it further; this needs either better tool documentation
  or five minutes in Scott's own Netlify dashboard (Sites list — which site currently shows
  `reactivebloodtracker.com` under Domain settings, and what is that site actually called/its ID)
  to resolve safely, rather than guessing at rebinding a live public domain.
- **Next step:** once the correct current site is identified, deploy the current code to *that*
  site specifically (same scratch-copy-repo workaround as before), which should bring the custom
  domain fully up to date in one go.

**Resolved, same session — root cause was simpler than the theory above.** Scott confirmed the
Netlify project's Site ID (`0b9a9624-13b7-4441-8056-0807f9cbbf7c`) — it's the **same site** already
documented, not a second one; no site-duplication mystery after all. Investigated properly via the
site's own Deploys tab:
- **What actually happened:** every past deploy is still sitting in Netlify's deploy history, each
  with its own permanent permalink (`https://<deploy-id>--reactivebloodtracker.netlify.app`).
  Checking each one's actual HTML directly (`curl`, looking for `<h1 id="view-title">`) showed the
  **Sep 14, 12:17 PM "upload" deploy already had the correct, redesigned Home/Readings/Settings
  UI** — but production was serving the Sep 12 or Sep 13 deploy (old "Timeline" UI) instead. Today
  at 2:57 PM something republished an old deploy back to production (2-second "deploy" with no
  message — consistent with clicking "Publish deploy" on a historical entry rather than a fresh
  build) — that's the actual regression, not a stale/never-updated domain as first suspected.
- **Fixed:** opened the Sep 14, 12:17 PM deploy in Netlify's dashboard and clicked Publish deploy →
  Publish. Confirmed live via `curl`: `reactivebloodtracker.com` now serves the Home/Readings/
  Settings redesign again.
- **Still not live: today's newest work** (the Food Guidance section, the Home hero/Bluetooth-badge
  redesign from this same session) — none of that has ever been deployed anywhere yet, so
  restoring the Sep 14 deploy doesn't include it. Getting it live needs a fresh deploy, which hit
  two real, unresolved blockers this session:
  1. **Git is broken system-wide on this Mac right now**: every git command, even `git --version`,
     fails with `You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild
     -license'...`. This blocks the scratch-copy-repo deploy workaround entirely (needs a local git
     repo to hand to the deploy tool). **Needs Scott specifically** — it's a `sudo` command
     requiring his password and his own agreement to Apple's license; not something to do on his
     behalf even with full computer access. One-time fix, ~30 seconds in Terminal.
  2. **The Netlify deploy/reader MCP tools are unusable this session** — both
     `netlify-deploy-services-updater` and `netlify-project-services-reader` expect an internal
     `selectSchema` discriminator that isn't documented anywhere visible here; every attempted
     shape (string, nested object, `{type, params}`) was rejected with the same generic error.
     Didn't force it further. A future session should check whether better tool docs are available
     before re-attempting, rather than repeating the same guesswork.
  3. **The dashboard's own drag-and-drop deploy zone has no fallback file input** — checked via the
     accessibility tree; it's pure drag-and-drop with no click-to-browse element, so it can't be
     driven by file-upload automation either. A real OS-level drag of the built `dist/` folder (or
     a zip of it) onto that page, done by a human, is the remaining path — the built zip is already
     sitting at
     `/private/tmp/claude-501/.../scratchpad/reactivebloodtracker-deploy.zip` if it's still around,
     otherwise `npm run build` again and zip fresh.
  **Bottom line for next session or for Scott:** either (a) run `sudo xcodebuild -license` once, or
  (b) drag a fresh build zip onto `app.netlify.com/projects/reactivebloodtracker/deploys` — either
  unblocks getting today's work live.

**Resolved same session:** Scott ran `sudo xcodebuild -license` himself — git works again. Also
found: a GitHub repo now exists at `github.com/GoFreo/reactivebloodtracker.com` (empty, freshly
created). Worth connecting Netlify to it properly next session (Netlify's own "Import from Git"
flow) so deploys happen from pushes instead of the scratch-copy workaround each time — not done
yet this session, flagging so it isn't lost.

## 2026-09-15 (continued) — Mac-as-hub workflow: photo import + Home Bluetooth shortcut, and a real Safari photo-save bug found

Scott reframed the near-term plan given today's constraints (iPhone can't do Web Bluetooth at all;
mobile app not fully there yet): make the **Mac** the hub for now. Phone becomes just a camera —
take food photos there, get them onto the Mac (AirDrop/iCloud Photos already does this
automatically, no app code needed for that leg), then the app picks up a whole batch at once.

**Built:**
- **`src/photoImport.js`** — hand-rolled EXIF `DateTimeOriginal` reader (no new dependency; only
  needs one ASCII field out of the JPEG/TIFF structure, not general EXIF support). A file with no
  EXIF (screenshot, re-saved image) falls back to its own last-modified time rather than blocking
  the import. Unit-tested against hand-built JPEG/EXIF byte arrays, same approach as
  `bluetoothGlucose.spec.js`'s hand-built `DataView`s.
- **"📥 Import photos" button on Home** (third icon alongside Camera/Barcode) — select a whole
  batch at once (a day's worth, doesn't matter which), each photo becomes its own food entry dated
  by when it was actually taken, oldest-first. Deliberately does **not** auto-run AI parsing on
  import — same manual "Parse with AI" step as every other entry, so importing a whole day never
  racks up API calls without Scott choosing that per entry.
- **"🔵 Sync meter" button on Home**, next to the glucose form — same Bluetooth connect flow
  already in Settings, now reachable without a trip there. Both buttons share one
  `runBluetoothSync()` function (refactored out) rather than duplicating the connect/error logic.

**Found, fixed, and worth reading carefully — likely explains an earlier real complaint:** while
testing the photo importer, hit `UnknownError: Error preparing Blob/File data to be stored in
object store` — a genuine WebKit IndexedDB bug when storing certain `File`/`Blob` objects.
Confirmed this is **not new** — the exact same error already existed in the original single-photo
camera-capture save path (`foodForm`'s submit handler), just never caught by any test before (the
existing camera test explicitly can't simulate a real photo — "needs a physical camera" — so this
path had never actually been exercised end-to-end). This is a strong candidate for explaining
Scott's earlier report of food photos "not being able to put in" — not user error, a real save
failure that was happening silently (no error shown, nothing saved, nothing visibly wrong either).
- **Fixed both paths**: rebuild a plain `Blob` from the photo's own bytes (`toStorableBlob` in
  `photoImport.js`) rather than storing the `File` object directly, and wrapped both save paths in
  proper try/catch so a failure now shows a clear message instead of silently doing nothing.
- **Honest open question:** the Blob-rebuild didn't clear the error when tested under Playwright's
  automated WebKit specifically — tried a couple of other angles (allowing service workers) without
  a clean resolution either. This points at least partly at the *automation environment itself*
  (a real photo from the native camera is backed differently than one injected via
  automated file-input), so it may already work fine in Scott's actual Mobile Safari — but that
  isn't proven either way from here. The two WebKit projects' equivalent test is deliberately
  skipped with a comment explaining exactly this, rather than silently weakened or left failing.
  **Next session, or for Scott: if a food photo still fails to save on the iPhone specifically,
  report the exact error text now shown (it wasn't visible before this fix) — that's the missing
  piece to actually close this out.**

**Also flagged, not actioned:** Scott raised wanting a proper email address set up via Microsoft
Business for the app(s) — held off per the project's standing rule against configuring account/
security infrastructure directly; asked him to clarify the actual goal (a forwarding address on an
existing mailbox vs. a new subscription) before doing anything here.

**Deployed, and a much better deploy method found.** Once git was working again, tried the Netlify
CLI directly (`npx netlify-cli`) instead of the old scratch-copy-git workaround — turns out this
Mac already has an authenticated `netlify-cli` session linked to the right project
(`reactivebloodtracker`, confirmed via `npx netlify-cli status`). A plain
`npx netlify-cli deploy --prod --dir=dist --site=0b9a9624-13b7-4441-8056-0807f9cbbf7c` (after
`npm run build`) deployed cleanly in ~40s — no git repo needed at all, sidesteps the whole
worktree-packaging problem that caused the original 2026-09-14 deploy failure. **This should be the
default deploy method going forward**, not the scratch-copy workaround — much simpler, and doesn't
depend on git working. Confirmed live via `curl`: today's Home redesign, sync badge, photo import,
and Bluetooth diagnostics are all now on `reactivebloodtracker.com`.

## 2026-09-16 — Branch/worktree reconciliation: the main folder now matches what's live

Picked this project back up on a day Scott was actively using it for a real reactive-hypoglycemia
episode (a real crash after breakfast, tracked by hand while this session worked — exactly the
use case this app exists for). Reading `CLAUDE.md`/`HANDOVER.md` on `main` described a much earlier
state (2026-09-12, "working v1") than what was actually live — this entry is the reconciliation.

**Found:** three `claude/*` branches existed alongside `main`, each with its own linked worktree
under `.claude/worktrees/`, none reflected in this file:
- `claude/reactive-hypoglycemia-tracker-940786` — 5 real commits (2026-09-14/15) never merged to
  `main`: the Home/Readings/Settings redesign, glucose thresholds, real Bluetooth meter integration
  (Web Bluetooth, standard GATT Glucose Service), barcode scanning + Open Food Facts lookup, photo
  import, Food Guidance content, CSV import, sound alerts, date-format lock. Tested (100-104 passing
  across 4 browser projects at each step) and **already the code actually deployed** at
  `reactivebloodtracker.com` — confirmed via the Netlify deploy record (`deploy_source: "cli"`,
  2026-09-15, matching this branch's tip exactly). The live site was correct; `main` and this file
  were just stale.
- `claude/reactive-hypoglycemia-tracker-3cd4a9` — no unique commits, but real **uncommitted** work
  from an earlier 2026-09-13 session: `src/sync.js` (full manual device-to-device export/import via
  Web Share Sheet, no server — a genuine answer to the "shared data between phone and Mac" idea
  noted elsewhere in this file) and an early `src/thresholds.js` prototype (the `drivingCutoff: 5.0`
  idea that the 940786 branch's later, more complete threshold system also implements). Committed
  as-is (`d6f7ce4`) to preserve it — **not merged into `main`**, since it touches the same files
  (`main.js`, `index.html`, etc.) the 940786 work independently rewrote, and reconciling the two
  needs a deliberate pass, not a blind merge. `sync.js` in particular looks worth resurrecting.
- `claude/admin-account-access-9ddec0` — identical to old `main`, zero unique content, added
  nothing. Deleted.
- Three duplicate research-brief files (chat downloads) were also sitting loose at the project
  root — confirmed byte-identical to `research/`'s existing v1/v2 and to `3cd4a9`'s uncommitted v3.
  Saved v3 into `research/` properly, removed the root duplicates.

**Done:**
- Merged `940786` into `main` (clean auto-merge, no conflicts) — `main` now matches the live site.
- Committed `3cd4a9`'s dormant work to its own branch so nothing is lost, left unmerged (see above).
- Removed all three `.claude/worktrees/*` checkouts (`git worktree remove`, one needed `--force` for
  leftover build/cache cruft — `.netlify/`, `test-results/`, `.DS_Store`, nothing of substance).
  Deleted the two branches that had become fully redundant (`admin-account-access-9ddec0`,
  `940786` — its commits live on in `main`'s history via the merge). Kept `3cd4a9`'s branch.
  **One leftover:** the now-empty `.claude/worktrees/` directory itself couldn't be removed this
  session (a `rm -rf` was declined) — cosmetic only, safe for Scott to trash via Finder, or ask a
  future session to clear it. *(Update 2026-09-20: it wasn't actually empty — it held a stale
  160 KB snapshot folder, `reactive-hypoglycemia-tracker-3cd4a9/`, byte-identical to what's committed
  on that branch. Handled — see the 2026-09-20 entry at the bottom.)*
- `npm install` (picks up `@zxing/browser` and other deps the merged code needs) + `npm test`:
  **118 passed, 2 skipped (the documented WebKit photo-save automation-environment gap), 0 failed.**
- Updated this file's top status line to match reality (was still "pre-code" — four days and a full
  feature build stale). `MASTER_HANDOVER.md`'s one-line summary needs the same treatment — next.

**Root cause, not yet fixed — needs Scott's decision:** Netlify's **Continuous deployment → Current
repository: Not linked** (confirmed directly in the Netlify dashboard). Every deploy so far has been
a manual `netlify-cli` push from whichever machine/folder someone happened to be in — this is *why*
work ended up scattered across worktrees and why a stale deploy once got accidentally republished
(see the 2026-09-15 entry above). A GitHub repo already exists for this
(`github.com/GoFreo/reactivebloodtracker.com`, empty, per the 2026-09-15 entry) but was never wired
up. Linking Netlify's continuous deployment to it would mean every future deploy is just "push to
`main`," from this one folder, no more manual CLI juggling — the direct fix for Scott's own
"where's the deploy folder, let's make it findable" instinct today. **Not done unilaterally this
session** — pushing this repo's code to a GitHub remote for the first time is a real, visible
action worth Scott's explicit go-ahead rather than assuming it. Ask him next time this comes up if
he hasn't already answered. *(Update 2026-09-20: the push **did** happen — git's own reflog shows
`origin/main` updated "by push" on 2026-09-16 11:35 +1000, about 4 minutes after the last commit, and
the dormant `3cd4a9` branch went up at 11:35:30. `main` == `origin/main`. This paragraph and the
root index were never updated afterwards. What's still unconfirmed is only Netlify's own
continuous-deployment link to that repo, which is a dashboard setting — see the "At a glance" block.)*

**Not investigated this session, lower priority:** whether `3cd4a9`'s `sync.js` should be reconciled
into `main` (real feature, just needs a deliberate merge pass against the 940786-derived code it
overlaps with).

## 2026-09-20 — Autonomous verification pass (Claude, Scott away)

Picked from `MASTER_HANDOVER.md` because this project's only open "needs Scott" item was the git
remote. Worked only inside this folder. **Docs only were changed** — no source, no commit, no push, no
deploy (see "Left alone on purpose").

**Verified (all read-only or in a scratch copy)**
- **Live == `main`.** Fresh `vite build` of `main` (built into a scratch folder, not `dist/`) and the
  live `index.html` reference identical hashed bundles — same code.
- **`npm test`: 118 passed / 2 skipped / 0 failed** (1.1 min) — exactly the 2026-09-16 figure; nothing
  drifted. `npm audit`: 0 vulnerabilities (all and production). `npm outdated`: nothing.
- **The GitHub push HAS happened.** `git reflog --date=iso origin/main` → "update by push"
  2026-09-16 11:35:21 +1000 (last commit 11:31); the `3cd4a9` branch went up at 11:35:30. `main` ==
  `origin/main` (`a695000`). The 2026-09-16 entry above, `MASTER_HANDOVER.md` and `SCOTT-TO-ACTION.md`
  all still said the push needed Scott's go-ahead / the repo was empty — they had been written just
  before it happened and never updated. What is genuinely still open is only Netlify's own
  continuous-deployment link, a dashboard setting nothing on disk can reveal.

**Docs corrected:** `CLAUDE.md` (status line, "key not configured yet" → configured & verified,
test count, and a "superseded" pointer above its stale Next-steps list); two inline "Update
2026-09-20" annotations on the 2026-09-16 entry; the "At a glance" block at the top of this file.

**Housekeeping:** the "empty `.claude/worktrees/`" left over from 2026-09-16 was not empty — it held a
stale 160 KB snapshot folder (`reactive-hypoglycemia-tracker-3cd4a9/`, orphaned: git no longer listed
it). Every tracked file in it was diffed against branch `3cd4a9` and was **byte-identical** (the rest
was `.netlify/` build output, `test-results/`, `.DS_Store`). Moved — not deleted — to
`~/Dropbox/Pending Deletion/tracker-stale-worktree-snapshot-3cd4a9-moved-2026-09-20/`.
`.claude/worktrees/` now holds only a `.DS_Store`.

**Findings — real and evidenced, deliberately not fixed in live code**
1. **Big photos probably can't be AI-parsed.** `parseFoodWithAI` base64s the raw camera file — there is
   no resize anywhere in `src/`. Scott's 3 staged photos are 1.97 / 3.19 / **4.68** MB (file sizes only
   were read). Netlify's docs give a 6 MB buffered request limit, effectively ~4.5 MB for a photo once
   base64'd; the 4.68 MB one is over it and would be turned away before `ai-proxy` runs. **Not
   reproduced on a device.** (Anthropic's own per-image cap on the direct API is 10 MB, so it is *not*
   the binding limit.)
2. **…and the message shown would be wrong:** Netlify's non-JSON rejection makes `res.json()` throw and
   the old catch says "needs `netlify dev`…", misleading on the live site.
3. **The AI endpoint is public with no per-caller limit.** Good news first: model, `max_tokens` and the
   system prompt are fixed server-side, so it is *not* an open Claude proxy. But `text`/`mimeType` were
   unbounded, a bare `null` body threw an uncaught `TypeError`, and there is no auth or rate limiting
   (the optional `APP_SHARED_SECRET` guard, if set, only deters casual callers — `VITE_` values are
   readable in the shipped bundle). Real exposure is calls-per-second × ~$0.003–0.005 each on Scott's
   key. **The actual backstop is a monthly spend limit in the Anthropic console — Scott only.**

**Proposed, not applied:** `proposed-patches/2026-09-20-photo-downscale-and-proxy-caps/` — shrinks only
the copy sent to the AI (≤1568 px — Haiku 4.5's own native limit — JPEG q0.85; falls back to the
original on any failure), separates "unreachable" from "rejected" errors, and bounds the proxy's
inputs. Built and tested in a scratch copy of `main`: the 5 tests describing new behaviour fail on
the unpatched source, and with the patch the **full suite is 210 passed / 2 skipped / 0 failed on all
4 browser projects**; a worst-case ~9–10 MB photo went from ~11.4 MB uploaded to 0.76 MB (Chromium) /
1.27 MB (WebKit). `git apply --check` against real `HEAD` is clean. Its README lists what is
unverified (real iPhone Safari, EXIF rotation, 48 MP memory, photos of text).

**Left alone on purpose:** `data/` and `food photos/` (only file *sizes* of the latter were read — no
image opened); `src/sync.js` and the `3cd4a9` branch; no commit, push or deploy (deploys are Scott's,
and nothing here is his to be surprised by); HawkScan could not run (no `hawk` CLI / `HAWK_API_KEY`
in this environment — same limitation as 2026-09-12). The scratch copy lives only in the session
scratchpad; the patch file in `proposed-patches/` is the durable result.

**Next safe step for a future session with Scott present:** ask for the yes/no on the patch and the
photo test; if yes, apply → `npm test` → he reviews → commit → manual deploy per "At a glance".

## 2026-09-28 — Libre 2 Plus CGM sync built (LibreLinkUp + passcode); Dexcom G7 & fitness requested

**Context:** both the Libre 2 Plus and the Accu-Chek Guide Me are now in hand and in daily use. Scott
sees a "large discrepancy" between them. Explained as expected up to a point: CGM reads interstitial
fluid and lags blood by ~5–15 min, most of all during fast drops (exactly a reactive crash), and new
sensors read worse on day 1. No numbers given yet; offered to look at paired readings.

**Built (commit `dee45e8`, deployed, live endpoint confirmed answering `configured:false`):**
- `netlify/functions/cgm-sync.js`: logs in to LibreLinkUp server-side (follower account from Netlify
  env vars), fetches `/llu/connections` then `/graph` (~12h at 15-min intervals + current), returns
  mmol/L readings. **Stores nothing server-side.** API details checked 2026-09-28 against
  `timoschlueter/nightscout-librelink-up`: `version` 4.16.0 (override via `LIBRELINKUP_VERSION`),
  `product: llu.ios`, `account-id` = sha256(user id), host `api-au.libreview.io` (follows a region
  redirect once). `FactoryTimestamp` is parsed explicitly as UTC. Implausible values are dropped.
- **Passcode gate:** `CGM_SYNC_PASSCODE` (refused if under 8 chars), compared via hashed
  timing-safe equality, with a 1s delay on a wrong guess. Without it the URL would hand anyone
  Scott's glucose. It's still a single static secret with no real rate limit, so use a long one.
- App: `src/libreLinkUp.js`, a "📈 Sync CGM" button on Home (side by side with Sync meter), and a
  Settings section for the passcode with opt-in "remember on this device" (localStorage). Dedupes on
  source + exact timestamp, so repeated syncs are safe. Readings list now tags glucose as "· CGM" or
  "· Meter" so the two sources can be compared.
- Tests: new `tests/cgmSync.spec.js` (timestamp/UTC, AM/PM edges, conversion, dedupe, implausible
  values, passcode, not-configured paths) plus 2 smoke tests (mocked function: passcode required,
  import + re-sync dedupe, CGM tag, wrong passcode). **146 passed / 2 skipped / 0 failed.**

**Not verified:** a real LibreLinkUp login. That needs Scott's follower account + env vars, and
Abbott changes this unofficial API without notice. The first real sync is the test.

**Scott's next steps (his, not Claude's — credentials):**
1. Libre app → Connected Apps → LibreLinkUp → **Add Connection** → invite an email he controls.
2. Install LibreLinkUp, sign up with that email, accept the invite and terms, confirm a reading shows.
3. Netlify → Site configuration → Environment variables: `LIBRELINKUP_EMAIL`, `LIBRELINKUP_PASSWORD`,
   `CGM_SYNC_PASSCODE`. Env var changes apply to functions on the next deploy, so do one redeploy after.
4. In the app: Settings → type the passcode → Sync CGM readings.

**Noted from Scott's screenshot:** a "Libre Data Share" code is active until 1 Oct. It's a separate
Abbott feature, not needed for this. It's his call whether it was intended; "Manage Code" ends it.

**New requests, captured, not built:**
- ~~**Dexcom G7** coming from ADACare for a trial...~~ — **see the 2026-10-02 entry near the bottom of
  this file: it arrived, and it's a Dexcom ONE+, not a G7. That entry has the actual API research
  ("decide once the device is here" — done) and what Scott needs to do before it can be built.**
- **Fitness section (steps/activity), plus separate Carbs / Fitness / History sections.** Hard
  platform limit: a web app **cannot read Apple Health/HealthKit**. Realistic routes: an iOS Shortcut
  that exports daily steps to a file the app imports; Health's own "Export All Health Data" XML
  import; or a native iOS wrapper (big step). Needs Scott's call on the route and on how the
  sections should be laid out before building.

**Follow-ups worth doing:** ~48 CGM points per 12h will crowd the Readings list, so consider
collapsing or filtering by source. Also consider a paired CGM-vs-finger-prick comparison view (purely
descriptive). The graph currently plots all sources as one line.

### 2026-09-28 (continued) — spike prompt, graph honesty, new icon, research, scope change

**Built & deployed (all live, `npm test` 198 passed / 2 skipped / 0 failed):**
- `e6ed865`: CGM sync now names *which* Netlify settings are missing (names only). It showed all three
  Production values are empty; the names were saved but the values weren't. **Scott to re-enter the values.**
- `d11f121`: "Why did your sugar spike?" (`src/spikeDetection.js`). A rise or drop of 2+ mmol/L within
  60 min on CGM data, with nothing logged in the prior 2 h (4 h for drops), gets a Home card with
  Yes (logs the food at that time) / Not sure (recorded as unexplained) / Sensor glitch / Dismiss.
  Answering a rise also settles the crash after it. Answers are diary entries tagged `excursionId`,
  so they show in the timeline and export. Thresholds are editable in Settings.
- `0a60adf`: new icon, a droplet on a coil spring (Scott's "reactive" idea), plus real PNG icons
  (`icon-180` apple-touch, 192, 512, maskable 512), because iOS ignores SVG home-screen icons.
  `scripts/render-icons.mjs` regenerates them. Service worker cache bumped to v2.
- `c397b53`: graph rewrite. The Libre line breaks at gaps over 45 min (shaded "no data"),
  finger-pricks are diamonds on top (device differences are visible), meal markers run along the
  bottom, the time axis spans the whole range, and there's a legend and an optional low-threshold rule.

**Deploy gotcha found:** `netlify deploy` can silently reuse a cached function bundle (two deploys
uploaded an identical `cgm-sync` digest despite different code). **Always deploy with
`--skip-functions-cache`:**
`npx netlify-cli deploy --prod --dir=dist --functions=netlify/functions --skip-functions-cache --site=0b9a9624-13b7-4441-8056-0807f9cbbf7c`,
then confirm by curling the function.

**Research:** "Glucose App Field Study" (https://claude.ai/artifact/Ya7Fr1FHxAj1iVfrHwGNNc) covers ten
apps (Gluroo, Undermyfork, mySugr, LibreLink, Dexcom G7/Follow, Sugarmate, Lingo, One Drop, Glucose
Buddy, xDrip+/Juggluco/Nightscout), each with pros, cons and a take/avoid note, plus a scorecard.
Key finding: nobody builds for lows first.

**Scope change (Scott, 2026-09-28):** public app, BYO key, diabetes + insulin as well as reactive
hypo, co-loggers + clinician viewers, exercise, care-team involvement. Recorded at the top of
`CLAUDE.md`. Scott also set new working rules (decide logical questions yourself, log them in the
SITREP, batch only Scott-only questions), recorded in root `MASTER_HANDOVER.md` and in memory.

**Agreed build order:** (1) Libre sync ✅ built, waiting on values; (2) spike prompt ✅; then meal
gallery with after-meal outcome → meal builder (ingredients/barcodes, carbs totalled) → sharing
with roles (encrypted, opt-in) → "tell my family if I go low" → exercise → BYO key + condition
profile for going public.

**Small stumbles, all fixed:** the icon script mis-wrote to a `%20`-encoded path (moved the 4 files
in, removed only the empty stray folders, script now uses `fileURLToPath`); one test edit briefly
landed in the main checkout instead of the worktree (reverted with `git checkout`, main was clean at
that file); the LibreView Data Share code was rejected twice (AUTH_LOGIN 437), stopped retrying, and
LibreLinkUp is the working route anyway.


## 2026-09-28 (evening) — Meal builder built on a branch (autonomous pass, Scott away)

**What:** a "🧺 Build a meal from ingredients" panel inside the Food form (collapsed by default,
so the quick one-line food entry is unchanged). Each ingredient row takes **Grams**, **Per 100g**
(the label's carbs figure) and **Carbs g** (for when the item's total is already known — it wins
over the calculation). The running total updates live, and names any items that have no carb figures
("not counting Whey powder") rather than quietly under-counting. Tapping **Barcode** while the panel
is open adds the product as an ingredient (name + per-100g carbs from Open Food Facts); the portion
is left empty for the user, the app never guesses it. Readings → Meals shows "🧺 36 g carbs from 2
ingredients" and uses the ingredient names as the card title.

**Where:** `src/mealBuilder.js` (pure arithmetic, no browser), UI in `src/main.js`, CSS at the end of
`src/style.css`, storage change in `src/food.js` (food entries built this way carry `items` and
`carbsTotal`; other entries are saved exactly as before). Tests: `tests/mealBuilder.spec.js` (8 unit)
+ 2 new smoke tests (full build/save/Meals flow, and "a plain meal saves as before"), all 4 browsers.

**Branch, not main:** `main` is what's live, and deploying is Scott's call, so the work sits on
`meal-builder` (commit `bdc7da7`). Not pushed to GitHub either (the repo's visibility wasn't
checked; a push is outward-facing). Merge is a fast-forward.

**Decisions I made — revisit if you disagree:**
- Carbs only are totalled in the headline (sugars shown as a secondary figure when labels have it).
  No fibre/"net carbs" maths: that's closer to dose-adjacent territory and labels vary.
- ml is treated like g (Australian labels quote drinks per 100 ml).
- The saved text line carries the breakdown ("Rolled oats 40g (24g carbs), Milk 250g (12g carbs) |
  Total 36g carbs") so CSV export, print and the timeline need no format change. A CSV re-import
  brings back the text, not the structured rows — acceptable for now.
- No saved "recipes"/favourite meals yet — the existing quick-pick suggestion chips still work on
  the text. A natural next step if Scott finds himself rebuilding the same breakfast.
- Co-logger friendly means "simple enough for someone else to fill in"; real co-logger accounts are
  the next item in the build order (sharing with roles), not part of this.

**Friction, honestly:** `npm test`'s own web server times out (build takes ~80 s on iCloud vs a 60 s
limit), so the suite was run against a manually started `vite preview` on port 4173, which Playwright
reuses. Same code, same bundle — just started by hand. Consider raising `webServer.timeout` to 180000.
HawkScan (the security-scan hook) can't run on this Mac: no hawk CLI or API key.

## 2026-09-28 (late evening) — Readings filter, and Scott's pantry as test data (branch `readings-filter`)

**Readings list filter (`c9fa631`):** chips above the List — All / Finger-prick / CGM / Food / Notes, each with
its count — so ~48 Libre readings per 12 h don't bury finger-pricks, meals and notes (a follow-up this file
listed). Remembered per device; default "All" (unchanged behaviour); hidden outside List mode. Logic in
`src/readingsFilter.js`; readings with no `sourceId` (older entries) count as finger-pricks.

**Pantry test starter (`4b55a44`) — from Scott's own barcode photos, sent mid-session with "test starter for
reactive blood tracker" / "test data":** `tests/fixtures/scott-pantry-barcodes.json` holds 16 real products
(barcode, what the photo shows, what Open Food Facts returned on 2026-09-28, and pack-label figures where
legible). `tests/pantry.spec.js` runs offline against that snapshot: every barcode resolves as it did; a real
breakfast (yoghurt 170 g + milk 250 ml + gouda + orange juice typed from the pack) totals 59.2 g carbs and
names the gouda as uncounted; and a known disagreement is pinned (pepper cheddar: database 3.8 g/100 g, pack
<1 g). `RUN_LIVE_OFF=1 npx playwright test tests/pantry.spec.js -g live --project="Desktop Chrome (Mac/PC)"`
re-checks the live database for drift (rate-limit aware; ~1 min). Last live run: all 16 checked, no drift.
- Coverage: 12 of 16 are in Open Food Facts; 3 of those have no carb figure (gouda, sparkling water,
  vinegar). **Not in the database:** Primo prosciutto, Primo salami, Hilltop orange juice, Hilltop apple
  juice — Scott types those from the pack (or adds them to Open Food Facts himself, which is free).
- Two photos had no fully readable barcode (Bega cream jar, Vittoria coffee) — rescan if wanted. Primo and
  mango-milk digits were read at medium confidence.

**Bug found by the live check, fixed (`4b55a44`):** Open Food Facts now answers HTTP 404 for unknown products;
`lookupBarcode` treated that as a failure, so the user saw "Lookup failed (404)" rather than "Not in Open Food
Facts — describe it yourself". Now a 404 is "not in the database". Test added. **This bug is on the live site
until the branch ships.**

**Decisions I made — revisit if you disagree:** the fixture lives in `tests/` (it's shop products, no health
data, so it's fine in git); the pack label wins over the database when they disagree (the user types the
pack figure in "Carbs g"); the live check is opt-in so the normal suite never needs the internet.

### 2026-09-28 (later) — shipped; Scott is scanning at Coles tomorrow
Scott will photograph more products at Coles to grow the pantry test set. The suggested scan list is on the
SITREP. How to add them: each photo should show the barcode **and** the per-100 g column of the nutrition panel;
a session reads both, looks each barcode up in Open Food Facts, and appends to
`tests/fixtures/scott-pantry-barcodes.json` (snapshot + label figures), then reruns `tests/pantry.spec.js`.

## 2026-09-28 (night) — My foods, household food bank, portions (branch `my-foods`); diet-app study

**Scott's asks, mid-session:** the phone camera is the scanner; save scanned products somewhere other than the
phone ("Netlify has an area?"); clearer scanner messages instead of a black screen; portions (full, ½, ¼ serve)
because a gastric sleeve means small serves; research the top diet apps, paid and free, both stores.

**Built (branch `my-foods`: `01b1e0e`, `54ca11f`, `b4792dd`):**
- `src/myFoods.js`: device copy of checked products (localStorage), validation (per-100 g figures 0–100, sugars ≤
  carbs, serving 0–5000 g), backup/restore JSON, newer-edit-wins merge.
- `netlify/functions/food-bank.js` + `src/foodBank.js`: the shared food bank in Netlify Blobs (one JSON
  "catalogue" blob; GET all / GET one / POST / DELETE; 10 KB body cap; 20,000 products cap). Lookup chain on
  every scan: device → food bank → Open Food Facts; a food-bank hit is copied to the device for offline use.
- Home scanner: vibrates on a read, then a status line walks through each stage and ends with found / not found
  (with what to do). Same on the My foods page.
- Meal builder: serving size carried from the product; ¼ ½ ¾ Full buttons set the grams; the ingredient box
  suggests saved foods and fills their figures. Saving a meal remembers scanned items (and pushes them to the bank).
- Tests: `tests/myFoods.spec.js`, `tests/foodBank.spec.js` (function with an in-memory store + the lookup chain),
  portion and saved-food smoke tests. 354 passed / 6 skipped / 0 failed.

**Decisions I made — revisit if you disagree:**
- Reused the Libre sync passcode to lock the food bank, so there's no new secret to set up. Phase 1 only; a
  public version needs real per-household accounts.
- Only product facts go to the bank (barcode, name, per-100 g carbs/sugars, serving size), never meals or readings.
- One shared JSON blob, not one per product: a household list stays small (5,000 products is under 1 MB) and
  the phone downloads it in one go.
- A product deleted on one device stays on others until deleted there too (safer than silently losing it).
- Size isn't why the bank exists: phone storage could hold it. It exists so every device sees the same list and
  a lost phone loses nothing.

**Research:** "Meal & Carb App Study" — https://claude.ai/artifact/RpHjgJfhMkwy5fKYyhfygd (copy in `research/`).
Twelve apps on both stores (MyFitnessPal 100M+, Yazio 50M+, FatSecret 50M+, Lose It! 10M+, Carb Manager 5M+,
MyNetDiary 5M+, mySugr 5M+, Baritastic 500K+, Easy Diet Diary 100K+, Cronometer, MacroFactor, SNAQ), with
paid-tier features and prices. Closest rival: **SNAQ** (meals on the CGM curve; photo-AI carbs). Suggested next
builds: saved meals, recipes with servings, a source label on each figure, voice logging (fits Scott's
dictation), "similar meals" from his own history, and later Australian loose-food data (AUSNUT).

## 2026-09-28 (late) — food bank shipped; Help & sources page and first-run welcome built (branch `help-and-welcome`)

**Scott's asks:** a help page that credits the Australian and international research and food data the app
draws on; make clear it's an aid, not gospel (the Libre and finger-pricks already disagree a lot); check how
other apps limit liability; and a first-run screen with a profile and a checkbox.

**Built (`151de5c`):**
- **Help & sources** (Home → ❓): what the app is and isn't; why the Libre and a finger-prick disagree
  (interstitial fluid lags blood 5–15 min; published Libre 2 average error ~9–13%, worse in lows and on day one);
  what Australian guidance says about a low (Diabetes Australia/healthdirect: below 4.0, ~15 g fast carbs,
  recheck after 15 min — framed as pointing to official guidance, with "your care team's plan comes first");
  how each part works; exactly what data leaves the device; **19 cited sources** in five groups (Australian
  low-glucose guidance; reactive and post-bariatric hypoglycaemia; sensor accuracy; food data incl. the Open Food
  Facts ODbL attribution, AUSNUT, Sydney Uni GI; ADA threshold and the TGA software exclusions).
- **Welcome** (`src/welcome.js`): shown once per wording version (`TERMS_VERSION`); optional first name,
  condition (reactive / post-surgery / type 1 / type 2 / gestational / other), who helps you; a required
  checkbox. "Read Help & sources first" is allowed; the welcome returns until accepted. Help has a button to
  review it. Device only. Tests start with it accepted via `storageState` in `playwright.config.js`.

**How other apps handle liability (researched):** mySugr's wording is the typical pattern — not medical advice,
for information only, not a replacement for professional diagnosis or treatment, always consult your doctor.
Health trackers that avoid dosing (MyFitnessPal, most carb apps) aren't registered medical devices; mySugr's
bolus calculator *is* one in several markets. For this app, the stronger protection is staying descriptive
(no doses, no "safe amounts"), which keeps it within the TGA software exclusions.

**Decisions I made — revisit if you disagree:** collect only what the app uses (name optional, condition, care
team); age and weight left out until a feature needs them. Checkbox is required to continue; everything else
optional. Replaced a placeholder that used real names (Dr Foley, Marg) with a generic example.

**Needs Scott:** "ship it" for `help-and-welcome`; **a lawyer's review of the Help and welcome wording before
the app is public** (Australian Consumer Law guarantees can't be excluded by a disclaimer; a lawyer should
also check the privacy wording against the Privacy Act for health information).

## 2026-09-28 (late) — size, memory and a stale-code sweep (branch `cleanup`)

Scott asked how big the app is and whether there's stale code.

**Size:** a phone downloads ~620 KB raw, **~150 KB compressed**: the app itself is 63 KB JS + 15 KB CSS (≈24 KB
compressed); the barcode reader is 478 KB (≈123 KB compressed) but **only loads when Barcode is tapped**. Source:
~5,200 lines of app code + ~1,500 lines of tests. `node_modules` (96 MB) is development-only, never shipped.

**Memory and storage (load test, synthetic data in a throwaway browser, Pixel 7 profile):**
| | 1 month (2,970 entries) | 1 year (36,135 entries) |
|---|---|---|
| Memory after opening | 2.6 MB | 8.6 MB |
| Readings list, before fix | 2.2 s, 15,787 elements | 4.4 s, **188,312 elements** |
| Readings list, after fix | — | 2.2 s, **1,451 elements** |
| Storage on the phone (no photos) | 1.0 MB | 11.7 MB |
The remaining ~2 s is reading a year from storage; fine for now, could load recent data first later.
Meals tab 0.56 s and graph 0.34 s at a year. Script: session scratchpad `perf/load.mjs` (not kept in the repo).

**Findings and what was done:**
- Readings list drew every entry → now newest 200 + "Show more" (`cleanup`, `9e0f7e2`, test added).
- Dead code removed: `db.deleteEntry` (never called), `myFoods.lookupWithMyFoods` (replaced by
  `foodBank.lookupFood`), `timeline.renderTimeline` alias.
- Several helpers are exported but only used inside their own file — harmless, left alone.
- **Photos are stored full size** (~2–5 MB each from an iPhone → ~5 GB/year at 3 a day; iPhone browsers may
  clear a site's storage). **Needs Scott:** OK to also shrink the saved copy (see the photo patch README).
- The 20 Sept photo patch no longer applied → refreshed (`proposed-patches/…/REFRESHED-2026-09-28.patch`);
  466 passed with it applied. Still not applied.
- Stale worktree `…-0f088a` (146 MB; 116 MB of it a Netlify build cache; nothing uncommitted) moved to
  `PROJECTS - START HERE/Scott Check Here/tracker-stale-worktree-0f088a (safe to delete, 2026-09-28)` (a move to
  Dropbox stalled on iCloud downloads and was stopped before anything was copied; the same-drive move was instant); merged local branches
  (`meal-builder`, `readings-filter`, `my-foods`, `claude/…-0f088a`) deleted.
- Old branch `claude/reactive-hypoglycemia-tracker-3cd4a9` (on GitHub) has **one unmerged commit**, an early
  "manual device-to-device sync" prototype. **Needs Scott:** keep or drop (the food bank now covers sharing
  products; it doesn't cover readings).
- `CLAUDE.md`'s test counts were stale (still "four files, 30 test cases") → updated.

## 2026-09-28 (night) — Saved meals (branch `saved-meals`, on top of `cleanup`)

Scott: "carry on with other stuff". Picked the top suggestion from the app study and his own point that
people eat the same foods regularly. `src/savedMeals.js` (device-only list; same name replaces; alphabetical),
chips at the top of the meal builder load a saved meal as editable rows; "⭐ Save meal" under the total. 3 unit
+ 1 smoke test (save → reload → load → adjust grams → total updates → delete). 390 passed / 6 skipped / 0 failed.
Also shortened the Home link "Help & sources" to "Help" (it wrapped to three lines on a phone).
**Decision I made:** saved meals stay on the device (not in the food bank), since a meal is personal eating
data, and the food bank is product facts only.

## 2026-09-28 (21:50–21:58) — photos shrunk; Libre passcode prompt fixed; both shipped

**Photos (Scott: "apply the photo patch and shrink saved photos too"):** the refreshed 2026-09-20 patch applied
cleanly (AI copy ≤ 1568 px; ai-proxy input caps; clearer errors). New: the photo **saved with a meal** is now
≤ 1600 px, JPEG q0.8 (`shrinkForStorage` in `src/imageForAI.js`, used by the camera save and the batch photo
import; photo dates are still read from the original). Photos saved before tonight are unchanged. Test: a
4032×3024 noisy photo saves as 1600 px wide and under a third of the size (Chromium; WebKit skipped for the
documented photo-save automation gap).

**Libre sync bug (Scott: "there seems to be a problem with the CGM syncing … password input not asked for"):**
root cause — with no passcode saved on the device, Home's "Sync CGM" only showed a hint pointing to Settings;
nothing reached the server (function logs: no calls from his phone tonight, only my passcode-less deploy
checks). Fix: Home shows a passcode box ("Remember on this phone" ticked), syncs, and if a saved passcode is
wrong it's forgotten and Home asks again. 2 smoke tests. **Not verified on his phone yet** — his next Sync CGM
tap is the test; if it says "Wrong sync passcode", the Netlify value and what he types differ.
**Decision I made:** "Remember on this phone" defaults to ticked on the Home prompt (Settings' own checkbox
still starts unticked) — typing it every time is what caused this.

## 2026-09-28 (22:00–22:05) — header, full screen, passcode drop-down (shipped)

Scott: the top-left said "Home" — better for the app's name and the date/time; wants full screen with no URL;
"a drop-down box asking for the password would be better".
- Header: "Reactive Blood Tracker" on Home (other pages keep their titles) with the date/time underneath on
  every page (`formatDate`, so it follows the Settings date format), refreshed every 30 s.
- Full screen: the manifest was already `display: standalone` with the Apple meta tags, so the **home-screen
  icon** already opens with no address bar. A website can't hide Safari's own bar, so phones in the browser now
  get a one-time "Add to Home Screen" tip (iPhone wording: Share → Add to Home Screen; Android: menu → Install
  app). Manifest `name` → "Reactive Blood Tracker", `short_name` + `apple-mobile-web-app-title` → "Reactive".
- The Home passcode box (shipped 21:58) now slides into view and focuses the field.
- **Tell Scott / likely cause of "not asked":** a home-screen app stays in memory on iPhone — swipe it closed and
  reopen to get new versions (the service worker is network-first, so a reload online always gets the latest).

**22:10 — branch `claude/reactive-hypoglycemia-tracker-3cd4a9` dropped (Scott: "drop the old device-sync branch").**
Its one unmerged commit (`d6f7ce4`, an early manual device-to-device sync + threshold prototype) was saved first
as `PROJECTS - START HERE/Scott Check Here/tracker-device-sync-prototype-3cd4a9 (dropped 2026-09-28).patch`
(recover with `git am`), then deleted locally and on GitHub. The repo now has only `main`.

## 2026-09-28 22:13 — Libre passcode still refused (Scott: "checked the password twice, still not accepting")

**Evidence:** `cgm-sync` logs show his 5 attempts (22:02–22:09 AEST) reached the server, each ~1,000 ms = the
wrong-passcode path. So the new Home prompt works; the passcode doesn't match `CGM_SYNC_PASSCODE`.
**Shipped (`03b1272`, 502 passed):** the comparison now ignores spaces at either end on both sides (also used by
the food bank). **Not verified** — the value in Netlify was not read (credentials are Scott's).
**Likely remaining causes, for Scott:** (1) he's typing his LibreLinkUp/Libre app password, not the separate
passcode he made up for `CGM_SYNC_PASSCODE`; (2) the Production value in Netlify differs from what he remembers.
**Fix path (his):** Netlify → Site configuration → Environment variables → `CGM_SYNC_PASSCODE` → view or set a new
value (8+ characters) for Production; **then a redeploy is needed** (functions only see env changes after one) —
tell a session "redeploy" and it runs the standard deploy line.

## 2026-09-28 22:15–22:21 — first-run opening, keyboard, "Your setup" (shipped)

Scott: on first open a keyboard covered the bottom of Home; wanted the opening to be the bouncing droplet with the
name, then optionally a short "what it does", then the agreement, then the app — the extra steps only once. Also:
record in Help that the conditions were accepted and how the app was set up, with where to change it.
- **Keyboard:** the glucose box had `autofocus`, which pops the keyboard on open. Removed.
- **Opening:** the splash (droplet lands on the spring) now reads "Reactive / Blood Tracker" with "For reactive
  hypoglycaemia and diabetes…". It plays every start and fades as before. **First run only:** it stays up with
  "What does it do?" (a 5-point overview → Next) and "Get started" (straight to the agreement). After accepting,
  those two screens never show again (until the wording version changes).
- **Help → Your setup:** date the conditions were accepted, name, what's tracked, who helps, and "Change my setup"
  (reopens the agreement pre-filled). `acceptedAt()` + `CONDITION_LABELS` in `src/welcome.js`.
- Tests updated/added in `tests/welcome.spec.js` (incl. "no keyboard focus on first open").

## 2026-09-28 22:23 — Scott's next requests (planned, not built: too close to his 11 pm internet cut-off)

**1. Graph redesign (no Scott input needed — build first).** His words: "an average flowing line… on one side the
peaks and on the other side the troughs, and any time you exceed the lower threshold for low blood sugar or the
threshold for high blood sugar, which is important for diabetes cases". Plan:
- Line: a rolling average of CGM readings (e.g. 30-min centred window), drawn smooth; raw points faint behind it.
- Peaks (local maxima above a prominence, e.g. ≥ 1.5 mmol/L) labelled *above* the line with value + time;
  troughs labelled *below*. Keep labels from colliding (skip ones too close together).
- Shaded bands where readings are below `low` or above `high` (both already exist in `src/thresholds.js`),
  with a list under the graph: each crossing's start time, lowest/highest value, and duration.
- Finger-pricks stay as diamonds; meal markers stay; legend updated. Also used in the printable report.
- Decisions I'd make: smoothing window 30 min; peak prominence 1.5 mmol/L; crossings shorter than 15 min still
  listed (a short low matters).

**2. "Report a problem" (no Scott input needed for v1).** A form in Help: what happened, what they expected, an
optional screenshot; the app attaches version, device and page. v1 stores reports in Netlify Blobs
(`bug-reports`, like the food bank, no personal health data included by default) and a session reads them.
**Scott's question:** should reports also email him? If yes, which address (his Business 365 one?) — that's
publishing an address, so his call. Emailing needs a sending service (e.g. Resend or Postmark, a free tier is
likely enough) set up with his account.

**3. People who monitor (family, carers, diabetes educator, endocrinologist).** "Alter/add people who are
interested in monitoring… low or high." This is the planned sharing-with-roles feature plus "tell my family if I
go low". **Scott's decisions needed:** (a) how alerts reach them — a notification on their own phone (they
install the app; free, needs the app open or push set up), SMS (costs per message, most reliable), or email
(free, slowest); (b) what they may see — alerts only, or the full graph/report. Consent: each person is added by
the user, can be removed any time, and sees only what that role allows (privacy principles in `CLAUDE.md`).

**4. Letter to doctors.** Draft written: `research/2026-09-28 DRAFT letter to doctors.md` — what the app does,
why the patient is sharing, how to read the graph (matches plan 1), that it's descriptive only, and an easy
opt-out for the doctor. In the app: a "Share with my doctor" button that opens the patient's own email app with
the letter pre-filled plus the printable report (email apps can't take attachments from a link, so v1 is
"download report, then attach"; true attachments need the sending service from 2). **Scott:** read the draft;
lawyer review before public.

## 2026-09-28 22:26 — Scott's product vision (recorded in `CLAUDE.md` → "Product vision"); new backlog items

Recorded, not built. Added to the backlog, after the four planned items above:
5. **Device list the user picks from** (Settings → "My devices"): Libre 2 Plus, Accu-Chek Guide Me, Dexcom G7
   (arriving soon from ADACare), "other / type readings in". Uses the existing `glucoseSources` registry.
6. **Sensor vs finger-prick check.** When a finger-prick is logged and the CGM line has been flat (e.g. change
   < 0.5 mmol/L over the prior 30 min), compare them; if they differ by more than ~20% (or 1.0 mmol/L at low
   values; to be tuned), show a note: "Your sensor and meter disagree while your glucose is steady. A common cause
   is sensor placement" + links to Abbott's and Dexcom's **official** application instructions (manufacturer
   pages/videos, not random YouTube). Descriptive, no device advice beyond the manufacturer's own.
   Scott's case for the record: Libre on the inside of the arm read dramatically low (into muscle); back of the
   upper arm matched the meter once steady.
7. **"Frequent lows" prompt → letter to GP/endocrinologist.** e.g. "3 or more lows below your threshold in 7 days"
   → "You may want to show this to your GP" + the doctor letter pre-filled with those episodes. Wording must stay
   a suggestion to see a professional (the thresholds for "frequent" are a product decision to confirm with Scott).
8. **Invite your doctor** to view (part of the monitoring/roles feature, item 3).
9. **Exercise alongside glucose** (already on the list; Apple Health route = iPhone Shortcut import).

## 2026-09-28 22:43 — "My devices" spec, from Scott (build second, after the graph)

Scott: "a list of devices that have been sent along with their serial numbers… we have them individually. I'm at
hospital, there might be more than one… make sure you've got the right one… a method of checking and/or
re-entering the passwords… if they fail to register."
- **Device register** (Settings → My devices): each physical device kept individually — type (Accu-Chek Guide Me,
  Libre 2 Plus sensor, Dexcom G7, other), **serial number**, a nickname, date added/started, status
  (in use / finished / failed). Stored on the device (not the food bank — it's personal).
- **Right device, not a neighbour's:** a meter's serial is readable after connecting (Bluetooth Device Information
  Service 0x180A, Serial Number String 0x2A25 — check the Guide Me exposes it). On sync, compare with the saved
  serial; if it differs, stop and ask "This is meter …1234, not your saved meter …5678 — use it anyway?" before
  saving any readings. First connection offers to save the serial. (Web Bluetooth's own picker also shows the
  name; the serial check is the safety net.)
- **Libre sensors:** LibreLinkUp's connection data includes the active sensor's serial and start time — record each
  new sensor automatically into the register with its start date. This also gives the sensor-failure history Scott
  needs for Abbott replacements (his Libres fail after 3–4 days; DVA handover logs this separately).
- **Check / re-enter credentials per device:** a "Test connection" button on each device; on failure the exact reason
  and a re-enter box (the Home passcode prompt already does this for the Libre sync passcode; extend it per device).
- Readings keep the device they came from, so the graph can compare devices.
- **One "Sync" button, not one per device (Scott, 2026-10-02).** Once devices are paired/registered,
  a single Sync button walks through all of them in sequence rather than Home having a separate
  button per device type. For a device needing manual action first (the Accu-Chek Guide Me: wake it,
  it's not advertising until you do), the flow shows a prompt step ("Turn on your Accu-Chek Guide Me,
  then tap Continue") before attempting that device's connection, then moves to the next registered
  device automatically. Libre (LibreLinkUp, needs only the saved passcode) and Dexcom ONE+ (needs
  nothing physical once OAuth'd) can run without a manual-action prompt. Build this as part of My
  devices, replacing the separate "Sync CGM"/"Sync meter" buttons that exist today — not an addition
  alongside them.

**22:45 — redeployed at Scott's request** (same code, live `index-Ct3LwouD.js`), so the sync functions pick up any Netlify setting he just changed. `cgm-sync` confirms a passcode is set (answers "Wrong sync passcode" to a blank one, not "not configured"). His next Sync CGM tap is the test.

## 2026-10-02 — third CGM device arrived: Dexcom ONE+, not G7 (corrected everywhere above)

Scott: "dexcon one +" has arrived from ADACare. Every prior mention in this project (CLAUDE.md, this
file) assumed **Dexcom G7** — asked him directly rather than guess, since the two models may not
integrate the same way. Confirmed: **Dexcom ONE+**. Fixed the forward-looking references above; left
the dated historical entries as the record of what was said at the time, with pointers to this entry.

**Researched what this means for the build** (the 2026-09-28 entry above had flagged "Dexcom Share
vs official developer API — decide once the device is here"; it's here now):

- **Good news: ONE+ uses the same "Dexcom Share" mechanism as G6/G7** — this isn't a different
  integration path, just a different device name. The *original* Dexcom ONE (no "+") does **not**
  support Share; ONE+ does. (Sources: [Dexcom G7 vs One+ in xDrip — NightscoutFoundation/xDrip
  discussion #3677](https://github.com/NightscoutFoundation/xDrip/discussions/3677),
  [Nightscout's supported-uploaders docs](https://nightscout.readthedocs.io/en/latest/uploader/uploaders.html).)
- **Dexcom's official path is a real developer API** (OAuth 2.0, REST — `developer.dexcom.com`), with
  the exact two-tier split that resolves the "decide" from 2026-09-28:
  - **Sandbox** returns **only simulated test accounts — never real glucose data**, confirmed directly
    from Dexcom's own docs: "a small set of simulated user accounts that do not correspond to real
    users." Not useful for Scott's own readings, ever.
  - **Production / "Limited Access"** is what actually returns real data, and explicitly supports an
    **individual developer applying for their own personal use** — "Apply for Upgrade" from the app's
    profile page, reviewed by Dexcom's Strategic Partnerships team, approval comes with a **Data
    Licensing Agreement Scott would need to sign himself**, capped at 5 authorized users (more than
    enough — covers him plus the "people who monitor" feature later). ([Dexcom developer
    docs — scopes & access](https://developer.dexcom.com/docs/dexcom/scopes-access).)
  - This is the same server-side-polling shape already built for LibreLinkUp (`netlify/functions/cgm-sync.js`)
    — once Scott has real OAuth client credentials from an approved Dexcom developer app, a second
    Netlify function hitting Dexcom's endpoints instead of LibreLinkUp's is the natural build, reusing
    the `glucoseSources` registry exactly as designed for this.
  - Unofficial alternative exists too (xDrip4iOS on iOS, xDrip on Android, bridging to a self-hosted
    Nightscout instance) — same tradeoff already written up for Libre: avoids Dexcom's approval process,
    but adds a self-hosting step. Official path is recommended first, same reasoning as the Libre choice.

**Needs Scott, before any real Dexcom sync can be built (can't do this for him — it's his identity and
his signature):** register a Dexcom developer account and apply for Limited Access on
`developer.dexcom.com`; that review+signature step is the real lead time here, not anything code-side.

**Not blocking the device-register work:** "My devices" (backlog item 5, build order above) can still
list "Dexcom ONE+" as a selectable type and let Scott record its serial/nickname now — same pattern as
Libre/Accu-Chek already in the registry before their real connections existed — manual entry stays the
fallback either way.

## 2026-10-02 — Graph redesign built (Scott: "start the graph"): smoothed line, peaks/troughs, threshold bands, in the printable report too

Built the item Scott asked to start first, to the exact spec in the 2026-09-28 22:23 entry above (a
rolling-average line; peaks labelled above it, troughs below; shaded bands and a list wherever a
reading crosses low/high) — nothing further needed from him, as that entry itself said.

**New: `src/graphAnalysis.js`** (pure logic, 17 unit tests in `tests/graphAnalysis.spec.js`):
- `smoothSeries(points, windowMinutes=30)` — centred rolling average, run per gap-split run (same
  `splitAtGaps` the raw line already used) so smoothing never bridges a sensor data gap.
- `findPeaksAndTroughs(smoothed, {prominence=1.5})` — a simplified topographic-prominence filter:
  finds alternating local extrema, then repeatedly drops the single least-prominent one (how far it
  stands above/below the higher/lower of its two neighbours) until everything remaining clears the
  threshold. A flat run collapses to one extremum; a small wobble next to a real peak gets merged away.
- `findThresholdCrossings(points, thresholds, pointsUnit)` — continuous spans of RAW readings (not
  smoothed — "a short low matters," so nothing shorter is filtered out) below low / above high.
  Finger-pricks are deliberately excluded from crossings: they're sparse, already flagged individually
  on their own diamond marker, and claiming a "duration" between two isolated moments would overstate
  what was actually measured. Takes the points' own unit explicitly (mirrors how the rest of the graph
  already converts thresholds for the low-rule line) — caught by a test before it shipped: it's easy to
  assume mmol/L and quietly compare the wrong scale when the display unit is mg/dL.

**`src/timeline.js`:** `renderReadingsGraph` now draws, per CGM run: faint raw dots behind a bold
smoothed line; a labelled dot at each kept peak/trough (collision-avoided — a label within 26px of the
last one of its kind is skipped, Scott's own "keep labels from colliding" ask); a `highRule` dashed line
to match the existing `lowRule` (was missing entirely before); shaded `graph-crossing` bands for every
low/high span; a crossings list underneath (most recent first, e.g. "Low — 3.0 mmol/L lowest, 45 min
(12:05–12:50)"), still listing anything under 15 minutes in full rather than rounding it away. Legend
updated to match. The axis now always extends to include the high threshold, mirroring how the low
threshold already worked (previously only low self-extended the axis).

Refactored the SVG-building into a DOM-free `buildGraphHTML()`, with `renderReadingsGraph()` now a
one-line wrapper that assigns it into a container — needed so the printable report (next) can reuse the
exact same renderer without a live DOM container.

**Printable report now includes a graph** (Scott's spec: "also used in the printable report").
Deliberately always "the last 7 days ending now," independent of whatever historical from/to range was
picked for the table below it — matching that range would have meant reworking the chart's own "now"
axis label and title for a feature whose main content is already the full table; the 7-day snapshot adds
real value without that complexity. `src/style.css` forces print-friendly light colours for the graph
under `#print-summary` (a dark-mode surface/background would otherwise print as a wasted dark rectangle).

**Verified:** 17 new unit tests + a new smoke test (CGM synced via the existing `mockSpikySync` mock,
then printed, checking the graph section's heading/SVG/legend appear) — **608 passed / 12 skipped / 0
failed**, all 4 browser projects. Also checked by eye in the Browser pane with a seeded 6-hour spike-
and-crash series: smoothed line, both peak (11.5) and trough (3.3) labels, both threshold rules, both
shaded bands, and the crossings list all rendered correctly and matched the underlying data.

**Mid-build, Scott sent three unrelated updates — captured against the right backlog items, not
acted on yet (noted further up this file, near each item):** the single-sync-button idea for My
devices; Dexcom's own Apple Fitness/steps option (confirms the exercise-correlation feature is worth
building, doesn't change the Shortcut-import plan); a splash-screen colour-wave polish idea; and a
question about a quick mmol/mg toggle on the graph itself (answered: yes, trivial linear conversion,
already supported app-wide via Settings — **new, not yet built:** a local toggle right on the graph,
reusing the same `convertUnit`/`unit` parameter that already exists, for a viewer who thinks in the
other unit without digging into Settings — small, ready whenever it's next up).

**✅ SHIPPED 2026-10-02** — committed (`726b760`), pushed to GitHub, deployed with
`--skip-functions-cache`. Live bundle `index-CCaZ0fTT.js` confirmed on reactivebloodtracker.com;
`cgm-sync`/`food-bank` both still answer 401 without a passcode (correct).

## 2026-10-02 — My devices built (Scott: "yes, go ahead"): device register, right-device safety check, Libre sensor auto-record

Built most of the spec from the 2026-09-28 22:43 entry above, against the device Scott confirmed
today (Dexcom **ONE+**, not G7). Scoped deliberately: the device register, the safety checks, and
Settings UI are built and shipped below; the **single unified Sync button replacing the two existing
ones is not built yet** — see "Not built this pass" below for why.

**New `src/devices.js`** (pure logic, 8 unit tests): a device-only (not food-bank — personal, not
shared) register — type (Accu-Chek Guide Me / Libre 2 Plus sensor / Dexcom ONE+ / other), serial,
nickname, status (in use / finished / failed), date added. No hard delete — retiring a device keeps
its row, since readings already attributed to it stay meaningful. `recordLibreSensorIfNew()` is
idempotent by serial, and retires the previous Libre sensor to "finished" when a new one appears.

**`src/bluetoothGlucose.js`:** `connectAndFetchReadings()` now also reads the standard Device
Information Service's serial (Bluetooth SIG 0x180A/0x2A25 — a generic BLE service, not Accu-Chek-
specific guesswork, so confidence here is higher than the rest of this file's own "unverified against
real hardware" caveat, though it's still genuinely untested against the physical Guide Me). Returns
`{readings, serial, deviceName}` now, not just `readings` — the one call site (`main.js`) was updated.
**Known limitation, documented in the code:** a device paired *before* this change won't expose the
new service until its next full re-pair through the picker — `getDevices()`'s silent reconnect replays
the original grant, which for an already-paired meter won't include `device_information` yet. Fails
soft either way (serial just comes back `null`, readings sync proceeds normally) — never blocks on this.

**`netlify/functions/cgm-sync.js` / `src/libreLinkUp.js`:** `extractSensorInfo()` pulls the active
sensor's serial + activation time straight out of the `/llu/connections` response's own `sensor` field
(`sn`, `a` as Unix *seconds*) — field names confirmed against a real captured LibreLinkUp HTTP exchange
before writing any parsing code, not assumed (Abbott publishes nothing official for this). Nothing new
stored server-side; the client auto-records it, same privacy rule as readings.

**`src/main.js` — the two existing sync flows now use this:**
- Bluetooth: if a registered meter's serial differs from the one just connected, stops and asks
  ("This is meter …1234, not your saved meter …5678 — use it anyway?", `confirm()`, matching the
  existing pattern already used for deletions elsewhere) before saving any readings. First connection
  with no registered meter yet *offers* to save the serial (asks — a meter can be shared/borrowed,
  so this isn't the same "just record it" case as a Libre sensor).
- Libre: a new sensor is recorded **automatically**, no asking (Scott's own spec: a sensor change is
  routine). Home's status line names it so Scott notices without a trip to Settings.

**Settings → My devices:** list with each device's last-4-of-serial, nickname, add date, and a status
dropdown (retiring doesn't delete); an "Add device" form for noting one by hand (before a first sync,
or for types with no sync yet). Reuses the existing `.source-item` layout.

**Not built this pass — the single unified Sync button:** Scott's 2026-10-02 idea (one button, walks
through every registered device in sequence, with a "turn on your Accu-Chek, then tap Continue" prompt
for the one device that needs manual action first) means *replacing* the two existing, currently-
working `runBluetoothSync`/`runCgmSync` buttons Scott actually uses for his real health tracking — a
materially different risk profile from everything above, which only *adds* checks around those same
flows without changing their shape. Deliberately sequenced as its own next step rather than rushed
into the same pass as the device register underneath it.

**Verified:** 10 new unit tests (`tests/devices.spec.js`, `tests/cgmSync.spec.js`) + 3 new smoke tests
(manual add + status-change-survives-reload; Libre sensor auto-record visible in Settings, idempotent
on a second sync) — **656 passed / 12 skipped / 0 failed**, all 4 browser projects. Checked by eye in
the Browser pane: added a device through the real form, confirmed it listed correctly (and confirmed
*why* an accidental double-click produced a duplicate-looking row — my own test mistake, not a bug —
by reading the actual stored records back out, not just trusting a screenshot).

**Not verified (can't be, from here):** the Bluetooth serial read against Scott's real Guide Me meter
— same standing caveat as the rest of this file's Bluetooth code. The right-device-check and
first-connection-offer prompts are therefore also unverified against a real device, though the logic
either side of the `confirm()` calls is covered by the Bluetooth sync's existing tested paths.

**✅ SHIPPED 2026-10-02** — committed (`95d46a2`), pushed to GitHub, deployed with
`--skip-functions-cache`. Live bundle `index-CKeIr4Q8.js` confirmed on reactivebloodtracker.com;
`cgm-sync`/`food-bank` both still answer 401 without a passcode (correct). **Needs Scott:** his first
real Bluetooth sync is also the first real test of the serial read and the right-device check.

## 2026-10-02 — Unified Sync button built (Scott: "yes, build the unified sync button")

Replaces the two separate "Sync CGM"/"Sync meter" buttons on Home with one: tap **🔄 Sync devices**,
it runs Libre first (nothing physical needed), then the Bluetooth meter (if this browser supports
Web Bluetooth) with a "Turn on your meter, then tap Continue" prompt first, since it isn't advertising
until woken. Either device can be skipped independently without blocking the other.

**The real architecture problem this solved:** the two old flows were separate button-click handlers,
each free to return early (e.g. "no passcode saved, show the prompt, stop"). A *sequence* needs each
step to actually finish — including pausing for a human to type a passcode or physically turn on a
meter — then **resume the same flow** afterward rather than starting a new, disconnected one.
Converted both into step functions that `await` a `Promise` for whichever human input they need
(`waitForCgmPasscode`, and the new `waitForManualStep` for the meter), resolved by the same inline
form/button clicks as before — so from Scott's side almost nothing changes, but the one orchestrating
function can now genuinely wait, then continue to the next device.

**Settings simplified to configuration only:** the Libre passcode field and Bluetooth troubleshooting
hints stay (still useful to set up ahead of time), but their action buttons are gone — both point to
the Sync devices button on Home instead. Per Scott's own spec, this *replaces* the old buttons, not
an addition alongside them.

**The "last synced" badge now covers either source**, not just Bluetooth — it used to hide itself
entirely without Web Bluetooth, which meant it never appeared at all on Safari/iPhone even though
Libre sync works fine there. Generalized rather than left as a Bluetooth-only indicator now that one
button covers both.

**Three real bugs found and fixed while building this** (none were guesses — each was reproduced
and confirmed before being called a bug):
1. The status line only showed a *combined* result at the very end of the whole sequence — so while
   the Bluetooth step's manual-action prompt was waiting (which can sit for minutes), Libre's own
   result was invisible even though it had already finished. Fixed to show each step's result the
   moment it completes.
2. A test helper tried to simulate "no Bluetooth" (to test Safari-like behavior in Chrome) by setting
   `navigator.bluetooth` to `undefined` — but `isBluetoothAvailable()` checks `"bluetooth" in
   navigator`, and overwriting a property's *value* doesn't remove its *key*. Confirmed live in the
   Browser pane: Chrome's real `navigator.bluetooth` exists as an API surface even with no hardware,
   so the check still passed. Fixed with a `Proxy` whose `has` trap actually makes the key disappear.
3. This same gap meant **every existing CGM-sync test was implicitly assuming Bluetooth was
   unavailable** in the test browser, which turned out to be false for the Chrome projects — so after
   Libre finished, every one of those tests' pages would silently move on to the Bluetooth
   manual-step prompt and hang there, since nothing in those tests clicked Continue or Skip. Not a
   product bug (a real user would see and act on the prompt), but it would have made ~10 tests
   flaky/hanging in exactly the scenario they were meant to guard. Fixed by applying the Proxy stub
   to the tests that are genuinely only about Libre, and adding one dedicated test for the real
   two-device sequence (skip Libre, then skip the meter prompt too) on the Chrome projects specifically
   (skipped on WebKit, which has no Web Bluetooth at all — a real platform difference, not a gap).

**Verified:** 658 passed / 14 skipped / 0 failed, all 4 browser projects (12 previously-documented
skips + 2 new, intentional WebKit skips for the Bluetooth-sequence test). Checked by eye in the
Browser pane end-to-end on real Chrome: tapped Sync devices, watched the Libre passcode prompt, then
(since this Mac's Chrome genuinely reports Web Bluetooth support) watched the flow correctly move on
to "Turn on your Bluetooth meter… then tap Continue" — confirmed the real sequencing, not just the
mocked test path.

**Not verified (can't be, from here):** an actual two-device run against Scott's real Accu-Chek Guide
Me and a real Libre sensor together — same standing caveat as the rest of this file's Bluetooth code.

**✅ SHIPPED 2026-10-02** — committed (`ef29a41`), pushed to GitHub, deployed with
`--skip-functions-cache`. Live bundle `index-YBHOg2tH.js` confirmed on reactivebloodtracker.com, with
"Sync devices" present on both Home and the Settings pointer text; `cgm-sync`/`food-bank` both still
answer 401 without a passcode (correct). **Needs Scott:** his first real sync is also the first real
test of the full sequence against his actual Libre sensor and Accu-Chek meter together.

**My devices is now feature-complete against the original 2026-09-28 22:43 spec** (device register,
right-device check, sensor auto-record, one unified Sync button) — no further build planned here
unless Scott asks for something new.

## 2026-10-03 — Connect Dexcom built and shipped (Scott: "Applied, go ahead and build the Connect Dexcom flow")

**Scott's side, done this morning:** registered a Dexcom developer app ("ReactiveBloodTracker.com", developer
account `gofreo`), redirect URI `https://reactivebloodtracker.com/dexcom-callback` saved, and **applied for
Limited Access** (status until approved: Sandbox Data: Access / Production Data: Sandbox Access). Client ID (not
secret): `N7mmBhl4yXM0BktMNVXeEXuLvyGngrvq`. The Client Secret was never shown or copied in-session. Note for
Scott: the app's Dexcom description still says "endocardiologist" (meant endocrinologist) — cosmetic.

**Built (official Dexcom API v3, OAuth 2.0 — endpoints checked against developer.dexcom.com today):**
- `netlify/functions/dexcom.js` — holds the client secret; builds the sign-in link, swaps the one-time code for
  tokens, and syncs (dataRange → egvs, mg/dL → mmol/L). **Stores nothing**: tokens go back to the device and are
  sent with each sync. No passcode needed (unlike Libre) — Dexcom's own sign-in is the gate and a token only reads
  its owner's data. Refresh tokens are **single-use** (Dexcom docs), so it only refreshes once the 2-hour access
  token has expired, and the client saves rotated tokens immediately.
- Query window anchors on Dexcom's own newest data (dataRange), not "now", because Dexcom holds app-uploaded
  readings back **1 h in the US, 3 h elsewhere (so 3 h for Scott)** — documented in Settings so it's not a surprise.
  First sync: 7 days; later: from an hour before the last saved Dexcom reading, capped at Dexcom's 30-day limit.
- `src/dexcom.js` + Settings → "Dexcom ONE+ (CGM)": Connect / Disconnect, status line. A random `state` guards the
  return trip (a sign-in that didn't start in this app is refused). The `/dexcom-callback` URL is cleaned
  immediately so the code isn't left in history; `public/sw.js` never caches that path; `netlify.toml` serves the
  app there.
- **Sync devices** now runs Libre → Dexcom (only if connected; silent otherwise) → Bluetooth meter. New ONE+
  sensors are auto-recorded in My devices by transmitter id (new generic `recordSensorIfNew` in `devices.js`).
- **Sandbox safety:** while `DEXCOM_ENV` is `sandbox` (the default), sync reports "connection works, N simulated
  readings received, not saved" — Dexcom's fake test users never get mixed into Scott's real readings.

**Verified:** 13 server unit tests (`tests/dexcom.spec.js`) + 6 UI flows × 4 browsers (`tests/dexcomUi.spec.js`);
full suite **734 passed / 14 skipped / 0 failed**. Committed `10b7f12`, pushed, deployed with
`--skip-functions-cache`; live bundle `index-BX-GtdhK.js` confirmed; `/dexcom-callback` serves the app; the
`dexcom` function answers "missing DEXCOM_CLIENT_ID, DEXCOM_CLIENT_SECRET" (correct until Scott sets them);
`cgm-sync` still 401 without a passcode.

**Not verified (can't be yet):** a real round trip with Dexcom — needs the two Netlify values. Field names for
dataRange/egvs come from Dexcom's docs, not a captured real response. Readings Dexcom reports with no number (e.g.
below its measurable range) are dropped, as with Libre — worth revisiting for a lows-first app.

**Needs Scott, in order:**
1. Netlify → Site configuration → Environment variables: add `DEXCOM_CLIENT_ID` (the ID above) and
   `DEXCOM_CLIENT_SECRET` (copy from Dexcom's "Show" himself — never via Claude). Then a redeploy (env changes only
   reach functions after one).
2. Settings → Connect Dexcom → sign in at Dexcom with a **sandbox** user → Sync devices should say "test mode".
3. When Limited Access is approved: set `DEXCOM_ENV` to `eu` — **confirmed 2026-10-03:** Scott's personal Dexcom
   account lives at myaccount.dexcom.eu (country: Australia), so `eu` is right, redeploy, Disconnect + Connect again with his real Dexcom login.
