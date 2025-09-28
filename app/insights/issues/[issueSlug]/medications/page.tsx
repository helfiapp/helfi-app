import { redirect } from 'next/navigation'

interface MedicationsPageProps {
  params: { issueSlug: string }
}

export default function MedicationsPage({ params }: MedicationsPageProps) {
  redirect(`/insights/issues/${params.issueSlug}/medications/working`)
}
