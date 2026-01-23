import { redirect } from 'next/navigation'

export default function HealthRemindersRedirect() {
  redirect('/notifications/reminders')
}
