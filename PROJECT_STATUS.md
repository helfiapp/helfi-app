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

## Deployment Rule (Option 1: Fast Staging Deploys)
The owner decided “one gatekeeper” was too slow.

New rule:
1. Any agent may deploy to staging (https://stg.helfi.ai).
2. Live (https://helfi.ai) is stricter: only deploy live if the owner clearly says “deploy live”.
3. Every staging deploy must be ONE task at a time (do not bundle unrelated changes).
4. After any deploy, the agent must verify Vercel is READY, then write a short `DEPLOYED` note at the TOP of `CURRENT_ISSUES_LIVE.md`.

Why the “one task per deploy” rule matters:
- If staging has 10 changes and the owner only wants 2 of them live, the only safe way is if those changes were kept separate.
- If changes are bundled together, you cannot reliably send only “part of it” to live without breaking things.

## Native App (Phone App)
- Location: `native/`
- Status: basic navigation and starter screens exist (Welcome + tabs).
- Not published yet.

## Apple Login Status (Web)
- Apple login support was added to the web login page.
- On staging it shows an Apple button, but it stays disabled until Apple setup is completed in the Apple Developer account (the required Apple keys and website settings).

## Important Warning (If Another Agent Pushes To Live)
If an agent deploys live without you asking, it can accidentally ship unfinished work publicly.

What you do:
1. Tell that agent: “Stop deploying live.”
2. Ask them to leave a note in `CURRENT_ISSUES_LIVE.md` explaining what they shipped.
3. Use the Vercel deployments page to confirm exactly what changed.

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
