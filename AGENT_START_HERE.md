# 🤖 AGENT START HERE

**⚠️ CRITICAL: Read this file FIRST before making any changes**

## Mandatory Pre-Deployment Checklist

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

