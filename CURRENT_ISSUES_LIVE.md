# 🚨 CURRENT LIVE ISSUES - HELFI.AI

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 19:05 AEDT
- What changed: Deployed HEL-7 so the “Link your Apple login” pop-up shows reliably on onboarding (and doesn’t silently fail right after login).
- Where to see it (page/link): https://helfi.ai/onboarding
- What to quickly test: Log in, go to onboarding: confirm the pop-up appears. Click “Link Apple login” and confirm it starts the Apple link flow. Click “Skip/Not now” and confirm it closes.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 18:36 AEDT
- What changed: Deployed the fix for HEL-5 so Health Setup does NOT run “Updating insights…” in the background unless the user actually changed something (QA PASS).
- Where to see it (page/link): https://helfi.ai/onboarding
- What to quickly test: Log out, log back in, do not click anything: the “Updating insights…” message should NOT appear. Then change one field and confirm it DOES appear.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 16:12 AEDT
- What changed: Added “no more authorize drama” rules: project link, do NOT log Linear out, and what to do if the wrong Linear workspace shows up.
- Where to see it (page/link): Repo docs: `AGENTS.md` + `PROJECT_STATUS.md`
- What to quickly test: New agents should NOT run any Linear logout/reconnect. They should open the “Helfi Dev” project link and see the same tickets (HEL-5, HEL-6, etc).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 16:01 AEDT
- What changed: Linear coordination now supports the default Linear columns (Todo / In Progress / Done) using labels for Blocked + Ready to deploy, so agents stop getting stuck on “wrong column names”.
- Where to see it (page/link): Repo docs: `AGENTS.md` + `PROJECT_STATUS.md`. Linear labels: `Blocked`, `Ready to deploy`.
- What to quickly test: In Linear “Helfi Dev”, set an issue to `In Progress` for active work. When ready for QA, move it to `Todo` and add label `Ready to deploy`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 14:30 AEDT
- What changed: Added a Playwright “save logged-in session” script so the testing agent can stay logged in and stop asking for logins repeatedly. Improved it to confirm a real logged-in session (not just “page loaded”).
- Where to see it (page/link): Repo file: `scripts/save-playwright-auth.mjs`
- What to quickly test: Run `node scripts/save-playwright-auth.mjs --mode credentials` (or `--mode google`) and confirm it creates a file under `playwright/.auth/` (this folder is ignored by git).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07
- What changed: Added REQUIRED agent coordination rules (use Linear project "Helfi Dev" to avoid conflicts; only one "Ready to deploy" at a time). Clarified that on this setup all agents share the same Mac/login so they should not ask for emails/invites.
- Where to see it (page/link): Repo docs: `AGENTS.md` + `PROJECT_STATUS.md`
- What to quickly test: Open `AGENTS.md` and confirm the new "Agent Coordination (REQUIRED)" section is present. New agents should follow it before starting work or deploying.

**Last Updated**: January 10th, 2025 by Agent #46
**Production URL**: https://helfi-b7kw09kuy-louie-veleskis-projects.vercel.app

---

## DEPLOYED (LIVE) - 2026-02-07

**What changed (simple)**:
- Health Setup will no longer run “Updating insights…” in the background unless you actually changed something.
- The Gender + Terms step will no longer auto-save on page load. It only saves when you click Male/Female or tick the checkbox.

**Where to see it**:
- https://helfi.ai/onboarding

**What to quickly test**:
- Log out, log back in, do not change anything: you should NOT see “Updating insights…” appear.
- On step 1 (Gender): clicking Male/Female should still work as normal.
- Ticking Terms should still work as normal.

## **🔥 CRITICAL ISSUES**

### **1. 📱 ACCORDION DROPDOWN MISALIGNMENT - MOBILE ONLY**
**Status**: ❌ **CRITICAL** - Costing user money, multiple agents failed
**Severity**: HIGH - Affects core functionality

**BREAKTHROUGH DISCOVERY by Agent #46**:
- **Works perfectly on DESKTOP** ✅
- **Fails completely on MOBILE (iPhone)** ❌
- **This is a MOBILE-SPECIFIC issue** - NOT data structure related

**Problem Description**:
- User adds supplement → triggers fresh analysis → Page 8 accordion dropdowns malfunction
- Clicking first accordion opens second accordion instead
- Clicking second accordion opens recommendations section
- "Show History" button may navigate to page 9 incorrectly

**Critical Insight**:
ALL previous agents (Agent #37-#46) focused on wrong root causes:
- ❌ Data structure mismatches
- ❌ Component re-rendering
- ❌ State synchronization
- ❌ Backend API differences

**Real Issue**: Mobile Safari touch event handling or CSS behavior

**What Agent #46 Tried (FAILED)**:
- Mobile touch optimizations (`onTouchStart`, `touch-manipulation`)
- Event prevention for touch events
- WebKit tap highlight removal

**For Next Agent**:
- Focus on iOS Safari specific behaviors
- Test on actual iPhone device (not desktop dev tools)
- Investigate CSS touch-action properties
- Consider alternative accordion implementation for mobile

---

### **2. 💾 SUPPLEMENT SAVING RACE CONDITION**
**Status**: ❌ **CRITICAL** - Data loss issue
**Severity**: HIGH - User loses entered data

**Problem Description**:
- User adds supplement → clicks "Next" → supplement not saved to database
- Caused by React state update race condition
- `onNext({ supplements })` called before `setSupplements()` completes
- Backend "delete all + recreate" strategy causes data loss

**Root Cause**:
```typescript
// In addSupplement function:
setSupplements((prev) => [...prev, supplementData]); // Async
// User clicks "Next" button immediately:
onNext({ supplements }); // Uses old state, missing new supplement
```

**Backend Issue**:
```typescript
// API deletes ALL supplements then recreates from incomplete list
await prisma.supplement.deleteMany({ where: { userId: user.id } });
await prisma.supplement.createMany({ data: data.supplements }); // Missing new supplement
```

**Solution Options**:
1. Fix race condition with `flushSync`
2. Change backend to additive approach (safer)
3. Ensure `onNext` uses most current data

---

## **✅ WORKING FEATURES**

### **1. Page 8 Accordion - Desktop**
- Direct navigation to page 8 works perfectly
- All accordion dropdowns function correctly on desktop browsers
- History section works properly

### **2. Supplement Adding UI**
- Form validation works
- UI updates correctly when supplements added
- Visual feedback is appropriate

---

## **🔍 INVESTIGATION STATUS**

### **Agent #46 Findings**:
- **MOBILE-SPECIFIC NATURE** of accordion issue confirmed
- **SUPPLEMENT SAVING RACE CONDITION** identified
- **FAILED APPROACHES** documented to avoid repetition

### **Next Agent Priority**:
1. **MOBILE ACCORDION FIX** - Test on actual iPhone
2. **SUPPLEMENT SAVING FIX** - Critical data loss prevention
3. **AVOID FAILED APPROACHES** - Don't repeat Agent #46's methods

---

## **⚠️ DEPLOYMENT WARNINGS**

- **Current state**: All Agent #46 changes reverted
- **No new deployments** until issues resolved
- **Test on mobile device** before any deployment
- **Verify supplement saving** before claiming fix

---

## **📊 USER IMPACT**

- **Financial**: User spending money on credits for broken functionality
- **Frustration**: Multiple failed agent attempts
- **Data Loss**: Potential supplement data not being saved
- **Mobile Users**: Cannot use Page 8 accordion functionality

**URGENT**: Next agent must succeed where 10+ previous agents failed.
