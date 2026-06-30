export type NativeWebPageKey =
  | 'talkToHelfi'
  | 'chatHistory'
  | 'healthJournal'
  | 'symptomNotes'
  | 'healthImageNotes'
  | 'healthIntake'
  | 'dailyCheckIn'
  | 'moodTracker'
  | 'labReports'
  | 'devices'
  | 'healthTips'
  | 'healthTipsHistory'
  | 'notificationDelivery'
  | 'healthReminders'
  | 'moodReminders'
  | 'help'
  | 'faq'
  | 'affiliate'
  | 'affiliateApply'
  | 'affiliateTerms'

export type NativeWebPageRoute = {
  title: string
  path: string
}

export const NATIVE_WEB_PAGES: Record<NativeWebPageKey, NativeWebPageRoute> = {
  talkToHelfi: {
    title: 'Talk to Helfi',
    path: '/chat',
  },
  chatHistory: {
    title: 'Chat History',
    path: '/chat?history=1',
  },
  healthJournal: {
    title: 'Health Journal',
    path: '/health-journal',
  },
  symptomNotes: {
    title: 'Symptom Notes',
    path: '/symptoms',
  },
  healthImageNotes: {
    title: 'Health Image Notes',
    path: '/medical-images',
  },
  healthIntake: {
    title: 'Health Intake',
    path: '/onboarding?step=1',
  },
  dailyCheckIn: {
    title: "Today's Check-in",
    path: '/check-in',
  },
  moodTracker: {
    title: 'Mood Tracker',
    path: '/mood',
  },
  labReports: {
    title: 'Lab Reports',
    path: '/lab-reports',
  },
  devices: {
    title: 'Devices',
    path: '/devices',
  },
  healthTips: {
    title: 'Health Tips',
    path: '/health-tips',
  },
  healthTipsHistory: {
    title: 'Health Tips History',
    path: '/health-tips/history',
  },
  notificationDelivery: {
    title: 'Notification Delivery',
    path: '/notifications/delivery',
  },
  healthReminders: {
    title: 'Health Reminders',
    path: '/notifications/health-reminders',
  },
  moodReminders: {
    title: 'Mood Reminders',
    path: '/notifications/mood-reminders',
  },
  help: {
    title: 'Help & Support',
    path: '/help',
  },
  faq: {
    title: 'FAQ',
    path: '/faq',
  },
  affiliate: {
    title: 'Affiliate Program',
    path: '/affiliate',
  },
  affiliateApply: {
    title: 'Affiliate Application',
    path: '/affiliate/apply',
  },
  affiliateTerms: {
    title: 'Affiliate Terms',
    path: '/affiliate/terms',
  },
}
