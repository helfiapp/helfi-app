# iOS PWA Logout Issue – Handover Document

## 🚨 CRITICAL HANDOVER FOR NEXT AGENT

**Date:** December 1, 2025  
**Status:** Issue persists - user still being logged out when switching apps on iOS PWA  
**Last Agent:** Attempted multiple fixes but none resolved the issue  
**User Request:** User wants a new agent to take over - previous attempts have not worked

### Current State (HEAD: accb5432)

**Problem:** User logs in on iOS PWA (https://helfi.ai/healthapp), switches to another app, returns to PWA, and is immediately forced to log in again. This was NOT happening before today.

**What's Currently Deployed:**
- NextAuth cookies configured with `SameSite=None; Secure` in production (`lib/auth.ts`)
- Middleware attempts to reissue session cookies from `helfi-remember-token` cookie
- `/api/auth/restore` endpoint exists to restore cookies server-side
- `/api/auth/signin-direct` sets both session cookies and remember cookie
- Pre-hydration script in `app/layout.tsx` attempts to restore session before React loads
- AuthProvider (`components/providers/AuthProvider.tsx`) has session keep-alive logic
- Comprehensive logging added to middleware, pre-hydration script, and AuthProvider

**What's NOT Working:**
- Despite all the above, user is still logged out when switching apps
- All cookie restoration mechanisms are in place but not preventing logout
- Logging is in place but may need to be checked to see what's actually happening

### Key Files Modified Today:
- `lib/auth.ts` - NextAuth cookie configuration (SameSite=None)
- `middleware.ts` - Cookie reissue logic + logging
- `app/layout.tsx` - Pre-hydration script + logging
- `components/providers/AuthProvider.tsx` - Session keep-alive + logging
- `app/api/auth/restore/route.ts` - Restore endpoint (SameSite=None)
- `app/api/auth/signin-direct/route.ts` - Sign-in endpoint (SameSite=None)

### What NOT to Try Again:
1. ❌ **DO NOT** try `SameSite=None` changes - already attempted (commits 0bc7dc62, accb5432)
2. ❌ **DO NOT** add more middleware reissue logic - already exists
3. ❌ **DO NOT** add more pre-hydration scripts - already exists
4. ❌ **DO NOT** add more AuthProvider keep-alive logic - already exists
5. ❌ **DO NOT** add more restore endpoints - already exists
6. ❌ **DO NOT** try client-side cookie setting with `document.cookie` - cannot set SameSite=None properly

### Recommended First Steps:
1. **Check the logs** - Review server logs and browser console to see what's actually happening:
   - Are cookies present when user returns?
   - Is middleware executing?
   - Is the remember token cookie present?
   - What do the `[MIDDLEWARE]`, `[PRE-HYDRATION]`, and `[AUTH-PROVIDER]` logs show?

2. **Test on actual iOS device** - Use Safari DevTools to inspect cookies:
   - Check if `helfi-remember-token` cookie persists after backgrounding
   - Check if session cookies are present
   - Check if localStorage persists

3. **Consider alternative approaches:**
   - IndexedDB instead of localStorage (more persistent on iOS)
   - Database sessions instead of JWT sessions
   - Service Worker to intercept requests and restore cookies
   - Different cookie domain/path strategy

---

## Summary
- Symptom: On iOS PWA (https://helfi.ai/healthapp added to Home Screen), user is forced to log in again immediately after switching to another app and coming back. Desktop and non-PWA Safari not reported as affected.
- Affected account reported: info@sonicweb.com.au (but fixes attempted were global).
- Barcode scanner UI was kept intact; camera fallback was added earlier and reverted/replayed per user requests. Logout issue persists independent of camera changes.

---

## Complete Chronological List of All Attempted Fixes

### Session 1: Initial Attempts (Before Today)

#### Commit: 52dd74c1 - "Fix iOS PWA barcode camera fallback"
- **What:** Baseline before auth changes
- **Result:** Not related to logout issue

#### Commit: ce82f7fb - "Use server restore endpoint for session cookie reissue on resume"
- **What:** 
  - Added `/api/auth/restore` endpoint
  - Adjusted pre-hydration script and AuthProvider to reissue cookies via server
- **Result:** ❌ User still logged out

#### Commit: 4265bba4 - Empty commit to trigger redeploy
- **What:** No code changes, just redeploy
- **Result:** ❌ Logout persisted

#### Commit: 73eb4fcf - Empty commit to trigger redeploy
- **What:** No code changes, just redeploy
- **Result:** ❌ Logout persisted

#### Commit: ca94f8fb - "Reissue session cookies from remember token (middleware + signin)"
- **What:**
  - Middleware reissue logic added
  - Signin-direct sets remember cookie
- **Result:** ❌ Logout persisted

---

### Session 2: Today's Attempts (December 1, 2025)

#### Commit: 0bc7dc62 - "Fix iOS PWA logout issue: Add comprehensive logging and update cookies to SameSite=None"
- **What was attempted:**
  1. Added comprehensive logging to middleware (`middleware.ts`):
     - Logs cookie presence, iOS detection, session restoration attempts
     - Logs when remember token is found/missing
     - Logs when cookies are reissued
  
  2. Added logging to pre-hydration script (`app/layout.tsx`):
     - Logs localStorage state, cookie presence, restore attempts
     - Logs iOS detection, visibility state
  
  3. Added logging to AuthProvider (`components/providers/AuthProvider.tsx`):
     - Logs session checks, restore attempts, failures
     - Logs when cookies are set from localStorage
  
  4. Updated remember cookie to use `SameSite=None; Secure`:
     - `app/api/auth/signin-direct/route.ts` - Changed remember cookie from `SameSite=Lax` to `SameSite=None`
     - `app/api/auth/restore/route.ts` - Changed session cookies to `SameSite=None`
     - `middleware.ts` - Changed reissued cookies to `SameSite=None`
  
  5. Updated pre-hydration script to use `SameSite=None`:
     - Attempted to set cookies with `SameSite=None` via `document.cookie` (later removed as ineffective)
  
  6. Updated AuthProvider to use `SameSite=None`:
     - Attempted to set cookies with `SameSite=None` via `document.cookie` (later removed as ineffective)

- **Result:** ❌ Build failed due to TypeScript error in restore route

#### Commit: 36fbce56 - "Fix TypeScript error in restore route - ensure decoded.exp is treated as number"
- **What was attempted:**
  - Fixed TypeScript error: `decoded.exp` type checking
  - Added explicit type assertion: `const exp = decoded.exp as number`
- **Result:** ✅ Build succeeded, but ❌ logout issue persisted

#### Commit: accb5432 - "CRITICAL FIX: Update NextAuth cookies to SameSite=None for iOS PWA"
- **What was attempted:**
  1. **Updated NextAuth cookie configuration (`lib/auth.ts`):**
     - Changed `sessionToken` cookie from `SameSite=Lax` to `SameSite=None` in production
     - Changed `callbackUrl` cookie from `SameSite=Lax` to `SameSite=None` in production
     - Changed `csrfToken` cookie from `SameSite=Lax` to `SameSite=None` in production
     - This was the PRIMARY fix - NextAuth sets cookies during sign-in
  
  2. **Removed client-side cookie setting attempts:**
     - Removed `document.cookie` setting from pre-hydration script (cannot properly set SameSite=None)
     - Removed `document.cookie` setting from AuthProvider (cannot properly set SameSite=None)
     - All cookie setting now goes through server endpoints
  
  3. **Rationale:**
     - NextAuth is the primary cookie setter during sign-in
     - If NextAuth sets cookies with `SameSite=Lax`, iOS Safari drops them when app is backgrounded
     - Client-side `document.cookie` cannot properly set `SameSite=None` (requires Secure flag set server-side)

- **Result:** ❌ User confirmed logout issue still persists

---

## Code Changes Attempted (Detailed Breakdown)

### 1. Pre-hydration remember-me script (`app/layout.tsx`)
- **Multiple iterations attempted:**
  - Ensure `helfi:rememberMe` flag is set to '1' by default
  - On load/resume, if remember is on and email exists, reissue NextAuth cookies by:
    - Setting cookies from stored remember token if present (REMOVED - cannot set SameSite=None client-side)
    - Falling back to POST `/api/auth/restore` if token exists
    - Falling back to POST `/api/auth/signin-direct` with rememberMe=true if no token
  - Added event bindings for `pageshow`, `focus`, `visibilitychange` to re-run reissue
  - Added comprehensive logging for debugging
  - Throttles adjusted (2s/15s) in different attempts
- **Result:** ❌ Did not stop logout on iOS PWA

### 2. Sign-in page defaults (`app/auth/signin/page.tsx`)
- **What:** Defaulted "Keep me signed in" to true; persisted remember flag/email/token on sign-in
- **Status:** Part of earlier attempts before reverting; not in current head
- **Result:** ❌ Did not resolve issue

### 3. AuthProvider session keep-alive (`components/providers/AuthProvider.tsx`)
- **What:**
  - If session missing but remember token exists, attempts server restore
  - Falls back to POST `/api/auth/signin-direct` with rememberMe=true
  - Throttled retries (15 seconds)
  - Respects manual sign-out flag (5-minute window)
  - Added comprehensive logging
  - Removed client-side cookie setting (cannot set SameSite=None properly)
- **Result:** ❌ Active but not preventing logout

### 4. New endpoint `/api/auth/restore` (`app/api/auth/restore/route.ts`)
- **What:**
  - Accepts `{ token }` in POST body
  - Decodes JWT via NEXTAUTH_SECRET
  - Sets HttpOnly NextAuth cookies server-side with `SameSite=None; Secure`
  - Allows client to reissue cookies even if Safari drops them
- **Result:** ❌ Endpoint exists but not preventing logout

### 5. Middleware reissue from remember token (`middleware.ts`)
- **What:**
  - On each request, attempts `getToken()` from session cookie
  - If missing, reads non-HttpOnly remember cookie (`helfi-remember-token`)
  - Decodes JWT and re-sets HttpOnly session cookies with remaining TTL
  - Uses `SameSite=None; Secure` when reissuing
  - Added comprehensive logging
  - Uses NEXTAUTH_SECRET and works for all users (not per-email)
- **Result:** ❌ Active but not preventing logout

### 6. Signin-direct sets remember cookie (`app/api/auth/signin-direct/route.ts`)
- **What:**
  - On successful sign-in with rememberMe, sets:
    - HttpOnly session cookies (`SameSite=None; Secure` in production)
    - Non-HttpOnly `helfi-remember-token` cookie (`SameSite=None; Secure` in production)
  - Both use same JWT with long maxAge (~5 years)
  - Stores token in response JSON for localStorage backup
- **Result:** ❌ Cookies are set but still getting dropped

### 7. NextAuth cookie configuration (`lib/auth.ts`)
- **What:**
  - Updated `sessionToken` cookie to use `SameSite=None` in production (was `SameSite=Lax`)
  - Updated `callbackUrl` cookie to use `SameSite=None` in production (was `SameSite=Lax`)
  - Updated `csrfToken` cookie to use `SameSite=None` in production (was `SameSite=Lax`)
  - All cookies use `Secure=true` in production
  - MaxAge: ~5 years
- **Result:** ❌ This was the PRIMARY fix attempt but logout still persists

### 8. Comprehensive logging
- **What:**
  - Middleware logs: cookie presence, iOS detection, restoration attempts
  - Pre-hydration logs: localStorage state, cookie presence, restore attempts
  - AuthProvider logs: session checks, restore attempts, failures
- **Result:** ✅ Logging is in place but needs to be checked to see what's happening

---

## Camera/Barcode Changes (For Context)
- Added iOS PWA native BarcodeDetector start and fallback to html5-qrcode; cleaned up streams. (52dd74c1)
- Broadened start attempts (deviceId, facingMode, default video). (54143692, ba5a52f5)
- Added hybrid detector reading from video element in parallel with html5-qrcode. (d17ba136)
- Adjusted scan box config and loosened constraints. (ae83aea8)
- **Note:** These were reverted/force-pushed per user requests; logout issue persists independent of camera changes.

---

## What Did NOT Happen
- No destructive database changes
- No per-email hardcoding; all session fixes are global
- No changes to NextAuth provider logic (only cookie configuration)

---

## Current State (HEAD: accb5432)

### Active Mechanisms:
1. **NextAuth** sets cookies with `SameSite=None; Secure` during sign-in
2. **Middleware** reissues session cookies from remember token if session cookie missing
3. **Signin-direct** sets both session cookies and remember cookie with `SameSite=None; Secure`
4. **Restore endpoint** can reissue cookies server-side with `SameSite=None; Secure`
5. **Pre-hydration script** attempts to restore session before React loads
6. **AuthProvider** has session keep-alive with server-side restore attempts
7. **Comprehensive logging** in place for debugging

### Open Problem:
- On iOS PWA, user is still forced to log in after app switching despite all the above
- All cookie restoration mechanisms are in place but not working
- Need to investigate what's actually happening (check logs, inspect cookies on device)

---

## Suggested Next Steps for Next Agent

### 1. Investigate What's Actually Happening
- **Check server logs** for `[MIDDLEWARE]`, `[PRE-HYDRATION]`, `[AUTH-PROVIDER]` messages
- **Test on actual iOS device** with Safari DevTools:
  - Inspect cookies before/after backgrounding
  - Check if `helfi-remember-token` cookie persists
  - Check if session cookies are present
  - Check if localStorage persists
- **Check browser console** for client-side logs

### 2. Consider Alternative Approaches (NOT Yet Tried)
- **IndexedDB instead of localStorage**: More persistent on iOS than localStorage
- **Database sessions instead of JWT**: NextAuth supports database sessions which might be more reliable
- **Service Worker**: Intercept requests and restore cookies before they reach the server
- **Different cookie strategy**: Maybe cookies need different domain/path settings for PWA
- **PWA manifest changes**: Check if manifest.json needs updates for cookie persistence

### 3. Verify Cookie Settings
- Ensure `SameSite=None` requires `Secure=true` (already done)
- Verify domain is correct (should be `.helfi.ai` or just `helfi.ai`?)
- Verify path is correct (should be `/`)
- Check if PWA scope affects cookie behavior

### 4. Test Different Scenarios
- Test with regular Safari (not PWA) - does it work?
- Test with different iOS versions
- Test with different PWA installation methods
- Test timing - how long does user need to be away before logout?

---

## Reminder from Guard Rails
- `GUARD_RAILS.md` has no auth/persistence section. If you stabilize this, add a guard rail to prevent future regressions.

---

## Analysis Document
- See `LOGOUT_ISSUE_ANALYSIS.md` for detailed technical analysis and debugging recommendations
