# Reactive Hypoglycemia Tracker — Claude Session Starter

## End every session (or work stoppage) with a SITREP (added 2026-09-14, Scott's explicit instruction)

At the end of any session, or whenever a work stretch stops/pauses — not just when the whole
project wraps up — publish a SITREP as an artifact and leave it on screen. Don't wait to be asked;
this is standing, proactive practice from here on. Scott's own definition of "sitrep": a short
intro, then a plain **done / not-done** list, then a small **follow-up report** going into more
detail on whatever the session actually touched, plus an honest section on any errors, bugs, or
access limitations hit along the way (don't omit friction to make the session look cleaner than it
was). If a sitrep artifact already exists for this project, republish to the same URL rather than
creating a new one each time.

## Folder-boundary rule (read first)

> Work ONLY inside this folder (`Reactive Hypoglycemia Tracker/`). Do not read, search, or
> reference any other project under `PROJECTS - START HERE` (SfumatoART, DVA New Master, Beyond
> Tomorrow Finance, etc.) unless the user explicitly asks you to cross projects. The one expected
> exception: `DVA New Master`'s medical-evidence material is a named input to this project's
> research — only go there if Scott explicitly points you to it for that purpose, and treat it as
> read-only reference, not something to edit. If you're unsure which folder you're in, stop and ask
> before proceeding.

## What this project is

A personal health tool for reactive hypoglycemia — built from Scott's own medical evidence, the
medical-evidence material in `DVA New Master/`, and open-source JavaScript/Python prior art for
tracking/analysing it. Mobile-first (used mostly on Scott's phone), with a Mac-usable version too.
Will call the Anthropic API for its AI-driven sections — Scott is generating a fresh, dedicated key
for this project once that part is actually being built; don't hardcode or ask for one before then.

**Status as of 2026-09-12: working v1 built** (Vite PWA, `npm run dev`/`npm run build` both work).
See `HANDOVER.md` for what's built, tested, and open.

## Product scope (confirmed by Scott, 2026-09-12)

**Phase 1, now: just for Scott.** He's the actual reactive-hypoglycemia patient — "the guinea
pig" — and wants the tool made as good as it can be for his own daily use first, not held back or
padded out for hypothetical other users. **Phase 2, later, only if Phase 1 proves worthwhile:**
possibly turn it into something other people could use. Not decided, not being built toward yet.

**How this should shape decisions:** prioritize Scott's own UX/quality over any multi-user,
onboarding, or productization work — none of that is needed and none should be built speculatively
(same "don't build for hypothetical future requirements" principle, applied to scope, not just
code). The SparkyFitness non-commercial-license caution in `HANDOVER.md` still applies regardless
of timeline: writing clean original code now avoids having to rip out borrowed code later if
Phase 2 ever happens — costs nothing today, removes a real risk later.

## Privacy & data-sharing principles (confirmed by Scott, 2026-09-12 — read before touching storage or sharing features)

This is medical data. Scott was explicit about the model, and it governs every future storage or
sharing feature, not just what exists today:

1. **Local by default, not an "internet recording."** This is a *personal* recording, not
   something that lives on the internet unless the person using it chooses that. Matches what's
   already built: IndexedDB on-device, no backend database, no accounts, nothing uploaded
   automatically. If cloud backup/sync is ever added, it must be **opt-in** — off by default, a
   deliberate choice the user makes, never silently on. Don't build an "always syncs to the cloud"
   feature even if it seems convenient.
2. **Nothing is shared unless the user explicitly asks.** No document, no data leaves the device
   on its own. Sharing with a nurse, doctor, or anyone else happens only through an explicit user
   action — this is exactly what the Export screen already is (CSV, or the printable/PDF-style
   summary). Sharing channel is the user's choice at that moment: print/PDF, email, USB/file
   transfer, whatever suits them — the app's job is to produce a clean exportable document on
   request, not to pick or automate a delivery channel itself.
3. **Per-person data isolation, if it's ever more than one person.** Phase 1 is Scott alone, so
   this doesn't affect anything being built right now — but if Phase 2 (see above) ever happens,
   each person's records must be fully separate, isolated entries, never commingled across people.
   Design any future multi-user data model around that from the start; don't retrofit it. This is
   also a real legal requirement, not just a preference — see the research brief's §8 (Australian
   Privacy Act: health-service providers are covered regardless of business size, unlike the usual
   small-business exemption).
4. **The data is for the individual's own medical benefit first.** Sharing/export is a secondary
   feature serving that primary purpose (his own tracking, his own doctor visits) — not the other
   way around.

