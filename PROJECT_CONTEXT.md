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