import { NextRequest, NextResponse } from 'next/server'

const readBaseUrl = (request: NextRequest) => {
  const requestOrigin = request.nextUrl.origin.replace(/\/+$/, '')
  // In local simulator testing, keep OAuth on localhost.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin)) {
    return requestOrigin
  }

  const envBase = String(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (envBase) return envBase.replace(/\/+$/, '')
  return requestOrigin
}

const isAppleConfigured = () => {
  const clientId = String(process.env.APPLE_CLIENT_ID || '').trim()
  const teamId = String(process.env.APPLE_TEAM_ID || '').trim()
  const keyId = String(process.env.APPLE_KEY_ID || '').trim()
  const privateKey = String(process.env.APPLE_PRIVATE_KEY || '').trim()
  return Boolean(clientId && teamId && keyId && privateKey)
}

const isGoogleConfigured = () => {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim()
  return Boolean(clientId && clientSecret)
}

const completeUrl = (baseUrl: string) => `${baseUrl}/api/native-auth/oauth/complete`

const autoPostHtml = (params: {
  baseUrl: string
  provider: 'google' | 'apple'
  callbackUrl: string
  mode: 'signin' | 'signup'
}) => {
  const { baseUrl, provider, callbackUrl, mode } = params
  const action = `${baseUrl}/api/auth/signin/${provider}`

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Helfi sign in</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f7faf9; color: #0b1f1b; padding: 32px; }
      .card { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #dbe8e2; border-radius: 14px; padding: 20px; }
      .muted { font-size: 14px; color: #607d75; }
      .btn { display: inline-block; margin-top: 12px; padding: 10px 14px; background: #43a047; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 700; border: 0; }
      .hidden { display: none; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Connecting to ${provider === 'apple' ? 'Apple' : 'Google'}...</h2>
      <p class="muted">If this takes too long, tap continue.</p>
      <form id="oauthForm" method="post" action="${action}">
        <input id="csrfToken" type="hidden" name="csrfToken" value="" />
        <input type="hidden" name="callbackUrl" value="${callbackUrl}" />
        <input type="hidden" name="native" value="1" />
        <input type="hidden" name="mode" value="${mode}" />
        <button id="continueBtn" class="btn" type="button">Continue</button>
      </form>
      <p id="errorText" class="muted hidden">Could not start sign in automatically. Tap continue.</p>
    </div>
    <script>
      (async function () {
        const continueBtn = document.getElementById('continueBtn');
        let submitting = false;

        async function startAuth() {
          if (submitting) return;
          submitting = true;
          if (continueBtn) continueBtn.setAttribute('disabled', 'true');
          if (continueBtn) continueBtn.textContent = 'Connecting...';

          try {
            const csrfRes = await fetch(${JSON.stringify(`${baseUrl}/api/auth/csrf`)}, { credentials: 'include' });
            const csrfData = await csrfRes.json();
            const token = String(csrfData?.csrfToken || '').trim();
            if (!token) throw new Error('Missing csrf token');
            document.getElementById('csrfToken').value = token;
            document.getElementById('oauthForm').submit();
          } catch (err) {
            const el = document.getElementById('errorText');
            if (el) el.className = 'muted';
            submitting = false;
            if (continueBtn) continueBtn.removeAttribute('disabled');
            if (continueBtn) continueBtn.textContent = 'Continue';
          }
        }

        window.__helfiStartAuth = startAuth;
        if (continueBtn) {
          continueBtn.addEventListener('click', function () {
            void startAuth();
          });
        }

        try {
          await startAuth();
        } catch (err) {
          const el = document.getElementById('errorText');
          if (el) el.className = 'muted';
        }
      })();
    </script>
  </body>
</html>`
}

const errorHtml = (message: string) => {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Helfi sign in</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f7faf9; color: #0b1f1b; padding: 32px; }
      .card { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #dbe8e2; border-radius: 14px; padding: 20px; }
      .btn { display: inline-block; margin-top: 12px; padding: 10px 14px; background: #43a047; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Sign in is not available right now</h2>
      <p>${message}</p>
      <a class="btn" href="helfi://auth-complete?error=provider_not_available">Return to Helfi app</a>
    </div>
  </body>
</html>`
}

export async function GET(request: NextRequest) {
  const providerRaw = String(request.nextUrl.searchParams.get('provider') || '')
    .trim()
    .toLowerCase()
  const modeRaw = String(request.nextUrl.searchParams.get('mode') || 'signin')
    .trim()
    .toLowerCase()
  const provider = providerRaw === 'apple' ? 'apple' : providerRaw === 'google' ? 'google' : null
  const mode = modeRaw === 'signup' ? 'signup' : 'signin'

  if (!provider) {
    return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 })
  }

  if (provider === 'apple' && !isAppleConfigured()) {
    return new NextResponse(
      errorHtml('Apple sign in is not configured on this environment yet. Please use Google or email for now.'),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  if (provider === 'google' && !isGoogleConfigured()) {
    return new NextResponse(
      errorHtml('Google sign in is not configured on this environment yet. Please use email for now.'),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  const baseUrl = readBaseUrl(request)
  const callbackUrl = completeUrl(baseUrl)
  return new NextResponse(
    autoPostHtml({ baseUrl, provider, callbackUrl, mode }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}
