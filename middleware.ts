import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  // Skip middleware for static files and API routes that don't need auth
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.startsWith('/staging-signin') ||
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
      
      // Add headers to prevent session invalidation during deployments
      response.headers.set('X-Session-Preserved', 'true')
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      
      return response
    }
  } catch (error) {
    console.error('Middleware session check error:', error)
    // Continue without session preservation if there's an error
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