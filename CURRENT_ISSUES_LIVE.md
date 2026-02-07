# 🚨 CURRENT LIVE ISSUES - HELFI.AI

**Last Updated**: January 10th, 2025 by Agent #46
**Production URL**: https://helfi-b7kw09kuy-louie-veleskis-projects.vercel.app

---

## 2026-02-07 Notes (Recent Work + Current Concern)

### Staging: Health Setup shows "Updating insights..." even when nothing changed
**Where**: `https://stg.helfi.ai/onboarding`

**What the owner saw**:
- Log out, log back in, do not change anything.
- A toast appears: "Updating insights... You can keep using the app."
- This is concerning because updates should only happen when something actually changed.

**Likely cause (simple)**:
- Some parts of Health Setup were saving in the background during page load (even when the user didn't change anything),
  and that could trigger an "insights update" run.

**Fix prepared (NOT deployed, per owner request)**:
- Branch: `codex/fix-onboarding-no-background-update`
- Commit: `593d1f59` "Fix: stop background insights update when nothing changed"
- Change summary:
  - Only run background insights updates if the app knows there were real edits.
  - Ignore "partial saves" that don't actually change any values (prevents false triggers during page load).
  - Remove auto-save-on-login behavior.

**What needs testing (after gatekeeper deploys)**:
- Log out/in and confirm NO background "Updating insights..." toast unless you actually edit something.
- Make a real change (gender/weight/goals etc) and confirm the background update still triggers correctly.

### Staging: Weekly Health Report "Create report now" failures (previously)
**Where**: `https://stg.helfi.ai/insights`

**Status**:
- Fixed and deployed earlier so manual "Create report now" no longer throws the generic red error for the test account.
- Follow-up fix added to prevent duplicate weekly reports for the same 7-day period.

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
