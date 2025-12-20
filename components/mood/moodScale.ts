export const MOOD_LEVELS = [
  { value: 1, label: 'Very low', color: '#ef4444' },
  { value: 2, label: 'Low', color: '#f97316' },
  { value: 3, label: 'A bit low', color: '#f59e0b' },
  { value: 4, label: 'Neutral', color: '#eab308' },
  { value: 5, label: 'A bit high', color: '#84cc16' },
  { value: 6, label: 'High', color: '#22c55e' },
  { value: 7, label: 'Very high', color: '#16a34a' },
] as const

export type MoodValue = (typeof MOOD_LEVELS)[number]['value']

export const DEFAULT_MOOD_TAGS = [
  'Calm',
  'Focused',
  'Motivated',
  'Anxious',
  'Irritable',
  'Energised',
  'Flat',
  'Social',
  'Overwhelmed',
] as const

