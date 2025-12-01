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

              // Pre-hydration refresh trigger to avoid Safari/PWA cookie eviction on resume.
              (function() {
                try {
                  const REMEMBER_FLAG = 'helfi:rememberMe';
                  if (!localStorage.getItem(REMEMBER_FLAG)) {
                    localStorage.setItem(REMEMBER_FLAG, '1');
                  }
                  const cachedToken = localStorage.getItem('helfi:refreshToken') || localStorage.getItem('helfi:rememberToken')
                  const cachedExp = parseInt(localStorage.getItem('helfi:rememberTokenExp') || '0', 10)

                  const pingServiceWorker = () => {
                    const message = { type: 'REFRESH_SESSION_NOW' };
                    if (navigator.serviceWorker?.controller) {
                      navigator.serviceWorker.controller.postMessage(message);
                    } else if (navigator.serviceWorker?.ready) {
                      navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(message)).catch(() => {});
                    }
                    if (cachedToken) {
                      const setMessage = { type: 'SET_REFRESH_TOKEN', token: cachedToken, exp: cachedExp || 0 }
                      if (navigator.serviceWorker?.controller) {
                        navigator.serviceWorker.controller.postMessage(setMessage)
                      } else if (navigator.serviceWorker?.ready) {
                        navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(setMessage)).catch(() => {});
                      }
                    }
                  };
                  pingServiceWorker();
                  window.addEventListener('pageshow', pingServiceWorker);
                  window.addEventListener('focus', pingServiceWorker);
                  document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') pingServiceWorker();
                  });
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
