import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/components/providers/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Helfi - AI-Powered Personal Health Intelligence Platform | Supplement Tracking & Voice AI',
  description: 'Transform your health with Helfi\'s AI-powered platform. Track supplements, medications, and nutrition with voice commands. Get personalized health insights, detect dangerous interactions, and optimize your wellness journey. Free trial available.',
  keywords: [
    'AI health tracking',
    'supplement tracker',
    'medication interaction checker',
    'voice AI health assistant',
    'personal health intelligence',
    'nutrition tracking app',
    'health optimization platform',
    'supplement safety checker',
    'personalized health insights',
    'preventive healthcare AI',
    'wellness tracking app',
    'health data analytics',
    'smart supplement management',
    'AI nutrition analysis',
    'health pattern recognition'
  ].join(', '),
  authors: [{ name: 'Helfi Health Intelligence' }],
  creator: 'Helfi',
  publisher: 'Helfi',
  category: 'Health & Wellness',
  classification: 'Health Technology',
  robots: 'index, follow',
  googlebot: 'index, follow',
  icons: {
    icon: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
    shortcut: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
    apple: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://helfi.ai',
    siteName: 'Helfi - Personal Health Intelligence Platform',
    title: 'Helfi - AI-Powered Health Tracking with Voice Assistant',
    description: 'Optimize your health with AI-powered supplement tracking, medication interaction checking, and voice-activated health insights. Try free for 14 days.',
    images: [
      {
        url: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png',
        width: 1200,
        height: 630,
        alt: 'Helfi - AI-Powered Personal Health Intelligence Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@helfi_ai',
    creator: '@helfi_ai',
    title: 'Helfi - AI Health Tracking with Voice Assistant',
    description: 'Transform your health with AI-powered supplement tracking, interaction checking, and voice commands. Free 14-day trial.',
    images: ['https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png'],
  },
  verification: {
    google: 'REPLACE_WITH_YOUR_VERIFICATION_CODE', // Replace this with your actual Google Search Console verification code
  },
  alternates: {
    canonical: 'https://helfi.ai',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
} 