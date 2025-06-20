import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/components/providers/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Helfi - Personal Health Intelligence Platform',
  description: 'Track, analyze, and optimize your health with AI-powered insights.',
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
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
} 