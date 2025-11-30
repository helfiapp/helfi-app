import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const ADMIN_GATE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

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
    const token = await getToken({ 
      req: request, 
      secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024',
      // Use a stable encryption key to prevent session invalidation
      cookieName: process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token' 
        : 'next-auth.session-token'
    })

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
