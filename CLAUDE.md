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

## AI / Anthropic key

Not configured yet. Don't hardcode a key, don't ask Scott for one in chat — when he's generated the
dedicated key for this project he'll provide it through normal config (e.g. an env var / `.env`,
already gitignored here). Until then, don't build anything that assumes a live API call succeeds.

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
