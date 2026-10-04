# Project Status (Read This First)

This file is for quick handover. A new agent should be able to read this and
start helping without the owner needing to copy/paste lots of background.

Last updated: Oct 5, 2026

## Critical OpenAI Key Warning
- Do not export, copy, print, or use `OPENAI_API_KEY` from agent scripts or terminal commands.
- The local key is only for the actual Helfi app UI/server during owner-approved AI feature testing.
- If the local OpenAI key blocker fires, stop and do not bypass it.

## Current Release Repair Work
- The full 1 October food/Apple audit repair goal is active under HEL-440.
- Latest verified live source: `a390b19b5b60aab3b9bc7a696cba48235fed53a6`, AWS job50; all steps succeeded and both live domains loaded on Oct5.
- Six nutrient cards are restored in tested result screens; multiple serving/unit errors, missing-versus-zero values and native recipe zero-calorie imports are repaired. Actual iPhone/iPad/web recipe save/reopen and portions agree. The remaining portion paths still require validation.
- Updated native Release simulator apps are signed in; these are not new signed store uploads. Store submissions are not complete.
- Remaining work and evidence: `docs/RELEASE_REPAIR_PROGRESS_2026-10-04.json`. API liquid mapper and ordinary web Add Ingredient portions repaired. Live website100g milk61 saved/reopened on phone with all six cards, daily809/wallet619; olive oil15ml122/15g133. Shared density identity repaired in49; live mayonnaise100g361/g-only and diluted juice100g47/sugarunknown passed. Juice saved/reopened web and rebuilt phone with sixcards and unknownSugar preserved; bothdaily856/wallet619. Saved web conversion repair50 live; recorded239g juice cup,50g24 save/reopen and iPhone sixcards/daily833/wallet619 passed. Actual zero-weight test exposes imported serving-mode validation gap; follow-up51 source repaired and actual handler/input/save gates pass; full build/deployment/runtime verification remains before completing this matrix. Native Add Ingredient still selects100ml for original100g juice after serving-options override; separate next repair. Invalid amount save is blocked but its warning needs placement inside the window. Ordinary web missing-optional save/reopen now passes via diluted juice. Review hard-coded preferred liquid results labelled USDA separately. FatSecret live supplier/region checks, restaurant custom serving-basis review, recipe-import wallet refresh, current AU labels/known-weight photos, model comparison and final signed device/store checks remain.
- Five owner information/approval questions remain unanswered: the three live credit API responses (required by GUARD_RAILS2082), plus Android SDK/ARM licenses, Apple HealthKit/Push profile access, Helfi admin login, and deleting/replacing incorrect iPad listing screenshots. Do not assume approval or repeat the same questions.

## What Helfi Is Right Now
- The main product is a website (web app).
- There is also a phone app codebase started in `native/` (React Native), but it is not published to the App Store or Google Play yet.

## Where Things Live
- Live site: `https://helfi.ai`
- Staging (test site): `https://stg.helfi.ai`
- Production hosting: AWS Amplify app `d2n4u4zm85ooe` in Sydney (`ap-southeast-2`)
- The old Vercel `helfi-app` project was permanently removed on Sep 8, 2026. Do not recreate or relink it.
- After a push, verify the newest AWS Amplify job succeeds and confirm both `helfi.ai` and `www.helfi.ai` load through AWS CloudFront.

## Agent Coordination (Required)

We coordinate work in one shared Linear project named: `Helfi Dev`.

Important: All agents run on the SAME Mac and SAME login, so agents should already have access to Linear in Codex.

Linear project link: https://linear.app/helfi/project/helfi-dev-565afd449e32

Rules:
1. Every agent must claim ONE ticket and move it to `Doing` before starting.
2. Only ONE ticket can be `Ready to deploy` at a time. If someone else is already `Ready to deploy`, wait.
3. After a deploy is confirmed successful in AWS Amplify, the agent must move the ticket to `Deployed` and write the `DEPLOYED:` note at the top of `CURRENT_ISSUES_LIVE.md`.

Note: Linear may show default columns like `Todo / In Progress / Done`. That is fine:
- `In Progress` = `Doing`
- `Todo` + label `Blocked` = `Blocked`
- `Todo` + label `Ready to deploy` = `Ready to deploy`
- `Done` = `Deployed`

Important: Agents must NOT log Linear out. Logging out causes “Authorize” problems.

## Deployment Rule (Live-First During Development)
The owner is the only current user, and prefers simple “ship it” workflows.

Rules:
1. Default: deploy straight to LIVE (https://helfi.ai).
2. Staging (https://stg.helfi.ai) is optional. Use it only if the owner asks, or if the change is risky.
3. One task per deploy (do not bundle unrelated changes).
4. After every deploy, verify AWS Amplify succeeded and both live domains load through AWS CloudFront, then write a short `DEPLOYED` note at the TOP of `CURRENT_ISSUES_LIVE.md`.

If/when real users are on the site, switch to staging-first to avoid breaking things for users.

## Native App (Phone App)
- Location: `native/`
- Approach: one shared codebase for iPhone + Android (React Native).
- Not published yet.
- Source of truth: the only valid native app folder is `native/` inside `/Volumes/U34 Bolt/HELFI APP/helfi-app`
- Do not use separate worktrees or duplicate app copies as alternate native sources.

## Protected Areas (Do Not Change Without Explicit Owner Approval)
Before changing sensitive areas, read:
- `GUARD_RAILS.md`
- `WAITLIST_EMAIL_PROTECTION.md`
- `HEALTH_SETUP_PROTECTION.md`
