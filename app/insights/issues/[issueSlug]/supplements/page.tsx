import { redirect } from 'next/navigation'

interface SupplementsPageProps {
  params: { issueSlug: string }
}

export default function SupplementsPage({ params }: SupplementsPageProps) {
  redirect(`/insights/issues/${params.issueSlug}/supplements/working`)
}
