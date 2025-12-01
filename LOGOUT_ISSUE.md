# iOS PWA Logout Issue – Handover

## Summary
- Symptom: On iOS PWA (https://helfi.ai/healthapp added to Home Screen), user is forced to log in again immediately after switching to another app and coming back. Desktop and non-PWA Safari not reported as affected.
- Affected account reported: info@sonicweb.com.au (but fixes attempted were global).
- Barcode scanner UI was kept intact; camera fallback was added earlier and reverted/replayed per user requests. Logout issue persists independent of camera changes.

## Deployment timeline (from earliest to latest in this session)
- **52dd74c1** – "Fix iOS PWA barcode camera fallback" (pre-auth changes baseline). Initially reverted to this to undo later auth changes when requested.
- **ce82f7fb** – "Use server restore endpoint for session cookie reissue on resume" (added `/api/auth/restore`, adjusted pre-hydration script and AuthProvider to reissue cookies via server). Deployed; user still logged out.
- **4265bba4** – empty commit to trigger redeploy after reverting (no code changes). Deployed to force Vercel refresh. Logout persisted.
- **73eb4fcf** – empty commit to trigger redeploy at ce82f7f state. Deployed. Logout persisted.
- **ca94f8fb** (current head at time of writing) – "Reissue session cookies from remember token (middleware + signin)" (see details below). Deployed. Logout persisted.

## Code changes attempted (auth/persistence)
1) **Pre-hydration remember-me script in app/layout.tsx** (multiple iterations):
   - Ensure `helfi:rememberMe` flag is set to '1' by default.
   - On load/resume, if remember is on and email exists, reissue NextAuth cookies by:
     - Setting cookies from stored remember token if present.
     - Falling back to POST `/api/auth/signin-direct` with rememberMe=true if no token or no session.
   - Added event bindings for `pageshow`, `focus`, `visibilitychange` to re-run reissue.
   - Light throttles adjusted (2s/15s) in different attempts.
   - Result: did not stop logout on iOS PWA.

2) **Sign-in page defaults** (app/auth/signin/page.tsx):
   - Defaulted "Keep me signed in" to true; persisted remember flag/email/token on sign-in. (Part of earlier attempts before reverting; not the current head after reverting to ce82f7f+.)

3) **AuthProvider session keep-alive (components/providers/AuthProvider.tsx)**:
   - If session missing but remember token exists, attempted server restore before client cookie set.
   - Falls back to POST `/api/auth/signin-direct` with rememberMe=true.
   - Throttled retries; respects manual sign-out flag.
   - Active in current head.

4) **New endpoint /api/auth/restore (app/api/auth/restore/route.ts)**:
   - Accepts { token }, decodes via NEXTAUTH_SECRET, sets HttpOnly NextAuth cookies server-side.
   - Allows client to reissue cookies even if Safari drops them. (Added in ce82f7fb; remains.)

5) **Middleware reissue from remember token (middleware.ts) – current**:
   - On each request, attempts getToken from session cookie.
   - If missing, reads non-HttpOnly remember cookie (`helfi-remember-token`), decodes JWT, and re-sets the HttpOnly session cookies with remaining TTL.
   - Uses NEXTAUTH_SECRET and works for all users (not per-email).

6) **Signin-direct sets remember cookie (app/api/auth/signin-direct/route.ts) – current**:
   - On successful sign-in with rememberMe, sets HttpOnly session cookies **and** a non-HttpOnly `helfi-remember-token` (same JWT, long maxAge) so middleware/restore can reissue.

7) **Other auth-related toggles**:
   - `AuthProvider` patched to auto-mark remember flag when session exists and to avoid rapid reissue loops.
   - Various throttles were tightened/loosened (e.g., 15s -> 2s) to ensure frequent reissue.

## Camera/Barcode changes (for context; unaffected by logout but part of this session)
- Added iOS PWA native BarcodeDetector start and fallback to html5-qrcode; cleaned up streams. (52dd74c1)
- Broadened start attempts (deviceId, facingMode, default video). (54143692, ba5a52f5)
- Added hybrid detector reading from video element in parallel with html5-qrcode. (d17ba136)
- Adjusted scan box config and loosened constraints. (ae83aea8)
- These were reverted/force-pushed per user requests; current head is not focused on camera but on auth fixes.

## What did NOT happen
- No destructive database changes.
- No per-email hardcoding; all session fixes are global.
- No changes to NextAuth provider configuration (`lib/auth.ts`) in this session.

## Current state (HEAD ca94f8fb)
- Middleware: if session cookie missing, decode `helfi-remember-token` and set session cookies server-side.
- Signin-direct: sets `helfi-remember-token` (non-HttpOnly) alongside HttpOnly session cookies when rememberMe is checked.
- AuthProvider: tries `/api/auth/restore` first, then `/api/auth/signin-direct` if session missing.
- Pre-hydration script remains; event listeners reattempt reissue on resume.

## Open problem
- On iOS PWA, user is still forced to log in after app switching despite the above. Likely Safari/PWA dropping all cookies/localStorage on background or blocking third-party-like cookies even with same-site Lax.

## Suggested next steps for the next agent
1) **Instrument**: Add temporary logging (server + client) to confirm whether `helfi-remember-token` persists across backgrounding and whether middleware executes on first request after resume.
2) **Switch to `SameSite=None; Secure` for the remember cookie** (currently Lax) if iOS PWA treats Lax differently on resume; ensure Secure + proper domain.
3) **Consider IndexedDB/localStorage token fallback**: store the JWT in localStorage and POST to `/api/auth/restore` on resume before any route renders (pre-hydration). Ensure throttling.
4) **Check domain/path**: PWA is at `/healthapp`; ensure cookie path `/` and correct domain (currently default). Verify no redirect to helfi.ai root losing cookies.
5) **Evaluate NextAuth session strategy**: maybe switch to database sessions or a dedicated refresh endpoint instead of pure JWT for PWA stability.
6) **Reproduce on a test device**: confirm whether cookies are truly evicted on background or if fetch/cookie writes are blocked due to PWA manifest/scope.

## Reminder from guard rails
- `GUARD_RAILS.md` has no auth/persistence section. If you stabilize this, add a guard rail to prevent future regressions.
