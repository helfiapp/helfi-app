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
