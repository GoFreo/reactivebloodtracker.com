# Reactive Hypoglycemia-Aware Glucose & Food Tracker — Research Brief for Claude Code

Prepared for: Scott Fraser (SfumatoART)
Purpose: hand-off research brief so Claude Code can scope and build the app. Not a spec — a grounded starting point. Decisions marked **[DECISION NEEDED]** need Scott's input before or during build.

---

## 1. What this app is for

A personal tool that logs food (by photo or voice) and blood glucose readings, and shows how they correlate — built first for Scott's own reactive hypoglycemia, with a road toward selling it to others (veterans first, then possibly public) once it works reliably.

**Scott's actual situation (from DVA/RAP records), which should shape v1:**

- DVA-approved for both RAP items: **AF01** (standard finger-prick meter) and **AF02** (continuous glucose monitor). Currently using finger-prick only; a **Libre 2 Plus CGM is approved and pending supply**.
- Has a documented collapse history tied to blood glucose — this is flagged as the top concern for his upcoming reverse shoulder replacement (anaesthesia/peri-operative glucose management).
- Prefers written documentation over speaking in appointments — an exportable glucose/food summary report for his GP and anaesthetist is a genuinely useful feature, not a nice-to-have.
- Runs SfumatoART (a live PWA product) solo, directing an AI coding tool rather than hand-coding. This app should reuse that proven stack and workflow rather than start from scratch (see §7).
- **His own Libre 2 Plus 24-hour graphs (now live) already show the exact pattern this app is meant to catch:** repeated sharp dips per day, several touching or crossing the low-glucose line (the app's own red dashed threshold), interspersed with normal-range readings — not an occasional event but a recurring daily pattern. This is useful concretely: it's real ground-truth data Claude Code can use to validate that the food-correlation logic in §5/§10 actually lines up dips with what was eaten beforehand, rather than testing only against synthetic personas.

---

## 2. Clinical background (plain terms, for context — not medical advice)

Reactive (postprandial) hypoglycemia is a blood sugar drop **within about 4 hours after eating**, most often after high-sugar/refined-carb meals or alcohol without food. Symptoms: shakiness, sweating, dizziness, rapid heartbeat, hunger, irritability, confusion. Standard non-drug management is dietary: balanced meals with fibre, smaller meals every ~3 hours, pairing alcohol with food, and avoiding sugary food on an empty stomach. [Mayo Clinic](https://www.mayoclinic.org/diseases-conditions/diabetes/expert-answers/reactive-hypoglycemia/faq-20057778)

This matters for the app's design: the core value isn't "counting calories," it's **surfacing the food→glucose-drop pattern** for a specific person, which is a different (simpler) job than diabetes carb-counting apps are built for.

---

## 3. Getting glucose data into the app

### 3.1 Finger-prick meter (now) — confirmed model: **Accu-Chek Guide Me**

Scott photographed the meter's back label and, later, front-facing shots of it in use — the model name is clearly legible in two of those photos. Confirmed: **Roche Accu-Chek Guide Me** (Mannheim, Germany), mmol/L unit variant (correct for Australia), CE-marked (notified body 0123) and RCM-marked for AU, with a **printed Bluetooth pairing PIN (900155)** next to the serial number and GTIN barcode.

The Guide Me is Bluetooth-capable and pairs with **Accu-Chek Connect** or **mySugr** using that printed PIN — a standard, documented pairing flow (Roche publishes a video walkthrough for Guide Me ↔ mySugr pairing). This is a real upgrade from "manual entry only": Claude Code can either target the Guide Me's Bluetooth GATT profile directly, or — more pragmatically — look at how Accu-Chek Connect/mySugr talk to the device as a reference implementation, since both are established, working integrations against this exact meter.

**v1 fallback (still recommended to build first regardless):** manual entry — reading + timestamp, logged in under 10 seconds — so the app works from day one even before Bluetooth pairing is wired up.

**Real-world Bluetooth sync behaviour, confirmed during Scott's own pairing attempts (worth designing around):** Roche's official pattern (used by mySugr/Accu-Chek Connect) is "Auto-Send" from the meter — once enabled in the meter's wireless settings, each test transmits automatically right after it's taken, with no app interaction needed, and the meter queues readings if the phone isn't in range. **A phone PWA can't replicate that passive background behaviour** — browsers don't allow a web app to keep a Bluetooth connection alive or receive pushes while closed/backgrounded, unlike a native app. So the realistic, working pattern for this app is **active pull, not passive push**: the user opens the app and taps "Sync meter" while the meter is awake and in range, which connects and reads back whatever's stored since the last sync. Design implication for Claude Code: don't build toward "it'll just arrive automatically" — build the UI/UX around "tap sync when you're near the meter" as the expected normal flow, and make sure the meter is awake (not asleep/off) at the moment of tapping, since a sleeping meter won't expose its Bluetooth glucose service (this was the likely cause of an early "no services found" pairing error). **The sync button itself should reflect this active-pull state**, not just sit static: e.g. "Sync meter" → changes to "Download" (or a spinner) while the Bluetooth read is actively in progress → "Synced ✓" on success. Without that feedback, a 2-3 second Bluetooth transfer looks like a dead/broken button.

**⚠️ Critical platform finding, confirmed during Scott's own testing (changes the plan for this feature):** Scott has been testing meter Bluetooth pairing on his **Mac in Chrome**, where it works — including the device picker re-appearing on every sync, which can be fixed with Chrome's `navigator.bluetooth.getDevices()` API (lets a page silently reconnect to an already-granted device without re-showing the picker). **However, Web Bluetooth is not supported at all in Safari/iOS** — confirmed current as of this research, with Apple stating no intent to add it — and every iOS browser (including Chrome on iPhone) runs on Apple's WebKit engine, so none of them can use it either. Since Scott's actual phone is an iPhone and the app is meant to run there as an installed PWA, **meter Bluetooth sync as currently built cannot work on his real device at all** — it only works on the Mac he's testing from. Three options, in increasing order of effort: (1) treat manual meter entry as the real iPhone path (already the planned v1 fallback) and Bluetooth as a bonus that only works on desktop Chrome/Android; (2) keep Bluetooth for a possible future Android/desktop companion view without solving iPhone; (3) wrap the app as a native/hybrid iOS build (e.g. via Capacitor) to get real Bluetooth access on iPhone — a materially bigger lift, and only worth it if meter Bluetooth sync specifically matters enough to justify leaving the pure-PWA approach. This doesn't affect the Libre CGM path at all, since that's a server-side LibreLinkUp pull, not a Bluetooth connection.

**Fix needed — the device picker shouldn't reappear on every sync.** As currently built, tapping "Sync meter" re-opens the full OS Bluetooth device-picker window every time, even though the meter was already paired/granted once. That's unnecessary: Web Bluetooth supports remembering a previously-granted device via [`navigator.bluetooth.getDevices()`](https://developer.mozilla.org/docs/Web/API/Bluetooth/getDevices) and reconnecting to it directly (`device.gatt.connect()`) without showing the chooser again — the picker should only need to reappear if that silent reconnect attempt fails (meter off/out of range/permission revoked). **Build fix for Claude Code:** on sync, first try `getDevices()` + direct reconnect to the previously-paired meter; only fall back to `requestDevice()` (which shows the picker) if that fails. This turns the expected flow into "turn meter on, tap Sync, done" with no picker window most of the time.

**A note on comparing meter and CGM readings (relevant now that Scott has both running side by side):** his recent paired readings — 7.5 mmol/L (meter) vs 7.9 mmol/L (Libre 2 Plus), and 4.8 mmol/L (meter) vs 4.5 mmol/L (Libre) — are both within the normal, expected difference between the two technologies, not a sign either device is wrong. Finger-prick meters measure **blood** glucose directly; CGMs measure glucose in **interstitial fluid** (the fluid between cells), which tracks blood glucose closely but lags behind it by roughly 5-15 minutes, especially when glucose is changing quickly. Accu-Chek's own clinical training material has a page specifically on this ("lag time"), and it's a well-documented, expected characteristic of all CGMs, not a Libre-specific flaw.

**Why this matters for the app's design, specifically for reactive hypoglycemia:** reactive hypoglycemia is defined by *fast* glucose drops — exactly the scenario where interstitial lag is largest and a CGM reading can trail the true blood value by the most. Design implication for Claude Code: when both a meter and CGM reading exist for a similar timestamp, don't silently prefer one as "ground truth" — show both, and if they're used together to flag a hypo event, weight the finger-prick reading more heavily during rapid-change periods (the CGM's own trend arrow/rate-of-change is a better signal than its absolute number in those moments). This is a real, physiological reason to keep manual finger-prick entry in the app long-term rather than treating it as a stopgap until the CGM fully takes over.

**Scott's own comparison method is worth encoding directly into the app:** he waits until the Libre's trend arrow is level before doing a finger-prick comparison — which correctly removes the lag-time confound, since blood and interstitial glucose have had time to equilibrate when nothing is changing quickly. A comparison taken mid-swing looks like device disagreement but is really just lag. **Build recommendation:** when the app logs a meter+CGM comparison pair, capture the CGM trend-arrow state (rising/falling/level) alongside both numbers, and only treat level-arrow pairs as genuine "how well do my devices agree" data — mid-swing pairs get tagged as lag-time data, not accuracy data, so the two don't get mixed together in any accuracy reporting.

**v1 fallback (still recommended to build first regardless):** manual entry — reading + timestamp, logged in under 10 seconds — so the app works from day one even before Bluetooth pairing is wired up.

### 3.2 Libre 2 Plus CGM (coming)
Three real options, in order of recommendation:

1. **Official LibreLinkUp/LibreView sharing (recommended for v1).** Once Scott's sensor is active in the official FreeStyle LibreLink app, he can share readings via LibreLinkUp; a backend job (e.g. a Netlify scheduled function) can poll the LibreLinkUp API on his behalf and store the latest reading. This is the ToS-safe, stable path.

   **Practical setup steps (this is the "follower" connection, not the 72-hour clinician share code):**
   1. On Scott's phone, in the **LibreLink** app (the app reading the sensor): Menu → **Connected Apps / Share** → invite a follower by entering an email address — this is different from the "share with healthcare team" 72-hour code screen; look for the LibreLinkUp/follower-connection option specifically.
   2. That invite email should be a dedicated address the app will use (could just be Scott's own email, or a purpose-made one for the app's backend account) — not a personal login he uses elsewhere.
   3. Create a **LibreLinkUp** account with that email at [librelinkup.com](https://www.librelinkup.com/) (or via the [LibreLinkUp app](https://www.librelinkup.com/) on [iOS](https://apps.apple.com/us/app/librelinkup/id1234323923)/[Android](https://play.google.com/store/apps/details?id=org.nativescript.LibreLinkUp)) and accept the connection invite from step 1. [LibreLinkUp getting-started guide](https://www.librelinkup.com/articles/getting-started) · [Australian LibreLinkUp page](https://www.freestylelibre.com.au/librelinkup-au-app) · [general FAQ](https://www.librelinkup.com/faqs).
   4. Once that LibreLinkUp account is linked and receiving readings (verify by installing the LibreLinkUp app once and confirming Scott's glucose shows up), **Claude Code's backend uses that same LibreLinkUp email+password to log in programmatically** — same login, but called from server code instead of tapping through the app. This is exactly what the unofficial API libraries in §6 (`libre-link-unofficial-api`, `libreview-unofficial`) already do, and there's a documented (unofficial) endpoint reference at [InventivetalentDev/LibreViewApi](https://github.com/InventivetalentDev/LibreViewApi/blob/master/LibreLinkUpApi.md).
   5. Abbott doesn't publish this as an official developer API, so treat step 4 the same as noted below (§3.2's risk warning) — stable in practice, not contractually guaranteed.
2. **Nightscout + xDrip+ bridge (power-user option, defer to v2).** Nightscout is a mature, 10+ year old open-source diabetes data platform with a well-documented REST API used by hundreds of third-party apps and devices. xDrip+ (open source, Android only) can read the Libre 2 sensor and push data into a self-hosted Nightscout instance, which the app then reads via a clean, stable API — avoiding Abbott's private endpoints entirely. Downside: Android-only, and setup is genuinely fiddly (Scott's iPhone-first, per the SfumatoART HEIC/iPhone notes).
3. **Unofficial reverse-engineered Libre APIs** (e.g. `libre-link-unofficial-api` on GitHub) — explicitly "at your own risk," alpha-quality, breaks when Abbott changes their backend. Avoid for anything Scott will rely on for a surgery-relevant record.

**Correction on the "tap the phone" idea:** with Libre 2/2 Plus, the NFC tap is only needed once, to activate/pair the sensor. After that it streams via Bluetooth automatically (roughly every minute) to the paired official app — no repeated tapping needed. Good news: it simplifies the UX once the official-API route is used.

### 3.3 Health platform layer
Apple Health (iOS) and Google Health Connect (Android) both support a blood-glucose data type. Worth writing to/reading from these as a neutral integration layer regardless of meter/CGM choice — future-proofs against meter changes and plays nicely if Scott ever adds a smartwatch.

### 3.4 Dexcom G7 — confirmed, already ordered, for a real head-to-head comparison period

**This is not hypothetical — Scott has already ordered a Dexcom G7 and is picking it up shortly.** His care provider wants him running the Libre 2 Plus and the Dexcom G7 **simultaneously for a period**, to compare accuracy and see which device he prefers — so for a while there will be two independent CGM data streams to handle, not a replacement of one by the other.

**Integration approach mirrors the Libre work already scoped — same shape, different vendor:**

1. **Official Dexcom Share/Follow sharing (recommended, same tier as LibreLinkUp above).** In the **Dexcom G7 app**: Connections → Share, invite a follower (up to 10 allowed) — functionally identical pattern to LibreLinkUp's follower setup in §3.2. [Dexcom's own instructions](https://www.dexcom.com/en-us/faqs/how-do-i-share-my-dexcom-g7-glucose-data-with-followers) confirm this is an account-based, ongoing connection (not a time-limited code like the Libre clinician share), using the separate **Dexcom Follow** app or compatible integrations.
2. **`pydexcom`** ([GitHub](https://github.com/gagebenne/pydexcom), MIT-licensed, actively maintained) is the direct Dexcom equivalent of the unofficial Libre libraries already in §6 — logs into the Dexcom Share service with the follower credentials and pulls current readings/trend programmatically, exactly the pattern the existing Netlify scheduled function already uses for LibreLinkUp. The library's own docs flag the same caveat as Libre's unofficial route: "the Dexcom Share API sometimes changes," so treat it with the same stability expectations as §3.2's unofficial APIs — fine in practice, not contractually guaranteed. (Dexcom also has an official developer API, but its own docs note it's built for aggregate/historical data, not real-time fetching — not the right fit here.)
3. **Data-model implication, worth building in from the start rather than retrofitting:** every glucose reading needs a **source/device tag** (`meter`, `libre`, `dexcom`) from day one. This is what makes the comparison period Scott actually wants possible — without it, there's no clean way to tell the two CGM streams apart once both are logging simultaneously.

**Chart implication (ties to §10's shared view too):** with two CGM sources running at once, the glucose chart needs to plot them as **visually distinct lines** — Scott's own suggestion of a different line colour per device is exactly right, and simple to build (colour-code by the source tag from point 3 above).

### 3.5 Chart style — the Libre app's shaded target-range band

Scott likes how the LibreLinkUp/LibreLink graphs look (visible in his own screenshots earlier in this research) — a **shaded green band for the in-range zone**, with **dashed lines marking the low and high thresholds**, rather than just a bare line connecting data points. **This is entirely achievable and not a technical obstacle** — it's a standard feature of ordinary charting libraries (e.g. Chart.js with an annotations plugin, or a custom SVG with a background rectangle drawn between the low/high threshold values plus dashed reference lines) — not custom engineering. Worth building this styling in from the start rather than shipping a plain line chart and revisiting it later, since it's genuinely the same amount of initial effort either way, just a different chart configuration.

---

## 4. Food logging — photo and dictation

### 4.1 Photo-based estimation — what the evidence actually shows
This is the hard part, and the research is consistent across independent sources:

- Accuracy is genuinely good for **single, separated foods** (roughly 10-15% error in independent testing of leading apps) and **much worse for mixed/composite dishes** — curries, casseroles, restaurant plates with hidden oils/sauces — where errors commonly run 25-30%+. One 2026 benchmark (PlateLens, self-reported) claimed ±1.1% MAPE on simple foods but ±3.4%+ on fused/mixed dishes — even the vendor's own numbers show the same pattern.
- Common, repeated failure modes across every AI calorie app reviewed: **missed cooking oils/fats, different estimates from different photo angles, confidently misidentifying mixed dishes, confusing visually similar foods** (e.g. turkey vs beef mince).
- A 2026 peer-reviewed study on LLM-based food-image nutrition estimation found that **prompt design measurably changes portion estimates** — e.g. framing the prompt as "estimate as a dietitian would" shifts the numbers. This is directly actionable: the system prompt for Claude's food-photo analysis needs deliberate design and testing, not just "what's on this plate?"
- The universal recommendation across every source, including the vendors' own docs: treat AI estimates as **a fast starting point that the person corrects**, not a verdict. Nobody claims a fire-and-forget photo pipeline is safe to trust blind — and for Scott's use case (medically-relevant, tied to a surgery), that human-confirms-the-estimate step isn't optional.

**Design implication for Claude Code:** every AI-estimated food entry needs a visible confidence indicator and a one-tap "adjust" flow — never silently presented as fact. This is a safety requirement, not a polish item, given the medical context Scott described.

### 4.2 Dictation
Scott already has a dictation app (forked from VoiceInk) — but that's Mac/Blue Snowball-specific and he's noted **iOS dictation doesn't route well to that setup**. For a mobile app, the right approach is simpler: use the **phone's own native speech-to-text** (iOS/Android built-in dictation), then send the transcribed text to Claude for structured parsing into food + quantity + meal context. Same LLM call pattern as the photo path — one food-parsing "brain," two input methods (photo, voice-to-text). This also matches how SparkyFitness (an open-source project, see §6) does AI food logging: chat-style text in, structured entry out.

### 4.3 Restaurants and eating out — Scott's specific scenario
This is the genuinely hard case, and every source agrees there's no clean automatic answer: "hidden ingredients, oils, sauces, layered foods, restaurant meals... remain difficult," and the honest framing is a support tool requiring human judgement, not a black box.

Recommended flow, incorporating Scott's own idea about photographing the menu:

1. Photo of the **plate** → Claude identifies the dish and estimates portion using visible cues (plate size, comparison to a reference object if one's in frame).
2. Optional photo of the **menu** (or just naming the dish) → Claude cross-references its own knowledge of how that dish is typically prepared, which narrows the guess.
3. **When confidence is low, Claude asks 1-2 specific clarifying questions** rather than guessing silently — e.g. "Was that pan-fried or grilled?" / "Creamy sauce or tomato-based?" / "Any bread or rice on the side that isn't visible in the photo?" — and Scott answers by voice or a quick tap.
4. The entry is stored **with its confidence level and the assumptions made** ("assumed grilled, no added butter — restaurant meal, not verified") so that later, if a pattern review matters (e.g. for the surgery), the record honestly shows what was measured vs guessed.

This clarifying-question loop is the single most important UX pattern in the whole app — it's what separates "guessing" from "a tool a clinician could trust the trend from."

### 4.4 Glycemic Index / Glycemic Load — how to get this without a paid service

Scott asked directly for GI (glycemic index), not just carbs/calories — this matters more than plain carb counts for reactive hypoglycemia, since GI/GL is specifically about how fast a food raises blood glucose. There's no live public "GI API," but there is a solid, free path:

- **The authoritative source is an academic table, not a live API:** Atkinson, Brand-Miller et al., *"International Tables of Glycemic Index and Glycemic Load Values: 2021"* (American Journal of Clinical Nutrition — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0002916522004944), free PDF widely mirrored) covers **over 4,000 foods** and is the standard reference every GI app/database ultimately draws from. It's a structured table (food name, GI value, serving size, GL), not JSON, so it needs a one-time digitisation pass — a good, bounded task for Claude Code (extract the table, clean it into a local database) rather than something to keep re-fetching live.
- **[glycemicindex.com](https://glycemicindex.com/)** (University of Sydney — the same research group behind the tables above) has a public searchable database. Good as a manual reference and for spot-checking values; treat as **not necessarily a bulk-scrape/API source** without checking their terms first — worth a quick manual check before Claude Code builds anything that pulls from it programmatically at scale.
- A community-maintained table exists at [glycemic-index/glycemic-index.github.com](https://github.com/glycemic-index/glycemic-index.github.com) (GitHub) — worth a look as a possible starting CSV, but it's not an official/maintained dataset, so any values pulled from it should be spot-checked against the Atkinson 2021 table before being trusted.

**The key design insight, which ties directly into §4.1-4.3:** GI is a property of the *food type* (a fixed lookup), while **Glycemic Load (GL) also needs the *portion size*** — `GL = GI × (carbs per serving ÷ 100)`. That portion-size number is exactly what the photo/dictation pipeline in §4.1-4.3 is already estimating. So the practical build is: (1) a local GI lookup table seeded from Atkinson 2021, matched to food names/categories, plus (2) the carb-per-serving estimate Claude already produces from the photo or dictation — multiplied together to get **GL per logged meal**, which is the actually-useful "how hard will this hit me" number for reactive hypoglycemia. No extra data source needed beyond what's already planned — just one more calculation once both numbers exist.

---

## 5. Testing & validation plan (smoke-testing a health-adjacent app)

Scott's right to insist on this — a tool that will inform surgery-relevant conversations needs to be wrong in *safe, visible* ways, never wrong silently. Recommended approach: build 4 synthetic test personas and run every food-logging path (photo, dictation, restaurant+menu) against each, before trusting real data.

| Persona | Behaviour | What it stress-tests |
|---|---|---|
| **The Precise Logger** | Describes exact items/weights/brands, eats mostly home-cooked meals | Baseline accuracy against known ground truth (weigh the actual meal to check) |
| **The Vague Describer** | Dictates loosely — "had a big bowl of pasta, bit of garlic bread" | Whether the clarifying-question flow successfully extracts the missing detail instead of guessing |
| **The Restaurant Regular** | Eats out 4-5x/week, only has a plate photo (± menu photo) | Whether restaurant entries are flagged as lower-confidence and whether assumptions are recorded honestly |
| **The Minimizer** | Systematically under-describes portions/oils (documented real-world bias — people under-report intake by 20%+, worst on energy-dense/hidden-fat foods) | Whether the AI pushes back appropriately (e.g. asks about oil/butter) rather than accepting a lowball description at face value |

Also smoke-test, independent of persona: CGM/meter data dropout (Bluetooth disconnects, LibreLinkUp API downtime — does the app degrade to "no reading" rather than showing stale data as current?), offline logging (food logged with no connection — does it queue and sync correctly?), and that **no screen ever presents an AI estimate as a confirmed fact** without the confidence/assumptions annotation from §4.3.

**Scope guardrail for Claude Code:** keep v1 strictly descriptive (logs data, shows correlations/trends) — not prescriptive (no "you should take X" recommendations). That's both a safety call and a regulatory one (§8).

---

## 6. Nutrition data and existing open-source components worth reusing

Reuse-first, per how Scott already works (SfumatoART, the VoiceInk-based dictation app):

- **[SparkyFitness](https://github.com/CodeWithCJ/SparkyFitness)** — self-hosted nutrition/fitness tracker (TypeScript, PostgreSQL, Docker). Already has: AI chat-based food logging plus photo-upload logging ("SparkyAI," in beta), Apple Health + Google Health Connect + Fitbit/Garmin/Withings sync, and built-in USDA + Open Food Facts nutrition lookups. Actively maintained (4.8k GitHub stars). **⚠️ Correction to an earlier version of this brief:** SparkyFitness ships under a **custom non-commercial license**, not MIT — it explicitly permits use/copy/modify/distribute "for non-commercial purposes only." That rules it out as a fork base for anything Scott intends to sell later. **Recommendation:** study its architecture (schema design, AI-logging flow, health-platform sync approach) for ideas, but Claude Code should write original code for anything shipped — don't copy its source into a product with commercial intent. Worth double-checking the current LICENSE file at build time in case terms change.
- **Open Food Facts** — free, crowdsourced, global barcode/nutrition database with real Australian packaged-food coverage. Good for scanning packaged items. Has **official, ready-to-install packages** (not just a raw API to wrap by hand): [`openfoodfacts-js`/`openfoodfacts-nodejs`](https://github.com/openfoodfacts/openfoodfacts-js) (`npm install @openfoodfacts/openfoodfacts-nodejs`) and [`openfoodfacts-python`](https://github.com/openfoodfacts/openfoodfacts-python) (`pip install openfoodfacts`), both maintained by the Open Food Facts project itself, both permissively licensed (open source, safe for a commercial product).
- **AUSNUT / FSANZ food composition database** — free, Australia-specific generic food composition data from Food Standards Australia New Zealand. Downloadable dataset, not a live API — would need periodic import into the app's own database. Best source for "how many carbs in a generic AU dish" when no barcode exists.
- **USDA FoodData Central** — free, very comprehensive, US-centric but fine as a fallback/reference set.
- **Nutritionix** — commercial, natural-language food parsing + a large restaurant-chain database, but that database is heavily US-centric — limited value for Australian restaurant coverage, and it's a paid API. Given Claude is already doing the heavy lifting on unstructured description → structured estimate, Nutritionix's natural-language parsing is largely redundant here. Not recommended as a paid dependency for v1.
- **xDrip+ / Nightscout** — see §3.2, the mature open-source CGM bridge if/when the official LibreLinkUp route isn't enough.
- **cgmquantify** (Python) — [on PyPI](https://pypi.org/project/cgmquantify) (`pip install cgmquantify`), published alongside a peer-reviewed paper — computes standard glycemic-variability metrics from CGM data (time-in-range, mean amplitude of glycemic excursions, etc.) out of the box. Real, installable, not just a concept. **Glucose360** (Python, on [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12588377/)) is a newer alternative in the same space. Either is a genuine shortcut over hand-rolling glycemic-variability maths — useful once Scott wants more than a line chart.
- **Nightscout `cgm-remote-monitor`** (Node.js, [GitHub](https://github.com/nightscout/cgm-remote-monitor)) — the actual open-source Nightscout server code, MIT-licensed, if the Nightscout/xDrip+ bridge path (§3.2) is ever needed. Real server to `git clone` and deploy, not a from-scratch build.
- **Barcode scanning (packaged food, instant lookup):** [`html5-qrcode`](https://www.npmjs.com/package/html5-qrcode) — mature, actively-maintained, permissively-licensed JS npm package that reads barcodes/QR codes straight from the phone camera in a browser/PWA, no native app needed. Pair it with the Open Food Facts lookup above: scan → barcode number → instant nutrition data. (The browser's built-in `BarcodeDetector` API is a lighter zero-dependency alternative on supporting devices, worth Claude Code checking current browser support before choosing.)

**Straight answer on "pre-written scripts to use":** yes — the Open Food Facts packages and cgmquantify above are genuine, install-and-go open-source libraries (not just APIs to wrap). SparkyFitness and Nightscout are full applications worth reading for architecture, with the licensing caveat above. Nothing found is a drop-in "reactive hypoglycemia food/glucose correlator" — that correlation logic (matching a food-log timestamp to a glucose drop 1-4 hours later) is a small, well-defined thing Claude Code should just write; it's not worth hunting for a library to do it.

---

## 7. Architecture recommendation — reuse the SfumatoART pattern

Scott's existing stack for SfumatoART is a proven, working pattern for exactly this kind of solo-AI-directed build: **Vite + vanilla JS PWA, Netlify hosting with serverless functions proxying the Anthropic API key** (`netlify/functions/ai-proxy.js` equivalent), installable to the iPhone home screen now, with a known path to the Play Store later via PWABuilder/TWA. Recommend Claude Code follow the same shape here rather than introducing a new stack:

- **Frontend:** PWA (installable on Scott's iPhone immediately — no App Store friction for a personal-use v1).
- **AI calls:** Netlify serverless function proxies all Claude API calls (food-photo analysis, dictation parsing, clarifying questions) — same security pattern as SfumatoART, keeps the Anthropic key server-side.
- **Data storage:** local-first (IndexedDB) for the personal-use phase — health data shouldn't default to a shared cloud database until/unless Scott decides to commercialise and multi-user accounts are actually needed. SfumatoART already has an IndexedDB migration path designed (`session_architecture.md`) that can likely be reused directly.
- **CGM polling:** a small Netlify **scheduled function** polling LibreLinkUp on an interval and caching the latest reading — this is the one piece that can't be pure client-side, since LibreLinkUp needs server-side login/session handling.
- **Health platform sync:** write glucose + food-timing events to Apple Health/Google Health Connect where possible, as a neutral backup layer.

This reuses a system Scott already trusts and knows how to operate (drag-to-Netlify deploy, Codex/Claude Code diagnose-approve-implement loop), rather than asking him to learn a second toolchain for a second product.

---

## 8. Privacy & regulatory notes (relevant now for design, not urgent for v1 personal use)

- **TGA (medical device regulation):** Software that logs data and shows correlations/trends, without making diagnostic or treatment recommendations, sits in the territory TGA generally excludes from regulation as a medical device. The moment the app starts giving personalised clinical advice ("reduce your insulin," "your food choice caused this") it likely crosses into regulated Software-as-a-Medical-Device territory. **Keep v1 (and any commercial version) strictly descriptive** — this is the same guardrail as §5's smoke-testing note, for two different reasons (safety and regulatory).
- **Australian Privacy Act / APPs:** if Scott ever sells this to other people, note that **health-service providers are covered by the Privacy Act regardless of business turnover** — the usual small-business (<$3M) exemption does not apply once you're handling other people's health information. Not a blocker for personal use, but a real requirement (privacy policy, APP compliance) before any public launch — worth flagging to Claude Code now so data-handling isn't built in a way that has to be re-architected later.

---

## 9. Competitive landscape — what's already out there, and the gap

| App/category | Pros (from user reviews & reporting) | Cons / gaps |
|---|---|---|
| **MySugr** | Long-established, solid diabetes logging, good UX for manual entry | Built for diabetes (insulin dosing etc.), not reactive hypoglycemia; not AU-focused |
| **Levels** | Strong food/glucose correlation graphs, established brand | US-only, $125/yr membership + separate CGM cost, "two apps required" setup complaint, no clinical guidance included |
| **Nutrisense / Signos** | Coaching support included | Subscription-heavy, US-centric, aimed at metabolic health/weight loss rather than hypoglycemia specifically |
| **Cal AI / SnapCalorie / generic AI calorie apps** | Fast photo logging, good on simple foods | Documented 25-30%+ error on mixed/restaurant meals, miss hidden oils, no glucose correlation at all |
| **SparkyFitness (open source)** | Free, self-hosted, AI photo+chat logging, health-platform sync | No glucose-specific features out of the box; self-hosting is a technical step most users won't take |

**The gap Scott's app can fill:** nothing in this landscape combines (a) reactive-hypoglycemia-specific framing rather than diabetes/weight-loss framing, (b) Australian food/restaurant context, (c) a genuine dictation+photo dual input with an honest clarifying-question loop instead of silent guessing, and (d) a clinician-ready export report. That combination — plus starting from Scott's own real, hard use case — is a legitimate product angle if he goes to market later.

---

## 10. Family sharing — full shared access, not just a read-only view

**Revised per Scott's direct clarification — this is a bigger feature than a simple "follower" link.** Marg (who does the cooking) and his daughter should see the **whole app**, the same way Scott does, synced live across devices — not a stripped-down summary page. The split is by *data source*, not by screen:

- **Everything that comes from a device** (Accu-Chek meter, Libre 2 Plus, and — confirmed, already ordered — a Dexcom G7, see §3.4) is **read-only for everyone, Scott included** — nobody hand-edits a glucose reading, it just reflects what the device reported.
- **Everything in the food/diet log is shared and co-editable** — Marg especially needs to add, edit, or delete food entries, scan barcodes, and log what was actually eaten vs not, from her own device, since she's the one preparing meals. Scott, Marg, and his daughter all need write access to this part.
- **Glucose + high/low alarms**, with **each person able to set their own threshold and choose their own alert sound** — Scott's own alarm doesn't have to match Marg's or his daughter's, so one person's phone can alert on something the others' phones stay quiet on (or vice versa), by design.

**Why this is a real architecture shift, not a small add-on:** §7's local-first IndexedDB approach assumed data lives on Scott's phone alone. Multi-person co-editing of the food log means **the food log itself has to become a shared, synced store that multiple devices read and write to** — not just a one-way snapshot pushed out for viewing. Recommended approach, still reusing the existing Netlify stack rather than introducing a new service:

1. **Netlify Blobs**, one shared "household" store, holding the food log and a mirrored copy of the latest device readings (written by the existing LibreLinkUp-polling function, plus whatever syncs the meter). All three people's apps read from and, for the food log, write to this same store.
2. **A simple per-person identity** (not necessarily full account/password login — a private per-person link or PIN is enough for a 3-person household) so the app knows *who* added a food entry or *whose* alarm settings to apply — this is a step up from the plain anonymous "share link" originally scoped, because write access needs to be attributable, and alarm preferences need to be personal.
3. **Known trade-off worth flagging rather than quietly accepting:** Netlify Blobs has last-write-wins concurrency (confirmed from Netlify's own docs), with no built-in conflict resolution. For a 2-3 person household logging meals, simultaneous edits to the *same* entry are rare, so this is a reasonable v1 trade-off — but Claude Code should know it's a deliberate simplification, not an oversight, in case it ever needs revisiting (e.g. if entries start silently overwriting each other).
4. **Alarms with per-person custom sounds**: each person installs the app to their own phone's home screen (needed for iOS push regardless, per §3.1/earlier notes) and sets their own thresholds + alert sound in their own settings — this keeps it simple (nobody centrally manages three people's preferences) and matches Scott's own description of "some noises they'd pick up, some they might not."

**What this is explicitly not:** the 72-hour LibreLinkUp clinician code (§3.2) is Abbott's own one-off feature — separate infrastructure, expires on its own, unrelated to this. This is a feature native to Scott's own app.

**The "G7" mention is confirmed, not hypothetical** — see §3.4 for the Dexcom G7 integration this now requires, including why a device/source tag on every glucose reading matters once two CGMs are running at once.

---

## 11. Recommended v1 scope for Claude Code

**Build:**
- Manual glucose entry (finger-prick) + LibreLinkUp official polling once the Libre 2 Plus is active
- Barcode scan (packaged food) → instant Open Food Facts lookup via `html5-qrcode`
- Photo food logging via Claude vision, with confidence display + one-tap correction
- Dictation food logging (native mobile STT → Claude parsing), same confidence/correction UX
- Restaurant flow: plate photo (+ optional menu photo) → clarifying questions when confidence is low → entry stored with assumptions noted
- Local GI lookup table (seeded from Atkinson 2021) × estimated carbs-per-serving = **Glycemic Load per meal** — the core "how hard will this hit me" number
- Local timeline correlating food entries, GL, and glucose readings
- Exportable summary report (PDF/CSV) for GP/anaesthetist appointments
- PWA on Netlify, IndexedDB storage, Netlify function proxy for Anthropic API — following the SfumatoART pattern
- Family sharing: full shared access for Marg and his daughter (Netlify Blobs household store + per-person identity) — read-only device data, co-editable food log, per-person configurable alarms, per §10
- Dexcom G7 integration via official Share/Follow + `pydexcom` (§3.4) — confirmed, needed soon, running alongside the Libre 2 Plus for a comparison period
- Glucose reading data model includes a source/device tag (meter/libre/dexcom) from the start (§3.4)
- Glucose chart: shaded in-range band + dashed threshold lines (matching the Libre app's style, §3.5), with each CGM source as a distinct line colour during the Libre/Dexcom comparison period

**Explicitly defer:**
- Nightscout/xDrip+ bridge (only needed if LibreLinkUp proves insufficient)
- Multi-user accounts / commercialisation infrastructure
- Play Store native packaging
- Advanced glycemic-variability analytics (cgmquantify-style metrics)
- Any prescriptive/advisory features (regulatory guardrail, §8)

---

## 12. Open questions for Scott before/at kickoff

1. ~~Confirm exact meter model~~ — **Resolved:** Roche **Accu-Chek Guide Me**, Bluetooth-capable via printed PIN (see §3.1).
2. **[DECISION NEEDED]** Comfortable using the official LibreLinkUp sharing setup (needs a LibreLinkUp account + sharing enabled from the LibreLink app) as the CGM data source, at least for v1? (Scott has since enabled Libre sharing and both devices are now producing paired readings — see §3.1's lag-time note.)
3. **[DECISION NEEDED]** Rough Anthropic API budget expectation — photo + dictation parsing calls add up per meal logged; worth a ballpark before Claude Code architects the call volume.
4. Timeline pressure from the shoulder surgery — does the peri-operative export report need to exist before a specific date?
5. Someone (Scott or Claude Code) needs to check glycemicindex.com's actual terms of use before any bulk/automated pull from it — fine as a manual reference regardless, but that's a five-minute check worth doing before building against it.
6. ~~Confirm whether the Dexcom G7 is a real plan~~ — **Resolved:** confirmed and already ordered, for a comparison period alongside the Libre 2 Plus (see §3.4).
7. **[DECISION NEEDED]** For family sharing (§10): confirm the simple per-person identity approach (private link/PIN per person, no full account system) is enough, versus wanting proper login — matters for how much effort Claude Code puts into the auth side.
8. Roughly how long is the Libre/Dexcom comparison period expected to run? Doesn't block building the dual-source support in §3.4, but useful for Claude Code to know whether "both active at once" is a short trial or a longer-term arrangement.

---

## Sources

- [Mayo Clinic — Reactive hypoglycemia](https://www.mayoclinic.org/diseases-conditions/diabetes/expert-answers/reactive-hypoglycemia/faq-20057778)
- [DVA RAP — AF02 Continuous Glucose Monitors](https://www.dva.gov.au/providers/rehabilitation-appliances-program-rap/rap-schedule/rap-af02)
- [DVA RAP — AF01 Standard Glucose Monitor](https://www.dva.gov.au/providers/rehabilitation-appliances-program-rap/rap-schedule/rap-af01)
- [D9414 Order Form — Diabetes Products](https://www.dva.gov.au/sites/default/files/2023-08/d9414.pdf)
- [libre-link-unofficial-api (GitHub)](https://github.com/DRFR0ST/libre-link-unofficial-api)
- [LibreView Unofficial API docs (GitHub)](https://github.com/FokkeZB/libreview-unofficial)
- [Dexcom — How do I share my Dexcom G7 glucose data with followers?](https://www.dexcom.com/en-us/faqs/how-do-i-share-my-dexcom-g7-glucose-data-with-followers)
- [pydexcom (GitHub) — unofficial Dexcom Share API library](https://github.com/gagebenne/pydexcom)
- [xDrip+ / Nightscout overview](https://digital-diabetes.com/2022/10/15/how-to-make-your-freestyle-libre-2-a-glucose-continuous-meter-gcm/)
- [Nightscout documentation](https://nightscout.github.io/)
- [International tables of glycemic index and glycemic load values 2021 (Atkinson et al., AJCN)](https://www.sciencedirect.com/science/article/pii/S0002916522004944)
- [University of Sydney Glycemic Index Database](https://glycemicindex.com/)
- [glycemic-index/glycemic-index.github.com — community GI table](https://github.com/glycemic-index/glycemic-index.github.com)
- [html5-qrcode (npm)](https://www.npmjs.com/package/html5-qrcode)
- [Accu-Chek data transfer FAQ](https://www.accu-chek.co.uk/support/faq/how-does-data-transfer-work-accu-chek-instant-meter)
- [Accu-Chek Guide Me — Bluetooth & USB](https://xeteor.com/roche-accu-chek-guide-me-meter-bluetooth-capability/)
- [Accu-Chek — CGM Lag Time training page](https://www.accu-cheklatam.com/en/training/cgm/lag-time)
- [ADCES — "Lag Time" glossary entry](https://www.diabeteseducator.org/)
- [Clinical Nutrition Report — calorie tracker accuracy](https://clinicalnutritionreport.com/articles/most-accurate-calorie-tracker-reddit-2026/)
- [Is Cal AI Accurate? — Intake Nutrition](https://www.intakenutrition.io/blog/is-cal-ai-accurate-what-public-reviews-and-ai-research-actually-suggest)
- [Photo-Based Carb Counting: Why Portion Estimation Is the Hard Part — snaq.ai](https://www.snaq.ai/blog/photo-based-carb-counting-why-portion-estimation-is-the-hard-part)
- [Prompt Engineering and Model Selection for LLM-Based Nutritional Estimation from Food Images (2026)](https://doi.org/10.3390/nu18122017)
- [A Japanese-Dietitian Prompt Systematically Shifts Portion Estimates in LLM-Based Nutrient Estimation](https://www.mdpi.com/2072-6643/18/17/2892)
- [Levels CGM cost/review — Nutrisense](https://www.nutrisense.io/blog/cost-of-levels-cgm)
- [SparkyFitness (GitHub)](https://github.com/CodeWithCJ/SparkyFitness)
- [Open Food Facts](https://world.openfoodfacts.org/data)
- [AUSNUT — Food Standards Australia New Zealand](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut)
- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [cgmquantify (GitHub)](https://github.com/brinnaebent/cgmquantify)
- [Glucose360 — open-source CGM analysis platform (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12588377/)
- [TGA — Software-based medical device exclusions](https://www.tga.gov.au/products/medical-devices/software-and-artificial-intelligence-ai/overview/software-based-medical-device-exclusions)
- [Australia Privacy Act small business exemption — health service exception](https://termageddon.com/australia-privacy-act-small-business/)
