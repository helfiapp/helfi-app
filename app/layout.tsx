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
                  let remembered = localStorage.getItem(REMEMBER_FLAG) === '1'
                  const email = (localStorage.getItem(REMEMBER_EMAIL) || '').trim().toLowerCase()
                  const ensureRememberedFlag = () => {
                    try {
                      localStorage.setItem(REMEMBER_FLAG, '1')
                      remembered = true
                    } catch {}
                  }
                  ensureRememberedFlag()
                  if (!remembered || !email) return

                  const now = Date.now()
                  const manualSignOutAt = parseInt(localStorage.getItem(LAST_MANUAL_SIGNOUT) || '0', 10)
                  if (manualSignOutAt && now - manualSignOutAt < 5 * 60 * 1000) return

                  const lastRestoreAt = parseInt(localStorage.getItem(LAST_SESSION_RESTORE) || '0', 10)
                  if (now - lastRestoreAt < 15_000) return

                  const token = localStorage.getItem(REMEMBER_TOKEN) || ''
                  const tokenExp = parseInt(localStorage.getItem(REMEMBER_TOKEN_EXP) || '0', 10)
                  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : ''
                  const hasSessionCookie = document.cookie.includes('__Secure-next-auth.session-token') || document.cookie.includes('next-auth.session-token')
                  const reissueSession = async () => {
                    try {
                      const res = await fetch('/api/auth/signin-direct', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ email, rememberMe: true })
                      })
                      if (res.ok) {
                        localStorage.setItem(LAST_SESSION_RESTORE, Date.now().toString())
                        localStorage.removeItem(LAST_MANUAL_SIGNOUT)
                      } else if (res.status === 401) {
                        localStorage.removeItem(REMEMBER_FLAG)
                        localStorage.removeItem(REMEMBER_EMAIL)
                      }
                    } catch {}
                  }

                  if (token) {
                    const msLeft = tokenExp ? Math.max(tokenExp - now, 5_000) : 5 * 365 * 24 * 60 * 60 * 1000
                    const maxAgeSeconds = Math.floor(msLeft / 1000)
                    document.cookie = \`__Secure-next-auth.session-token=\${token}; path=/; max-age=\${maxAgeSeconds}; SameSite=Lax\${secureFlag}\`
                    document.cookie = \`next-auth.session-token=\${token}; path=/; max-age=\${maxAgeSeconds}; SameSite=Lax\${secureFlag}\`
                    localStorage.setItem(LAST_SESSION_RESTORE, now.toString())
                    localStorage.removeItem(LAST_MANUAL_SIGNOUT)
                    if (!hasSessionCookie) {
                      reissueSession()
                    }
                    return
                  }

                  fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
                    .then((res) => Promise.all([res.ok, res.json().catch(() => null)]))
                    .then(async ([ok, data]) => {
                      const hasSession = ok && data && data.user
                      if (hasSession) return

                      const res = await fetch('/api/auth/signin-direct', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ email, rememberMe: true })
                      })

                      if (res.ok) {
                        localStorage.setItem(LAST_SESSION_RESTORE, Date.now().toString())
                        localStorage.removeItem(LAST_MANUAL_SIGNOUT)
                      } else if (res.status === 401) {
                        localStorage.removeItem(REMEMBER_FLAG)
                        localStorage.removeItem(REMEMBER_EMAIL)
                      }
                    })
                    .catch(() => {})
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
