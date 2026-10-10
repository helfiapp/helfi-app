# AGENTS

Start here:
1. Read `config.toml` first.
2. Then read this file. This is the only agent instruction file.

Do not use or recreate `AGENT_START_HERE.md` or `AGENT_HANDOVER_MESSAGE.md`.

## OPENAI API Key Warning (Critical)

- Do not export, copy, print, or use `OPENAI_API_KEY` from any agent script or terminal command.
- The local key is only for the real Helfi app UI/server when testing actual Helfi AI features.
- Do not run direct OpenAI scripts, direct API calls, billing checks, or one-off canaries with the live key.
- If `scripts/assert-no-local-openai-key.js` blocks you, stop. Do not bypass it.
- Never paste the key into chat, Linear, logs, tickets, docs, or screenshots.

## Local Secret Backup (macOS Keychain)

Production secrets must never be stored in repo files. Some values are backed up in macOS Keychain so future agents can restore production settings in the current AWS account without recreating keys. Historical Keychain item names remain unchanged.

Rules:
- Never paste secret values into chat, Linear, docs, screenshots, logs, or commits.
- Never print secret values in terminal output.
- Use Keychain Access or the macOS `security` command only when restoring a value into the real production account UI. Do not recreate the removed Vercel project.
- For OpenAI, keep following the warning above. Do not use the saved key for direct OpenAI scripts or one-off tests.

Known Keychain items:
- `HELFI_OPENAI_API_KEY_VERCEL_PRODUCTION` account `helfi-production`
- `HELFI_ENV_APPLE_IAP_BUNDLE_ID` account `helfi-production`
- `HELFI_ENV_GOOGLE_PLAY_PACKAGE_NAME` account `helfi-production`
- `HELFI_ENV_STRIPE_PRICE_PRACTITIONER_LISTING` account `helfi-production`
- `HELFI_AWS_AGENT_ACCESS_KEY_ID` account `helfi-production`
- `HELFI_AWS_AGENT_SECRET_ACCESS_KEY` account `helfi-production`

## AWS Agent Access

- Future agents do not need the owner to sign in to AWS for normal Helfi hosting work.
- AWS CLI profile: `helfi-agent`
- Default AWS region: `ap-southeast-2` (Sydney)
- Use commands such as: `aws --profile helfi-agent amplify list-apps`
- The profile reads its credentials from macOS Keychain through `/Users/louieveleski/.local/bin/helfi-aws-credentials`.
- Never run that credential helper directly, print its output, or copy its values into repo files, chat, logs, screenshots, Linear, or documentation.
- The IAM identity is `helfi-codex-deployer` with broad deployment access but no AWS console password and no permission to manage IAM users or the AWS account.

## Communication Rules

1. The owner is not a developer or coder. Always respond in simple, easy-to-understand English and avoid technical language.
2. Never assume technical knowledge. Explain things as if the reader is computer illiterate.

### Completion and Release Work (Owner instruction, 10 October 2026)

- Carry authorised Helfi work through repair, meaningful testing, verified deployment and the requested Apple/Google submission. A status report or plan is not a replacement for doing the work.
- Do not use the words "unfinished" or "blocked" in messages to the owner. Report concrete results, the specific remaining action and what you are doing to resolve it. Internal tool/status names may retain their required spelling.
- Do not hide failures, invent test results or claim submission/approval without evidence. State exactly what has been verified.
- Reuse prior authorisation. Do not repeatedly ask for routine sign-in, repairs, builds, uploads or submissions already requested in this conversation. Use the saved account-access procedure below.
- When a method fails, diagnose it and try a supported alternative within the authorised scope. Continue independent work while an exact personal action is pending; do not treat one unavailable step as a reason to stop all release work.
- The owner explicitly authorises additional agents for this Helfi audit/release. Delegate separate tasks when it improves completion. The primary agent owns integration and all deployments; agree file ownership before edits and do not let delegated agents deploy or overwrite shared files independently.
- Ask only when an observed step genuinely needs a human, or an applicable tool policy requires action-time confirmation. Present the concrete prepared result, exact action and reason; avoid generic permission requests. Do not bypass authentication, legal confirmations or browser security protections.
- Apply the actual confirmation mode documented by the current browser tool. The owner’s specific request to repair and submit Helfi authorises accurate routine listing changes, review notes, build uploads and submissions where pre-approval is permitted. Do not invent a fresh approval requirement for every form. Binding terms, new sensitive account access and permanent deletion still require the exact confirmation specified by tool policy.
- Avoid speculative completion dates. Give an estimate only when supported by the actual remaining work or store-provided review information.

## Quick Handover File

After reading this file, also read `PROJECT_STATUS.md` for the current state of the project.

## Computer, Browser, and Email Access

The owner has given agents permission to use the currently open browser, Apple Mail, and browser-based Gmail accounts for Helfi work and testing.

