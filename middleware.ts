import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { decode, encode } from 'next-auth/jwt'

const ADMIN_GATE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const SESSION_COOKIE = '__Secure-next-auth.session-token'
const LEGACY_SESSION_COOKIE = 'next-auth.session-token'
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
const REFRESH_HEADER = 'x-helfi-refresh-token'
const REMEMBER_COOKIE = 'helfi-remember-token'

async function encodeSessionLike(decoded: any, maxAge: number) {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return encode({
    token: {
      sub: decoded?.sub,
      id: decoded?.id || decoded?.sub,
      email: decoded?.email,
      name: decoded?.name,
      image: decoded?.image,
      iat: nowSeconds,
      exp: nowSeconds + maxAge,
    },
    secret: JWT_SECRET,
    maxAge,
  })
}

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

    // If no session cookie but a refresh token header exists, re-issue session cookies (used by SW/IDB flow)
    if (!token) {
      const refreshToken = request.headers.get(REFRESH_HEADER)
      const rememberToken = request.cookies.get(REMEMBER_COOKIE)?.value

      const candidateToken = refreshToken || rememberToken

      if (candidateToken) {
        try {
          const decoded = await decode({ token: candidateToken, secret: JWT_SECRET })
          const exp = (decoded as any)?.exp
          const nowSeconds = Math.floor(Date.now() / 1000)
          if (exp && exp > nowSeconds) {
            const maxAge = Math.max(Math.min(exp - nowSeconds, 7 * 24 * 60 * 60), 5)
            const response = NextResponse.next()
            const sameSite = request.nextUrl.protocol === 'https:' ? 'none' : 'lax'
            const sessionToken = await encodeSessionLike(decoded as any, maxAge)
            if (!sessionToken) {
              return response
            }
            response.cookies.set(SESSION_COOKIE, sessionToken, {
              httpOnly: true,
              secure: request.nextUrl.protocol === 'https:',
              sameSite,
              maxAge,
              path: '/',
            })
            response.cookies.set(LEGACY_SESSION_COOKIE, sessionToken, {
              httpOnly: true,
              secure: request.nextUrl.protocol === 'https:',
              sameSite,
              maxAge,
              path: '/',
            })
            token = decoded as any
            return response
          }
        } catch (err) {
          console.warn('Refresh/remember token decode failed', err)
        }
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
