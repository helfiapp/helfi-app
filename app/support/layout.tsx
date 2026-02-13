import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support | Helfi',
  description: 'Contact Helfi support for account and product help.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
