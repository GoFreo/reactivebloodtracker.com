# Reactive Hypoglycemia Tracker — Claude Session Starter

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

## Platform target

Mobile-first — this is the primary way Scott will actually use it day to day. Mac support matters
but is secondary. Keep that priority in mind for any framework/UI decisions once building starts.

## Next steps (PICK UP HERE)

- Waiting on the Cowork research handoff to land in `research/` (see above — nothing there yet).
- Once it lands: read it, update `HANDOVER.md` with what it says, then scope the actual build
  (data model, mobile framework choice, where AI fits) before writing code.
- Cross-reference, not yet resolved either way: `PROJECT-REGISTRY.md` (root) section 5 "Personal
  Dashboard" already lists "blood sugar monitoring" as a must-include for a parked personal-
  dashboard idea, and section 4 "DVA Folder" flagged 2026-09-07 that its medical file was "meant
  to feed a new program going forward" — this is that program. Worth a conscious call with Scott
  on whether this absorbs those or stays separate; don't assume.
