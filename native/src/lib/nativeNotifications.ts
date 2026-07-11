import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

type ReminderSettings = {
  enabled: boolean
  frequency: number
  time1: string
  time2: string
  time3: string
  time4: string
}

const CATEGORY_PREFIX = 'helfi-reminder:'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function getNativeNotificationsEnabled() {
  const permissions = await Notifications.getPermissionsAsync()
  return permissions.granted === true
}

export async function enableNativeNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('helfi-reminders', {
      name: 'Helfi reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  const requested = await Notifications.requestPermissionsAsync()
  return requested.granted === true
}

export async function clearNativeReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      .filter((item) => String(item.content.data?.helfiId || '').startsWith(CATEGORY_PREFIX))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  )
}

function reminderTimes(settings: ReminderSettings) {
  return [settings.time1, settings.time2, settings.time3, settings.time4]
    .slice(0, Math.max(1, Math.min(4, Number(settings.frequency) || 1)))
    .map((value) => String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ hour: Number(match[1]), minute: Number(match[2]) }))
}

export async function scheduleNativeReminders(checkins: ReminderSettings, mood: ReminderSettings) {
  await clearNativeReminders()
  if (!(await getNativeNotificationsEnabled())) return

  const groups = [
    { key: 'checkin', title: "Today's Helfi check-in", body: 'Take a moment to record how you are feeling.', settings: checkins },
    { key: 'mood', title: 'Mood check-in', body: 'How are you feeling right now?', settings: mood },
  ]

  for (const group of groups) {
    if (!group.settings.enabled) continue
    const times = reminderTimes(group.settings)
    for (let index = 0; index < times.length; index += 1) {
      const time = times[index]
      await Notifications.scheduleNotificationAsync({
        content: {
          title: group.title,
          body: group.body,
          sound: true,
          data: { helfiId: `${CATEGORY_PREFIX}${group.key}:${index}`, screen: group.key === 'mood' ? 'MoodTracker' : 'DailyCheckIn' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: time.hour,
          minute: time.minute,
          channelId: Platform.OS === 'android' ? 'helfi-reminders' : undefined,
        },
      })
    }
  }
}
