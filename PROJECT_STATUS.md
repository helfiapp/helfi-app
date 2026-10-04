# Project Status (Read This First)

This file is for quick handover. A new agent should be able to read this and
start helping without the owner needing to copy/paste lots of background.

Last updated: Oct 5, 2026

## Critical OpenAI Key Warning
- Do not export, copy, print, or use `OPENAI_API_KEY` from agent scripts or terminal commands.
- The local key is only for the actual Helfi app UI/server during owner-approved AI feature testing.
- If the local OpenAI key blocker fires, stop and do not bypass it.

## Current Release Repair Work
- Task55 source/build/data checkpoint: original Foundation calorie IDs2047/2048 recovered by actual CSV importer; deterministic1008/2047/2048 priority avoids taking the largest alternative method. Actual importer fixtures/original archive, full production build, protected regions and root/native locks pass. Reviewed dry run and atomic public-library repair applied230 exact archive-backed missing-calorie values; all6250 Foundation records/IDs/other values and all customer tables preserved. Original backup SHA30db8f0701d21d47a3df89709892a42137ca5c5046471b7f2d0e94d8681c2901. Source deployment and fresh actual web/native validation pending.5874 no-original-energy rows and11 macro mismatches preserved; negative original carbs and apple sugar precision require separate review. Whole audit/model/store goal active.
- Task54 source/build checkpoint: strict whole-food milk identity now applies before result limits and across local, custom, supplier and USDA fallback paths. Real-name aliases support skim/nonfat, full cream/whole and soy milk/Soymilk; exact fat percentages do not match different percentages. Complete same-name Legacy records survive incomplete Foundation peers. Full endpoint fixtures, liquid/recipe checks, protected regions, root/native page locks, root TypeScript and full production build pass. No UI/native or billing changes. AWS54 all steps SUCCEED; both domains200/CloudFront/new matchingetaguyx92802a61z15. Actual oatmilk search no longer returns cereal; USDA2257046 web100g48/50g24 and100g save/reopen web+restarted logged-in iPhone allsixcards PASS, bothdaily1004/wallet619. Native new-add fat2.8 differs from saved/web2.7 and needs source-detail tracing; alias live matrix remains pending. Next55 original Foundation energy mapping claimed: original archive2047=48.3298 but exact Energy-only importer skips it. No repair applied yet.
- The full 1 October food/Apple audit repair goal is active under HEL-440.
- Latest verified live source: `82bff8278b833a7c49fbb465fdd9965562219963`, AWS job54; all steps succeeded and both live domains loaded on Oct5.
- Six nutrient cards are restored in tested result screens; multiple serving/unit errors, missing-versus-zero values and native recipe zero-calorie imports are repaired. Actual iPhone/iPad/web recipe save/reopen and portions agree. The remaining portion paths still require validation.
- The iPhone Release39 simulator is rebuilt from52 and signed in; iPad needs this latest source rebuild. These are not new signed store uploads. Store submissions are not complete.
- Remaining work and evidence: `docs/RELEASE_REPAIR_PROGRESS_2026-10-04.json`. API liquid mapper and ordinary web Add Ingredient portions repaired. Live website100g milk61 saved/reopened on phone with all six cards, daily809/wallet619; olive oil15ml122/15g133. Shared density identity repaired in49; live mayonnaise100g361/g-only and diluted juice100g47/sugarunknown passed. Juice saved/reopened web and rebuilt phone with sixcards and unknownSugar preserved; bothdaily856/wallet619. Saved web conversion repair50 live; recorded239g juice cup,50g24 save/reopen and iPhone sixcards/daily833/wallet619 passed. Imported serving-mode validation repaired51 and verified live: zero/empty Enter blocks save with visible warning; milk100g61↔97.087ml61/100ml63 and oil15ml122↔13.8g122/15g133 pass. Valid milk100ml63/oil15g133 save/reopen website+iPhone with sixcards, bothdaily846/wallet619. Native serving override repaired52 and verified live with rebuilt logged-in iPhone: original juice now opens recorded239g cup112, compatible g/oz only;100g47 saves/reopens web+iPhone with sixcards and unknownSugar, bothdaily893/wallet619. Provider choices100g/cup239g/fl oz29.9g preserved; zero Add blocked. Remaining display follow-ups: caption still shows original basis rather than eaten quantity, invalid native preview says1serving, and native >=10g rounding differs from web. Invalid amount save is blocked but its warning needs placement inside the window. Ordinary web missing-optional save/reopen now passes via diluted juice. Review hard-coded preferred liquid results labelled USDA separately. FatSecret live supplier/region checks, restaurant custom serving-basis review, recipe-import wallet refresh, current AU labels/known-weight photos, model comparison and final signed device/store checks remain.
- Earlier source task53: removed synthetic preferred USDA common-drink rows and retained actual library/provider records. Complete real endpoint fixtures cover13 common/variant queries, original IDs/options, source order, precision and missing/zero; full build/typecheck and locks pass. Live baseline confirms shortcut whole milk61kcal/100ml versus actual library63. AWS53 verified all steps and both domains. Actual milk100ml63/100g61 save/reopen web+iPhone with sixcards and USDA171265 source proof passes; bothdaily956/wallet619. Coffee/orangejuice/oil/chocolatealmond lookups retain actualrecords/measurementbases. Oat milk runtime exposes a remaining identity bug (babyfood oatmeal with whole milk); task54 claimed to enforce whole-food milk identity and real-name aliases across all source/fallback paths. Actual oatmilk Foundation records have caloriesnull; separate original-source energy-ID/import review remains pending. Soymilk real records exist and need query alias support. Broader signed-release matrix remains pending. Alias/fat-percentage searches and full signed-release matrix still need validation.
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
