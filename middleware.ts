import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { decode } from 'next-auth/jwt'

const ADMIN_GATE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const REMEMBER_COOKIE = 'helfi-remember-token'
const SESSION_COOKIE = '__Secure-next-auth.session-token'
const LEGACY_SESSION_COOKIE = 'next-auth.session-token'
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'

export async function middleware(request: NextRequest) {
  // Preview-staging should always skip the admin gate to avoid iOS logout loops
  const skipAdminGate = true

  // Skip middleware for static files and API routes that don't need auth
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  try {
    // Get the token from the request
    let token = await getToken({ 
      req: request, 
      secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024',
      // Use a stable encryption key to prevent session invalidation
      cookieName: process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token' 
        : 'next-auth.session-token'
    })

    // Logging for iOS PWA logout debugging
    const isIOS = request.headers.get('user-agent')?.includes('iPhone') || request.headers.get('user-agent')?.includes('iPad')
    const hasSessionCookie = !!request.cookies.get(SESSION_COOKIE) || !!request.cookies.get(LEGACY_SESSION_COOKIE)
    const hasRememberCookie = !!request.cookies.get(REMEMBER_COOKIE)
    const rememberValue = request.cookies.get(REMEMBER_COOKIE)?.value
    
    console.log('[MIDDLEWARE] Session check:', {
      path: request.nextUrl.pathname,
      isIOS: isIOS || false,
      hasSessionCookie,
      hasRememberCookie,
      hasToken: !!token,
      rememberTokenPreview: rememberValue ? `${rememberValue.substring(0, 20)}...` : 'none',
      timestamp: new Date().toISOString(),
    })

    // If no session cookie but remember token exists, re-issue session cookies (helps iOS PWA when cookies are dropped)
    if (!token) {
      const remember = request.cookies.get(REMEMBER_COOKIE)?.value
      if (remember) {
        try {
          const decoded = await decode({ token: remember, secret: JWT_SECRET })
          const exp = (decoded as any)?.exp
          const nowSeconds = Math.floor(Date.now() / 1000)
          if (exp && exp > nowSeconds) {
            const maxAge = Math.max(exp - nowSeconds, 5)
            console.log('[MIDDLEWARE] Reissuing session cookies from remember token:', {
              path: request.nextUrl.pathname,
              isIOS: isIOS || false,
              maxAgeSeconds: maxAge,
              expiresAt: new Date(exp * 1000).toISOString(),
            })
            const response = NextResponse.next()
            // Use SameSite=None; Secure for iOS PWA compatibility
            const isSecure = request.nextUrl.protocol === 'https:'
            response.cookies.set(SESSION_COOKIE, remember, {
              httpOnly: true,
              secure: isSecure,
              sameSite: isSecure ? 'none' : 'lax',
              maxAge,
              path: '/',
            })
            response.cookies.set(LEGACY_SESSION_COOKIE, remember, {
              httpOnly: true,
              secure: isSecure,
              sameSite: isSecure ? 'none' : 'lax',
              maxAge,
              path: '/',
            })
            token = decoded as any
            return response
          } else {
            console.warn('[MIDDLEWARE] Remember token expired:', {
              exp,
              nowSeconds,
              expired: exp <= nowSeconds,
            })
          }
        } catch (err) {
          console.warn('[MIDDLEWARE] Remember token decode failed', err)
        }
      } else {
        console.log('[MIDDLEWARE] No remember token found for restoration')
      }
    }

    // If we have a valid token, preserve it by adding stability headers
    if (token) {
      const response = NextResponse.next()

      // Refresh admin gate cookie so testers aren't booted back to the gate page
      response.cookies.set('passed_admin_gate', '1', {
        httpOnly: false,
        maxAge: ADMIN_GATE_COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:'
      })
      
      // Add headers to prevent session invalidation during deployments
      response.headers.set('X-Session-Preserved', 'true')
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      
      return response
    }
  } catch (error) {
    console.error('Middleware session check error:', error)
    // Continue without session preservation if there's an error
  }

  // Gate sign-in routes behind /healthapp admin check
  const pathname = request.nextUrl.pathname
  if (skipAdminGate && pathname === '/healthapp') {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/signin'
    return NextResponse.redirect(url)
  }
  // Never allow direct access to the temporary staging sign-in page
  if (pathname === '/staging-signin') {
    const url = request.nextUrl.clone()
    url.pathname = '/healthapp'
    return NextResponse.redirect(url)
  }
  const needsAdminGate = pathname === '/auth/signin'
  if (skipAdminGate && needsAdminGate) {
    return NextResponse.next()
  }
  const hasPassedGate = request.cookies.get('passed_admin_gate')?.value === '1'
  if (needsAdminGate && !hasPassedGate) {
    const url = request.nextUrl.clone()
    url.pathname = '/healthapp'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
