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

---

## 2. Clinical background (plain terms, for context — not medical advice)

Reactive (postprandial) hypoglycemia is a blood sugar drop **within about 4 hours after eating**, most often after high-sugar/refined-carb meals or alcohol without food. Symptoms: shakiness, sweating, dizziness, rapid heartbeat, hunger, irritability, confusion. Standard non-drug management is dietary: balanced meals with fibre, smaller meals every ~3 hours, pairing alcohol with food, and avoiding sugary food on an empty stomach. [Mayo Clinic](https://www.mayoclinic.org/diseases-conditions/diabetes/expert-answers/reactive-hypoglycemia/faq-20057778)

This matters for the app's design: the core value isn't "counting calories," it's **surfacing the food→glucose-drop pattern** for a specific person, which is a different (simpler) job than diabetes carb-counting apps are built for.

---

## 3. Getting glucose data into the app

### 3.1 Finger-prick meter (now)
**[DECISION NEEDED]** Scott — what's the exact meter model? RAP AF01-supplied meters in Australia are typically Roche Accu-Chek or Abbott Optium models. Many current models (e.g. Accu-Chek Instant, Accu-Chek Guide Me) support **Bluetooth** export to a companion app, and older/other models use a USB/infrared cable with Accu-Chek Smart Pix reader software. Once the exact model is known, Claude Code can check whether it exposes Bluetooth or a documented export format.
**v1 fallback (recommended):** manual entry — reading + timestamp, logged in under 10 seconds. Don't block launch on meter integration.

### 3.2 Libre 2 Plus CGM (coming)
Three real options, in order of recommendation:

1. **Official LibreLinkUp/LibreView sharing (recommended for v1).** Once Scott's sensor is active in the official FreeStyle LibreLink app, he can share readings via LibreLinkUp; a backend job (e.g. a Netlify scheduled function) can poll the LibreLinkUp API on his behalf and store the latest reading. This is the ToS-safe, stable path.
2. **Nightscout + xDrip+ bridge (power-user option, defer to v2).** Nightscout is a mature, 10+ year old open-source diabetes data platform with a well-documented REST API used by hundreds of third-party apps and devices. xDrip+ (open source, Android only) can read the Libre 2 sensor and push data into a self-hosted Nightscout instance, which the app then reads via a clean, stable API — avoiding Abbott's private endpoints entirely. Downside: Android-only, and setup is genuinely fiddly (Scott's iPhone-first, per the SfumatoART HEIC/iPhone notes).
3. **Unofficial reverse-engineered Libre APIs** (e.g. `libre-link-unofficial-api` on GitHub) — explicitly "at your own risk," alpha-quality, breaks when Abbott changes their backend. Avoid for anything Scott will rely on for a surgery-relevant record.

**Correction on the "tap the phone" idea:** with Libre 2/2 Plus, the NFC tap is only needed once, to activate/pair the sensor. After that it streams via Bluetooth automatically (roughly every minute) to the paired official app — no repeated tapping needed. Good news: it simplifies the UX once the official-API route is used.

### 3.3 Health platform layer
Apple Health (iOS) and Google Health Connect (Android) both support a blood-glucose data type. Worth writing to/reading from these as a neutral integration layer regardless of meter/CGM choice — future-proofs against meter changes and plays nicely if Scott ever adds a smartwatch.

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