Browser rules:
- Do not open a separate browser app for normal testing.
- Do not open a separate hidden browser, in-app browser, Playwright/browser tool session, Chrome profile, or headless browser for normal Helfi testing.
- Use the browser that is already open on the web app.
- If the already-open browser cannot be controlled, stop and tell the owner instead of opening another browser.
- It is OK to open a new tab in that same browser when needed.
- Agents may use logged-in browser sessions for Helfi, Linear, App Store Connect, Gmail, and related project checks.

### Agent Account Access (Owner instruction, 10 October 2026)

Handle routine Helfi account access yourself. Before asking the owner to sign in, read `/Users/louieveleski/.codex/skills/helfi-account-access/SKILL.md` and verify the actual existing browser session.

- Check already-open Chrome tabs first. Use `browser.user.openTabs()` and claim the exact returned object; `browser.tabs.list()` alone misses owner tabs.
- Helfi user, Helfi admin, Apple and Google Play are separate sessions. A blocked API URL or automation error does not prove the owner is logged out. Recover the supported controls or observe actual responses from normal UI activity; do not bypass browser restrictions.
- For an actually expired Helfi web/native test login, use the private `NATIVE_TEST_EMAIL` / `NATIVE_TEST_PASSWORD` settings through the normal login UI. Do not print environment files or credentials.
- Reuse the admin's remembered session. An initial QR/login view can appear briefly during renewal; wait for renewal before declaring a logout. Keep password/authenticator and account-revocation checks intact.
- Apple: read `/Users/louieveleski/.codex/skills/log-in-helfi-app-store-connect/SKILL.md`. The password for `helfiweb@gmail.com` is saved in **Google Password Manager**. Use normal saved-entry autofill; never reveal/copy/export the password. The in-field LastPass icon is a separate manager.
- Google Play: reuse Global 22 / Helfi and the saved Google login if recovery is genuinely needed. AWS: use `helfi-agent`; Linear: use the existing Helfi Dev connection. Do not ask for invitations or unrelated logins.
- Collect required account diagnostics yourself where supported. Ask only for a specific unavoidable personal step, such as Touch ID or a new device approval, explaining the observed prompt and attempted recovery.
- Preserve sessions and unfinished forms. Never clear cookies, log accounts out, reset credentials/authenticators or weaken authentication to make access easier.

Future agents on this Mac must follow this procedure and re-check live account state instead of repeating old login requests.

Email rules:
- Agents may read/search Apple Mail for project-related emails and status checks.
- Agents may read/search Gmail accounts that are already open in the browser for project-related emails and status checks.
- Never delete, archive, move, mark, reply to, forward, or send emails unless the owner explicitly asks for that exact action.
- Never print passwords, one-time codes, reset links, or secret values from emails. Summarize only the status or relevant non-secret details.

## Native App Test Login

When working on the native phone app, agents must keep the app logged in to the same test account so the owner does not need to log in again after restarts.

Use the local native test account for iPhone and Android native app testing:
- Email/password are stored only on this Mac in `.env.local` as `NATIVE_TEST_EMAIL` and `NATIVE_TEST_PASSWORD`.
- The standard test email is `info@sonicweb.com.au`; use this account for normal web and native user testing.
- Do not commit or copy the password into public docs, app data, tickets, or deploy notes.

Important:
- This is a throwaway test account provided by the owner.
- Do not ask the owner to log in manually unless the login itself is broken.
- After restarting the native app, visually check the simulator/emulator and confirm the app is actually open and logged in before saying it is done.

## Agent Coordination (REQUIRED - To Avoid Conflicts)

We have had problems with multiple agents working at the same time and deploying at random times.
To prevent conflicts, every agent MUST coordinate in ONE place:

Linear project name: `Helfi Dev`
Linear project link: https://linear.app/helfi/project/helfi-dev-565afd449e32

IMPORTANT: On this project, all agents run on the SAME Mac and SAME login, so you should already have access.
Do NOT ask for emails/invites.

If Linear does not load inside Codex:
1. Restart the Codex app.
2. Try again.
3. If it still fails, tell the owner “Linear is not connected in Codex on this Mac”.

### IMPORTANT: No More “Authorize” Drama

1. DO NOT log Linear out.
- Never run commands like `codex mcp logout linear`.
- Do not “reconnect Linear” unless you are truly blocked.

2. If Linear says “Not logged in”:
- Restart Codex.
- Try again.
- If it still says “Not logged in”, YOU must re-login to Linear from Codex (do not ask the owner unless you are fully stuck).

3. If you only see “welcome” tickets:
- You are in the wrong Linear workspace.
- Stop immediately and tell the owner. Do not create a new project.

### Required Columns (Use These Exact Names)

Preferred (ideal) columns:
- `Doing`
- `Blocked`
- `Ready to deploy`
- `Deployed`

If Linear shows the default columns instead (this is OK):
- Use `In Progress` as `Doing`
- Use `Todo` + label `Blocked` as `Blocked`
- Use `Todo` + label `Ready to deploy` as `Ready to deploy`
- Use `Done` as `Deployed`

### Required Rules (Must Follow)

1. Before you start any work:
- Pick ONE Linear ticket (or create one) for the ONE task you will do.
- Move it to `Doing`.
- Comment what area you will touch (example: “onboarding page”, “food diary”, “admin UI”, “billing/credits”).

