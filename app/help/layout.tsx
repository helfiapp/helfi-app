import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help & Support | Helfi',
  description: 'Get support with your Helfi account and app usage.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
