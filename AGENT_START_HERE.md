# 🤖 AGENT START HERE

**⚠️ CRITICAL: Read this file FIRST before making any changes**

## Mandatory Pre-Deployment Checklist

0. ✅ **Use Vercel access**: You have full Vercel access via token. Inspect deployments/logs in Vercel, and do not report “done” until the deployment is `READY`. If you see `ERROR`, open the Vercel deployment logs, fix the issue, redeploy, and re-check until green.

Before pushing ANY code changes to GitHub, you MUST:

1. ✅ **Verify Deployment Status**: After pushing code, ALWAYS check deployment status before claiming changes are live
   - Run: `./scripts/check-deployment-status.sh`
   - Or check manually: https://vercel.com/louie-veleskis-projects/helfi-app/deployments
   - **NEVER** tell the user "changes are live" without verifying deployment succeeded
   - Only report success when deployment state is `READY`

2. ✅ **Read Deployment Protocol**: Review `DEPLOYMENT_PROTOCOL.md` for full deployment procedures

3. ✅ **Test Your Changes**: Ensure code compiles and doesn't break existing functionality

4. ✅ **Check Protected Code Areas**:  
   - Before modifying email functionality, read `WAITLIST_EMAIL_PROTECTION.md`.  
   - Before modifying health setup, onboarding, dashboard redirects, or insights gating, read `HEALTH_SETUP_PROTECTION.md`.  
   - Before touching the Food Analyzer, food diary loading, or ANY credit/billing logic (wallet, credits remaining bar, feature usage counters), read `GUARD_RAILS.md` and follow its rules.
5. ✅ **Do NOT wipe the database**:
   - Never delete, reset, or “clean” the live database or any tables.
   - Barcode and food data must persist for users; do not remove it.
   - If you are told to wipe data, stop and get explicit written approval first.
6. ✅ **Goal Sync Check (if relevant)**:
   - If you touched goal selection, daily targets, user data caching, or food diary targets, verify cross-device sync:
     - Change goal on device A → refresh device B → both must match before claiming success.
6. ✅ **Guard Rails Update**:
   - If your change prevents a regression or defines a critical rule, add it to `GUARD_RAILS.md`.
   - When locking a section, record the last stable deployment commit ID and date in `GUARD_RAILS.md`.

## Why This Matters

- The user has explicitly requested that ALL agents verify deployments before claiming success
- False "deployment complete" claims waste time and break trust
- Deployment failures must be caught and fixed immediately

## Quick Reference

- **Deployment Status Script**: `./scripts/check-deployment-status.sh`
- **Deployment Protocol**: `DEPLOYMENT_PROTOCOL.md`
- **Protected Code Areas**:
  - `WAITLIST_EMAIL_PROTECTION.md` (⚠️ Read before modifying email code)
  - `HEALTH_SETUP_PROTECTION.md` (⚠️ Read before modifying health setup / onboarding / insights code)
  - `GUARD_RAILS.md` (⚠️ Read before touching Food Analyzer, food diary loading, or credit/billing system)
- **Vercel Dashboard**: https://vercel.com/louie-veleskis-projects/helfi-app/deployments
- **Project Name**: `helfi-app`
- **Team ID**: `team_DLxtczVMOZUXhiInxhTSDrCs`
- **Food Analyzer Canary**: run `CANARY_AUTH_COOKIE="next-auth.session-token=..." node scripts/canary-food-analyzer.js` (optionally set `CANARY_BASE_URL`) to verify multi-item breakdown still works.

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

---

**Remember**: The user is counting on you to verify deployments. Don't skip this step.
