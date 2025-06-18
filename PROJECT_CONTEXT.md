# HELFI.AI PROJECT CONTEXT FOR AI AGENTS

## 🚨 CRITICAL RULES - READ FIRST
1. **NEVER change anything unless explicitly told to do so**
2. **ALWAYS examine the site first and report findings before making ANY changes**
3. **Deployment process MUST be:** `git add . && git commit -m "message" && git push && vercel --prod --yes`
4. **Site MUST deploy to helfi.ai (main domain) - NEVER subdomains**
5. **Test thoroughly before deploying - don't break working features**

## 🏥 PROJECT OVERVIEW

**Helfi.ai** is a comprehensive health and wellness application that provides personalized health guidance and tracking.

### Core App Purpose
- **Health Profile Setup:** 10-step onboarding to collect user's health data
- **Personalized Recommendations:** AI-driven health insights based on user profile
- **Health Tracking:** Monitor supplements, medications, goals, and progress
- **Dashboard:** Centralized view of health status and recommendations

### Key Features

#### 1. Onboarding Flow (10 steps)
1. Gender selection
2. Physical metrics (weight, height, body type)
3. Exercise habits and fitness level
4. Health goals selection
5. Current health situations
6. Supplements tracking
7. Medications tracking
8. Blood results upload
9. AI insights preferences
10. Review and confirmation

#### 2. Main App Sections
- **Dashboard:** Health overview and insights
- **Profile:** User settings and data management
- **Health Tracking:** Daily supplement/medication logging
- **Insights:** AI-generated health recommendations
- **Reports:** Health progress analytics
- **Settings:** Account and notification preferences

#### 3. Authentication System
- Email/password login (Supabase)
- Google OAuth (currently broken)
- Admin-protected routes for testing

### User Journey
1. User visits helfi.ai → sees login screen
2. Signs up/logs in → completes 10-step onboarding
3. Gets personalized dashboard with health insights
4. Can track daily health metrics and view progress

## 🏗️ TECHNICAL ARCHITECTURE

### Current Stack
- **Frontend:** Next.js 14.1.0
- **Authentication:** Supabase
- **Storage:** Currently localStorage (causing sync issues)
- **Database:** Prisma schema exists but not fully implemented
- **Hosting:** Vercel with custom domain helfi.ai
- **Styling:** Tailwind CSS

### Authentication Flow
- **Main site:** helfi.ai (should show login screen)
- **Admin route:** helfi.ai/healthapp (requires password: HealthBeta2024!)
- **Test email:** info@sonicweb.com.au
- **Both routes should lead to same 10-step onboarding**

## 🔧 KNOWN ISSUES

### 1. Google Login Issue (UNRESOLVED - HIGH PRIORITY)
- **Problem:** Google OAuth login is not working properly
- **Symptoms:** User gets redirected but authentication fails
- **Potential Causes:** Google Client ID/Secret configuration, callback URLs
- **Status:** DO NOT attempt to fix without explicit instructions

### 2. Mobile vs Desktop Data Inconsistency (UNRESOLVED - HIGHEST PRIORITY)
- **Problem:** Desktop and mobile show different data even when logged into same account
- **Symptoms:** User sees different onboarding data on different devices
- **Root Cause:** localStorage is device-specific, no cloud synchronization
- **Impact:** User expects data to sync across all devices
- **Previous Attempt:** Database integration attempted but broke the app, had to revert

### 3. Button Sizing Issues (MINOR)
- **Problem:** Some buttons appear too large/stretched out
- **Location:** Onboarding flow buttons
- **Status:** Only fix if specifically requested

## ⚠️ RECENT DEPLOYMENT HISTORY

### What Broke the Site Recently
- **Attempt:** Database integration to fix mobile/desktop sync
- **Result:** Client-side errors, app completely broken
- **Actions Taken:** Button size changes that introduced syntax errors
- **Resolution:** Reverted to commit `d664341` - "Fix healthapp admin password to HealthBeta2024"

