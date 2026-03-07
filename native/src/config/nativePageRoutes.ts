export type NativeWebPageKey =
  | 'talkToHelfi'
  | 'healthJournal'
  | 'symptomAnalysis'
  | 'medicalImageAnalyzer'
  | 'healthIntake'
  | 'dailyCheckIn'
  | 'moodTracker'

export type NativeWebPageRoute = {
  title: string
  path: string
}

export const NATIVE_WEB_PAGES: Record<NativeWebPageKey, NativeWebPageRoute> = {
  talkToHelfi: {
    title: 'Talk to Helfi',
    path: '/chat',
  },
  healthJournal: {
    title: 'Health Journal',
    path: '/health-journal',
  },
  symptomAnalysis: {
    title: 'Symptom Analysis',
    path: '/symptoms',
  },
  medicalImageAnalyzer: {
    title: 'Medical Image Analyzer',
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
}
