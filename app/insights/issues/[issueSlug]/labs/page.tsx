import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getIssueSection } from '@/lib/insights/issue-engine'
import SectionRenderer from '../SectionRenderer'

interface IssueLabsPageProps {
  params: { issueSlug: string }
}

export default async function IssueLabsPage({ params }: IssueLabsPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

  const result = await getIssueSection(session.user.id, params.issueSlug, 'labs')
  
  // Handle case where user has no bloodwork data
  if (!result) {
    // Return a friendly message instead of 404
    return (
      <div className="space-y-8">
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Labs & Bloodwork Insights</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            There is no labs or bloodwork currently in your health information data. 
            Upload your blood test results in Health Setup to receive personalized lab insights and recommendations.
          </p>
        </section>
      </div>
    )
  }

  return <SectionRenderer issueSlug={params.issueSlug} section="labs" initialResult={result} />
}
