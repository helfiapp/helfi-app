# Helfi Deployment Protocol

Production is AWS Amplify app `d2n4u4zm85ooe`, branch `master`, in Sydney (`ap-southeast-2`). The Vercel project was removed on 8 September 2026. Do not recreate it, request Vercel credentials or use the old Vercel deployment/status scripts.

## Complete one authorised task at a time

Use only `/Volumes/U34 Bolt/HELFI APP/helfi-app`. Follow AGENTS.md, GUARD_RAILS.md and the notes for the changed area. Claim one Helfi Dev Linear issue and describe the exact scope. The primary agent coordinates deployments when agents work in parallel. Do not deploy another agent's pending work or use blanket `git add -A`.

The owner has authorised the current audit repairs, app checks and Apple/Google submissions. Use that authorisation for routine work; do not ask again for normal account access, builds or already-requested submissions. Report concrete verified results. Preserve data, credentials, authentication and applicable personal/action-time confirmation requirements.

## Before pushing

1. Review the exact diff and exclude unrelated changes. Preserve other agents' work.
2. Run meaningful checks for the change and the required production build.
3. Run `npm run check:page-locks` and `npm --prefix native run check:page-locks`. Only refresh the exact owner-approved file snapshots after verification.
4. Retain protected food rename behaviour, credit enforcement, AI consent and account isolation. Never wipe or reset live data. Read the relevant protection notes first.
5. Move the scoped Linear issue to Ready to deploy (or Todo with the matching label). If another issue is already there, coordinate with its owner rather than deploying concurrently.
6. Stage only reviewed files, commit that one task and push `origin master`. A successful push is not evidence that the site changed.

## Verify the exact AWS job

AWS access is already configured through profile `helfi-agent`. Its Keychain credential helper must never be run directly or printed. Do not request console login for ordinary hosting work.

Find the job for the exact pushed commit:

```bash
aws --profile helfi-agent --region ap-southeast-2 amplify list-jobs --app-id d2n4u4zm85ooe --branch-name master --max-results 5 --query 'jobSummaries[].{id:jobId,commit:commitId,status:status}'
```

Inspect the matching job, replacing `JOB_ID` with its actual identifier:

```bash
aws --profile helfi-agent --region ap-southeast-2 amplify get-job --app-id d2n4u4zm85ooe --branch-name master --job-id JOB_ID --query 'job.{summary:summary.{id:jobId,commit:commitId,status:status},steps:steps[].{name:stepName,status:status}}'
```

Wait for BUILD, DEPLOY and VERIFY to succeed. If a step fails, inspect secret-safe diagnostics, fix the cause, redeploy the same task and verify again. Do not print raw secret-bearing environment values, signed log URLs, provider URLs containing keys, or unfiltered server logs. Keep progress updates useful while checks run.

## Verify production behaviour

- Confirm both `https://helfi.ai` and `https://www.helfi.ai` load successfully through CloudFront after the exact job succeeds. Compare deployment identity/cache evidence with the previous version where relevant.
- Test the changed behaviour through the existing authorised browser/native account. Use the saved account-access skill rather than requesting fresh logins.
- Check cross-device goals/targets if those paths changed. Validate save/reopen and unknown-versus-zero nutrients for food changes where relevant.
- Move the scoped issue to Deployed/Done only for work actually verified. Keep the overall store objective distinct from individual deployed fixes.
- Add this note at the top of CURRENT_ISSUES_LIVE.md:

```text
DEPLOYED:
- LIVE or STAGING:
- Date/time:
- What changed:
- Where to see it (page/link):
- What to quickly test:
```

## Store submissions

Apple and Google uploads are separate from the website deployment. Verify the exact source, signed binary, package/bundle identity, release checks, account/team, listing assets and metadata before submission. Record the actual upload/processing/submission status. Do not describe a simulator build as a signed store upload or a submission as store approval.

Use the existing Global 22 store sessions and saved logins. Delegate separate preparation tasks when useful, with one integration owner. Ask the owner only for a specific observed personal step or required action-time confirmation, after preparing a concrete reviewable action.

## Protected rename checks

Food Diary/Favorites/Custom rename paths remain protected. Do not change them without the owner's explicit request for that behaviour. Rename diagnostics are optional and run only when the owner requests them; do not perform them routinely or export browser authentication values.