- **[SparkyFitness](https://github.com/CodeWithCJ/SparkyFitness)** — self-hosted, open-source nutrition/fitness tracker (TypeScript, PostgreSQL, Docker). Already has: AI chat-based food logging plus photo-upload logging ("SparkyAI," in beta), Apple Health + Google Health Connect + Fitbit/Garmin/Withings sync, and built-in USDA + Open Food Facts nutrition lookups. Actively maintained (4.8k GitHub stars). **Strong candidate to fork or mine for architecture/code** rather than building the food-database plumbing from zero — this is the single biggest time-saver found in this research.
- **Open Food Facts** — free, crowdsourced, global barcode/nutrition database with real Australian packaged-food coverage. Good for scanning packaged items.
- **AUSNUT / FSANZ food composition database** — free, Australia-specific generic food composition data from Food Standards Australia New Zealand. Downloadable dataset, not a live API — would need periodic import into the app's own database. Best source for "how many carbs in a generic AU dish" when no barcode exists.
- **USDA FoodData Central** — free, very comprehensive, US-centric but fine as a fallback/reference set.
- **Nutritionix** — commercial, natural-language food parsing + a large restaurant-chain database, but that database is heavily US-centric — limited value for Australian restaurant coverage, and it's a paid API. Given Claude is already doing the heavy lifting on unstructured description → structured estimate, Nutritionix's natural-language parsing is largely redundant here. Not recommended as a paid dependency for v1.
- **xDrip+ / Nightscout** — see §3.2, the mature open-source CGM bridge if/when the official LibreLinkUp route isn't enough.
- **cgmquantify / Glucose360** (Python) — open-source packages for computing standard glycemic-variability metrics from CGM data (time-in-range, mean amplitude of glycemic excursions, etc.) — useful later if Scott wants proper glucose analytics rather than a simple line chart.

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

## 10. Recommended v1 scope for Claude Code

**Build:**
- Manual glucose entry (finger-prick) + LibreLinkUp official polling once the Libre 2 Plus is active
- Photo food logging via Claude vision, with confidence display + one-tap correction
- Dictation food logging (native mobile STT → Claude parsing), same confidence/correction UX
- Restaurant flow: plate photo (+ optional menu photo) → clarifying questions when confidence is low → entry stored with assumptions noted
- Local timeline correlating food entries against glucose readings
- Exportable summary report (PDF/CSV) for GP/anaesthetist appointments
- PWA on Netlify, IndexedDB storage, Netlify function proxy for Anthropic API — following the SfumatoART pattern

**Explicitly defer:**
- Nightscout/xDrip+ bridge (only needed if LibreLinkUp proves insufficient)
- Multi-user accounts / commercialisation infrastructure
- Play Store native packaging
- Advanced glycemic-variability analytics (cgmquantify-style metrics)
- Any prescriptive/advisory features (regulatory guardrail, §8)

---

## 11. Open questions for Scott before/at kickoff

1. **[DECISION NEEDED]** Exact finger-prick meter model/brand (for Bluetooth/USB export research).
2. **[DECISION NEEDED]** Comfortable using the official LibreLinkUp sharing setup (needs a LibreLinkUp account + sharing enabled from the LibreLink app) as the CGM data source, at least for v1?
3. **[DECISION NEEDED]** Rough Anthropic API budget expectation — photo + dictation parsing calls add up per meal logged; worth a ballpark before Claude Code architects the call volume.
4. Timeline pressure from the shoulder surgery — does the peri-operative export report need to exist before a specific date?

---

## Sources

- [Mayo Clinic — Reactive hypoglycemia](https://www.mayoclinic.org/diseases-conditions/diabetes/expert-answers/reactive-hypoglycemia/faq-20057778)
- [DVA RAP — AF02 Continuous Glucose Monitors](https://www.dva.gov.au/providers/rehabilitation-appliances-program-rap/rap-schedule/rap-af02)
- [DVA RAP — AF01 Standard Glucose Monitor](https://www.dva.gov.au/providers/rehabilitation-appliances-program-rap/rap-schedule/rap-af01)
- [D9414 Order Form — Diabetes Products](https://www.dva.gov.au/sites/default/files/2023-08/d9414.pdf)
- [libre-link-unofficial-api (GitHub)](https://github.com/DRFR0ST/libre-link-unofficial-api)
- [LibreView Unofficial API docs (GitHub)](https://github.com/FokkeZB/libreview-unofficial)
- [xDrip+ / Nightscout overview](https://digital-diabetes.com/2022/10/15/how-to-make-your-freestyle-libre-2-a-glucose-continuous-meter-gcm/)
- [Nightscout documentation](https://nightscout.github.io/)
- [Accu-Chek data transfer FAQ](https://www.accu-chek.co.uk/support/faq/how-does-data-transfer-work-accu-chek-instant-meter)
- [Accu-Chek Guide Me — Bluetooth & USB](https://xeteor.com/roche-accu-chek-guide-me-meter-bluetooth-capability/)
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
