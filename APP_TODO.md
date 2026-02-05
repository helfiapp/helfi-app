APP TODO LIST (FOR YOU, NO CODING)

1. ✅ App basics are set. Name: Helfi. Tagline: “Your Personal Health Intelligence Platform.” Colors: same as the current web app.
2. ✅ Support email is support@helfi.ai.
3. ✅ Privacy policy https://helfi.ai/privacy and terms https://helfi.ai/terms.
4. ✅ Assets received in `public/mobile-assets/`: static splash (`STATIC SPLASH.png`), animated splash (`ANIMATED SPLASH.mp4`), logo (`HELFI TRANSPARENT.png`), and favicon/icon source (`FAVICON.png`).
5. Screenshots: hold off for now; we will take them once the app sections are final.
6. ✅ Create a Google Play developer account (one-time fee). Next: I can handle setup while you are logged in (Playwright), or you can add another admin.
7. ✅ Create an Apple Developer account (annual fee). Next: add me as an admin so I can handle setup and signing.
8. ☐ If you prefer, I can manage the Firebase/notifications setup so you do not have to touch it. Just create the account and give me access (or invite me to your Google account project) and I will handle the details.
9. ☐ Decide if the app will collect data like email, name, or health info. Tell me what you collect so I can fill in the store compliance answers.
10. ☐ Decide if you want push notifications on launch. If yes, confirm what types (reminders, updates, marketing) so I can configure them correctly.
11. ☐ Confirm any permissions the app will need (camera, photos, files, location). If none, say “none” so we keep the permission prompts clean.
12. ☐ Share any legal or regulatory requirements you must follow (for example: HIPAA, GDPR). If you are unsure, tell me what regions you plan to launch in.
13. ☐ Provide a short app store description (2–3 sentences) and a longer one (3–6 bullet points of benefits). I can edit/polish them for you.
14. ☐ Confirm the countries/regions you want to launch in. If you want worldwide by default, say so.
15. ☐ Tell me who should be invited as testers (emails) so I can add them to TestFlight (iOS) and the internal testing track (Android).
16. ☐ Decide how you want users to contact you for support (email, link to help page, or both). Provide the link if you have one.
17. ☐ Share any deadlines or launch dates so I can plan builds and submissions around them.
18. ☐ Add the food icon to the left side of each food panel in the mobile UI; asset lives at `public/mobile-assets/MOBILE ICONS/FOOD ICON.svg` (PNG version also present) and should be placed as shown in the reference screenshot `public/mobile-design-screenshots/FOOD ICON PLACEMENT IMAGE.jpg` (Cronometer page with the icon overlaid for positioning).

Splash screen suggestion: go with a simple option—solid brand background with the logo centered. If you prefer a different style (gradient, photo, or slogan included), tell me which and I’ll set it up.

---
## Handover for next agent

### What I was doing
- Adding AI usage logging per feature so we can compute real costs (tokens/dollars) and then set credit pricing for 60% subscription margin and 70% top-up margin. Goal: log tokens/cost for all AI calls and later adjust `CREDIT_COSTS` from actual usage.
- Integrated logging via `lib/ai-usage-logger.ts` and `runChatCompletionWithLogging` wrapper; writes to `AIUsageLog` table (created if missing) with userId, feature tag, model, prompt/completion tokens, and costCents.
- Instrumented multiple endpoints (insights LLM, packaged food, supplement image, symptoms chat, voice chat, insights ask, insights landing generate, section chat, medical image chat, admin analytics) to log usage.

### Why so many deployment errors
- After refactoring to use the logging helper, several functions in `lib/insights/llm.ts` had outdated call signatures: `openai` was removed from callee signatures but still passed in some call sites, causing TypeScript errors at build time. Each deploy surfaced another leftover reference.
- I fixed multiple instances but missed remaining ones; builds failed until each was removed. Latest fix removed `openai` dependency inside `rewriteCandidatesToDomain` and `fillMissingItemsForSection` by fetching the client internally.

### Current suspected build blocker
- Error log (12:45 build) shows `rewriteCandidatesToDomain` call missing required `openai` param. I just patched `rewriteCandidatesToDomain` to self-acquire OpenAI, but there may still be call sites or helper signatures expecting `openai`. Need to search `lib/insights/llm.ts` for any remaining `openai` props in object literals passed to helper functions, and for helper signatures that still require `openai`.
- Also check `fillMissingItemsForSection` and any other helper that still expects `openai` in its params. The goal is consistent signatures: helpers should grab `getOpenAIClient()` internally and not require `openai` in arguments.

### Files touched
- `lib/ai-usage-logger.ts`: logging helper and DB insert for `AIUsageLog`.
- `lib/insights/llm.ts`: multiple `runChatCompletionWithLogging` integrations and signature cleanups; this file still needs a full sweep for lingering `openai` param mismatches.
- API routes instrumented: `app/api/analyze-packaged/route.ts`, `app/api/analyze-supplement-image/route.ts`, `app/api/analyze-symptoms/chat/route.ts`, `app/api/chat/voice/route.ts`, `app/api/insights/ask/route.ts`, `app/api/insights/generate/route.ts`, `app/api/insights/issues/[slug]/sections/[section]/chat/route.ts`, `app/api/medical-images/chat/route.ts`, `app/api/analytics/route.ts`.

### Next steps for the new agent
1) Fix the current build error: in `lib/insights/llm.ts`, make all helper signatures and call sites consistent:
   - `rewriteCandidatesToDomain` should not take `openai` in args; fetch internally (already patched).
   - `fillMissingItemsForSection` same approach (patched).
   - Ensure all calls to these helpers no longer pass `openai`, and remove `openai` from any remaining helper params. Do a full search for `openai,` in object literals in this file.
2) Run a local type check (`npm run build` or `tsc`) to confirm no more signature mismatches.
3) After build passes, redeploy.
4) Later: use `AIUsageLog` data to compute per-feature cost and adjust `CREDIT_COSTS` for 60%/70% margin.

### Context on objectives (credits and margins)
- Subscription credits: $10→700, $20→1,400, $30→2,100, $50→3,500 (~$0.014/credit, targeting ~60% margin if cost ≈ $0.0057/credit).
- Top-ups: $5→250, $10→500, $20→1,000 (~$0.020/credit, targeting ~70% margin if cost ≈ $0.006/credit).
- We need actual per-feature AI cost (tokens/$) to tune credit charges. Logging is step one.

### Environment
- Latest push: `bdcd42c Make rewrite/fill helpers use local OpenAI client`.
- Build failures are TypeScript signature mismatches in `lib/insights/llm.ts`.

### Apology / expectation
- Multiple failures were due to incomplete cleanup of `openai` args after logging refactor. Please do a comprehensive sweep in `lib/insights/llm.ts` before redeploying.
