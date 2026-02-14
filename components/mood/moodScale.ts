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

export function moodColorForValue(value: number) {
  const palette: Record<number, string> = {
    1: '#ef4444',
    2: '#f87171',
    3: '#fb923c',
    4: '#facc15',
    5: '#bbf7d0',
    6: '#4ade80',
    7: '#22c55e',
  }
  return palette[value] ?? '#bbf7d0'
}

export const DEFAULT_MOOD_TAGS = [
  { label: 'Calm', emoji: '😌' },
  { label: 'Peaceful', emoji: '🕊️' },
  { label: 'Balanced', emoji: '⚖️' },
  { label: 'Relaxed', emoji: '🧘' },
  { label: 'Focused', emoji: '🤓' },
  { label: 'Clear-minded', emoji: '🧠' },
  { label: 'Motivated', emoji: '😤' },
  { label: 'Productive', emoji: '✅' },
  { label: 'Inspired', emoji: '✨' },
  { label: 'Anxious', emoji: '😰' },
  { label: 'Stressed', emoji: '😫' },
  { label: 'Worried', emoji: '😟' },
  { label: 'Frustrated', emoji: '😤' },
  { label: 'Sad', emoji: '😢' },
  { label: 'Down', emoji: '🙁' },
  { label: 'Lonely', emoji: '🥺' },
  { label: 'Tired', emoji: '😴' },
  { label: 'Drained', emoji: '🪫' },
  { label: 'Burnt out', emoji: '🥵' },
  { label: 'Restless', emoji: '😬' },
  { label: 'Content', emoji: '😊' },
  { label: 'Confident', emoji: '😎' },
  { label: 'Grateful', emoji: '😇' },
  { label: 'Optimistic', emoji: '🌤️' },
  { label: 'Hopeful', emoji: '🙂' },
  { label: 'Irritable', emoji: '😠' },
  { label: 'Energised', emoji: '😁' },
  { label: 'Excited', emoji: '🤗' },
  { label: 'Social', emoji: '🥳' },
  { label: 'Flat', emoji: '😶' },
  { label: 'Overwhelmed', emoji: '😵‍💫' },
  { label: 'Foggy', emoji: '🌫️' },
  { label: 'Sensitive', emoji: '💗' },
] as const