### Current Working State (Commit: d664341)
- ✅ Site functional at helfi.ai
- ✅ Authentication working on individual devices
- ✅ Onboarding flow complete and functional
- ✅ UI improvements preserved
- ❌ Mobile/desktop sync still broken
- ❌ Google login still broken

## 🎯 PRIORITY ISSUES (When Asked to Address)
1. **Fix mobile/desktop data sync** (HIGHEST - implement proper database storage)
2. **Resolve Google login issue** (HIGH - fix OAuth configuration)
3. **Improve button sizing** (LOW - only if specifically requested)

## 🚀 DEPLOYMENT PROCESS

### Required Steps (IN ORDER)
1. Make changes to code
2. Test locally if possible
3. `git add .`
4. `git commit -m "descriptive message"`
5. `git push`
6. `vercel --prod --yes`
7. Verify deployment at helfi.ai (NOT subdomains)

### Deployment Verification
- Site must be accessible at helfi.ai
- Main login screen should appear (not healthapp admin screen)
- Authentication flow should work
- No client-side errors in browser console

## 📁 KEY FILES TO UNDERSTAND

### Authentication & Routing
- `app/page.tsx` - Main landing/login page
- `app/healthapp/page.tsx` - Admin-protected onboarding route
- `app/onboarding/page.tsx` - Main onboarding flow
- `app/dashboard/page.tsx` - Post-onboarding dashboard

### Database Schema
- `prisma/schema.prisma` - Database structure (exists but not fully used)

### Configuration
- `next.config.js` - Next.js configuration
- `.env.local` - Environment variables (Supabase keys, etc.)

## 🔍 DEBUGGING CHECKLIST

### Before Making Changes
1. Visit helfi.ai and document current state
2. Test authentication flow
3. Check browser console for errors
4. Test on both desktop and mobile
5. Verify admin route (helfi.ai/healthapp) works

### After Making Changes
1. Test all core functionality
2. Verify deployment to helfi.ai (not subdomain)
3. Check mobile/desktop consistency
4. Test authentication on both routes
5. Confirm no new errors introduced

## 💡 IMPORTANT NOTES

### User Expectations
- The user has been frustrated by agents breaking working functionality
- The user expects mobile and desktop to show identical data
- The user values the existing UI improvements and doesn't want them lost
- The user wants careful, methodical changes with thorough testing

### Common Pitfalls to Avoid
- Don't modify working localStorage system without proper database replacement
- Don't change authentication flow without understanding current setup
- Don't deploy to Vercel subdomains instead of helfi.ai
- Don't make changes without explicit permission
- Don't break existing functionality while trying to fix other issues

## 📞 EMERGENCY RECOVERY

If the site breaks:
1. Check git log: `git log --oneline -10`
2. Revert to last known good commit: `git reset --hard [commit-hash]`
3. Force push: `git push --force`
4. Deploy: `vercel --prod --yes`
5. Verify at helfi.ai

**Last Known Good Commit:** `d664341` - "Fix healthapp admin password to HealthBeta2024"

---
*This document should be referenced at the start of any AI agent session working on Helfi.ai*

## 🚨 RECENT AGENT FAILURE RECORD (DECEMBER 2024)

### ⚠️ CRITICAL: FAILED ATTEMPTS BY PREVIOUS AGENT
**Read this section carefully to avoid repeating failed approaches**

#### FAILED ATTEMPT #1: Cross-Device Data Sync Implementation
**What was attempted:**
- Created `/app/api/user-data/route.ts` for database sync
- Modified onboarding page to save to both localStorage AND database
- Added database loading logic with localStorage fallback
- Multiple cache clearing and rebuilding attempts

**Why it failed:**
- Persistent syntax error at line 2302 in `app/onboarding/page.tsx`
- Error: "Expression expected" with malformed `} else {` statement
- Despite code appearing correct in file, error persisted through multiple builds
- Supabase connection errors (`supabaseUrl is required`, `supabaseKey is required`)
- Bootstrap script errors causing development instability

