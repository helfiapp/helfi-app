import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Helfi Admin Panel',
  manifest: '/main-admin/manifest.json',
}

export default function MainAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  return <>{children}</>
}

