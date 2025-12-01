# iOS PWA Logout Issue - Comprehensive Analysis

## Problem Statement

**Symptom**: On iOS PWA (https://helfi.ai/healthapp added to Home Screen), users are forced to log in again immediately after switching to another app and coming back.

**Affected**: iOS PWA specifically (desktop and non-PWA Safari not reported as affected)

**Affected Account**: info@sonicweb.com.au (though fixes were global, not per-email)

**Status**: Issue persists despite multiple attempted fixes across 4+ commits

---

## Expected vs Actual Behavior

### Expected Behavior
- User logs in with "Keep me signed in" enabled
- User switches to another iOS app (backgrounds the PWA)
- User returns to the PWA
- **Expected**: User remains logged in, session persists

### Actual Behavior
- User logs in with "Keep me signed in" enabled
- User switches to another iOS app
- User returns to the PWA
- **Actual**: User is logged out, must sign in again

---

## Deployment Timeline & Attempted Fixes

### Commit History (from earliest to latest)
1. **52dd74c1** - "Fix iOS PWA barcode camera fallback" (baseline before auth changes)
2. **ce82f7fb** - "Use server restore endpoint for session cookie reissue on resume"
   - Added `/api/auth/restore` endpoint
   - Adjusted pre-hydration script and AuthProvider
   - **Result**: Logout persisted
3. **4265bba4** - Empty commit to trigger redeploy (no code changes)
   - **Result**: Logout persisted
4. **73eb4fcf** - Empty commit to trigger redeploy at ce82f7f state
   - **Result**: Logout persisted
5. **ca94f8fb** (current HEAD) - "Reissue session cookies from remember token (middleware + signin)"
   - Middleware reissue logic added
   - Signin-direct sets remember cookie
   - **Result**: Logout persisted

---

## Current Implementation Architecture

### 1. Cookie Strategy
The app uses a dual-cookie approach:

**Session Cookies** (HttpOnly, Secure in production):
- `__Secure-next-auth.session-token` (production)
- `next-auth.session-token` (legacy/dev)
- SameSite: `Lax`
- MaxAge: ~5 years (when rememberMe is enabled)

**Remember Token Cookie** (non-HttpOnly):
- `helfi-remember-token`
- SameSite: `Lax`
- MaxAge: ~5 years
- Purpose: Survive iOS Safari cookie eviction, allow middleware/client to reissue session cookies

### 2. Session Restoration Layers

#### Layer 1: Pre-Hydration Script (`app/layout.tsx`)
- Runs **before React hydration** (critical for iOS PWA resume)
- Checks localStorage for remember token
- Attempts to restore session cookies via:
  - Direct cookie setting from localStorage token
  - POST to `/api/auth/restore` if token exists
  - POST to `/api/auth/signin-direct` if no token but email exists
- Listens for `pageshow`, `focus`, `visibilitychange` events
- Throttle: 2 seconds between retries

#### Layer 2: Middleware (`middleware.ts`)
- Runs on **every request** (except API routes and static files)
- Checks for session token via `getToken()`
- If no session token but `helfi-remember-token` exists:
  - Decodes remember token JWT
  - Validates expiration
  - Re-sets HttpOnly session cookies with remaining TTL
  - Returns response with restored cookies

#### Layer 3: AuthProvider (`components/providers/AuthProvider.tsx`)
- Client-side session keep-alive
- Checks `/api/auth/session` every 5 minutes
- If session missing but remember state exists:
  - First tries direct cookie setting from localStorage token
  - Falls back to POST `/api/auth/signin-direct` with rememberMe=true
- Listens for `visibilitychange`, `focus`, `pageshow` events
- Throttle: 15 seconds between restore attempts
- Respects manual sign-out flag (5-minute window)

#### Layer 4: Signin-Direct Endpoint (`app/api/auth/signin-direct/route.ts`)
- Sets both HttpOnly session cookies AND non-HttpOnly remember cookie
- Stores token in response JSON (for client-side localStorage backup)
- Creates NextAuth-compatible JWT with 5-year expiration

#### Layer 5: Restore Endpoint (`app/api/auth/restore/route.ts`)
- Accepts token in POST body
- Validates and decodes JWT
- Sets HttpOnly session cookies server-side
- Allows client to reissue cookies even if Safari drops them

### 3. localStorage Backup Strategy
- Stores remember token, email, expiration in localStorage
- Used as fallback when cookies are evicted
- Pre-hydration script reads from localStorage before React loads

---

## Error Messages & Flow Analysis

### No Explicit Error Messages
The issue manifests as silent logout - no error messages are shown. The user is simply redirected to the sign-in page.

### Session Flow on iOS PWA Resume
1. User backgrounds PWA → iOS may evict cookies from memory
2. User returns to PWA → Page loads
3. Pre-hydration script runs → Attempts restore
4. Middleware runs → Checks for session cookie
5. If cookies were evicted:
   - Middleware should detect `helfi-remember-token` and reissue
   - OR pre-hydration script should restore via API call
6. **Current failure point**: Neither mechanism successfully restores session

### Potential Failure Points
1. **Remember cookie also evicted**: iOS Safari may drop ALL cookies, including `helfi-remember-token`
2. **localStorage also cleared**: iOS may clear localStorage when app is backgrounded
3. **Middleware not executing**: First request after resume may not hit middleware
4. **Cookie SameSite restrictions**: `Lax` may not work in PWA context
5. **Timing race condition**: Pre-hydration script may not complete before middleware runs

---

## Root Cause Analysis

### Most Likely Root Causes

#### 1. iOS Safari Cookie Eviction (HIGH PROBABILITY)
iOS Safari has aggressive cookie eviction policies for PWAs:
- Cookies may be evicted when app is backgrounded
- Even `SameSite=Lax` cookies can be dropped
- HttpOnly cookies are more likely to be evicted than non-HttpOnly
- **Issue**: The `helfi-remember-token` cookie (non-HttpOnly) may also be getting evicted

#### 2. SameSite=Lax Limitation (MEDIUM PROBABILITY)
`SameSite=Lax` cookies are not sent on top-level navigations initiated by external apps:
- When user switches apps and returns, iOS may treat it as a "cross-site" navigation
- This could prevent cookies from being sent even if they weren't evicted
- **Solution**: Try `SameSite=None; Secure` for remember cookie

#### 3. localStorage Eviction (MEDIUM PROBABILITY)
iOS may clear localStorage when PWA is backgrounded for extended periods:
- Pre-hydration script relies on localStorage token backup
- If localStorage is cleared, restoration fails
- **Issue**: No verification that localStorage persists across app switches

#### 4. Middleware Execution Timing (LOW PROBABILITY)
Middleware may not execute on the first request after resume:
- Static assets or service worker may intercept first request
- Middleware matcher may skip certain paths
- **Current matcher**: Excludes `/api`, `/_next`, and files with dots

#### 5. PWA Scope/Manifest Issues (LOW PROBABILITY)
PWA manifest shows:
- `start_url`: `/`
- `scope`: `/`
- User accesses via `/healthapp` route
- **Potential issue**: Cookie path/domain may not match PWA scope

---

## Open Questions

1. **Does `helfi-remember-token` cookie persist across app switches?**
   - Need to verify: Check cookies in Safari DevTools after backgrounding
   - Add logging to middleware to see if remember cookie is present

2. **Does localStorage persist across app switches?**
   - Need to verify: Check localStorage after backgrounding
   - Add logging to pre-hydration script

3. **Is middleware executing on first request after resume?**
   - Need to verify: Add server-side logging to middleware
   - Check if middleware runs before pre-hydration script completes

4. **Are cookies being blocked due to SameSite policy?**
   - Need to verify: Try `SameSite=None; Secure` for remember cookie
   - Ensure domain is correct (helfi.ai, not localhost)

5. **Is there a race condition between pre-hydration and middleware?**
   - Need to verify: Check timing of cookie restoration attempts
   - May need to ensure middleware runs AFTER pre-hydration completes

6. **Does the `/healthapp` route path affect cookie scope?**
   - Need to verify: Check if cookies are set with correct path (`/`)
   - Verify domain is correct (not subdomain-specific)

---

## Recommended Debugging Steps

### Step 1: Add Comprehensive Logging

#### Server-Side Logging (Middleware)
```typescript
// In middleware.ts, add logging:
console.log('[MIDDLEWARE] Request:', {
  path: request.nextUrl.pathname,
  hasSessionCookie: !!request.cookies.get('__Secure-next-auth.session-token'),
  hasRememberCookie: !!request.cookies.get('helfi-remember-token'),
  rememberCookieValue: request.cookies.get('helfi-remember-token')?.value?.substring(0, 20) + '...',
  userAgent: request.headers.get('user-agent')?.includes('iPhone') || request.headers.get('user-agent')?.includes('iPad'),
})
```

#### Client-Side Logging (Pre-Hydration Script)
```javascript
// In app/layout.tsx pre-hydration script, add:
console.log('[PRE-HYDRATION] Resume check:', {
  hasRememberToken: !!localStorage.getItem('helfi:rememberToken'),
  hasEmail: !!localStorage.getItem('helfi:rememberEmail'),
  hasSessionCookie: document.cookie.includes('__Secure-next-auth.session-token'),
  visibilityState: document.visibilityState,
})
```

#### Client-Side Logging (AuthProvider)
```typescript
// In components/providers/AuthProvider.tsx, add:
console.log('[AUTH-PROVIDER] Session check:', {
  status,
  hasSession: !!sessionData?.user,
  remembered: remembered,
  hasToken: !!token,
})
```

### Step 2: Verify Cookie Persistence

**Test on iOS Device:**
1. Log in with "Keep me signed in"
2. Open Safari DevTools (via Mac Safari → Develop → [Your iPhone])
3. Check cookies for `helfi-remember-token` and session cookies
4. Background the PWA
5. Wait 30 seconds
6. Return to PWA
7. Check cookies again - are they still present?

### Step 3: Try SameSite=None; Secure

**Modify remember cookie settings:**
```typescript
// In app/api/auth/signin-direct/route.ts
response.cookies.set(rememberCookie, keepSignedIn ? token : '', {
  httpOnly: false,
  secure: true, // Always true for SameSite=None
  sameSite: 'none', // Changed from 'lax'
  maxAge: keepSignedIn ? maxAgeSeconds : 0,
  path: '/',
  domain: '.helfi.ai', // May need to test with/without domain
})
```

**Also update middleware:**
```typescript
// In middleware.ts, when reissuing session cookies:
response.cookies.set(SESSION_COOKIE, remember, {
  httpOnly: true,
  secure: true,
  sameSite: 'none', // Changed from 'lax'
  maxAge,
  path: '/',
  domain: '.helfi.ai', // May need to test
})
```

### Step 4: Add IndexedDB Fallback

**Consider storing token in IndexedDB instead of localStorage:**
- IndexedDB is more persistent than localStorage on iOS
- Can store token as backup when cookies fail
- Pre-hydration script can read from IndexedDB

### Step 5: Test Middleware Execution

**Verify middleware runs on resume:**
1. Add unique request ID to middleware logs
2. Check server logs after resuming PWA
3. Confirm middleware executes before page renders
4. Check if middleware sees remember cookie

### Step 6: Evaluate NextAuth Session Strategy

**Consider switching to database sessions:**
- Current: JWT-only sessions (stateless)
- Alternative: Database sessions (stateful)
- Pros: More reliable on iOS, can track session state server-side
- Cons: Requires database queries, more complex

---

## Code Locations Reference

### Key Files
- `middleware.ts` - Server-side session restoration
- `app/layout.tsx` - Pre-hydration script (lines 62-154)
- `components/providers/AuthProvider.tsx` - Client-side session keep-alive
- `app/api/auth/restore/route.ts` - Restore endpoint
- `app/api/auth/signin-direct/route.ts` - Sign-in with remember cookie
- `lib/auth.ts` - NextAuth configuration

### Cookie Names
- `__Secure-next-auth.session-token` - Production session cookie
- `next-auth.session-token` - Legacy/dev session cookie
- `helfi-remember-token` - Non-HttpOnly remember token cookie

### localStorage Keys
- `helfi:rememberMe` - Remember flag
- `helfi:rememberEmail` - User email
- `helfi:rememberToken` - JWT token backup
- `helfi:rememberTokenExp` - Token expiration timestamp
- `helfi:lastManualSignOut` - Manual sign-out timestamp
- `helfi:lastSessionRestore` - Last restore attempt timestamp

---

## Next Steps Priority

1. **HIGH**: Add logging to verify cookie/localStorage persistence
2. **HIGH**: Test `SameSite=None; Secure` for remember cookie
3. **MEDIUM**: Verify middleware execution on resume
4. **MEDIUM**: Consider IndexedDB fallback
5. **LOW**: Evaluate database sessions if above fail

---

## Notes

- Issue is iOS PWA-specific (desktop Safari works fine)
- Multiple restoration layers exist but none are working
- No explicit errors - silent logout suggests cookie eviction
- Remember cookie strategy is sound but may not survive iOS eviction
- Need instrumentation to confirm root cause before further fixes

