import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import NutritionShell from './NutritionShell'

interface NutritionLayoutProps {
  children: ReactNode
  params: { issueSlug: string }
}

export default async function NutritionLayout({ children, params }: NutritionLayoutProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'nutrition')
  if (!result) {
    notFound()
  }

  return (
    <NutritionShell initialResult={result} issueSlug={params.issueSlug}>
      {children}
    </NutritionShell>
  )
}