## Reading order — do BEFORE writing any code

1. `HANDOVER.md` (this folder) — current status, what's decided, what's still open.
2. `research/` (this folder) — anything the Cowork research session has dropped here. If it's
   empty and `HANDOVER.md` still says "awaiting handoff," don't guess at scope — check with Scott.

## How the Cowork research session links up (read this if unsure)

Scott separately started a Claude session in "research mode" — he calls it **Cowork** — with the
sole intent of researching reactive hypoglycemia against his medical evidence, `DVA New Master`'s
medical-evidence folder, and open-source JS/Python prior art, then handing the findings to a Claude
Code session here for building.

**There is no live link between that session and this one.** Confirmed directly (2026-09-12): its
session ID, `cse_01SH3uMcFJ2Kt4E9nejDK31F`, does not appear as an addressable peer session from a
Claude Code session in this folder — it's a different kind of Claude session (very likely a plain
claude.ai conversation), not something reachable via SendMessage/ListAgents from here. So the
handoff only happens through a file: Scott (or the Cowork session, if he exports from it) drops
its findings into `research/`, and that's the only way this project sees them. If `research/` is
empty, the research hasn't come across yet — don't assume or invent findings.

## AI / Anthropic key — Phase 1 vs Phase 2 (confirmed by Scott, 2026-09-12)

**Phase 1, now: one personal key, Scott's own.** Deployed on Netlify
(`reactive-hypoglycemia-tracker.netlify.app`, team `smfraser60`, site id
`0b9a9624-13b7-4441-8056-0807f9cbbf7c`). Scott picked Anthropic himself ("I like their policies").
The key is a server-side env var (`ANTHROPIC_API_KEY`) read by `netlify/functions/ai-proxy.js` —
architecture already built for exactly this, nothing to change. **Not configured yet.**

**Whoever picks this up: do not enter the key value yourself, in any tool, ever — not into
Netlify's env vars, not into a `.env` file, not anywhere.** Handling API keys/secrets on Scott's
behalf is off-limits regardless of whether he pastes the value in chat and asks — tell him to add
it himself directly in Netlify's dashboard (Site settings → Environment variables →
`ANTHROPIC_API_KEY`), or run `netlify env:set` himself. Until it's set, `ai-proxy.js` correctly
returns `{configured: false}` — that's working as designed, not a bug to chase.

