## Handover: Make Insights Refreshes charge accurate, per-run costs

Goal
- When a user clicks “Update Insights” in Health Setup or “Generate Nutrition Insights”, charge credits based on actual OpenAI tokens used for that refresh (no flat rate), applying the usual profit margin. Avoid touching other flows (food analyzer, medical scans, symptom analysis, etc.).

Current state
- AI calls already log tokens/cost to `AIUsageLog` via `runChatCompletionWithLogging` (see `lib/ai-usage-logger.ts`, `lib/insights/llm.ts`).
- The new targeted refreshes (Health Setup Update Insights, Nutrition Generate) DO NOT currently deduct credits. The old “Regenerate All” flow uses a fixed `INSIGHTS_GENERATION` credit cost (2 credits) but is being de-emphasized.
- Credit pricing guidance below targets ~65% margin on subscriptions and ~75% on top-ups. See “AI Costs & Credit Guidance” section that follows.

Proposal (keep everything else intact)
1) Tag each refresh with a run ID:
   - When user clicks Update Insights (any Health Setup step) or Generate Nutrition Insights, create a runId (UUID) and pass it through the backend calls that trigger insights generation.
   - In insights generation (the LLM calls in `lib/insights/llm.ts`), include `{ runId, feature: 'insights:targeted' }` in the logging context so `AIUsageLog` rows have that runId.
2) After generation finishes, total the real cost:
   - New endpoint (or use the same handler) to sum `AIUsageLog.costCents` WHERE runId = ?. This gives actual OpenAI cost for that refresh.
3) Convert to credits with margin:
   - Use current revenue/credit: subs ~$0.0143/credit, top-ups ~$0.0200/credit (from below).
   - To hit ~65% margin (subs): credits = ceil((cost / 0.35) / 0.0143).
   - To hit ~75% margin (top-ups): credits = ceil((cost / 0.25) / 0.0200).
   - If user has both balances, follow existing wallet precedence; store the charged credits.
   - Record a feature usage entry (e.g., `insightsTargeted`) so the meter updates. DO NOT change other feature costs (food analyzer, medical scans, etc.).
4) Display to user:
   - On the buttons (“Update Insights”, “Generate Nutrition Insights”), show a small “Credits will be charged after generation based on actual AI usage” note.
   - After run completes, show “Charged X credits” (using the calculated amount) and refresh the credit meter.
5) Safety/guard rails:
   - Do not change existing fixed costs (CREDIT_COSTS) used by other features.
   - Do not enable background auto-regeneration; keep it on-demand only.
   - Keep Insights routes otherwise intact; only add runId plumbing + post-run billing.
   - Use `AIUsageLog` in the prod DB (Neon) as documented below; do not swap DB strings.

Open questions for the next agent (confirm with user if needed)
- If a run fails or times out: charge 0 credits. Only charge on success.
- Rounding: use ceil to avoid undercharging; document the exact credit calculation used.
- Capping: if a single run is huge, cap the charge or prompt before charging? (Ask user.)

Implementation sketch
- Frontend: generate runId at click, send to backend when triggering insights refresh.
- Backend: propagate runId to insights generation calls (through `getIssueSection`/LLM layer), ensure `runChatCompletionWithLogging` logs runId and feature.
- After generation: sum `AIUsageLog` by runId, compute credits, charge via `CreditManager`, log feature usage, and return charged amount to the client.
- Show the charged amount in UI and refresh the credit meter event.

## AI Costs & Credit Guidance (Production)

