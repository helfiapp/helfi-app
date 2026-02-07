# Project Status (Read This First)

This file is for quick handover. A new agent should be able to read this and
start helping without the owner needing to copy/paste lots of background.

Last updated: Feb 7, 2026

## What Helfi Is Right Now
- The main product is a website (web app).
- There is also a phone app codebase started in `native/` (React Native), but it is not published to the App Store or Google Play yet.

## Where Things Live
- Live site: `https://helfi.ai`
- Staging (test site): `https://stg.helfi.ai`
- Vercel deployments page: `https://vercel.com/louie-veleskis-projects/helfi-app/deployments`
- Deployment status script (must be used after pushes): `./scripts/check-deployment-status.sh`

## Agent Coordination (Required)

We coordinate work in one shared Linear project named: `Helfi Dev`.

Important: All agents run on the SAME Mac and SAME login, so agents should already have access to Linear in Codex.

Linear project link: https://linear.app/helfi/project/helfi-dev-565afd449e32

Rules:
1. Every agent must claim ONE ticket and move it to `Doing` before starting.
2. Only ONE ticket can be `Ready to deploy` at a time. If someone else is already `Ready to deploy`, wait.
3. After a deploy is confirmed READY in Vercel, the agent must move the ticket to `Deployed` and write the `DEPLOYED:` note at the top of `CURRENT_ISSUES_LIVE.md`.

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
4. After every deploy, verify Vercel is READY, then write a short `DEPLOYED` note at the TOP of `CURRENT_ISSUES_LIVE.md`.

If/when real users are on the site, switch to staging-first to avoid breaking things for users.

## Native App (Phone App)
- Location: `native/`
- Approach: one shared codebase for iPhone + Android (React Native).
- Not published yet.

## Protected Areas (Do Not Change Without Explicit Owner Approval)
Before changing sensitive areas, read:
- `GUARD_RAILS.md`
- `WAITLIST_EMAIL_PROTECTION.md`
- `HEALTH_SETUP_PROTECTION.md`
