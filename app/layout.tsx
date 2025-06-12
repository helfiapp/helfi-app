import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/components/providers/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Helfi - Personal Health Intelligence Platform',
  description: 'Track, analyze, and optimize your health with AI-powered insights.',
  icons: {
    icon: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
    shortcut: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
    apple: 'https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/FAVICON_ntiqz6.png',
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