import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public access to these routes
  const publicRoutes = [
    '/',
    '/api/waitlist',
    '/api/auth',
    '/favicon.ico',
    '/_next',
    '/public'
  ]

  // Check if the current path should be public
  const isPublicRoute = publicRoutes.some(route => 
    pathname.startsWith(route) || pathname === route
  )

  if (isPublicRoute) {
    return NextResponse.next()
  }

  // For protected routes, continue with normal processing
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
} 