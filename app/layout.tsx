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
  manifest: '/manifest.json',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: '32x32',
        type: 'image/x-icon',
      },
      {
        url: '/icons/app-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/app-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Helfi" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL,GRAD@500,0,0"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Dark mode initialization - runs before React hydration to prevent flash.
              // IMPORTANT: Dark mode is only allowed inside the signed-in app.
              // Public pages (like / and /auth/*) should always render in light mode.
              (function() {
                try {
                  var path = (window && window.location && window.location.pathname) ? window.location.pathname : '';
                  var isPublic =
                    path === '/' ||
                    path === '/healthapp' ||
                    path === '/privacy' ||
                    path === '/terms' ||
                    path === '/help' ||
                    path === '/faq' ||
                    path.indexOf('/auth/') === 0 ||
                    path.indexOf('/staging-signin') === 0;

                  if (isPublic) {
                    document.documentElement.classList.remove('dark');
                    return;
                  }

                  var darkMode = localStorage.getItem('darkMode') === 'true';
                  document.documentElement.classList.toggle('dark', darkMode);
                } catch (e) {
                  // Ignore localStorage/cookie errors
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${inter.className}`}>
        <div
          id="helfi-splash"
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            autoPlay
            muted
            playsInline
            loop
            preload="auto"
            poster="/mobile-assets/STATIC%20SPLASH.png"
          >
            <source src="/mobile-assets/ANIMATED%20SPLASH.mp4" type="video/mp4" />
          </video>
        </div>
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
              (function() {
                try {
                  var splash = document.getElementById('helfi-splash');
                  if (!splash) return;
                  var show = function(opts) {
                    splash.style.display = 'flex';
                    splash.dataset.visible = '1';
                    if (opts && opts.targetUrl) {
                      try {
                        var target = new URL(opts.targetUrl, window.location.origin);
                        splash.dataset.targetPath = target.pathname;
                      } catch (e) {
                        delete splash.dataset.targetPath;
                      }
                    } else {
                      delete splash.dataset.targetPath;
                    }
                  };
                  var hide = function() {
                    splash.style.display = 'none';
                    splash.dataset.visible = '0';
                    delete splash.dataset.targetPath;
                  };
                  var getTargetPath = function() {
                    return splash.dataset.targetPath || '';
                  };
                  window.__helfiShowSplash = show;
                  window.__helfiHideSplash = hide;
                  window.__helfiGetSplashTargetPath = getTargetPath;

                  var path = (window && window.location && window.location.pathname) ? window.location.pathname : '';
                  var isPublic =
                    path === '/' ||
                    path === '/healthapp' ||
                    path === '/privacy' ||
                    path === '/terms' ||
                    path === '/help' ||
                    path === '/faq' ||
                    path.indexOf('/auth/') === 0 ||
                    path.indexOf('/affiliate/') === 0;

                  var isPwa = false;
                  try {
                    isPwa =
                      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                      window.navigator.standalone === true;
                  } catch (e) {}

                  if (isPublic || !isPwa) {
                    hide();
                  }
                } catch (e) {
                  // Ignore splash errors
                }
              })();

              // Register service worker for push notifications
              (function(){
                try {
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/sw.js').catch(function(err) {
                      console.log('Service worker registration failed:', err);
                    });
                    navigator.serviceWorker.addEventListener('message', function(event) {
                      try {
                        var data = event && event.data ? event.data : null;
                        if (!data || !data.type) return;
                        if (data.type === 'splash' && data.url) {
                          try {
                            if (typeof window.__helfiShowSplash === 'function') {
                              window.__helfiShowSplash({ targetUrl: data.url, reason: 'notification' });
                            }
                          } catch (e) {}
                          return;
                        }
                        if (data.type !== 'navigate' || !data.url) return;
                        var target = new URL(data.url, window.location.origin);
                        if (target.origin !== window.location.origin) return;
                        if (window.location.href === target.href) return;
                        try {
                          if (typeof window.__helfiShowSplash === 'function') {
                            window.__helfiShowSplash({ targetUrl: target.href, reason: 'notification' });
                          }
                        } catch (e) {}
                        if (typeof window.__helfiNavigate === 'function') {
                          window.__helfiNavigate(target.href);
                          return;
                        }
                        window.location.href = target.href;
                      } catch (e) {
                        // Ignore navigation message errors
                      }
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
