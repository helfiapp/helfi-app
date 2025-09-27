# Helfi Deployment Protocol

This checklist must be followed before running any production deployment for the
Helfi app. The goal is to guarantee we deploy with the correct Vercel account
and project every time and eliminate any chance of publishing to the EPG CRM
environment.

---

## 1. Confirm CLI Identity
- Run `npx vercel whoami`.
- Expected output: `helfiweb@gmail.com`.
- If the output is anything else, stop immediately: run `npx vercel logout` and
  then `npx vercel login` using the Helfi email.

## 2. Verify Project Link
- Ensure `.vercel/project.json` exists in the repo.
- Run `cat .vercel/project.json`.
- Confirm both values:
  - `projectId`: `prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7` (current Helfi project ID).
  - `orgId`: `team_pPRY3znvYPSvqemdfOEf3vAT` (Louie Veleski's projects team).
- If the file is missing or IDs differ, re-link with `npx vercel link` and
  choose **Louie Veleski’s projects → helfi-app**.
- Never run `vercel --prod` while the CLI is prompting to create a new project.

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