**Phase 2, later, only if this goes public — bring-your-own-key model:**
- Each user supplies their **own** Anthropic key — never a shared/pooled key covering everyone.
  Scott's reasoning: keeps each person's data under their own control, gives them choice of where
  their key comes from, and means Scott (as the app's builder) never becomes the custodian of
  everyone else's AI-routed health data or bears everyone's API cost.
- **At setup, before any key is entered:** show a plain-language security-risk disclosure — using
  AI features means their food photos/text get sent to Anthropic using their own key. Let them do
  their own research and decide they're comfortable, before the key-entry field appears, not after.
- The app can **guide** them on how to get an Anthropic key (a link to Anthropic's docs/console)
  but never supplies, generates, or stores a key on their behalf — sourcing the key is entirely
  their own personal choice/action.
- **Without a key, the app still fully works** — manual glucose/food/diary entry, timeline, export
  — it "just becomes a data storage system" (Scott's own words). Only AI-dependent features (photo
  food analysis, text AI-parsing, the clarifying-question loop) are unavailable.
- **Real architecture change this implies, not built yet:** Phase 1's single server-side env-var
  key doesn't work for Phase 2 — each user's key would need to be supplied per-request (e.g.
  entered client-side, sent with each call) rather than baked into one shared server config. Don't
  build this now; it's meaningless with one user, and premature per this project's own "don't build
  for hypothetical future requirements" rule. Just don't build anything in Phase 1 that would make
  this harder to add later (e.g. don't hardcode the assumption that there's exactly one global key).

## Glucose/meter connectivity — technical reality (clarified 2026-09-12, meter confirmed + built 2026-09-14)

Scott asked directly whether the app can talk to the Libre 2 Plus over Bluetooth and to a
finger-prick meter. Answered plainly, recorded here so it isn't over-promised later:

- **Libre 2 Plus is not a direct-Bluetooth-to-this-app situation.** The sensor streams over
  Bluetooth to Abbott's own app, not to arbitrary third-party apps. The real integration path —
  already the brief's own §3.2 recommendation — is **LibreLinkUp**: once the sensor is active and
  Scott turns on sharing from the official app, a backend job can poll LibreLinkUp for the latest
  reading every few minutes. Not live-streaming, not built yet, and can't be tested until the
  sensor is actually active — still pending supply as of 2026-09-14 (Abbott dispatched it
  2026-09-07, ADACare chasing a tracking number, see HANDOVER.md for the live status).
- **Finger-prick meter confirmed: Accu-Chek Guide Me** (ADACare phone call, 2026-09-14 — an earlier
  guess of "Accu-Chek Inform II" from a label photo was wrong inference and has been corrected;
  don't resurrect it). Guide Me genuinely has Bluetooth (standard Bluetooth SIG Glucose Service,
  0x1808 — a public spec, not something Roche has to bless) alongside a USB port for PC transfer
  (Roche's own protocol for that side is undocumented and they've refused to share it even under
  NDA — don't attempt that path). A real Bluetooth source is now built: `src/bluetoothGlucose.js`,
  registered in `glucoseSources` as `bluetooth-meter`, gated on `"bluetooth" in navigator` (Chrome
  on Mac/Android only — Safari/iOS has never implemented Web Bluetooth). **Built strictly to the
  published spec but not yet confirmed against the physical device** — see HANDOVER.md's
  2026-09-14 build entry for exactly what is and isn't verified. Manual entry remains the reliable
  fallback regardless.
- **Equipment WILL change over time — this is exactly why `glucoseSources` in `src/glucose.js` is
  a registry, not a hardcoded meter/CGM** (Scott's own explicit requirement, captured earlier in
  this file's history and in `HANDOVER.md`). When LibreLinkUp polling gets built, or a different
  meter replaces the Guide Me, it's a new/swapped entry in that registry — manual entry keeps
  working as the fallback, never a rewrite.

## Descriptive, not prescriptive — reaffirmed against a specific ask (2026-09-12)

Scott asked for the AI to eventually tell him "the amount of food you can eat without raising or
lowering your sugar too quickly" — i.e. a safe-portion recommendation. **This is out of scope, not
deferred-and-forgotten — explicitly declined, for the same reason brief §5/§8 already gave:** an
AI guessing wrong about a safe portion for someone with reactive hypoglycemia is a real safety
risk, and offering that kind of guidance pushes the app into TGA-regulated
software-as-a-medical-device territory. Both reasons hold regardless of how good the AI seems.

**What to build instead, once there's enough logged history to show it from:** surface the
*pattern* as plain fact, not advice — e.g. "the last 4 times you logged white bread, your next
reading was below 4.0 mmol/L within 90 minutes." Descriptive correlation between food and glucose
response, drawn from Scott's own real logged data, is exactly what this app is for (see brief
§1/§10). The line is: show what happened: yes. Tell him what's safe to eat: no. Any future work
suggesting portion sizes, meal timing advice, or anything phrased as a recommendation needs a
conscious call with Scott first, not a default assumption that "more helpful AI" is the goal.

**Exception, deliberately carved out by Scott himself (2026-09-14): a safety *floor* is not the
same as advice.** The Settings glucose-warning thresholds (`src/thresholds.js`) let Scott raise his
own low-threshold above a recognized standard for extra personal margin (his own analogy: driving
to a 5 mmol/L personal cutoff when the real risk starts around 4.6-4.7), but the app refuses to let
it go *below* that standard (currently the ADA's cited 3.9 mmol/L / 70 mg/dL). This is intentionally
different from the portion-size question above — it's a hard-coded, non-personalized, cited public
figure acting only as a clamp against a less-safe number, never a suggestion or a recommendation
generated for the specific situation. Don't read this as license to add other "the app just knows
what's safe" behavior elsewhere — it's a narrow, deliberate exception Scott designed himself, not a
precedent to extend without asking him first.

## Platform target

Mobile-first — this is the primary way Scott will actually use it day to day. Mac support matters
but is secondary. Keep that priority in mind for any framework/UI decisions once building starts.

## Testing — run before every deploy (added 2026-09-12, grown heavily 2026-09-14)

A real Playwright test suite exists — four files, 30 test cases: `tests/smoke.spec.js` (full
app-shell/UI flows: Home's glucose+food quick-entry, Readings list/graph, the threshold-floor rule,
date-format lock, barcode scanner open/close, photo import, settings, export+import),
`tests/bluetoothGlucose.spec.js` (pure SFLOAT/byte-layout decoding unit tests against hand-built
byte arrays, no browser needed — this is the safety-critical parsing logic that can't be verified
against Scott's real meter from here), `tests/nutrition.spec.js` (Open Food Facts lookup/formatting,
mocked `fetch`, no network call), and `tests/photoImport.spec.js` (EXIF date parsing against
hand-built JPEG/EXIF byte arrays). The AI-proxy route is mocked in tests the same way
(`/.netlify/functions/ai-proxy`) — never hits the real paid Anthropic API. `window.print` is
stubbed, never actually triggered (the real dialog blocks the browser and would hang a run).

**Runs across 4 projects** (`playwright.config.js`): Desktop Chrome + Mobile Chrome (Pixel 7) for
Chromium/Android coverage, Desktop Safari + Mobile Safari (iPhone 14) for WebKit/iOS/Mac coverage —
120 test runs total (2 deliberately skipped on WebKit only — see HANDOVER.md's 2026-09-15 entry on
the real Safari IndexedDB Blob-storage bug found there), per Scott's explicit ask for real
cross-device confidence, not just whatever engine Playwright defaults to. `serviceWorkers: "block"`
is set in the test context deliberately —
the app's real service worker (`src/main.js`) can intercept fetches before Playwright's
`page.route()` sees them under WebKit specifically (not Chromium), which broke the AI-mocking tests
silently until this was found. Keep this setting; don't remove it as unnecessary.

**Run `npm test` before every deploy, no exceptions.** It builds and serves the real production
bundle (`playwright.config.js`'s `webServer`, not the dev server) — a true pre-deploy gate, not a
dev-mode sanity check. All 100 passed as of 2026-09-14. If a deploy is proposed without this having
been run against the current code, run it first; don't skip on the assumption "it's a small change."
Add a new test case when a new feature ships — this suite is meant to grow, not stay frozen at any
particular count. **A recurring bug pattern worth specifically testing for in any new element:** if
you give a class its own explicit `display` value AND ever toggle `.hidden` directly on that same
element, you need a matching `.the-class[hidden] { display: none; }` rule too — the browser's
default hidden-handling silently loses to a same-specificity, later-declared rule otherwise. Bit
three separate elements before this pattern was recognized (`.timeline-list`, `.latest-reading`,
guarded against pre-emptively for `#barcode-scanner`) — see HANDOVER.md's 2026-09-14 entry.

## Next steps (PICK UP HERE) — updated 2026-09-14

- **Genuinely needs Scott:** surgery-timeline date for the export report (still unanswered from
  2026-09-12); **Resolved 2026-09-15:** the stale-deploy issue is fixed and today's work (Food Guidance, Home
  redesign, photo import, Bluetooth sync badge) is live on `reactivebloodtracker.com`. Deploy
  method going forward: `npm run build` then `npx netlify-cli deploy --prod --dir=dist
  --site=0b9a9624-13b7-4441-8056-0807f9cbbf7c` — this Mac already has an authenticated `netlify-cli`
  session, no git required, much simpler than the old scratch-copy workaround. See HANDOVER.md's
  2026-09-15 entries for the full diagnosis;
  whether to publish a real contact email on the landing page (a known address exists now — used
  with ADACare — but putting a personal address on a public page is his call, not a default);
  confirming the Bluetooth Guide Me connection actually works against the physical meter (built to
  spec 2026-09-14, genuinely untested against hardware — see HANDOVER.md).
- **Deferred, not forgotten** (see `HANDOVER.md`'s 2026-09-14 entry for full detail on each):
  country-aware food database (Open Food Facts already supports this, separate scope from the
  barcode-lookup work that IS built); real PNG app icons (still the placeholder SVG — no
  image-generation tool was available to do this properly); custom user-uploaded alarm tones (built
  distinct-but-fixed tones instead, as v1); meal-timed multiple reminders (still needs Scott to
  specify the shape — don't guess); LibreLinkUp polling (blocked on the Libre 2 Plus sensor
  physically arriving — dispatched 2026-09-07, no tracking number as of the 2026-09-14 ADACare
  call); Apple Health/Google Health Connect sync (brief §3.3, no movement).
- Cross-reference, not yet resolved either way: `PROJECT-REGISTRY.md` (root) section 5 "Personal
  Dashboard" already lists "blood sugar monitoring" as a must-include for a parked personal-
  dashboard idea, and section 4 "DVA Folder" flagged 2026-09-07 that its medical file was "meant
  to feed a new program going forward" — this is that program. Worth a conscious call with Scott
  on whether this absorbs those or stays separate; don't assume.
