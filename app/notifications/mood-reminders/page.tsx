import { redirect } from 'next/navigation'

export default function MoodRemindersRedirect({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams || {})) {
    const firstValue = Array.isArray(value) ? value[0] : value
    if (typeof firstValue === 'string' && firstValue) {
      params.set(key, firstValue)
    }
  }
  const query = params.toString()
  redirect(query ? `/notifications/reminders?${query}` : '/notifications/reminders')
}
