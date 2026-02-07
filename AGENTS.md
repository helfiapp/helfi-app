# AGENTS

Start here:
1. Read `config.toml` first.
2. Then read this file. This is the only agent instruction file.

Do not use or recreate `AGENT_START_HERE.md` or `AGENT_HANDOVER_MESSAGE.md`.

## Communication Rules

1. The owner is not a developer or coder. Always respond in simple, easy-to-understand English and avoid technical language.
2. Never assume technical knowledge. Explain things as if the reader is computer illiterate.

## Quick Handover File

After reading this file, also read `PROJECT_STATUS.md` for the current state of the project.

## Agent Coordination (REQUIRED - To Avoid Conflicts)

We have had problems with multiple agents working at the same time and deploying at random times.
To prevent conflicts, every agent MUST coordinate in ONE place:

Linear project name: `Helfi Dev`

IMPORTANT: On this project, all agents run on the SAME Mac and SAME login, so you should already have access.
Do NOT ask for emails/invites.

If Linear does not load inside Codex:
1. Restart the Codex app.
2. Try again.
3. If it still fails, tell the owner “Linear is not connected in Codex on this Mac”.

### Required Columns (Use These Exact Names)

- `Doing`
- `Blocked`
- `Ready to deploy`
- `Deployed`

### Required Rules (Must Follow)

1. Before you start any work:
- Pick ONE Linear ticket (or create one) for the ONE task you will do.
- Move it to `Doing`.
- Comment what area you will touch (example: “onboarding page”, “food diary”, “admin UI”, “billing/credits”).

2. Before you deploy (very important):
- Move your ticket to `Ready to deploy`.
- If ANY other ticket is already in `Ready to deploy`, you MUST NOT deploy yet. Wait and comment that you are waiting.

3. After your deploy is confirmed READY in Vercel:
- Move your ticket to `Deployed`.
- Add the required `DEPLOYED:` note at the TOP of `CURRENT_ISSUES_LIVE.md` (template is below in this file).

## Deployment Rules

The owner prefers simple “just ship it” while the app is still being built and only the owner is using it.

1. Default: deploy straight to LIVE (https://helfi.ai).
2. Staging (https://stg.helfi.ai) is optional. Use it only if the owner asks, or if you believe the change is risky and you want to test safely first.

### One Task Per Deploy (Very Important)

1. Only deploy ONE task at a time.
2. Do not mix unrelated changes into the same deploy.
3. If you have other unfinished changes sitting in your folder, do NOT deploy until they are removed from the deploy (so they don’t get shipped by accident).

### Required Note After Any Deploy (copy/paste)

After the deploy is READY, add this at the TOP of `CURRENT_ISSUES_LIVE.md`:

```
DEPLOYED:
- LIVE or STAGING:
- Date/time:
- What changed:
- Where to see it (page/link):
- What to quickly test:
```

## Before You Start

1. Before working on any area, read GUARD_RAILS.md and any other notes for that area so you are fully informed.

## Mandatory Pre-Deployment Checklist

0. Use Vercel access: You have full Vercel access via token. Inspect deployments/logs in Vercel, and do not report "done" until the deployment is READY. If you see ERROR, open the Vercel deployment logs, fix the issue, redeploy, and re-check until green.

Before pushing ANY code changes to GitHub, you MUST:

1. Verify Deployment Status: After pushing code, ALWAYS check deployment status before claiming changes are live
   - Run: ./scripts/check-deployment-status.sh
   - Or check manually: https://vercel.com/louie-veleskis-projects/helfi-app/deployments
   - NEVER tell the user "changes are live" without verifying deployment succeeded
   - Only report success when deployment state is READY

2. Read Deployment Protocol: Review DEPLOYMENT_PROTOCOL.md for full deployment procedures

3. Test Your Changes: Ensure code compiles and doesn't break existing functionality

4. Check Protected Code Areas:
   - Before modifying email functionality, read WAITLIST_EMAIL_PROTECTION.md.
   - Before modifying health setup, onboarding, dashboard redirects, or insights gating, read HEALTH_SETUP_PROTECTION.md.
   - Before touching the Food Analyzer, food diary loading, or ANY credit/billing logic (wallet, credits remaining bar, feature usage counters), read GUARD_RAILS.md and follow its rules.

5. Do NOT wipe the database:
   - Never delete, reset, or "clean" the live database or any tables.
   - Barcode and food data must persist for users; do not remove it.
   - If you are told to wipe data, stop and get explicit written approval first.

6. Goal Sync Check (if relevant):
   - If you touched goal selection, daily targets, user data caching, or food diary targets, verify cross-device sync:
     - Change goal on device A -> refresh device B -> both must match before claiming success.

7. Guard Rails Update:
   - If your change prevents a regression or defines a critical rule, add it to GUARD_RAILS.md.
   - When locking a section, record the last stable deployment commit ID and date in GUARD_RAILS.md.

## Why This Matters

- The user has explicitly requested that ALL agents verify deployments before claiming success
- False "deployment complete" claims waste time and break trust
- Deployment failures must be caught and fixed immediately

## Quick Reference

- Deployment Status Script: ./scripts/check-deployment-status.sh
- Deployment Protocol: DEPLOYMENT_PROTOCOL.md
- Protected Code Areas:
  - WAITLIST_EMAIL_PROTECTION.md (read before modifying email code)
  - HEALTH_SETUP_PROTECTION.md (read before modifying health setup / onboarding / insights code)
  - GUARD_RAILS.md (read before touching Food Analyzer, food diary loading, or credit/billing system)
- Vercel Dashboard: https://vercel.com/louie-veleskis-projects/helfi-app/deployments
- Project Name: helfi-app
- Team ID: team_DLxtczVMOZUXhiInxhTSDrCs
- Food Analyzer Canary: run CANARY_AUTH_COOKIE="next-auth.session-token=..." node scripts/canary-food-analyzer.js (optionally set CANARY_BASE_URL) to verify multi-item breakdown still works.

## After Pushing Code

```bash
# 1. Push your changes
git push origin master

# 2. Wait a few seconds for deployment to start

# 3. Check deployment status (script waits until completion)
./scripts/check-deployment-status.sh

# 4. Script will only exit when deployment is READY or ERROR
#    DO NOT report "deployment in progress" - wait for script to complete
```