**Specific errors encountered:**
```
× Expression expected
2302 │       } else {
     ·         ────
```
```
⨯ Error: supabaseUrl is required.
⨯ Error: supabaseKey is required.
⨯ Error: Invariant: missing bootstrap script. This is a bug in Next.js
```

**What was tried to fix it:**
1. ✅ Emergency revert to commit `ab25b39` (successful)
2. ❌ Multiple cache clears: `rm -rf .next && npm run build` (failed - error persisted)
3. ❌ Multiple npm installs and dependency updates (failed)
4. ❌ Killing development servers and restarting (failed)
5. ❌ Reading/checking code at line 2302 multiple times (code appeared correct)
6. ❌ Building with clean cache repeatedly (syntax error persisted)
7. ❌ Installing missing packages like `pg` and `@types/pg` (didn't solve syntax issue)

**Current state after failures:**
- ✅ Production app at helfi.ai is working (restored)
- ✅ Basic authentication flow works
- ✅ Onboarding displays correctly
- ❌ Cross-device sync still not implemented
- ❌ Development environment unstable (syntax errors)
- ❌ Data shows as blank for `info@sonicweb.com.au` across devices

#### FAILED ATTEMPT #2: Domain Configuration Issues
**What was attempted:**
- Multiple Vercel domain alias commands
- Trying to map helfi.ai to latest deployments
- Confusion between HELF AI (different company) and user's Helfi.ai

**Why it failed:**
- User confirmed they own helfi.ai domain
- Domain mapping attempts were correct but didn't solve underlying app issues
- The real problem was the syntax errors preventing proper app function

#### FAILED ATTEMPT #3: Repeated Build/Deploy Cycles
**What was attempted:**
- Over 10 build attempts with `npm run build`
- Multiple git commits and pushes
- Several Vercel deployments with `vercel --prod --yes`
- Constant cache clearing and environment reloading

**Why it failed:**
- Got stuck in endless loop of same syntax error
- Each build showed successful compilation but development server still had errors
- Deployed broken code to production multiple times
- User became frustrated with repetitive failed attempts

### 🔥 CRITICAL LESSONS FOR NEXT AGENT

#### DO NOT ATTEMPT:
1. **DON'T** try to fix the syntax error at line 2302 by modifying the onboarding page
2. **DON'T** attempt cache clearing commands (`rm -rf .next`) - this was tried extensively
3. **DON'T** try to implement cross-device sync until development environment is stable
4. **DON'T** make multiple build/deploy attempts without solving root cause
5. **DON'T** modify the `/app/api/user-data/route.ts` file - it was already created and causes errors

#### APPROACH NEEDED:
1. **FIRST**: Identify why syntax error persists despite code appearing correct
2. **CONSIDER**: The file may be corrupted or have invisible characters
3. **INVESTIGATE**: Whether the issue is in a different file that's causing the error to be reported incorrectly
4. **ALTERNATIVE**: Complete file rewrite of onboarding page may be needed
5. **VERIFY**: Development environment stability before attempting any new features

#### ENVIRONMENT STATE:
- **Node.js version**: Compatible (app builds in production)
- **Next.js version**: 14.1.0
- **Package.json**: Dependencies are correct
- **Build process**: Works in production, fails in development
- **Error pattern**: Consistent syntax error at same line number

### 🎯 RECOMMENDED NEXT STEPS (Only if explicitly requested)
1. **FIRST**: Examine the exact bytes/characters at line 2302 in onboarding page
2. **SECOND**: Check if error is actually originating from different file
3. **THIRD**: Consider creating fresh onboarding page from scratch
4. **FOURTH**: Only after dev environment stable, attempt cross-device sync

### ⛔ WHAT NOT TO REPEAT
- Cache clearing loops (tried 5+ times)
- Build/deploy cycles without fixing root cause (tried 10+ times)  
- Modifying same code areas repeatedly (tried 3+ times)
- Environment variable changes (Supabase config is correct)
- Package installation attempts (dependencies are correct)

--- 