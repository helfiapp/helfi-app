import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { encode } from 'next-auth/jwt'

import { authOptions } from '@/lib/auth'

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderRedirectPage = (targetUrl: string, title: string, message: string) => {
  const safeTarget = escapeHtml(targetUrl)
  const safeTitle = escapeHtml(title)
  const safeMessage = escapeHtml(message)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f7faf9; color: #0b1f1b; padding: 32px; }
      .card { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #dbe8e2; border-radius: 14px; padding: 20px; }
      .btn { display: inline-block; margin-top: 12px; padding: 10px 14px; background: #43a047; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 700; }
      .muted { margin-top: 8px; font-size: 13px; color: #607d75; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${safeTitle}</h2>
      <p>${safeMessage}</p>
      <a class="btn" href="${safeTarget}">Return to Helfi app</a>
      <p class="muted">If nothing happens, tap the button above.</p>
    </div>
    <script>
      window.location.replace(${JSON.stringify(targetUrl)});
    </script>
  </body>
</html>`
}

const mapOAuthError = (rawError: string) => {
  const value = rawError.trim()
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'oauthsignin') return 'oauth_signin_failed'
  if (normalized === 'oauthcallback') return 'oauth_callback_failed'
  if (normalized === 'accessdenied') return 'oauth_access_denied'
  if (normalized === 'configuration') return 'oauth_config_error'
  if (normalized === 'callback') return 'oauth_callback_failed'
  return value
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url)
    const rawError = String(requestUrl.searchParams.get('error') || '')
    const mappedError = mapOAuthError(rawError)
    if (mappedError) {
      return new NextResponse(
        renderRedirectPage(
          `helfi://auth-complete?error=${encodeURIComponent(mappedError)}`,
          'Sign in failed',
          'Sign in could not be completed. Please try again.',
        ),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }

    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
    if (!secret) {
      return new NextResponse(
        renderRedirectPage(
          'helfi://auth-complete?error=missing_secret',
          'Sign in failed',
          'Server sign in configuration is missing. Please try again later.',
        ),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }

    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    const email = session?.user?.email
    const name = session?.user?.name || null
    const image = session?.user?.image || null

    if (!userId || !email) {
      return new NextResponse(
        renderRedirectPage(
          'helfi://auth-complete?error=missing_session',
          'Sign in not completed',
          'We could not find your session after sign in. Please try again.',
        ),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const exp = nowSeconds + SESSION_MAX_AGE_SECONDS
    const token = await encode({
      token: {
        sub: userId,
        id: userId,
        email,
        name: name || String(email).split('@')[0],
        image,
        iat: nowSeconds,
        exp,
      },
      secret,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    const params = new URLSearchParams()
    params.set('token', token)
    params.set('expiresAt', String(exp * 1000))
    params.set('id', userId)
    params.set('email', email)
    if (name) params.set('name', String(name))
    if (image) params.set('image', String(image))

    const targetUrl = `helfi://auth-complete?${params.toString()}`
    return new NextResponse(
      renderRedirectPage(
        targetUrl,
        'Sign in complete',
        'You are signed in. Returning to Helfi app now.',
      ),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  } catch (error) {
    console.error('Native OAuth complete failed:', error)
    return new NextResponse(
      renderRedirectPage(
        'helfi://auth-complete?error=oauth_complete_failed',
        'Sign in failed',
        'Something went wrong while finishing sign in. Please try again.',
      ),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }
}
