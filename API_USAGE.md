# API Usage & Billing Handover (Plain English)

This note explains where we are, what was done, and what the next agent needs to finish so the **admin AI Usage page shows real OpenAI charges (dollars and tokens), not estimates.**

## What the user wants
- Show the **exact real cost and tokens** per feature (food image analysis, insights, etc.) using OpenAI’s official billing data.
- Stop showing confusing/estimated numbers that don’t match OpenAI’s bill.
- Confirm we’re using the correct OpenAI API key and endpoint that actually gets charged.

## Current situation (today)
- The **real, billable spend** is what you see in the OpenAI dashboard (e.g., ~$5.09 for the day).
- The **admin AI Usage page** currently shows **internal estimates** (not real billing). That’s why it looks much higher and is stressful.
- Insights AI has been hard-disabled by default in production (unless `ENABLE_INSIGHTS_LLM=true`), so it should not be burning tokens now.
- Food image analysis still works and uses OpenAI normally.

## Changes already made
- Added a hard “off” switch for Insights AI. If `ENABLE_INSIGHTS_LLM` is not set to `true`, no insights calls will go to OpenAI.
- Stopped auto insights generation on health data save (now guarded by the above switch).
- Pushed these changes to `master`.

## What still needs to be done (next agent)
1) **Replace estimates with real OpenAI numbers in the admin AI Usage page.**
   - Call the OpenAI Usage/Billing API and display the real dollar spend and tokens (same as the OpenAI dashboard).
   - Make it crystal-clear in the UI: “This matches OpenAI billing.” **Do not show any of the old/estimated numbers anywhere. Remove or hide them entirely.**
2) **Per-feature costs from real data.**
   - Best-effort: map OpenAI usage back to app features (e.g., food image analysis vs. insights) using our request logs/context (userId, feature tags).
   - If exact mapping is impossible from OpenAI alone, **do NOT show estimates in the UI**. Either hide those rows or clearly state “not available yet” rather than guessing. The user does not want fake/estimated numbers shown.
   - The user specifically wants: (a) total usage per feature and (b) the cost per single use of each feature. Use real request counts and real spend to compute per-use averages. If a feature’s calls can’t be cleanly isolated, mark it “not available yet” instead of guessing.
3) **Key/endpoint sanity check.**
   - Confirm the app is using the intended OpenAI API key (`OPENAI_API_KEY` in env). Do not print the key; just verify it exists and matches the organization in use.
   - Confirm the endpoint is the official OpenAI endpoint (not a mock).
4) **Label everything clearly.**
   - In the admin UI, clearly mark “Real OpenAI billing” vs. any “estimated per-feature split” (if any remains).

## How to verify the correct key/endpoint (do this without exposing secrets)
1) Check that `OPENAI_API_KEY` is set in the environment used by the app (Vercel/production). Do not print it; just confirm it exists and belongs to the Helfi org you see in the OpenAI dashboard.
2) Run a single known test call (e.g., small chat completion) and confirm it appears on the OpenAI Usage page. That proves the endpoint + key are the ones being billed.
3) Ensure no other stray keys are in use (look for alternate env vars such as `OPENAI_API_KEY_*`). Remove or disable any unused keys.

## Notes on the screenshots/billing history
- The $44 and $55 entries are credit top-ups on the OpenAI account (pay-as-you-go balance). They are separate from the in-app estimates.
- The OpenAI “Usage” page (e.g., $5.09 for Dec 2) is the real daily spend.
- Credit balance shown ($18.02 in your screenshot) is the remaining OpenAI credit; when it hits $0, calls stop unless auto-recharge is enabled.

## Quick checklist for the next agent
1) Keep `ENABLE_INSIGHTS_LLM` **off** until real billing display is built (prevents surprise insight charges).
2) Wire the admin AI Usage page to **OpenAI’s official Usage/Billing API** and show those numbers.
3) Try to attribute spend per feature using request logs; if any part is still estimated, label it as “estimate” and highlight the real total from OpenAI.
4) Verify the **single** OpenAI key in use matches the org shown in the OpenAI dashboard.
5) After wiring, run a small test (e.g., one food image analysis) and confirm the dollar/token increase on the OpenAI dashboard matches what the admin shows.

## Source of truth
- **OpenAI dashboard** (and its API) = the real bill.
- The in-app admin AI Usage must be updated to match that data. **Do not display the old estimates at all.** If a per-feature split can’t be derived from real data, leave it blank or mark it as “not available yet” rather than guessing.

## Latest troubleshooting (Dec 4, 2025) — env/billing failures
- Current errors on the admin AI Usage page: `No such project: proj_iIRWK7gAVAbCaVjnMuDHi4j (status 401)`, `Missing required parameter: 'date' (status 400)`, and `billing_range/billing_single: Forbidden (403)`. Real cost tiles stay empty; tokens/calls come from local logs (best-effort, no markup).
- We tried multiple fetch patterns: usage range, usage single-date, billing range, billing single-date, and day-by-day aggregation. All fail with the key in use.
- Env history (Vercel):
  - `OPENAI_API_KEY` is currently set to a service-account/project-scoped key (starts `sk-…`, not `sk-proj-`, but still tied to the project).
  - `OPENAI_ORGANIZATION` and `OPENAI_PROJECT_ID` were removed in the latest deploy to avoid header mismatch errors.
  - Project ID (from OpenAI UI): `proj_iIRWK7gAVAbCaVjnMuDHi4j`. Org ID: `org-1kL238SR1VbBMUvXFNMnKRj`.
- Previous attempts to set org/project headers caused: “OpenAI-Organization header should match organization for API key” and “project does not exist in org” (401). Removing headers now yields “no such project”/“forbidden,” so the current key still lacks billing/usage scope.
- Root issue: the key in use cannot read billing/usage. It’s project-scoped and returns 401/403 for billing and usage. Need a billing-enabled key.

## Next agent: what to try
1) Acquire a billing-enabled key. Ideally an org-level key (not service-account, not `sk-proj`). If the UI forces project selection, ensure the key truly belongs to `proj_iIRWK7gAVAbCaVjnMuDHi4j` **and** has billing/usage scope. Test via curl:  
   `curl -H "Authorization: Bearer $KEY" "https://api.openai.com/v1/usage?date=2025-12-03"` — if this returns 401/403, the key is insufficient.
2) Set only `OPENAI_API_KEY` to that working key. Leave `OPENAI_ORGANIZATION` and `OPENAI_PROJECT_ID` unset unless absolutely required by the key; if you must set project, confirm the key is tied to that project.
3) Redeploy Production, open the admin AI Usage tab, and click Refresh. The red banner should clear and real cost tiles should populate if billing access works.
4) If experimentation is needed, use the Vercel token (user prefers you handle env changes directly; they are exhausted from re-entering variables).
