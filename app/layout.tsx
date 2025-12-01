import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { UserDataProvider } from '@/components/providers/UserDataProvider'
import LayoutWrapper from '@/components/LayoutWrapper'
import type { Metadata } from 'next'

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Helfi - Your AI Health Intelligence Platform',
  description: 'Transform your health with personalized AI insights, comprehensive tracking, and intelligent recommendations.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  icons: {
    icon: [
      {
        url: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
        sizes: '16x16',
        type: 'image/png',
      }
    ],
    apple: {
      url: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
      sizes: '180x180',
      type: 'image/png',
    }
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Dark mode initialization - runs before React hydration to prevent flash
              (function() {
                try {
                  const darkMode = localStorage.getItem('darkMode') === 'true';
                  if (darkMode) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {
                  // Ignore localStorage errors in SSR
                }
              })();

              // Pre-hydration remember-me restore to avoid Safari/PWA cookie eviction on resume
              (function() {
                try {
                  const REMEMBER_FLAG = 'helfi:rememberMe'
                  const REMEMBER_EMAIL = 'helfi:rememberEmail'
                  const REMEMBER_TOKEN = 'helfi:rememberToken'
                  const REMEMBER_TOKEN_EXP = 'helfi:rememberTokenExp'
                  const LAST_MANUAL_SIGNOUT = 'helfi:lastManualSignOut'
                  const LAST_SESSION_RESTORE = 'helfi:lastSessionRestore'
                  
                  // Logging for iOS PWA logout debugging
                  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
                  const visibilityState = document.visibilityState
                  const hasSessionCookie = document.cookie.includes('__Secure-next-auth.session-token') || document.cookie.includes('next-auth.session-token')
                  const hasRememberCookie = document.cookie.includes('helfi-remember-token')
                  
                  let remembered = localStorage.getItem(REMEMBER_FLAG) === '1'
                  const email = (localStorage.getItem(REMEMBER_EMAIL) || '').trim().toLowerCase()
                  const token = localStorage.getItem(REMEMBER_TOKEN) || ''
                  const tokenExp = parseInt(localStorage.getItem(REMEMBER_TOKEN_EXP) || '0', 10)
                  
                  console.log('[PRE-HYDRATION] Resume check:', {
                    isIOS: isIOS || false,
                    visibilityState: visibilityState,
                    hasSessionCookie: hasSessionCookie,
                    hasRememberCookie: hasRememberCookie,
                    hasRememberFlag: remembered,
                    hasEmail: !!email,
                    hasToken: !!token,
                    tokenExpired: tokenExp ? Date.now() > tokenExp : true,
                    timestamp: new Date().toISOString(),
                  })
                  
                  const ensureRememberedFlag = () => {
                    try {
                      localStorage.setItem(REMEMBER_FLAG, '1')
                      remembered = true
                    } catch {}
                  }
                  ensureRememberedFlag()
                  if (!remembered || !email) {
                    console.log('[PRE-HYDRATION] Skipping restore - no remember flag or email')
                    return
                  }

                  const now = Date.now()
                  const manualSignOutAt = parseInt(localStorage.getItem(LAST_MANUAL_SIGNOUT) || '0', 10)
                  if (manualSignOutAt && now - manualSignOutAt < 5 * 60 * 1000) {
                    console.log('[PRE-HYDRATION] Skipping restore - recent manual signout')
                    return
                  }

                  const lastRestoreAt = parseInt(localStorage.getItem(LAST_SESSION_RESTORE) || '0', 10)
                  const canRetry = () => {
                    const diff = Date.now() - parseInt(localStorage.getItem(LAST_SESSION_RESTORE) || '0', 10)
                    return diff > 2_000
                  }

                  const reissueSession = async () => {
                    if (!canRetry()) {
                      console.log('[PRE-HYDRATION] Skipping reissue - throttled')
                      return
                    }
                    try {
                      const useRestore = !!token
                      const payload = useRestore ? { token } : { email, rememberMe: true }
                      const endpoint = useRestore ? '/api/auth/restore' : '/api/auth/signin-direct'
                      console.log('[PRE-HYDRATION] Attempting session restore:', {
                        endpoint: endpoint,
                        method: useRestore ? 'restore' : 'signin-direct',
                        hasToken: !!token,
                      })
                      const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify(payload)
                      })
                      if (res.ok) {
                        console.log('[PRE-HYDRATION] Session restore successful')
                        localStorage.setItem(LAST_SESSION_RESTORE, Date.now().toString())
                        localStorage.removeItem(LAST_MANUAL_SIGNOUT)
                      } else if (res.status === 401) {
                        console.warn('[PRE-HYDRATION] Session restore failed - 401 unauthorized')
                        localStorage.removeItem(REMEMBER_FLAG)
                        localStorage.removeItem(REMEMBER_EMAIL)
                      } else {
                        console.warn('[PRE-HYDRATION] Session restore failed:', res.status)
                      }
                    } catch (err) {
                      console.error('[PRE-HYDRATION] Session restore error:', err)
                    }
                  }

                  if (token && tokenExp) {
                    // Client-side cookie setting cannot properly set SameSite=None
                    // Must use server-side endpoint to set cookies with proper SameSite=None; Secure
                    console.log('[PRE-HYDRATION] Token found, calling server restore endpoint:', {
                      hasToken: !!token,
                      tokenExpired: now > tokenExp,
                    })
                    if (!hasSessionCookie) {
                      console.log('[PRE-HYDRATION] No session cookie found, calling reissueSession')
                      reissueSession()
                    }
                    return
                  }

                  fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
                    .then((res) => Promise.all([res.ok, res.json().catch(() => null)]))
                    .then(async ([ok, data]) => {
                      const hasSession = ok && data && data.user
                      console.log('[PRE-HYDRATION] Session check result:', {
                        hasSession: hasSession,
                        ok: ok,
                        hasUser: !!data?.user,
                      })
                      if (hasSession) return
                      if (canRetry()) {
                        await reissueSession()
                      }
                    })
                    .catch((err) => {
                      console.error('[PRE-HYDRATION] Session check error:', err)
                    })

                  const bindResume = () => {
                    const handler = () => reissueSession()
                    window.addEventListener('pageshow', handler)
                    window.addEventListener('focus', handler)
                    document.addEventListener('visibilitychange', () => {
                      if (document.visibilityState === 'visible') reissueSession()
                    })
                  }
                  bindResume()
                } catch (e) {
                  // Ignore restore issues so login page still renders
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${inter.className}`}>
        <AuthProvider>
          <UserDataProvider>
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </UserDataProvider>
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Register service worker for push notifications
              (function(){
                try {
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/sw.js').catch(function(err) {
                      console.log('Service worker registration failed:', err);
                    });
                  }
                } catch (e) {
                  console.log('Service worker not supported:', e);
                }
              })();

              // Global dark mode toggle function
              window.toggleDarkMode = function(enabled) {
                try {
                  localStorage.setItem('darkMode', enabled.toString());
                  document.documentElement.classList.toggle('dark', enabled);
                  
                  // Dispatch custom event to sync all pages
                  window.dispatchEvent(new CustomEvent('darkModeChanged', { detail: enabled }));
                } catch (e) {
                  console.error('Dark mode error:', e);
                }
              };
              
              // Listen for dark mode changes
              window.addEventListener('darkModeChanged', function(e) {
                document.documentElement.classList.toggle('dark', e.detail);
              });
            `,
          }}
        />
      </body>
    </html>
  )
} 
