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

export const MOOD_FACE_OPTIONS = [
  { value: 1, label: 'Terrible', emoji: '😡' },
  { value: 2, label: 'Bad', emoji: '😞' },
  { value: 3, label: 'Meh', emoji: '😕' },
  { value: 4, label: 'Okay', emoji: '😐' },
  { value: 5, label: 'Good', emoji: '🙂' },
  { value: 6, label: 'Great', emoji: '😄' },
  { value: 7, label: 'Amazing', emoji: '🤩' },
] as const

export type MoodFaceOption = (typeof MOOD_FACE_OPTIONS)[number]

export function emojiForMoodValue(value: number) {
  return MOOD_FACE_OPTIONS.find((o) => o.value === value)?.emoji ?? '🙂'
}

export const DEFAULT_MOOD_TAGS = [
  { label: 'Calm', emoji: '😌' },
  { label: 'Focused', emoji: '🤓' },
  { label: 'Motivated', emoji: '😤' },
  { label: 'Anxious', emoji: '😰' },
  { label: 'Stressed', emoji: '😫' },
  { label: 'Sad', emoji: '😢' },
  { label: 'Lonely', emoji: '🥺' },
  { label: 'Tired', emoji: '😴' },
  { label: 'Restless', emoji: '😬' },
  { label: 'Content', emoji: '😊' },
  { label: 'Confident', emoji: '😎' },
  { label: 'Grateful', emoji: '😇' },
  { label: 'Hopeful', emoji: '🙂' },
  { label: 'Irritable', emoji: '😠' },
  { label: 'Energised', emoji: '😁' },
  { label: 'Flat', emoji: '😶' },
  { label: 'Social', emoji: '🥳' },
  { label: 'Overwhelmed', emoji: '😵‍💫' },
] as const
