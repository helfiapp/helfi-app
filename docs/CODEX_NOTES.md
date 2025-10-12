### 2025-10-12 – Insights performance and quality (P0)

1) Performance
- Opening Insights sections (Supplements, Nutrition, etc.) can take ~60s on production.
- Hypothesis: repeated cold LLM path due to cache-miss + validation strictness; UI waiting on network.
- Immediate actions: never block UI on LLM; show degraded/cached instantly; precompute concurrency=4; short-TTL cache for degraded results.

2) Quality
- Some sections return <4 Suggested or <4 Avoid despite requirement.
- Content feels generic; needs quantified actions (g/day, mg/day, timing) and reasons.
- Immediate actions: enforce guaranteed counts via strengthened fill-missing; add rewrite-to-domain when classifier returns `other`; include 7‑day nutrition summary and top foods in prompt.

3) Tracking
- See `insights.plan.md` (v3 plan) for the full remediation steps and acceptance criteria.