**Database for costs:** `helfi-main-database` (Neon), connection string:  
`postgresql://neondb_owner:npg_6Pwm8JLiQUxb@ep-shiny-silence-a7jm0pec-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

### Current observed average costs (from `AIUsageLog`)
Rounded per-call costs:
- Food analysis: ~\$0.074
- Symptom analysis: ~\$0.030
- Medical image analysis: ~\$0.038
- Insights “generate” flows (nutrition, supplements, meds, lifestyle, exercise): ~\$0.040
- Light chat-style (symptoms chat, similar): ~\$0.010

### Credit value (today)
- Subscriptions: \$20 → 1,400 credits ⇒ \$0.0143 revenue per credit. (Same math for \$10/\$30/\$50 plans; just scale revenue/credit.)
- Top-ups: \$5 → 250 credits ⇒ \$0.0200 revenue per credit.

### Credit charges to hit target margins
Use these per-feature credit deductions. They already bake in ~65% margin on subscriptions and ~75% on top-ups with the current credit values.
- Food analysis: **15 credits**
- Symptom analysis: **6 credits**
- Medical image analysis: **8 credits**
- Insights generate flows: **8 credits**
- Light chat-style: **2 credits**

Sanity check (example, subscriptions at \$0.0143/credit):
- Food analysis at 15 credits ⇒ revenue ≈ \$0.214; cost ≈ \$0.074; margin ≈ 65%.
- Symptom analysis at 6 credits ⇒ revenue ≈ \$0.086; cost ≈ \$0.030; margin ≈ 65%.
- Medical image at 8 credits ⇒ revenue ≈ \$0.114; cost ≈ \$0.038; margin ≈ 67%.
- Insights generate at 8 credits ⇒ revenue ≈ \$0.114; cost ≈ \$0.040; margin ≈ 65%.
- Light chat at 2 credits ⇒ revenue ≈ \$0.029; cost ≈ \$0.010; margin ≈ 65%.

### Where AI is used (OpenAI-backed routes)
- Food: `app/api/analyze-food/route.ts`
- Packaged food: `app/api/analyze-packaged/route.ts`
- Supplement image: `app/api/analyze-supplement-image/route.ts`
- Symptom analysis: `app/api/analyze-symptoms/route.ts`
- Symptom chat: `app/api/analyze-symptoms/chat/route.ts`
- Medical image (chat/analysis): `app/api/medical-images/chat/route.ts`
- Voice chat: `app/api/chat/voice/route.ts`
- Insights suite: `app/api/insights/generate/route.ts`, `app/api/insights/ask/route.ts`, `app/api/insights/detail/route.ts`, `app/api/insights/issues/[slug]/sections/[section]/chat/route.ts`, `app/api/analytics/route.ts`
- Interaction analysis: `app/api/analyze-interactions/route.ts`
- Health tips dispatch: `app/api/push/health-tips/dispatch/route.ts`
- Internal/debug: `app/api/test-vision/route.ts`, `app/api/debug-food-upload/route.ts`

### How to update/verify costs
1) Ensure `AIUsageLog` exists (it does in prod).
2) Pull fresh costs:
```
DATABASE_URL="postgresql://...neondb...sslmode=require&channel_binding=require" node - <<'NODE'
const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient();
(async()=>{
  const rows = await prisma.$queryRawUnsafe(`
    SELECT feature,
           COUNT(*)::int AS calls,
           ROUND(SUM("costCents")::numeric / 100, 4) AS total_usd,
           ROUND(AVG("costCents")::numeric / 100, 4) AS avg_usd
    FROM "AIUsageLog"
    GROUP BY feature
    ORDER BY total_usd DESC
    LIMIT 50;
  `);
  console.table(rows);
  await prisma.$disconnect();
})();
NODE
```
3) If costs shift, recompute credits:  
   - Subscription target 65% margin: credits = ceil((cost / 0.35) / \$0.0143)  
   - Top-up target 75% margin: credits = ceil((cost / 0.25) / \$0.0200)  
   - Then round to a sensible small integer (like the values above).

### Critical reminders
- Always use the Neon connection above (helfi-main-database). Ignore any old database strings.
- Keep `DATABASE_URL` in Vercel pointed to this database (it is).
- Adjust `CREDIT_COSTS`/deductions in the code to match the credit charges listed here.
