# Bluetooth meter sync: reconnect without re-showing the picker

**Status: APPLIED 2026-10-02.** `git apply` succeeded cleanly against `main`. The 6 `getRememberedDevice()` tests in this patch didn't actually pass once run for real, though — this environment's Node (v24) defines a built-in getter-only `navigator` global, so the tests' `globalThis.navigator = {...}` assignments threw `TypeError: Cannot set property navigator of #<Object> which has only a getter` (the standalone verification script mentioned below apparently ran under a Node version without that global, which is why it didn't catch this). Fixed by stubbing via `Object.defineProperty(globalThis, "navigator", {value, configurable: true})` instead, restored in `afterEach` so it can't leak into another test file. All 24 (6 cases × 4 browser projects) pass now, full suite 536 passed / 12 skipped / 0 failed. The application logic in `bluetoothGlucose.js` itself needed no changes — this was purely a test-stubbing gap.

## What Scott reported

After pairing the Accu-Chek Guide Me once, every subsequent "Sync meter" tap re-opens Chrome's Bluetooth device picker and asks him to choose the meter again, rather than just reconnecting to the device it already knows about and pulling new readings. He asked for the sync to behave the way he'd expect once a device is already paired: turn the meter on, and have it just transfer the data.

## Root cause

`connectAndFetchReadings()` in `src/bluetoothGlucose.js` always called `navigator.bluetooth.requestDevice(...)`, which **always** shows the OS/browser picker — that's how the Web Bluetooth API works; there's no way to open a GATT connection without it, *except* for one specific case. Chrome (desktop and Android — not Safari/iOS, which has no Web Bluetooth at all) exposes `navigator.bluetooth.getDevices()`, which returns devices the user has already granted this site access to, with no prompt. If the picker was shown once, that grant persists, and `getDevices()` is how a site is supposed to reconnect silently afterward.

## What this patch changes

`src/bluetoothGlucose.js`:
- Added `getRememberedDevice()` — calls `navigator.bluetooth.getDevices()` if it exists, and returns the single remembered device only when there's exactly one. Feature-detected (returns `null` immediately if the browser doesn't support it) and fails soft (returns `null` instead of throwing if Chrome's permission policy blocks the call in some context).
- `connectAndFetchReadings()` now calls `getRememberedDevice()` first. If it resolves to a device, that's used directly (no picker) and the status callback reports "Reconnecting to Accu-Chek Guide Me…" instead of "Choose your meter…". If it resolves to `null` — no support, zero devices, or more than one previously-granted device — behavior falls back exactly to the original `requestDevice()` picker flow. Nothing about the picker path changed.

Why fall back on "more than one device": if two+ devices have been granted to this origin, we don't know which one is Scott's meter, and guessing wrong would silently pull from (or fail against) the wrong device. The picker is the safer choice there because it lets Scott pick, same as today.

`tests/bluetoothGlucose.spec.js`:
- Added 6 cases for `getRememberedDevice()` covering: no Web Bluetooth support, no `getDevices()`, exactly one remembered device, zero devices, multiple devices (ambiguous → fall back), and `getDevices()` throwing.

## What's verified, and what isn't

This session runs this project's files through a Linux VM bridged to Scott's Mac, not natively on macOS. `npm test` (Playwright) needs a `vite preview` server built with native `rolldown` bindings that only exist for the Mac build — so it couldn't run from here (same limitation noted for build/test commands generally; not specific to this change). I could not run the project's actual Playwright suite.

To still verify the new logic honestly rather than assume it:
- `node --check` passes on both modified files (syntax only).
- I wrote the 6 test cases into `tests/bluetoothGlucose.spec.js` using the same `@playwright/test` `test`/`expect` API the rest of the file uses, so they'll run as part of `npm test` once this is applied somewhere the build toolchain works (i.e., on Scott's Mac directly, or via Claude Code there).
- I additionally ran the exact same 6 scenarios through a standalone Node script (not part of the repo, deleted after use) that imports the real `getRememberedDevice()` from the unmodified file and stubs `globalThis.navigator` the same way the Playwright tests do. All 6 passed. This confirms the logic itself is correct; it does not confirm the Playwright test syntax runs cleanly under this repo's exact Playwright version, since that step needs the native binary this environment doesn't have.
- The existing `requestDevice()` picker path (the fallback) is untouched — same code that already works today, just moved into an `else` branch.
- `git apply --check` against the live `main` HEAD succeeds — this patch applies cleanly on top of the current file.

**Not verified: an actual browser/device run.** I have no way to pair with the real Accu-Chek meter or launch real Chrome from this environment. The first real-world test of "does Chrome actually skip the picker and reconnect" needs to happen on Scott's Mac, in Chrome, with the meter already paired once.

## On the "button should change to Download" idea

Separately discussed: should the Sync button's label/state change once a meter is paired, to make clear it will now just download rather than re-pair? Looking at `src/main.js`'s `runBluetoothSync()`, this is already substantially handled — it disables the button during sync and updates an adjacent status line through each stage ("Connecting to…", "Requesting stored readings…", "Done — N new readings imported"). With this patch, that status line also now says "Reconnecting to Accu-Chek Guide Me…" instead of "Choose your meter…" when it can skip the picker, which already communicates the distinction Scott was asking about. I didn't make a separate button-label change — the existing status-text feedback plus this patch's new status message cover the same ground, and a second change there would be solving an already-solved problem. If Scott still wants the button's static label itself (not just the status line) to change, that's a small, separate, low-risk follow-up.

## Files in this folder

- `README.md` — this file
- `bt-reconnect.patch` — unified diff of `src/bluetoothGlucose.js` and `tests/bluetoothGlucose.spec.js`, verified to apply cleanly to current `main` via `git apply --check`
