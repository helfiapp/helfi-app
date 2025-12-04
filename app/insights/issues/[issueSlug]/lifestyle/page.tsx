import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import SectionRenderer from '../SectionRenderer'

interface IssueLifestylePageProps {
  params: { issueSlug: string }
}

export default async function IssueLifestylePage({ params }: IssueLifestylePageProps) {
  // Lifestyle has been folded into Overview; redirect to Overview for this issue
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }
  redirect(`/insights/issues/${params.issueSlug}/overview`)
}
