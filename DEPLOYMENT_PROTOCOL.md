# Helfi Deployment Protocol

This checklist must be followed before running any production deployment for the
Helfi app. The goal is to guarantee we deploy with the correct Vercel account
and project every time and eliminate any chance of publishing to the EPG CRM
environment.

---

> **Zero tolerance warning**
>
> Helfi and EPG-CRM must remain completely isolated. Under no circumstances may
> anyone create, link, or deploy an `epg-crm` project from this machine or this
> repository. If the Vercel CLI ever prompts you to create a new project or
> links to anything other than the Helfi IDs listed below, stop immediately,
> log out, and fix the link. Document any incident in CURRENT_ISSUES_LIVE.md.

## Fast Path: GitHub Push Auto‑Deploy (Preferred)
- Production deploys are triggered automatically by pushing to the `master` branch on GitHub.
- Do NOT ask the user for Vercel auth or tokens to deploy. Use Git instead.
- Steps:
  1. Commit your changes locally.
  2. Push to `origin master`.
  3. **MANDATORY**: Check deployment status using Vercel API before claiming changes are live.
  4. **NEVER** tell the user "changes are live" or "deployment complete" without verifying the deployment succeeded.
  5. If deployment fails, fix the issue and redeploy before reporting success.

### If you are a GPT-5 Codex agent (required quick path)
- **Always** use the Git push flow above (`git add -A && git commit ... && git push origin master`). This is the only supported production trigger.
- Do **not** attempt to deploy with `npx vercel` unless the Git pipeline is broken and you have explicit approval.
- Do **not** request or regenerate Vercel tokens; they are not needed for the Git-based deploy.
- The Vercel dashboard should show the new deployment immediately after the push; wait for `READY` before reporting success.
- If CLI auth prompts appear, stop and fall back to Git push (no CLI deploy).

### ⚠️ CRITICAL: Deployment Status Verification

**ALL AGENTS MUST VERIFY DEPLOYMENT STATUS BEFORE CLAIMING SUCCESS**

After pushing to GitHub, you MUST check the deployment status using the Vercel API:

1. **Get the latest deployment**:
   ```bash
   # Using Vercel API (requires VERCEL_TOKEN from STRIPE_PRODUCTS_DOCUMENTATION.md)
   curl -H "Authorization: Bearer $VERCEL_TOKEN" \
     "https://api.vercel.com/v6/deployments?projectId=prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7&limit=1"
   ```

2. **Check deployment state**:
   - `state: "READY"` = ✅ Success - deployment is live
   - `state: "BUILDING"` = ⏳ Still building - wait and check again
   - `state: "ERROR"` = ❌ Failed - check build logs and fix issues
   - `state: "QUEUED"` = ⏳ Waiting - check again shortly

3. **If deployment failed**:
   - Check the build logs in the API response or Vercel dashboard
   - Fix any errors (missing files, syntax errors, etc.)
   - Commit fixes and push again
   - Verify the new deployment succeeds before reporting to user

4. **Only report success when**:
   - Deployment state is `"READY"`
   - Build completed without errors
   - You have verified the deployment URL is accessible

**Verification Methods**:

1. **Using the helper script** (recommended - WAITS until deployment completes):
   ```bash
   ./scripts/check-deployment-status.sh
   ```
   **IMPORTANT**: This script will wait until deployment is READY or ERROR. Do NOT report "deployment in progress" - wait for completion.

2. **Using Vercel API** (if script doesn't work, try API directly):
   ```bash
   VERCEL_TOKEN="2MLfXoXXv8hIaHIE7lQcdQ39"
   curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
     "https://api.vercel.com/v6/deployments?project=helfi-app&teamId=team_DLxtczVMOZUXhiInxhTSDrCs&limit=1"
   ```

3. **Manual check** (fallback if API doesn't work):
   - Visit: https://vercel.com/louie-veleskis-projects/helfi-app/deployments
   - Check the latest deployment status
   - Only report success if status shows "Ready" (green checkmark)
   - If status shows "Error" (red X), check build logs, fix issues, and redeploy

Example commands:
```bash
git add -A
git commit -m "Deploy: <short summary>"
git push origin master
```

If you only changed documentation or configuration, this same flow applies.

## 1. Confirm CLI Identity
- Run `npx vercel whoami`.
- Expected output: `helfiweb@gmail.com`.
- If the output is anything else, stop immediately: run `npx vercel logout` and
  then `npx vercel login` using the Helfi email.

## 2. Verify Project Link (No EPG-CRM Allowed)
- Ensure `.vercel/project.json` exists in the repo.
- Run `cat .vercel/project.json`.
- Confirm both values:
  - `projectId`: `prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7` (current Helfi project ID).
  - `orgId`: `team_pPRY3znvYPSvqemdfOEf3vAT` (Louie Veleski's projects team).
- If the file is missing or IDs differ, re-link with `npx vercel link` and
  choose **Louie Veleski’s projects → helfi-app**.
- If the CLI shows a different project/org ID, or offers to create a new
  project (especially anything labelled `epg-crm`), choose **Cancel**, run
  `npx vercel logout`, and re-authenticate with the Helfi account.
- Never run `vercel --prod` while the CLI is prompting to create a new project.

## CLI Deploy (Fallback Only)
- Use the Vercel CLI only if you specifically need to test a build from this machine and GitHub push is not an option.
- If the CLI shows `Error: Could not retrieve Project Settings`:
  - Prefer the GitHub push auto‑deploy path above.
  - If you must use CLI, re‑link safely: `npx vercel link` → choose Louie Veleski’s projects → helfi-app. Verify IDs match below before running `npx vercel --prod`.
  - Never create a new project or link anything labelled `epg-crm`.

## 3. (Optional) Quick Link Sanity Check
- `npx vercel link --confirm`
- This command restates the existing link. If it errors, resolve the link
  before deploying.

## 4. Deployment Command
- After passing the checks above, run `npx vercel --prod` from the repo root.
- Watch the CLI output. The deployment URL must follow the pattern
  `helfi-*.vercel.app` under `louie-veleskis-projects`.

## 5. Post-Deploy Verification
- Visit the live Helfi domain and smoke-test the area you changed.
- Update CURRENT_ISSUES_LIVE.md, AGENT_TRACKING_SYSTEM.md, and the
  EXIT_VERIFICATION_CHECKLIST.md as required by the broader protocol.

---

### Keep Environments Isolated
- Do not log into the EPG CRM Vercel account from this OS user profile. Use a
  separate OS account, VM, or container if you must work on both projects.
- Never delete `.vercel/project.json` from this repository.
- If you clone the repo onto a new machine, run through steps 1–2 before the
  first deployment.
- If you ever discover an `epg-crm` project in this account or repo, delete the
  link immediately, notify the team, and append a note to the deployment log so
  future agents understand the remediation steps.

---

### Quick Shell Script (optional)
You can add the following helper script locally (not checked in) to automate
the pre-flight check:

```bash
#!/usr/bin/env bash
npx vercel whoami | grep -q 'helfiweb@gmail.com' || {
  echo '✖ Wrong Vercel account. Run `npx vercel logout` and log in again.'
  exit 1
}

grep -q 'prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7' .vercel/project.json || {
  echo '✖ .vercel/project.json does not point to the Helfi project.'
  exit 1
}

echo '✅ Ready to deploy'
```

Run it before `npx vercel --prod` to enforce the checks automatically.