2. Before you deploy (very important):
- Move your ticket to `Ready to deploy`.
- If ANY other ticket is already in `Ready to deploy`, you MUST NOT deploy yet. Wait and comment that you are waiting.

3. After the exact deployment succeeds in AWS Amplify and both live domains are verified:
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

## Full Page Lock (Must Follow)

The current live web app and current native app are baseline-locked.

Main source of truth:
- Web + native work must happen only in: `/Volumes/U34 Bolt/HELFI APP/helfi-app`
- Do not use worktrees for normal work on this project.
- Do not recreate duplicate app copies, duplicate native folders, or side versions of the app.
- If you discover another app copy or worktree, stop and tell the owner before doing anything else.

This means:
- Do not touch locked pages or shared UI unless the owner explicitly asked for that exact area.
- Work only in the real main folders for the current app.
- Do not create side copies, side folders, or extra versions for normal work.

Required checks:
- Web + shared UI lock check: `npm run check:page-locks`
- Native UI lock check: `npm --prefix native run check:page-locks`

If a locked file changes:
- Build/start will fail.
- Only unlock the exact file(s) the owner approved.
- Use: `ALLOW_LOCKED_FILES=file1,file2`
- After the approved change is finished and verified, refresh the lock snapshot with:
  - `npm run write:page-locks`

Important:
- This lock exists to stop regressions on the current live web app and current native app.
- If the owner did not ask for a page/section to be changed, do not touch it.

## Mandatory Pre-Deployment Checklist

0. Use AWS access: production is Amplify app `d2n4u4zm85ooe`, branch `master`, region `ap-southeast-2`, CLI profile `helfi-agent`. Vercel was removed on 8 September 2026; do not recreate/relink it, request Vercel login, or use old Vercel verification scripts. Inspect only appropriately filtered, secret-safe build diagnostics. Resolve failed deployments before reporting success.

Before pushing ANY code changes to GitHub, you MUST:

1. Verify Deployment Status: after pushing code, identify the AWS Amplify job for the exact pushed commit. Wait for its BUILD, DEPLOY and VERIFY steps to succeed, then confirm `helfi.ai` and `www.helfi.ai` serve the new deployment through CloudFront. Never claim changes are live from Git push alone. Follow DEPLOYMENT_PROTOCOL.md for the current commands.

2. Read Deployment Protocol: Review DEPLOYMENT_PROTOCOL.md for full deployment procedures

3. Test Your Changes: Ensure code compiles and doesn't break existing functionality
   - Food Diary/Favorites/Custom rename flows are locked by `GUARD_RAILS.md`.
   - Do not touch rename code unless owner gives explicit written approval first.
   - Rename canary is optional troubleshooting only (run only when owner requests rename diagnostics):
     - `CANARY_AUTH_COOKIE=\"next-auth.session-token=...\" ./scripts/check-rename-guard.sh`
     - or `CANARY_STORAGE_STATE=\"playwright/.auth/<file>.json\" ./scripts/check-rename-guard.sh`

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

- Deployment verification: AWS Amplify exact-commit job and both live domains
- Deployment Protocol: DEPLOYMENT_PROTOCOL.md (AWS; old Vercel scripts are obsolete)
- Protected Code Areas:
  - WAITLIST_EMAIL_PROTECTION.md (read before modifying email code)
  - HEALTH_SETUP_PROTECTION.md (read before modifying health setup / onboarding / insights code)
  - GUARD_RAILS.md (read before touching Food Analyzer, food diary loading, or credit/billing system)
- AWS Amplify app: `d2n4u4zm85ooe`, `master`, Sydney; use profile `helfi-agent`
- Project Name: helfi-app
- Team ID: team_DLxtczVMOZUXhiInxhTSDrCs
- Food Analyzer Canary: run CANARY_AUTH_COOKIE="next-auth.session-token=..." node scripts/canary-food-analyzer.js (optionally set CANARY_BASE_URL) to verify multi-item breakdown still works.
- Food Rename Guard Canary (optional troubleshooting only): run `CANARY_AUTH_COOKIE=\"next-auth.session-token=...\" ./scripts/check-rename-guard.sh` (or set `CANARY_STORAGE_STATE=playwright/.auth/<file>.json`).

## After Pushing Code

```bash
# 1. Push your changes
git push origin master

# 2. Find the job for the exact pushed commit
aws --profile helfi-agent --region ap-southeast-2 amplify list-jobs --app-id d2n4u4zm85ooe --branch-name master --max-results 5 --query 'jobSummaries[].{id:jobId,commit:commitId,status:status}'

# 3. Inspect that job until all steps succeed (replace JOB_ID)
aws --profile helfi-agent --region ap-southeast-2 amplify get-job --app-id d2n4u4zm85ooe --branch-name master --job-id JOB_ID --query 'job.{summary:summary.{id:jobId,commit:commitId,status:status},steps:steps[].{name:stepName,status:status}}'

# 4. Verify both live domains as described in DEPLOYMENT_PROTOCOL.md.
```
