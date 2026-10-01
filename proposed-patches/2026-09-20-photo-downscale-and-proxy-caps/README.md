# Proposed patch — shrink food photos before the AI call, and bound the AI proxy's inputs

**Status: APPLIED — shipped 2026-09-28 21:58** (per `HANDOVER.md`: "the refreshed 2026-09-20 patch
applied cleanly... photo patch is no longer pending"). `shrinkForStorage`/`downscaleForAI` are live in
`src/imageForAI.js`. This README's status line was never updated when that happened — confirmed by
re-checking the current code on 2026-10-02, not just trusting the old claim. Left in place as a
historical record; safe to delete this folder if it's just clutter now.

Original text below, unedited, for the record. Nothing in `src/`, `netlify/` or
`tests/` of this project was changed. It was written and tested in an isolated copy of `main`
(`a695000`) on 2026-09-20 by an autonomous Claude session while Scott was away; the entire result is
the one patch file next to this README. Applying it is Scott's call.

## Why — evidence, not theory

1. **Photos go to the AI at full camera resolution.** `parseFoodWithAI` (`src/food.js`) base64-encodes
   the file exactly as the camera made it. There is no resize step anywhere in `src/`.
2. **Scott's own photos are big enough for that to matter.** The 3 staged in `food photos/` on
   2026-09-20 are 1.97 / 3.19 / **4.68** MB (MB = ÷1,048,576; only file sizes were read, no image
   was opened; a small sample). Netlify's docs ("Configuration for functions") give a **6 MB**
   buffered request limit and note that base64 overhead effectively caps a binary payload at about
   **4.5 MB**. The app sends the photo as base64 inside JSON, so a 4.68 MB photo becomes a ~6.25 MB
   body — just over the line — and would be turned away *before* `ai-proxy` runs.
   **Not reproduced on a real phone** — confirming that is the first thing to do.
3. **The error shown would be wrong.** A non-JSON rejection makes `res.json()` throw, and the old
   `catch` says *"needs `netlify dev`…"* — misleading on the live site.
4. **The public endpoint had no input bounds.** `ai-proxy` already fixes the model, `max_tokens` and
   system prompt server-side (so it is **not** an open Claude proxy — good, and now covered by a test),
   but `text` and `mimeType` were unbounded, and a bare `null` JSON body threw an uncaught
   `TypeError` (a 500 instead of a clean 400).

Note: Anthropic's own per-image cap on the direct API is 10 MB (base64), so *Anthropic* is not the
binding limit here — Netlify's is. The model this proxy uses (Haiku 4.5, "standard" tier) downscales
anything past **1568 px** on the long edge itself, which is why that is the cap chosen.

## What the patch changes (6 files, +423 / −8)

| File | Change |
|---|---|
| `src/imageForAI.js` (new) | `downscaleForAI()` shrinks **the copy sent for parsing** to ≤ 1568 px long edge, JPEG q0.85. On *any* failure it returns the original file, so it can only make a request smaller, never break one that works today. `scaledSize()` is the pure size math. |
| `src/food.js` | uses it; and separates "couldn't reach the service" from "reached it, got a non-JSON reply", so an over-size rejection says so |
| `netlify/functions/ai-proxy.js` | `text` ≤ 4000 chars; `mimeType` allow-list (jpeg / png / webp / gif — exactly what Anthropic accepts); non-object bodies get a 400. Falsy values still mean "absent", exactly as before |
| `tests/aiProxy.spec.js`, `tests/imageForAI.spec.js`, `tests/aiPhoto.spec.js` (new) | 23 new tests |

**The photo saved with the entry is untouched** — only the copy sent to the AI is shrunk.

## Verified

- **Tests are meaningful:** run against the *unpatched* source, the 5 tests describing the new
  behaviour fail and the 11 describing existing behaviour pass.
- **With the patch:** full suite **210 passed / 2 skipped / 0 failed** on all 4 browser projects (the
  2 skips are the pre-existing, documented WebKit photo-save automation gap).
- **Measured upload for a deliberately worst-case, noisy ~9–10 MB photo:** ~11.4 MB base64 before →
  **0.76 MB (Chromium) / 1.27 MB (WebKit)** after, at 1568×1176. Real photos compress far better than noise.
- `git apply --check` against the real `main` HEAD: clean.
- `npm audit`: 0 vulnerabilities. HawkScan could not run (no `hawk` CLI / API key in this
  environment — same limitation earlier sessions recorded).

## Not verified — needs Scott and a real phone

- That the 4.68 MB photo really fails on the live site today (worth trying before *and* after).
- Real iPhone Mobile Safari: `img.decode()` + canvas re-encode, and EXIF rotation. The tests ran in
  desktop WebKit with an iPhone-sized viewport, not on a device.
- Very large photos (e.g. 48 MP) on older iPhones could exhaust decode memory — the code then falls
  back to sending the original, i.e. today's behaviour.
- Photos *of text* (nutrition labels): 1568 px at one q0.85 JPEG pass should stay legible, but that
  wasn't tested.

## What it does NOT do

It adds **no authentication or rate limiting**. The endpoint stays public and callable by anyone who
finds it; the input caps only make each call cheap. The real backstop on budget is a **monthly spend
limit on the Anthropic key/workspace** (Anthropic console) — that is Scott's to set, not something
code here can do.

If `MODEL` in `ai-proxy.js` is ever changed to a Claude 4.7+ model (the "high-resolution" tier, 2576 px
long edge), raise `AI_MAX_EDGE` in `src/imageForAI.js` to match.

## To apply (when Scott says yes)

```bash
cd "<this project folder>"
git apply --check proposed-patches/2026-09-20-photo-downscale-and-proxy-caps/photo-downscale-and-proxy-caps.patch
git apply         proposed-patches/2026-09-20-photo-downscale-and-proxy-caps/photo-downscale-and-proxy-caps.patch
npm test          # expect 210 passed / 2 skipped
```

Then review the diff, commit, and deploy the usual manual way (`npm run build`, then the
`netlify-cli deploy` line in `HANDOVER.md`). To undo before committing: `git apply -R` with the same
patch file. Once it has been applied (or rejected), move this folder to `Dropbox/Pending Deletion`.

Sources checked 2026-09-20: Netlify Docs — Configuration for functions
(<https://docs.netlify.com/build/functions/configuration/>); Anthropic Docs — Vision
(<https://platform.claude.com/docs/en/build-with-claude/vision>).

## Refreshed 2026-09-28 (night)

The original patch stopped applying after the 28 Sept changes to `src/food.js`. A three-way apply merged it
cleanly; with it applied, the full suite was **466 passed / 6 skipped / 0 failed**. The refreshed version is
`photo-downscale-and-proxy-caps.REFRESHED-2026-09-28.patch` (applies to branch `cleanup`, which sits on
`help-and-welcome`). Still **not applied** — Scott's yes/no. The original file is kept for history.

**Related, separate decision (not in this patch):** the photo *saved with each meal* is also kept at full
size (~2–5 MB from an iPhone), so three photos a day is roughly 5 GB a year in the phone browser's storage,
which iPhone browsers may clear when space runs low. Shrinking the saved copy too (to ~1600 px, a few hundred KB)
would fix that; the original stays in the camera roll. Needs Scott's OK because it changes what's kept.
