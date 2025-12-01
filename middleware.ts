import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { decode } from 'next-auth/jwt'

const ADMIN_GATE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const REMEMBER_COOKIE = 'helfi-remember-token'
const SESSION_COOKIE = '__Secure-next-auth.session-token'
const LEGACY_SESSION_COOKIE = 'next-auth.session-token'
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
const REMEMBER_HEADER = 'x-helfi-remember-token'

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

    // If no session cookie, try remember token from cookie or header and re-issue session cookies
    if (!token) {
      const remember = request.cookies.get(REMEMBER_COOKIE)?.value || request.headers.get(REMEMBER_HEADER) || ''
      if (remember) {
        try {
          const decoded = await decode({ token: remember, secret: JWT_SECRET })
          const exp = (decoded as any)?.exp
          const nowSeconds = Math.floor(Date.now() / 1000)
          if (exp && exp > nowSeconds) {
            const maxAge = Math.max(exp - nowSeconds, 5)
            const response = NextResponse.next()
            response.cookies.set(SESSION_COOKIE, remember, {
              httpOnly: true,
              secure: request.nextUrl.protocol === 'https:',
              sameSite: 'lax',
              maxAge,
              path: '/',
            })
            response.cookies.set(LEGACY_SESSION_COOKIE, remember, {
              httpOnly: true,
              secure: request.nextUrl.protocol === 'https:',
              sameSite: 'lax',
              maxAge,
              path: '/',
            })
            token = decoded as any
            return response
          }
        } catch (err) {
          console.warn('Remember token decode failed', err)
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

  const pathname = request.nextUrl.pathname
  // Allow authenticated users to land on /healthapp without redirecting to signin
  if (pathname === '/healthapp') {
    if (token) {
      return NextResponse.next()
    }
    if (skipAdminGate) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/signin'
      return NextResponse.redirect(url)
    }
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
