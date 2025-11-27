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
