# Project Status (Read This First)

This file is for quick handover. A new agent should be able to read this and
start helping without you needing to copy/paste lots of background.

Last updated: Feb 6, 2026 (AEDT)

## What Helfi Is Right Now
- The main product is a website (web app).
- There is also a new phone app codebase started in `native/` (React Native), but it is not published to the App Store or Google Play yet.

## Important Decisions Already Made
- Phone app approach: one shared codebase for iPhone + Android (React Native).
- App store internal ID: `ai.helfi.app`
- Login options at launch: email + password, Google, and Apple.

## Where Things Live
- Staging (test site): `https://stg.helfi.ai`
- Live site: `https://helfi.ai`
- Vercel deployments page: `https://vercel.com/louie-veleskis-projects/helfi-app/deployments`
- Deployment status script (must be used after pushes): `./scripts/check-deployment-status.sh`

## Deployment Rule (Stops “Spaghetti”)
- Only one agent is allowed to deploy.
- Other agents must not deploy.
- Non-deploying agents must leave handover notes (see below) and stop.

## Handover Notes (For Any Agent Who Is Not Deploying)
Write a short note into `CURRENT_ISSUES_LIVE.md`:
1. What you changed (simple English).
2. Which pages/features it affects.
3. What needs testing.
4. If you pushed code, include where (branch name or PR link).

Then stop. Do not deploy.

## Native App (Phone App)
- Location: `native/`
- Status: basic navigation and starter screens exist (Welcome + tabs).
- Not published yet.

## Apple Login Status (Web)
- Apple login support was added to the web login page.
- On staging it shows an Apple button, but it stays disabled until Apple setup is completed in the Apple Developer account (the required Apple keys and website settings).

## Protected Areas (Do Not Change Without Explicit Owner Approval)
Before changing sensitive areas, read:
- `GUARD_RAILS.md`
- `WAITLIST_EMAIL_PROTECTION.md`
- `HEALTH_SETUP_PROTECTION.md`

## Quick “If You Are Taking Over” Checklist
1. Read `config.toml`
2. Read `AGENTS.md`
3. Read this file (`PROJECT_STATUS.md`)
4. Read `GUARD_RAILS.md` before touching Food, onboarding, insights, billing, or notifications.
5. Check current problems in `CURRENT_ISSUES_LIVE.md`

