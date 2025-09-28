import { redirect } from 'next/navigation'

interface ExercisePageProps {
  params: { issueSlug: string }
}

export default function ExercisePage({ params }: ExercisePageProps) {
  redirect(`/insights/issues/${params.issueSlug}/exercise/working`)
}
