import { redirect } from 'next/navigation'

interface NutritionPageProps {
  params: { issueSlug: string }
}

export default function NutritionPage({ params }: NutritionPageProps) {
  redirect(`/insights/issues/${params.issueSlug}/nutrition/working`)
}
