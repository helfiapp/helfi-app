# General assistant core checkpoint — 17 October 2026

The owner authorised a 90-minute core integration using the existing app functions, with no Helfi credit spending. The run began at 11:24:52 AEDT; the requested report is at 12:54:52 AEDT. This document replaces the earlier five-operation architecture checkpoint and its broader-scope estimate.

**Helfi credits used for this work: 0.** No live AI request, real Helfi account read/write, signed app build, installation, upload, push or deployment was performed. Offline iPhone and Android code exports were compiled; these are not installed applications.

## What is connected locally

One fixed registry now assembles **58 operations** from the existing normal app handlers. **56 ordinary core operations are available in the local assembly; two paid symptom-analysis operations are unavailable.** Typed requests and structured voice requests use the same owned conversation, plans, review and result handling.

| Area | Connected core behavior verified with actual source and synthetic boundaries |
|---|---|
| Food and recipes | Read exact saved foods and totals; calculate current-day remaining targets using the manual screen's normal calculation; prepare source-resolved measured meals/recipes; distinguish library saves from portions eaten; save and reopen normal results. |
| Water and exercise | Read saved entries and real exercise types; prepare/create entries; update/delete exact owned records; use real exercise estimates; read/change hydration goals. |
| Mood and journals | Read saved entries; create exact literal Mood/Health Journal notes; retain supplied metadata; update/delete supported exact records; recover lost save replies without repeating POST. |
| Profile, setup and settings | Read saved profile/setup; review supported profile, health setup, goal, reminder, quiet-hours and check-in changes through their existing normal handlers. |
| Notifications, reports and devices | Read stored state and supported report content; perform supported normal notification changes. Paid generation, purchases, device permissions and other person-only workflows are outside this core checkpoint. |

A request can read actual stored state, use earlier results, ask for missing details, accept corrections and review separate changes in sequence. Each write still needs its own current review. The bounded read/planning loop can gather several facts for one original request and keep them together in its answer.

A separate cross-section journey runs one registry and durable assistant session through a source-measured recipe correction, independently reviewed water save, restart/recovery, literal journal save and exact journal readback. Its normal domain row stores are synthetic and independent; it does not claim a real shared production database or current-day calculation. Chained actions use the same published result fields shown to the planner; hidden receipt fields cannot become later inputs.

Conversation state and execution claims use the existing durable token table with ownership, leases, revisions and checksums. Normal Health/Mood Journal creation has an owned deterministic action identity. Known submitted saves recover through exact normal readback; unknown outcomes never trigger an automatic repeat.

Profile and Water refresh after verified assistant changes while preserving other edits. Profile checks prevent older full-form saves from overwriting newer confirmed changes. Completion events use the actual affected date and a stable verified action ID, including recovered results; later read requests do not replay historical saves.

## Repairs established by the combined checks

The checks reproduced and repaired hidden successful saves after a later-step error; selected past dates being mistaken for today; dictated text entering an old chat command; old reviews surviving clarification; lost-response duplication risks; and normal long-note results exceeding conversation capacity after saving. Known journal result space is reserved before review/submission, including Unicode bytes. Oversized requests retain their original text and ask for a smaller request before any save.

Clarification answers use server-owned question state, retain the existing request and require a fresh review before saving. Client-supplied billing exemptions are rejected. Follow-up clarification does not add another Helfi preparation charge.

## Verification and limits

The combined command is `node scripts/check-voice2-offline.cjs`: 35 offline suites. The full normal server production build, root/native type checks, existing required voice checks, TestFlight source preflight, protected-region checks and normal page locks also passed. The server build ran its key guard and complete normal pre-build checks; it loaded its own normal configuration without exposing credential values or invoking an AI feature. Exact command outcomes and final source hashes are recorded in `docs/release-evidence/2026-10-17/voice2-core-checkpoint.json`.

The iPhone and Android Hermes exports compiled with environment-file loading disabled and offline mode enabled. These prove code packaging, not a signed binary, installation or successful phone conversation. The approved Dashboard and Insights dedicated design baselines are unchanged. Normal page-lock snapshots now cover only the authorised functional additions/changes; full/native-only checks cover 299/100 files.

Tests execute actual handlers, runtime, persistence adapter and native callbacks with synthetic authentication, storage, network and planner boundaries. They do not prove a real model's understanding, live provider compatibility, microphone/hearing behavior or production database behavior. Fresh spoken-confirmation boundaries still require actual protocol/device verification; the on-screen review control remains the conservative confirmation path.

Conversation/request limits remain deliberate. Very large combined notes may need splitting; unsupported oversized external receipts remain unverified and cannot be automatically resubmitted. No full-app parity claim is made: the separate 321-operation manual inventory remains unchanged, with zero operations promoted to production-complete. Its full-scope release check continues to refuse; that is not a claim that all 321 operations are needed for the scoped core job.

## Release state

HEAD remains `0fba18f77f743cc8336cca8896998b7013144555`. Prior AWS139/native54 records are historical release evidence. This core candidate has not been released to the owner's phone or either live domain. Real conversation/device verification and a verified release remain to do. No further work-duration estimate is asserted by this checkpoint.
