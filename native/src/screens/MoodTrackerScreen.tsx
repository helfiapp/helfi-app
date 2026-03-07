import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg'
import * as ImagePicker from 'expo-image-picker'
import { Audio } from 'expo-av'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'

import { API_BASE_URL } from '../config'
import type { MainStackParamList } from '../navigation/MainNavigator'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type MoodEntry = {
  id: string
  localDate: string
  mood: number
  note: string
  timestamp: string
  tags?: unknown
  context?: any
}

type JournalEntry = {
  id: string
  localDate: string
  title: string
  content: string
  images?: unknown
  audio?: unknown
  tags?: unknown
  prompt?: string
  template?: string
  createdAt: string
  updatedAt?: string
}

type JournalAudioClip = {
  id: string
  localUri: string | null
  remoteUri: string | null
  uploading: boolean
  failed: boolean
}

type TabKey = 'checkin' | 'history' | 'journal'
type HistoryPeriod = 'day' | 'week' | 'month' | 'year'
type ChartMode = 'wave' | 'pie'
type FivePointKey = 'energyLevel' | 'sleepQuality' | 'nutrition' | 'supplements' | 'physicalActivity'
type DetailPanelKey = FivePointKey | null

type ContextResponse = {
  localDate: string
  meals: { todayCount: number; last: { name: string; meal: string | null; at: string } | null }
  supplements: { count: number }
  activity: { stepsToday: number | null; exerciseMinutesToday: number | null; exerciseCaloriesToday: number | null }
  sleep: { minutes: number | null; date: string | null }
}

const MOOD_FACE_OPTIONS = [
  { value: 1, label: 'Terrible', emoji: '😡' },
  { value: 2, label: 'Bad', emoji: '😞' },
  { value: 3, label: 'Meh', emoji: '😕' },
  { value: 4, label: 'Okay', emoji: '😐' },
  { value: 5, label: 'Good', emoji: '🙂' },
  { value: 6, label: 'Great', emoji: '😄' },
  { value: 7, label: 'Amazing', emoji: '🤩' },
] as const

const FEELING_GROUPS: Array<{ key: string; title: string; tone: string; labels: string[] }> = [
  {
    key: 'positive',
    title: 'POSITIVE',
    tone: '#12B76A',
    labels: ['Calm', 'Peaceful', 'Balanced', 'Relaxed', 'Content', 'Confident', 'Grateful', 'Hopeful', 'Optimistic'],
  },
  {
    key: 'energy',
    title: 'ENERGY',
    tone: '#2E90FA',
    labels: ['Focused', 'Clear-minded', 'Motivated', 'Productive', 'Inspired', 'Energised', 'Excited'],
  },
  {
    key: 'stress',
    title: 'STRESS',
    tone: '#F79009',
    labels: ['Anxious', 'Worried', 'Stressed', 'Frustrated', 'Overwhelmed', 'Restless', 'Irritable'],
  },
  {
    key: 'low',
    title: 'LOW MOOD',
    tone: '#F04438',
    labels: ['Sad', 'Down', 'Lonely', 'Flat', 'Foggy', 'Sensitive'],
  },
  {
    key: 'fatigue',
    title: 'FATIGUE',
    tone: '#7A5AF8',
    labels: ['Tired', 'Drained', 'Burnt out'],
  },
]

const FEELING_EMOJI_BY_LABEL: Record<string, string> = {
  Calm: '😌',
  Peaceful: '🕊️',
  Balanced: '⚖️',
  Relaxed: '🧘',
  Content: '😊',
  Confident: '😎',
  Grateful: '😇',
  Hopeful: '🙂',
  Optimistic: '🌤️',
  Focused: '🤓',
  'Clear-minded': '🧠',
  Motivated: '😤',
  Productive: '✅',
  Inspired: '✨',
  Energised: '😁',
  Excited: '🤩',
  Anxious: '😰',
  Worried: '😟',
  Stressed: '😫',
  Frustrated: '😤',
  Overwhelmed: '😵‍💫',
  Restless: '😬',
  Irritable: '😠',
  Sad: '😢',
  Down: '😕',
  Lonely: '🥺',
  Flat: '😶',
  Foggy: '🌫️',
  Sensitive: '💗',
  Tired: '😴',
  Drained: '🪫',
  'Burnt out': '🥵',
  Social: '🥳',
}

const INFLUENCE_ICON_URLS = {
  work: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/5f20be-computer/dynamic/200/color.webp',
  family: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/1acc3d-heart/dynamic/200/color.webp',
  sleep: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/a63030-moon/dynamic/200/color.webp',
  food: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/7fb19c-cup/dynamic/200/color.webp',
  weather: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/801da3-sun/dynamic/200/color.webp',
  exercise: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/10c35a-gym/dynamic/200/color.webp',
  travel: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/fa6099-travel/dynamic/200/color.webp',
  social: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/eec43d-chat-bubble/dynamic/200/color.webp',
  music: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/331e9c-music/dynamic/200/color.webp',
  movies: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/b1dccf-video-cam/dynamic/200/color.webp',
  gaming: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/a68576-puzzle/dynamic/200/color.webp',
  reading: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/628100-notebook/dynamic/200/color.webp',
  shopping: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/f71a3e-bag/dynamic/200/color.webp',
  cleaning: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/368c50-broom/dynamic/200/color.webp',
  cooking: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/544d0d-cauldron/dynamic/200/color.webp',
  tea: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/845bf0-tea-cup/dynamic/200/color.webp',
  photography: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/5656e5-camera/dynamic/200/color.webp',
  art: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/fcbbf1-painting-kit/dynamic/200/color.webp',
  nature: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/2c84d9-leaf/dynamic/200/color.webp',
  pets: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/1dec68-bone/dynamic/200/color.webp',
  money: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/7d956f-wallet/dynamic/200/color.webp',
  goals: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/49b6f4-target/dynamic/200/color.webp',
  calendar: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/f32794-calendar/dynamic/200/color.webp',
  walk: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/1858b9-map-pin/dynamic/200/color.webp',
  study: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/66b0f8-pencil/dynamic/200/color.webp',
  relax: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/6e6a21-candle/dynamic/200/color.webp',
  calls: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/87c2c5-call-out/dynamic/200/color.webp',
  sports: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/7db5bc-ball/dynamic/200/color.webp',
  diy: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/ff5be0-tools/dynamic/200/color.webp',
  chores: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/add2ea-trash-can/dynamic/200/color.webp',
  rainy: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/3f82a3-umbrella/dynamic/200/color.webp',
  audio: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/b81ead-headphone/dynamic/200/color.webp',
  achievement: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/39121b-medal/dynamic/200/color.webp',
  motivation: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/744cc0-rocket/dynamic/200/color.webp',
  time: 'https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes/8ef1fa-clock/dynamic/200/color.webp',
} as const

const MAIN_INFLUENCE_TILES = [
  { id: 'work', label: 'Work', imageUrl: INFLUENCE_ICON_URLS.work },
  { id: 'family', label: 'Family', imageUrl: INFLUENCE_ICON_URLS.family },
  { id: 'sleep', label: 'Sleep', imageUrl: INFLUENCE_ICON_URLS.sleep },
  { id: 'food', label: 'Food & Drink', imageUrl: INFLUENCE_ICON_URLS.food },
  { id: 'weather', label: 'Weather', imageUrl: INFLUENCE_ICON_URLS.weather },
  { id: 'exercise', label: 'Exercise', imageUrl: INFLUENCE_ICON_URLS.exercise },
  { id: 'achievement', label: 'Achievement', imageUrl: INFLUENCE_ICON_URLS.achievement },
] as const

const MORE_INFLUENCE_TILES = [
  { id: 'travel', label: 'Travel', imageUrl: INFLUENCE_ICON_URLS.travel },
  { id: 'social', label: 'Social', imageUrl: INFLUENCE_ICON_URLS.social },
  { id: 'music', label: 'Music', imageUrl: INFLUENCE_ICON_URLS.music },
  { id: 'movies', label: 'Movies', imageUrl: INFLUENCE_ICON_URLS.movies },
  { id: 'gaming', label: 'Gaming', imageUrl: INFLUENCE_ICON_URLS.gaming },
  { id: 'reading', label: 'Reading', imageUrl: INFLUENCE_ICON_URLS.reading },
  { id: 'shopping', label: 'Shopping', imageUrl: INFLUENCE_ICON_URLS.shopping },
  { id: 'cleaning', label: 'Cleaning', imageUrl: INFLUENCE_ICON_URLS.cleaning },
  { id: 'cooking', label: 'Cooking', imageUrl: INFLUENCE_ICON_URLS.cooking },
  { id: 'tea', label: 'Tea/Coffee', imageUrl: INFLUENCE_ICON_URLS.tea },
  { id: 'photography', label: 'Photography', imageUrl: INFLUENCE_ICON_URLS.photography },
  { id: 'art', label: 'Art', imageUrl: INFLUENCE_ICON_URLS.art },
  { id: 'nature', label: 'Nature', imageUrl: INFLUENCE_ICON_URLS.nature },
  { id: 'pets', label: 'Pets', imageUrl: INFLUENCE_ICON_URLS.pets },
  { id: 'money', label: 'Money', imageUrl: INFLUENCE_ICON_URLS.money },
  { id: 'goals', label: 'Goals', imageUrl: INFLUENCE_ICON_URLS.goals },
  { id: 'calendar', label: 'Schedule', imageUrl: INFLUENCE_ICON_URLS.calendar },
  { id: 'walk', label: 'Walk', imageUrl: INFLUENCE_ICON_URLS.walk },
  { id: 'study', label: 'Study', imageUrl: INFLUENCE_ICON_URLS.study },
  { id: 'relax', label: 'Relax', imageUrl: INFLUENCE_ICON_URLS.relax },
  { id: 'calls', label: 'Calls', imageUrl: INFLUENCE_ICON_URLS.calls },
  { id: 'sports', label: 'Sports', imageUrl: INFLUENCE_ICON_URLS.sports },
  { id: 'diy', label: 'DIY', imageUrl: INFLUENCE_ICON_URLS.diy },
  { id: 'chores', label: 'Chores', imageUrl: INFLUENCE_ICON_URLS.chores },
  { id: 'rainy', label: 'Rainy day', imageUrl: INFLUENCE_ICON_URLS.rainy },
  { id: 'audio', label: 'Podcasts', imageUrl: INFLUENCE_ICON_URLS.audio },
  { id: 'motivation', label: 'Motivation', imageUrl: INFLUENCE_ICON_URLS.motivation },
  { id: 'time', label: 'Time', imageUrl: INFLUENCE_ICON_URLS.time },
] as const

const PERIOD_OPTIONS: Array<{ key: HistoryPeriod; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

const PIE_COLORS: Record<number, string> = {
  1: '#EF4444',
  2: '#F87171',
  3: '#FB923C',
  4: '#FACC15',
  5: '#BBF7D0',
  6: '#4ADE80',
  7: '#22C55E',
}

const JOURNAL_PROMPTS = [
  'What went well today?',
  'What felt hard today?',
  'What am I grateful for?',
  'What do I need tomorrow?',
  'What surprised me today?',
]

const JOURNAL_TEMPLATES: Array<{ name: string; body: string }> = [
  {
    name: 'Daily reflection',
    body: 'Wins:\n\nChallenges:\n\nWhat I learned:',
  },
  {
    name: 'Gratitude',
    body: 'Today I am grateful for...\n\nSomeone I appreciate:\n\nOne small win:',
  },
  {
    name: 'Stress check',
    body: 'What caused stress?\n\nHow I responded:\n\nWhat could help next time:',
  },
]

function todayLocalDate() {
  return new Date().toISOString().slice(0, 10)
}

function shiftDays(localDate: string, deltaDays: number) {
  const d = new Date(`${localDate}T00:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function formatShortDate(value: string) {
  const d = new Date(`${value}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function minutesToHours(minutes: number | null) {
  if (minutes == null || minutes <= 0) return null
  const hrs = minutes / 60
  return `${hrs.toFixed(1)} h`
}

function formatEntryDateLabel(value: string) {
  const today = todayLocalDate()
  const yesterday = shiftDays(today, -1)
  if (value === today) return 'Today'
  if (value === yesterday) return 'Yesterday'
  return formatShortDate(value)
}

function normalizeStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item ?? '').trim()).filter(Boolean)
      }
    } catch {}
  }
  return []
}

function moodLabel(value: number) {
  return MOOD_FACE_OPTIONS.find((item) => item.value === value)?.label || 'Mood'
}

function moodEmoji(value: number) {
  return MOOD_FACE_OPTIONS.find((item) => item.value === value)?.emoji || '🙂'
}

function localDateRange(period: HistoryPeriod) {
  const end = todayLocalDate()
  if (period === 'day') return { start: shiftDays(end, -1), end }
  if (period === 'week') return { start: shiftDays(end, -6), end }
  if (period === 'month') return { start: shiftDays(end, -29), end }
  return { start: shiftDays(end, -364), end }
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function moodSummaryFromAverage(avg: number | null) {
  if (avg == null) return 'No data yet'
  if (avg >= 6.3) return 'Mostly Amazing'
  if (avg >= 5.5) return 'Mostly Great'
  if (avg >= 4.7) return 'Mostly Good'
  if (avg >= 3.8) return 'Mostly Okay'
  if (avg >= 2.8) return 'Mostly Meh'
  if (avg >= 1.8) return 'Mostly Bad'
  return 'Mostly Terrible'
}

function dotColorForAvg(avg: number | null) {
  if (avg == null) return '#CBD5E1'
  if (avg >= 5) return '#4ADE80'
  if (avg >= 3.5) return '#FACC15'
  return '#FB7185'
}

function asTag(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24)
}

function audioMimeFromUri(uri: string) {
  const lower = String(uri || '').toLowerCase()
  if (lower.endsWith('.caf')) return 'audio/x-caf'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.aac')) return 'audio/aac'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.webm')) return 'audio/webm'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  return 'audio/mp4'
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  }
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`
}

export function MoodTrackerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>()
  const { mode, session } = useAppMode()
  const { width: screenWidth } = useWindowDimensions()

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return {
      Authorization: `Bearer ${session.token}`,
      'x-native-token': session.token,
      'cache-control': 'no-store',
    }
  }, [mode, session?.token])

  const [activeTab, setActiveTab] = useState<TabKey>('checkin')

  const [entriesLoading, setEntriesLoading] = useState(true)
  const [entriesSaving, setEntriesSaving] = useState(false)
  const [entries, setEntries] = useState<MoodEntry[]>([])
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [intensityPercent, setIntensityPercent] = useState(35)
  const [feelings, setFeelings] = useState<string[]>([])
  const [addingFeeling, setAddingFeeling] = useState(false)
  const [customFeelingInput, setCustomFeelingInput] = useState('')
  const [influences, setInfluences] = useState<string[]>([])
  const [influencesExpanded, setInfluencesExpanded] = useState(false)
  const [addingInfluence, setAddingInfluence] = useState(false)
  const [customInfluenceInput, setCustomInfluenceInput] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailPanel, setDetailPanel] = useState<DetailPanelKey>(null)
  const [details, setDetails] = useState<Record<FivePointKey, number | null>>({
    energyLevel: null,
    sleepQuality: null,
    nutrition: null,
    supplements: null,
    physicalActivity: null,
  })
  const [contextData, setContextData] = useState<ContextResponse | null>(null)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('week')
  const [chartMode, setChartMode] = useState<ChartMode>('wave')
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const [activeSliceMood, setActiveSliceMood] = useState<number | null>(null)
  const [trendPct, setTrendPct] = useState<number | null>(null)

  const [journalLoading, setJournalLoading] = useState(false)
  const [journalSaving, setJournalSaving] = useState(false)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalSearch, setJournalSearch] = useState('')
  const [journalTitle, setJournalTitle] = useState('')
  const [journalContent, setJournalContent] = useState('')
  const [journalDate, setJournalDate] = useState(todayLocalDate())
  const [journalTags, setJournalTags] = useState<string[]>([])
  const [journalTagInput, setJournalTagInput] = useState('')
  const [journalPrompt, setJournalPrompt] = useState('')
  const [journalTemplate, setJournalTemplate] = useState('')
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null)
  const [journalImages, setJournalImages] = useState<string[]>([])
  const [journalAudio, setJournalAudio] = useState<JournalAudioClip[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [playingAudioUri, setPlayingAudioUri] = useState<string | null>(null)
  const audioSoundRef = useRef<Audio.Sound | null>(null)

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {})
      }
      if (audioSoundRef.current) {
        audioSoundRef.current.stopAsync().catch(() => {})
        audioSoundRef.current.unloadAsync().catch(() => {})
        audioSoundRef.current = null
      }
    }
  }, [recording])

  const loadEntries = useCallback(async () => {
    if (!authHeaders) {
      setEntriesLoading(false)
      return
    }

    try {
      setEntriesLoading(true)
      const { start, end } = localDateRange(historyPeriod)
      const res = await fetch(`${API_BASE_URL}/api/native-mood-entries?start=${start}&end=${end}`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not load mood entries'))
      const list = Array.isArray(data?.entries) ? data.entries : []
      setEntries(list)

      const days = historyPeriod === 'day' ? 1 : historyPeriod === 'week' ? 7 : historyPeriod === 'month' ? 30 : 365
      const prevStart = shiftDays(start, -days)
      const prevEnd = shiftDays(start, -1)
      const prevRes = await fetch(`${API_BASE_URL}/api/native-mood-entries?start=${prevStart}&end=${prevEnd}`, {
        headers: authHeaders,
      })
      const prevData: any = await prevRes.json().catch(() => ({}))
      if (prevRes.ok) {
        const current = average(
          list
            .map((entry: MoodEntry) => Number(entry.mood))
            .filter((value: number) => Number.isFinite(value)),
        )
        const previous = average(
          (Array.isArray(prevData?.entries) ? prevData.entries : [])
            .map((entry: MoodEntry) => Number(entry.mood))
            .filter((value: number) => Number.isFinite(value)),
        )
        if (current != null && previous != null && previous > 0) {
          setTrendPct(((current - previous) / previous) * 100)
        } else {
          setTrendPct(null)
        }
      }
    } catch (e: any) {
      Alert.alert('Could not load mood tracker', e?.message || 'Please try again.')
    } finally {
      setEntriesLoading(false)
      setHistoryLoading(false)
    }
  }, [authHeaders, historyPeriod])

  const loadContext = useCallback(async () => {
    if (!authHeaders) {
      setContextData(null)
      return
    }
    try {
      const localDate = todayLocalDate()
      const res = await fetch(`${API_BASE_URL}/api/mood/context?localDate=${encodeURIComponent(localDate)}`, {
        headers: authHeaders,
      })
      if (!res.ok) return
      const data: any = await res.json().catch(() => null)
      if (data && typeof data === 'object') {
        setContextData(data as ContextResponse)
      }
    } catch {
      // Keep UI stable when context data is unavailable.
    }
  }, [authHeaders])

  const loadJournalEntries = useCallback(async () => {
    if (!authHeaders) {
      setJournalLoading(false)
      return
    }
    try {
      setJournalLoading(true)
      const q = journalSearch.trim()
      const url = q
        ? `${API_BASE_URL}/api/native-mood-journal-entries?limit=50&q=${encodeURIComponent(q)}`
        : `${API_BASE_URL}/api/native-mood-journal-entries?limit=50`
      const res = await fetch(url, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not load journal entries'))
      setJournalEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch {
      setJournalEntries([])
    } finally {
      setJournalLoading(false)
    }
  }, [authHeaders, journalSearch])

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'checkin' || activeTab === 'history') {
        setHistoryLoading(true)
        void loadEntries()
      }
      if (activeTab === 'checkin') {
        void loadContext()
      }
      if (activeTab === 'journal') {
        void loadJournalEntries()
      }
      return () => {}
    }, [activeTab, loadContext, loadEntries, loadJournalEntries]),
  )

  const saveEntry = async () => {
    if (!authHeaders) return
    if (selectedMood == null) {
      Alert.alert('Mood missing', 'Please choose your mood first.')
      return
    }

    try {
      setEntriesSaving(true)
      const res = await fetch(`${API_BASE_URL}/api/native-mood-entries`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mood: selectedMood,
          note,
          tags: influences,
          localDate: todayLocalDate(),
          context: {
            localHour: new Date().getHours(),
            intensityPercent,
            ...(feelings.length > 0 ? { feelings } : {}),
            ...(details.energyLevel == null ? {} : { energyLevel: details.energyLevel }),
            ...(details.sleepQuality == null ? {} : { sleepQuality: details.sleepQuality }),
            ...(details.nutrition == null ? {} : { nutrition: details.nutrition }),
            ...(details.supplements == null ? {} : { supplements: details.supplements }),
            ...(details.physicalActivity == null ? {} : { physicalActivity: details.physicalActivity }),
          },
        }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not save mood entry'))

      setSelectedMood(null)
      setNote('')
      setIntensityPercent(35)
      setFeelings([])
      setInfluences([])
      setDetailsOpen(false)
      setDetailPanel(null)
      setAddingFeeling(false)
      setAddingInfluence(false)
      setCustomFeelingInput('')
      setCustomInfluenceInput('')
      setDetails({
        energyLevel: null,
        sleepQuality: null,
        nutrition: null,
        supplements: null,
        physicalActivity: null,
      })
      setActivePointIndex(null)
      setActiveSliceMood(null)
      await loadEntries()
      Alert.alert('Saved', 'Mood entry added.')
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.')
    } finally {
      setEntriesSaving(false)
    }
  }

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [entries],
  )

  const overallAverage = useMemo(
    () =>
      average(
        sortedEntries
          .map((entry) => Number(entry.mood))
          .filter((value) => Number.isFinite(value)),
      ),
    [sortedEntries],
  )

  const topMood = useMemo<{ mood: number; count: number } | null>(() => {
    const counts = new Map<number, number>()
    for (const entry of sortedEntries) {
      const mood = Number(entry.mood)
      if (!Number.isFinite(mood)) continue
      counts.set(mood, (counts.get(mood) || 0) + 1)
    }
    let result: { mood: number; count: number } | null = null
    counts.forEach((count, mood) => {
      if (!result || count > result.count) result = { mood, count }
    })
    return result
  }, [sortedEntries])

  const streakDays = useMemo(() => {
    const days = new Set<string>()
    for (const entry of sortedEntries) {
      const day = String(entry.localDate || '').slice(0, 10)
      if (day) days.add(day)
    }
    if (days.size === 0) return 0
    let cursor = todayLocalDate()
    let streak = 0
    while (days.has(cursor)) {
      streak += 1
      cursor = shiftDays(cursor, -1)
      if (streak > 365) break
    }
    return streak
  }, [sortedEntries])

  const chartPoints = useMemo(
    () =>
      sortedEntries.map((entry) => ({
        xLabel: formatShortDate(entry.localDate),
        mood: Number(entry.mood),
        timestamp: entry.timestamp,
      })),
    [sortedEntries],
  )

  const pointSpacing = useMemo(() => {
    if (chartPoints.length <= 10) return 46
    if (chartPoints.length <= 20) return 36
    if (chartPoints.length <= 40) return 30
    if (chartPoints.length <= 80) return 24
    return 18
  }, [chartPoints.length])
  const baseChartWidth = Math.max(260, screenWidth - 72)
  const chartWidth = useMemo(() => {
    const dynamic = chartPoints.length > 1 ? (chartPoints.length - 1) * pointSpacing + 44 : baseChartWidth
    return Math.min(4200, Math.max(baseChartWidth, dynamic))
  }, [baseChartWidth, chartPoints.length, pointSpacing])
  const chartHeight = 220
  const chartPadding = { top: 12, right: 12, bottom: 32, left: 24 }
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom

  const xAt = useCallback(
    (index: number) => {
      if (chartPoints.length <= 1) return chartPadding.left + plotWidth / 2
      return chartPadding.left + (index * plotWidth) / (chartPoints.length - 1)
    },
    [chartPoints.length, plotWidth],
  )

  const yAt = useCallback(
    (value: number) => {
      const clamped = Math.max(1, Math.min(7, value))
      return chartPadding.top + ((7 - clamped) / 6) * plotHeight
    },
    [plotHeight],
  )

  const buildWavePath = useCallback(() => {
    let path = ''
    chartPoints.forEach((point, index) => {
      if (!Number.isFinite(point.mood)) return
      const x = xAt(index)
      const y = yAt(point.mood)
      if (!path) path = `M ${x} ${y}`
      else path += ` L ${x} ${y}`
    })
    return path
  }, [chartPoints, xAt, yAt])

  const xLabelStep = useMemo(() => {
    if (chartPoints.length <= 12) return 1
    if (chartPoints.length <= 24) return 2
    if (chartPoints.length <= 48) return 3
    if (chartPoints.length <= 96) return 4
    return 6
  }, [chartPoints.length])

  const moodSlices = useMemo(() => {
    const counts = new Map<number, number>()
    for (const entry of sortedEntries) {
      const mood = Number(entry.mood)
      if (!Number.isFinite(mood)) continue
      counts.set(mood, (counts.get(mood) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([mood, count]) => ({ mood, count }))
  }, [sortedEntries])

  const pieTotal = useMemo(() => moodSlices.reduce((sum, slice) => sum + slice.count, 0), [moodSlices])
  const pieRadius = 84
  const pieCenterX = pieRadius + 8
  const pieCenterY = pieRadius + 8

  const pieSegments = useMemo(() => {
    if (pieTotal === 0) return []
    let current = 0
    return moodSlices.map((slice) => {
      const start = (current / pieTotal) * 360
      current += slice.count
      const end = (current / pieTotal) * 360
      return {
        ...slice,
        start,
        end,
        color: PIE_COLORS[slice.mood] || '#4ADE80',
      }
    })
  }, [moodSlices, pieTotal])

  const togglePieMood = useCallback((mood: number) => {
    setActiveSliceMood((current) => (current === mood ? null : mood))
  }, [])

  const toggleWavePoint = useCallback((index: number) => {
    setActivePointIndex((current) => (current === index ? null : index))
  }, [])

  const visibleHistoryRangeLabel = useMemo(() => {
    if (sortedEntries.length === 0) return 'No data available for the selected time period.'
    const first = sortedEntries[0]
    const last = sortedEntries[sortedEntries.length - 1]
    const firstLabel = formatShortDate(first.localDate)
    const lastLabel = formatShortDate(last.localDate)
    if (firstLabel === lastLabel) return `Showing data for ${firstLabel}`
    return `Showing data from ${firstLabel} to ${lastLabel}`
  }, [sortedEntries])

  const monthMap = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>()
    for (const entry of sortedEntries) {
      const date = String(entry.localDate || '').slice(0, 10)
      const mood = Number(entry.mood)
      if (!date || !Number.isFinite(mood)) continue
      const curr = totals.get(date) || { sum: 0, count: 0 }
      curr.sum += mood
      curr.count += 1
      totals.set(date, curr)
    }
    const out = new Map<string, number>()
    totals.forEach((value, key) => out.set(key, value.sum / value.count))
    return out
  }, [sortedEntries])

  const thisMonthDays = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const first = new Date(year, month, 1)
    const days = new Date(year, month + 1, 0).getDate()
    const mondayIdx = (first.getDay() + 6) % 7
    const cells: Array<{ type: 'pad' } | { type: 'day'; date: string; day: number; avg: number | null }> = []
    for (let i = 0; i < mondayIdx; i += 1) cells.push({ type: 'pad' })
    for (let day = 1; day <= days; day += 1) {
      const d = new Date(year, month, day)
      const key = d.toISOString().slice(0, 10)
      cells.push({
        type: 'day',
        date: key,
        day,
        avg: monthMap.get(key) ?? null,
      })
    }
    return cells
  }, [monthMap])

  const firstName = useMemo(() => {
    const raw = String(session?.user?.name || '').trim()
    if (!raw) return ''
    return raw.split(' ')[0] || raw
  }, [session?.user?.name])

  const sleepValue = useMemo(() => minutesToHours(contextData?.sleep?.minutes ?? null), [contextData?.sleep?.minutes])
  const activityValue = useMemo(() => {
    if (contextData?.activity?.stepsToday != null) return `${contextData.activity.stepsToday.toLocaleString()} steps`
    if (contextData?.activity?.exerciseMinutesToday != null) return `${contextData.activity.exerciseMinutesToday} min`
    return null
  }, [contextData?.activity?.exerciseMinutesToday, contextData?.activity?.stepsToday])
  const nutritionValue = useMemo(() => {
    if (!contextData?.meals) return null
    const count = Number(contextData.meals.todayCount || 0)
    return `${count} meal${count === 1 ? '' : 's'} logged`
  }, [contextData?.meals])
  const supplementsValue = useMemo(() => {
    if (!contextData?.supplements) return null
    return contextData.supplements.count > 0 ? 'Saved in Helfi' : 'None saved'
  }, [contextData?.supplements])

  const knownInfluenceLabels = useMemo(
    () =>
      new Set<string>(
        [...MAIN_INFLUENCE_TILES, ...MORE_INFLUENCE_TILES].map((item) => asTag(item.label).toLowerCase()),
      ),
    [],
  )

  const visibleInfluenceTiles = useMemo(() => {
    const selected = new Set(influences.map((item) => asTag(item).toLowerCase()))
    const selectedFromMore = MORE_INFLUENCE_TILES.filter((item) => selected.has(asTag(item.label).toLowerCase()))
    const base = influencesExpanded ? [...MAIN_INFLUENCE_TILES, ...MORE_INFLUENCE_TILES] : [...MAIN_INFLUENCE_TILES, ...selectedFromMore]

    const custom = influences
      .map((item) => asTag(item))
      .filter((item) => item && !knownInfluenceLabels.has(item.toLowerCase()))
      .map((item) => ({
        id: `custom-${item}`,
        label: item,
        imageUrl: null as string | null,
      }))

    const seen = new Set<string>()
    return [...base, ...custom].filter((item) => {
      const key = asTag(item.label).toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [influences, influencesExpanded, knownInfluenceLabels])

  const feelingSections = useMemo(() => {
    const selected = new Set(feelings.map((item) => asTag(item).toLowerCase()))
    const grouped = FEELING_GROUPS.map((group) => ({
      ...group,
      items: group.labels.map((label) => ({
        label,
        emoji: FEELING_EMOJI_BY_LABEL[label] || '🙂',
        selected: selected.has(asTag(label).toLowerCase()),
      })),
    }))

    const known = new Set<string>(FEELING_GROUPS.flatMap((group) => group.labels.map((label) => asTag(label).toLowerCase())))
    const custom = feelings
      .map((item) => asTag(item))
      .filter((item) => item && !known.has(item.toLowerCase()))
      .map((item) => ({
        label: item,
        emoji: FEELING_EMOJI_BY_LABEL[item] || '🙂',
        selected: true,
      }))

    return { grouped, custom }
  }, [feelings])

  const addFeeling = (tag: string) => {
    const cleaned = asTag(tag)
    if (!cleaned) return
    setFeelings((prev) => {
      if (prev.includes(cleaned)) return prev.filter((item) => item !== cleaned)
      return [...prev, cleaned].slice(0, 12)
    })
  }

  const addInfluence = (tag: string) => {
    const cleaned = asTag(tag)
    if (!cleaned) return
    setInfluences((prev) => {
      if (prev.includes(cleaned)) return prev.filter((item) => item !== cleaned)
      return [...prev, cleaned].slice(0, 12)
    })
  }

  const addCustomFeeling = () => {
    const cleaned = asTag(customFeelingInput)
    if (!cleaned) return
    addFeeling(cleaned)
    setCustomFeelingInput('')
    setAddingFeeling(false)
  }

  const addCustomInfluence = () => {
    const cleaned = asTag(customInfluenceInput)
    if (!cleaned) return
    addInfluence(cleaned)
    setCustomInfluenceInput('')
    setAddingInfluence(false)
    setInfluencesExpanded(true)
  }

  const uploadJournalImageFromUri = async (uri: string, mimeType?: string | null) => {
    if (!authHeaders) return
    const name = uri.split('/').pop() || `mood-image-${Date.now()}.jpg`
    const type = mimeType || 'image/jpeg'
    const targets = ['/api/native-mood-journal-upload', '/api/mood/journal/upload']
    let lastError = 'Could not upload image'

    for (const target of targets) {
      const form = new FormData()
      form.append('image', { uri, name, type } as any)
      const res = await fetch(`${API_BASE_URL}${target}`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      })
      const data: any = await res.json().catch(() => ({}))
      if (res.ok && data?.url) {
        const rawUrl = String(data.url || '').trim()
        const absoluteUrl = rawUrl.startsWith('/') ? `${API_BASE_URL}${rawUrl}` : rawUrl
        setJournalImages((prev) => [...prev, absoluteUrl].slice(0, 6))
        return
      }
      // Fallback to next endpoint only when route is missing.
      if (res.status === 404) continue
      lastError = String(data?.error || 'Could not upload image')
      break
    }

    throw new Error(lastError)
  }

  const pickJournalImage = async () => {
    if (!authHeaders) return
    try {
      setMediaBusy(true)
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to add images.')
        return
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      })
      if (picked.canceled || picked.assets.length === 0) return
      const asset = picked.assets[0]
      await uploadJournalImageFromUri(asset.uri, asset.mimeType)
    } catch (e: any) {
      Alert.alert('Image upload failed', e?.message || 'Please try again.')
    } finally {
      setMediaBusy(false)
    }
  }

  const uploadJournalAudioFromUri = async (uri: string) => {
    if (!authHeaders) return
    const name = uri.split('/').pop() || `voice-note-${Date.now()}.m4a`
    const mime = audioMimeFromUri(uri)
    const targets = ['/api/native-mood-journal-upload-audio', '/api/mood/journal/upload-audio']
    let lastError = 'Could not upload audio'

    for (const target of targets) {
      const form = new FormData()
      form.append('audio', { uri, name, type: mime } as any)
      const res = await fetch(`${API_BASE_URL}${target}`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
      })
      const data: any = await res.json().catch(() => ({}))
      if (res.ok && data?.url) {
        const rawUrl = String(data.url || '').trim()
        const absoluteUrl = rawUrl.startsWith('/') ? `${API_BASE_URL}${rawUrl}` : rawUrl
        return absoluteUrl
      }
      // Fallback to next endpoint only when route is missing.
      if (res.status === 404) continue
      lastError = String(data?.error || 'Could not upload audio')
      break
    }

    throw new Error(lastError)
  }

  const startVoiceRecording = async () => {
    try {
      if (recording) return
      setMediaBusy(true)
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to record voice notes.')
        return
      }
      if (AppState.currentState !== 'active') {
        await new Promise((resolve) => setTimeout(resolve, 350))
      }
      if (AppState.currentState !== 'active') {
        Alert.alert('Try again', 'Please open Helfi and tap Record voice note again.')
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      })
      const created = new Audio.Recording()
      await created.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await created.startAsync()
      setRecording(created)
    } catch (e: any) {
      const message = String(e?.message || '')
      if (message.toLowerCase().includes('background')) {
        Alert.alert('Try again', 'Please keep Helfi open, then tap Record voice note again.')
      } else {
        Alert.alert('Recording failed', message || 'Please try again.')
      }
    } finally {
      setMediaBusy(false)
    }
  }

  const stopVoiceRecording = async () => {
    if (!recording) return
    try {
      setMediaBusy(true)
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {})
      const uri = recording.getURI()
      setRecording(null)
      if (uri) {
        const clipId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        setJournalAudio((prev) =>
          [...prev, { id: clipId, localUri: uri, remoteUri: null, uploading: true, failed: false }].slice(0, 6),
        )
        void (async () => {
          try {
            const uploaded = await uploadJournalAudioFromUri(uri)
            if (!uploaded) throw new Error('Could not upload audio')
            setJournalAudio((prev) =>
              prev.map((item) =>
                item.id === clipId
                  ? { ...item, remoteUri: uploaded, uploading: false, failed: false }
                  : item,
              ),
            )
          } catch {
            setJournalAudio((prev) =>
              prev.map((item) =>
                item.id === clipId
                  ? { ...item, uploading: false, failed: true }
                  : item,
              ),
            )
          }
        })()
      }
    } catch (e: any) {
      Alert.alert('Audio upload failed', e?.message || 'Please try again.')
    } finally {
      setMediaBusy(false)
    }
  }

  const stopAudioPlayback = useCallback(async () => {
    const sound = audioSoundRef.current
    if (sound) {
      try {
        await sound.stopAsync()
      } catch {}
      try {
        await sound.unloadAsync()
      } catch {}
      audioSoundRef.current = null
    }
    setPlayingAudioUri(null)
  }, [])

  const toggleAudioPlayback = useCallback(
    async (uri: string) => {
      if (!uri) return
      if (playingAudioUri === uri) {
        await stopAudioPlayback()
        return
      }
      await stopAudioPlayback()
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        })
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false })
        audioSoundRef.current = sound
        setPlayingAudioUri(uri)
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            void stopAudioPlayback()
            return
          }
          if (!status.isLoaded && status.error) {
            void stopAudioPlayback()
          }
        })
        await sound.playAsync()
      } catch (e: any) {
        await stopAudioPlayback()
        Alert.alert('Playback failed', e?.message || 'Could not play this voice note.')
      }
    },
    [playingAudioUri, stopAudioPlayback],
  )

  const openPeriodPicker = () => {
    const options = PERIOD_OPTIONS.map((option) => ({
      text: option.label,
      onPress: () => {
        setHistoryPeriod(option.key)
        setHistoryLoading(true)
        setActivePointIndex(null)
        setActiveSliceMood(null)
      },
    }))
    Alert.alert('Select time period', 'Choose the range to view results.', [
      ...options,
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const handleAddJournalTag = () => {
    const tag = asTag(journalTagInput)
    if (!tag) return
    setJournalTags((prev) => (prev.includes(tag) ? prev : [...prev, tag].slice(0, 12)))
    setJournalTagInput('')
  }

  const resetJournalForm = () => {
    setEditingJournalId(null)
    setJournalTitle('')
    setJournalContent('')
    setJournalDate(todayLocalDate())
    setJournalTags([])
    setJournalPrompt('')
    setJournalTemplate('')
    setJournalImages([])
    setJournalAudio([])
  }

  const saveJournalEntry = async () => {
    if (!authHeaders) return
    if (!journalTitle.trim() && !journalContent.trim() && journalImages.length === 0 && journalAudio.length === 0) {
      Alert.alert('Missing content', 'Please add a title, notes, image, or voice note first.')
      return
    }
    if (journalAudio.some((item) => item.uploading)) {
      Alert.alert('Still uploading', 'Please wait a moment for voice note upload to finish.')
      return
    }
    if (journalAudio.some((item) => !item.remoteUri)) {
      Alert.alert('Voice note not ready', 'Please re-record that voice note and try again.')
      return
    }
    try {
      setJournalSaving(true)
      const url = editingJournalId
        ? `${API_BASE_URL}/api/native-mood-journal-entries/${editingJournalId}`
        : `${API_BASE_URL}/api/native-mood-journal-entries`
      const method = editingJournalId ? 'PUT' : 'POST'
      const audioToSave = journalAudio.map((item) => item.remoteUri).filter((value): value is string => Boolean(value))
      const res = await fetch(url, {
        method,
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: journalTitle,
          content: journalContent,
          images: journalImages,
          audio: audioToSave,
          tags: journalTags,
          prompt: journalPrompt,
          template: journalTemplate,
          localDate: journalDate,
        }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not save journal entry'))
      resetJournalForm()
      await loadJournalEntries()
      Alert.alert('Saved', editingJournalId ? 'Journal entry updated.' : 'Journal entry saved.')
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.')
    } finally {
      setJournalSaving(false)
    }
  }

  const editJournalEntry = (entry: JournalEntry) => {
    const toAbsoluteUrl = (value: string) => (value.startsWith('/') ? `${API_BASE_URL}${value}` : value)
    const audioItems = normalizeStringArray(entry.audio).map((value, index) => ({
      id: `saved-${entry.id}-${index}`,
      localUri: null,
      remoteUri: toAbsoluteUrl(value),
      uploading: false,
      failed: false,
    }))
    setEditingJournalId(entry.id)
    setJournalTitle(entry.title || '')
    setJournalContent(entry.content || '')
    setJournalDate(String(entry.localDate || todayLocalDate()).slice(0, 10))
    setJournalImages(normalizeStringArray(entry.images).map(toAbsoluteUrl))
    setJournalAudio(audioItems)
    setJournalTags(normalizeStringArray(entry.tags))
    setJournalPrompt(String(entry.prompt || ''))
    setJournalTemplate(String(entry.template || ''))
  }

  const deleteJournalEntry = async (entryId: string) => {
    if (!authHeaders) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/native-mood-journal-entries/${entryId}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not delete entry'))
      if (editingJournalId === entryId) resetJournalForm()
      await loadJournalEntries()
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Please try again.')
    }
  }

  const visibleJournalEntries = useMemo(() => {
    const term = journalSearch.trim().toLowerCase()
    if (!term) return journalEntries
    return journalEntries.filter((entry) => {
      return (
        String(entry.title || '').toLowerCase().includes(term) ||
        String(entry.content || '').toLowerCase().includes(term)
      )
    })
  }, [journalEntries, journalSearch])

  const renderChip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? '#4CAF50' : theme.colors.border,
        backgroundColor: active ? '#4CAF50' : theme.colors.card,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  )

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View style={styles.tabsWrap}>
          {([
            { key: 'checkin', label: 'Check-in' },
            { key: 'history', label: 'History' },
            { key: 'journal', label: 'Journal' },
          ] as const).map((tab) => {
            const active = activeTab === tab.key
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, active ? styles.tabButtonActive : styles.tabButtonInactive]}
              >
                <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}>{tab.label}</Text>
              </Pressable>
            )
          })}
          <Pressable
            onPress={() => navigation.navigate('Reminders', { focus: 'mood' })}
            style={({ pressed }) => ({
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              borderLeftWidth: 1,
              borderLeftColor: theme.colors.border,
            })}
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </Pressable>
        </View>

        {activeTab === 'checkin' ? (
          <>
            <View style={styles.card}>
              <View style={{ marginBottom: 6, alignItems: 'center', paddingHorizontal: 8 }}>
                <Text style={{ textAlign: 'center', fontSize: 33, fontWeight: '900', color: theme.colors.text }}>
                  {`How are you feeling${firstName ? `, ${firstName}` : ''}?`}
                </Text>
                <Text style={{ textAlign: 'center', marginTop: 8, color: theme.colors.muted, fontWeight: '600', fontSize: 15 }}>
                  Pick the face that matches your vibe.
                </Text>
              </View>

              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#475467' }}>Pick your mood</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B' }}>
                    {selectedMood ? moodLabel(selectedMood) : 'Tap a face'}
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 4, paddingVertical: 12 }}>
                  {MOOD_FACE_OPTIONS.map((option) => {
                    const selected = selectedMood === option.value
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setSelectedMood(option.value)}
                        style={{ alignItems: 'center', gap: 8 }}
                      >
                        <View
                          style={{
                            width: selected ? 96 : 80,
                            height: selected ? 96 : 80,
                            borderRadius: 999,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#FFFFFF',
                            borderWidth: selected ? 4 : 0,
                            borderColor: selected ? 'rgba(76,175,80,0.25)' : 'transparent',
                          }}
                        >
                          <Text style={{ fontSize: selected ? 58 : 50, opacity: selected ? 1 : 0.85 }}>{option.emoji}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#4CAF50' : '#64748B' }}>{option.label}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>

              <View style={styles.intensityCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.intensityIconCircle}>
                      <MaterialCommunityIcons name="lightning-bolt-outline" size={18} color={theme.colors.primary} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#334155' }}>Intensity</Text>
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.primary }}>{intensityPercent}%</Text>
                </View>

                <View style={{ marginTop: 4 }}>
                  <Slider
                    value={intensityPercent}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    minimumTrackTintColor="#4CAF50"
                    maximumTrackTintColor="#E2E8F0"
                    thumbTintColor="#FFFFFF"
                    onValueChange={(value) => setIntensityPercent(Math.round(value))}
                    style={{ width: '100%', height: 34 }}
                  />
                </View>

                <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                  <Text style={styles.intensityRangeLabel}>LOW</Text>
                  <Text style={styles.intensityRangeLabel}>HIGH</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#334155' }}>Emotions (optional)</Text>
                  {feelings.length > 0 ? (
                    <Pressable onPress={() => setFeelings([])}>
                      <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 12 }}>Clear all</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={{ gap: 10 }}>
                  {feelingSections.grouped.map((group) => (
                    <View key={group.key}>
                      <View style={[styles.feelingGroupBadge, { borderColor: `${group.tone}55`, backgroundColor: `${group.tone}14` }]}>
                        <Text style={[styles.feelingGroupBadgeText, { color: group.tone }]}>{group.title}</Text>
                      </View>
                      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {group.items.map((item) => (
                          <Pressable
                            key={`${group.key}-${item.label}`}
                            onPress={() => addFeeling(item.label)}
                            style={[styles.feelingChip, item.selected ? styles.feelingChipActive : null]}
                          >
                            <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                            <Text style={{ color: item.selected ? '#FFFFFF' : '#334155', fontWeight: '700', fontSize: 12 }}>
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}

                  {feelingSections.custom.length > 0 ? (
                    <View>
                      <View style={[styles.feelingGroupBadge, { borderColor: '#D0D5DD', backgroundColor: '#F8FAFC' }]}>
                        <Text style={[styles.feelingGroupBadgeText, { color: '#475467' }]}>CUSTOM</Text>
                      </View>
                      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {feelingSections.custom.map((item) => (
                          <Pressable
                            key={`custom-${item.label}`}
                            onPress={() => addFeeling(item.label)}
                            style={[styles.feelingChip, item.selected ? styles.feelingChipActive : null]}
                          >
                            <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                            <Text style={{ color: item.selected ? '#FFFFFF' : '#334155', fontWeight: '700', fontSize: 12 }}>
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <Pressable onPress={() => setAddingFeeling((prev) => !prev)} style={styles.addChipButton}>
                    <Text style={{ color: '#475467', fontWeight: '700', fontSize: 12 }}>+ Add feeling</Text>
                  </Pressable>
                </View>

                {addingFeeling ? (
                  <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={customFeelingInput}
                      onChangeText={setCustomFeelingInput}
                      placeholder="Custom tag"
                      placeholderTextColor="#8AA39D"
                      style={[styles.singleInput, { flex: 1, marginTop: 0 }]}
                    />
                    <Pressable onPress={addCustomFeeling} style={styles.smallActionButton}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Add</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#334155' }}>What’s affecting you?</Text>
                  <Pressable onPress={() => setInfluencesExpanded((prev) => !prev)} style={styles.moreOptionsButton}>
                    <MaterialCommunityIcons name={influencesExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '800' }}>
                      {influencesExpanded ? 'Show less' : 'More options'}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.influenceGrid}>
                  {visibleInfluenceTiles.map((item) => {
                    const cleanedLabel = asTag(item.label)
                    const selected = influences.includes(cleanedLabel)
                    const isCustom = String(item.id).startsWith('custom-')
                    return (
                      <Pressable key={item.id} onPress={() => addInfluence(cleanedLabel)} style={styles.influenceTileButton}>
                        <View style={[styles.influenceImageWrap, selected ? styles.influenceImageWrapActive : null]}>
                          {item.imageUrl ? (
                            <Image source={{ uri: item.imageUrl }} style={styles.influenceImage} />
                          ) : (
                            <View style={styles.customInfluenceBadge}>
                              <Text style={{ fontSize: 28, color: '#334155', fontWeight: '800' }}>
                                {cleanedLabel.charAt(0).toUpperCase() || '•'}
                              </Text>
                            </View>
                          )}
                          {selected ? (
                            <View style={styles.influenceCheckBadge}>
                              <MaterialCommunityIcons name="check" size={14} color="#0B2B10" />
                            </View>
                          ) : null}
                          {isCustom ? (
                            <View style={styles.customDot}>
                              <Text style={{ color: '#334155', fontSize: 10, fontWeight: '800' }}>C</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.influenceLabel, selected ? styles.influenceLabelActive : null]}>{cleanedLabel}</Text>
                      </Pressable>
                    )
                  })}

                  <Pressable onPress={() => setAddingInfluence((prev) => !prev)} style={styles.influenceTileButton}>
                    <View style={styles.addInfluenceCircle}>
                      <MaterialCommunityIcons name="plus" size={26} color="#94A3B8" />
                    </View>
                    <Text style={styles.influenceLabel}>Add</Text>
                  </Pressable>
                </View>

                {addingInfluence ? (
                  <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={customInfluenceInput}
                      onChangeText={setCustomInfluenceInput}
                      placeholder="Custom activity"
                      placeholderTextColor="#8AA39D"
                      style={[styles.singleInput, { flex: 1, marginTop: 0 }]}
                    />
                    <Pressable onPress={addCustomInfluence} style={styles.smallActionButton}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Add</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <Pressable onPress={() => setDetailsOpen((prev) => !prev)} style={{ marginTop: 14 }}>
                <Text style={{ color: '#334155', fontWeight: '800' }}>
                  {detailsOpen ? '▾ Optional details' : '▸ Optional details'}
                </Text>
              </Pressable>

              {detailsOpen ? (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {(
                    [
                      ['energyLevel', 'Energy', 'lightning-bolt-outline', details.energyLevel ? `Level ${details.energyLevel}/5` : 'Optional', null],
                      ['sleepQuality', 'Sleep', 'moon-waning-crescent', details.sleepQuality ? `Level ${details.sleepQuality}/5` : (sleepValue ? `Recent: ${sleepValue}` : 'Optional'), sleepValue ? `Recent sleep: ${sleepValue}.` : 'If you connect a device, sleep can fill in automatically.'],
                      ['nutrition', 'Nutrition', 'sparkles', details.nutrition ? `Level ${details.nutrition}/5` : (nutritionValue || 'Optional'), contextData?.meals?.last?.name ? `Last meal: ${contextData.meals.last.name}` : null],
                      ['supplements', 'Supplements', 'flask-outline', details.supplements ? `Level ${details.supplements}/5` : (supplementsValue || 'Optional'), null],
                      ['physicalActivity', 'Activity', 'chart-line', details.physicalActivity ? `Level ${details.physicalActivity}/5` : (activityValue || 'Optional'), activityValue ? `Today: ${activityValue}.` : 'If you log activity, it can show up here automatically.'],
                    ] as Array<[FivePointKey, string, React.ComponentProps<typeof MaterialCommunityIcons>['name'], string, string | null]>
                  ).map(([key, label, iconName, valueText, helperText]) => {
                    const open = detailPanel === key
                    return (
                      <View key={key} style={styles.detailCard}>
                        <Pressable
                          onPress={() => setDetailPanel((current) => (current === key ? null : key))}
                          style={styles.detailHeader}
                        >
                          <View style={styles.detailIconWrap}>
                            <MaterialCommunityIcons name={iconName} size={18} color="#475467" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailTitle}>{label}</Text>
                            <Text style={styles.detailValue}>{valueText}</Text>
                          </View>
                          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#98A2B3" />
                        </Pressable>

                        {open ? (
                          <View style={styles.detailBody}>
                            {helperText ? (
                              <Text style={styles.detailHint}>{helperText}</Text>
                            ) : null}
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {[1, 2, 3, 4, 5].map((value) => {
                                const selected = details[key] === value
                                return (
                                  <Pressable
                                    key={`${key}-${value}`}
                                    onPress={() =>
                                      setDetails((prev) => ({
                                        ...prev,
                                        [key]: prev[key] === value ? null : value,
                                      }))
                                    }
                                    style={[styles.scaleButton, selected ? styles.scaleButtonActive : null]}
                                  >
                                    <Text style={[styles.scaleButtonText, selected ? styles.scaleButtonTextActive : null]}>{value}</Text>
                                  </Pressable>
                                )
                              })}
                            </View>
                          </View>
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ) : null}

              <View style={{ marginTop: 10 }}>
                <Text style={{ color: '#334155', fontWeight: '700', marginBottom: 6 }}>Note (optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Write a quick note…"
                  placeholderTextColor="#8AA39D"
                  multiline
                  maxLength={600}
                  style={styles.noteInput}
                />
                <Text style={{ marginTop: 4, color: '#98A2B3', fontSize: 12 }}>{note.length}/600</Text>
              </View>

              <Text style={{ marginTop: 10, color: '#667085', fontSize: 12 }}>
                Mood is required. Everything else is optional.
              </Text>

              <Pressable
                onPress={saveEntry}
                disabled={selectedMood == null || entriesSaving}
                style={[
                  styles.logMoodButton,
                  (selectedMood == null || entriesSaving) ? { opacity: 0.5 } : null,
                ]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18 }}>
                  {entriesSaving ? 'Saving...' : 'Log Mood'}
                </Text>
                <Feather name="arrow-right" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </>
        ) : null}

        {activeTab === 'history' ? (
          <View style={styles.card}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text }}>Mood History</Text>
            <Text style={{ marginTop: 6, color: theme.colors.muted }}>
              {visibleHistoryRangeLabel}
            </Text>

            <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.text, flex: 1 }}>
                {moodSummaryFromAverage(overallAverage)}
              </Text>
              <Pressable
                onPress={openPeriodPicker}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: theme.colors.card,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                  {PERIOD_OPTIONS.find((item) => item.key === historyPeriod)?.label || 'Week'} ▾
                </Text>
              </Pressable>
            </View>

            {trendPct != null ? (
              <Text style={{ marginTop: 4, color: theme.colors.primary, fontWeight: '800' }}>
                {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct).toFixed(0)}% vs previous period
              </Text>
            ) : null}

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              {(['wave', 'pie'] as const).map((mode) => {
                const active = chartMode === mode
                return (
                  <Pressable
                    key={mode}
                    onPress={() => {
                      setChartMode(mode)
                      setActivePointIndex(null)
                      setActiveSliceMood(null)
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: active ? '#4CAF50' : theme.colors.border,
                      backgroundColor: active ? '#4CAF50' : theme.colors.card,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '700' }}>
                      {mode === 'wave' ? 'Wave' : 'Pie'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {historyLoading || entriesLoading ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : chartPoints.length === 0 ? (
              <View style={{ marginTop: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12 }}>
                <Text style={{ color: theme.colors.muted }}>No mood entries in this period.</Text>
              </View>
            ) : chartMode === 'wave' ? (
              <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E5ECE9', borderRadius: 12, padding: 10, backgroundColor: '#FCFDFC' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Svg width={chartWidth} height={chartHeight}>
                    {[1, 3, 5, 7].map((tick) => (
                      <G key={`grid-${tick}`}>
                        <Rect
                          x={chartPadding.left}
                          y={yAt(tick)}
                          width={plotWidth}
                          height={1}
                          fill="#E6EEEB"
                        />
                        <SvgText x={6} y={yAt(tick) + 4} fontSize="10" fill="#6B7F79">
                          {tick}
                        </SvgText>
                      </G>
                    ))}

                    <Path d={buildWavePath()} fill="none" stroke="#22C55E" strokeWidth={2.5} />

                    {chartPoints.map((point, index) => {
                      const x = xAt(index)
                      const y = yAt(point.mood)
                      const active = activePointIndex === index
                      return (
                        <G key={`${point.timestamp}-${index}`}>
                          <Circle cx={x} cy={y} r={14} fill="transparent" onPress={() => toggleWavePoint(index)} />
                          <Circle
                            cx={x}
                            cy={y}
                            r={active ? 6 : 4}
                            fill={active ? '#16A34A' : '#22C55E'}
                            onPress={() => toggleWavePoint(index)}
                          />
                          <SvgText x={x} y={Math.max(18, y - 14)} fontSize="16" textAnchor="middle" onPress={() => toggleWavePoint(index)}>
                            {moodEmoji(point.mood)}
                          </SvgText>
                        </G>
                      )
                    })}

                    {chartPoints.map((point, index) => {
                      if (index % xLabelStep !== 0 && index !== chartPoints.length - 1) return null
                      return (
                        <SvgText
                          key={`xtick-${point.timestamp}-${index}`}
                          x={xAt(index)}
                          y={chartHeight - 8}
                          fontSize="9"
                          fill="#6B7F79"
                          textAnchor="middle"
                        >
                          {point.xLabel}
                        </SvgText>
                      )
                    })}
                  </Svg>
                </ScrollView>

                {activePointIndex != null ? (
                  <Pressable onPress={() => setActivePointIndex(null)} style={styles.tooltipCard}>
                    <Text style={styles.tooltipTitle}>{moodLabel(chartPoints[activePointIndex].mood)}</Text>
                    <Text style={styles.tooltipText}>
                      {formatDateTime(chartPoints[activePointIndex].timestamp || '')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E5ECE9', borderRadius: 12, padding: 12, backgroundColor: '#FCFDFC' }}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Svg width={pieRadius * 2 + 16} height={pieRadius * 2 + 16}>
                    {pieSegments.map((segment) => (
                      <Path
                        key={`slice-${segment.mood}`}
                        d={describeArc(pieCenterX, pieCenterY, pieRadius, segment.start, segment.end)}
                        fill={segment.color}
                        onPressIn={() => togglePieMood(segment.mood)}
                      />
                    ))}
                    <Circle cx={pieCenterX} cy={pieCenterY} r={44} fill="#FFFFFF" />
                    <SvgText x={pieCenterX} y={pieCenterY - 6} fontSize="12" fill="#425853" textAnchor="middle">
                      Total
                    </SvgText>
                    <SvgText x={pieCenterX} y={pieCenterY + 14} fontSize="18" fontWeight="700" fill="#0B1B17" textAnchor="middle">
                      {pieTotal}
                    </SvgText>
                  </Svg>
                </View>

                <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {pieSegments.map((segment) => (
                    <Pressable
                      key={`legend-${segment.mood}`}
                      onPress={() => togglePieMood(segment.mood)}
                      style={{
                        borderWidth: 1,
                        borderColor: activeSliceMood === segment.mood ? '#4CAF50' : theme.colors.border,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: theme.colors.card,
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: segment.color }} />
                      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>
                        {moodEmoji(segment.mood)} {segment.count}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {activeSliceMood != null ? (
                  <Pressable onPress={() => setActiveSliceMood(null)} style={styles.tooltipCard}>
                    <Text style={styles.tooltipTitle}>{moodLabel(activeSliceMood)}</Text>
                    <Text style={styles.tooltipText}>
                      Count: {pieSegments.find((slice) => slice.mood === activeSliceMood)?.count || 0}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Top Mood</Text>
                <Text style={styles.summaryBig}>{topMood ? moodEmoji(topMood.mood) : '🙂'}</Text>
                <Text style={styles.summarySmall}>{topMood ? `${topMood.count}x` : '0x'}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Streak</Text>
                <Text style={styles.summaryBig}>🔥</Text>
                <Text style={styles.summarySmall}>{streakDays} day{streakDays === 1 ? '' : 's'}</Text>
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>This Month</Text>
              <View style={styles.monthGridWrap}>
                {thisMonthDays.map((cell, index) =>
                  cell.type === 'pad' ? (
                    <View key={`pad-${index}`} style={styles.monthCell} />
                  ) : (
                    <View key={cell.date} style={[styles.monthCell, { borderColor: '#E5ECE9' }]}>
                      {cell.avg == null ? (
                        <Text style={{ color: '#A0B2AE', fontSize: 10 }}>{cell.day}</Text>
                      ) : (
                        <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: dotColorForAvg(cell.avg) }} />
                      )}
                    </View>
                  ),
                )}
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Recent entries</Text>
              <View style={{ marginTop: 8, gap: 8 }}>
                {sortedEntries
                  .slice()
                  .reverse()
                  .slice(0, 8)
                  .map((entry) => (
                    <View key={entry.id} style={styles.listRow}>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                        {formatEntryDateLabel(entry.localDate)} · {moodEmoji(Number(entry.mood))} {moodLabel(Number(entry.mood))}
                      </Text>
                      <Text style={{ marginTop: 3, color: theme.colors.muted, fontSize: 12 }}>
                        {formatDateTime(entry.timestamp || '')}
                      </Text>
                      {!!entry.note ? <Text style={{ marginTop: 4, color: theme.colors.muted }}>{entry.note}</Text> : null}
                    </View>
                  ))}
              </View>
            </View>
          </View>
        ) : null}

        {activeTab === 'journal' ? (
          <>
            <View style={styles.card}>
              <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text }}>Mood Journal</Text>
              <Text style={{ marginTop: 6, color: theme.colors.muted }}>
                Write down your day, then save it to your mood history.
              </Text>

              <TextInput
                value={journalDate}
                onChangeText={setJournalDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8AA39D"
                style={styles.singleInput}
              />

              <TextInput
                value={journalTitle}
                onChangeText={setJournalTitle}
                placeholder="Entry title"
                placeholderTextColor="#8AA39D"
                style={styles.singleInput}
              />

              <Text style={styles.sectionTitle}>Prompts</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {JOURNAL_PROMPTS.map((prompt) =>
                  renderChip(prompt, journalPrompt === prompt, () => {
                    setJournalPrompt((current) => (current === prompt ? '' : prompt))
                  }),
                )}
              </View>

              <Text style={styles.sectionTitle}>Templates</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {JOURNAL_TEMPLATES.map((template) =>
                  renderChip(template.name, journalTemplate === template.name, () => {
                    if (journalTemplate === template.name) {
                      setJournalTemplate('')
                      return
                    }
                    setJournalTemplate(template.name)
                    setJournalContent((prev) => (prev.trim().length > 0 ? `${prev}\n\n${template.body}` : template.body))
                  }),
                )}
              </View>

              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                  value={journalTagInput}
                  onChangeText={setJournalTagInput}
                  placeholder="Add tag"
                  placeholderTextColor="#8AA39D"
                  style={[styles.singleInput, { flex: 1, marginTop: 0 }]}
                />
                <Pressable onPress={handleAddJournalTag} style={styles.smallActionButton}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Add</Text>
                </Pressable>
              </View>
              {journalTags.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {journalTags.map((tag) =>
                    renderChip(tag, true, () => setJournalTags((prev) => prev.filter((item) => item !== tag))),
                  )}
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={pickJournalImage}
                  disabled={mediaBusy}
                  style={[
                    styles.journalMediaButton,
                    styles.journalPhotoButton,
                    mediaBusy ? styles.journalMediaButtonDisabled : null,
                  ]}
                >
                  <View style={styles.journalMediaIconWrap}>
                    {mediaBusy ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Feather name="camera" size={15} color={theme.colors.primary} />
                    )}
                  </View>
                  <Text style={styles.journalMediaButtonText}>{mediaBusy ? 'Working...' : 'Add photo'}</Text>
                </Pressable>
                <Pressable
                  onPress={recording ? stopVoiceRecording : startVoiceRecording}
                  disabled={mediaBusy}
                  style={[
                    styles.journalMediaButton,
                    styles.journalVoiceButton,
                    recording ? styles.journalMediaButtonActive : null,
                    mediaBusy ? styles.journalMediaButtonDisabled : null,
                  ]}
                >
                  <View style={[styles.journalMediaIconWrap, recording ? styles.journalMediaIconWrapActive : null]}>
                    <Feather name={recording ? 'square' : 'mic'} size={15} color={recording ? '#FFFFFF' : theme.colors.text} />
                  </View>
                  <Text style={[styles.journalMediaButtonText, recording ? styles.journalMediaButtonTextActive : null]}>
                    {recording ? 'Stop recording' : 'Record voice note'}
                  </Text>
                </Pressable>
              </View>

              {journalImages.length > 0 ? (
                <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {journalImages.map((uri) => (
                    <View key={uri} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri }}
                        style={{ width: 70, height: 70, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}
                      />
                      <Pressable
                        onPress={() => setJournalImages((prev) => prev.filter((item) => item !== uri))}
                        style={{
                          position: 'absolute',
                          right: -4,
                          top: -4,
                          width: 20,
                          height: 20,
                          borderRadius: 99,
                          backgroundColor: '#DC2626',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {journalAudio.length > 0 ? (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {journalAudio.map((clip, index) => (
                    <View
                      key={clip.id}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Voice note {index + 1}</Text>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        {clip.uploading ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : null}
                        <Pressable
                          onPress={() => {
                            const playbackUri = clip.localUri || clip.remoteUri || ''
                            if (!playbackUri) return
                            void toggleAudioPlayback(playbackUri)
                          }}
                          disabled={clip.uploading || (!clip.localUri && !clip.remoteUri)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: playingAudioUri === (clip.localUri || clip.remoteUri || '') ? '#16A34A' : theme.colors.border,
                            backgroundColor: playingAudioUri === (clip.localUri || clip.remoteUri || '') ? '#EAF8EE' : '#FFFFFF',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: clip.uploading || (!clip.localUri && !clip.remoteUri) ? 0.4 : 1,
                          }}
                        >
                          <Feather
                            name={playingAudioUri === (clip.localUri || clip.remoteUri || '') ? 'pause' : 'play'}
                            size={16}
                            color={playingAudioUri === (clip.localUri || clip.remoteUri || '') ? '#16A34A' : theme.colors.primary}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            const playbackUri = clip.localUri || clip.remoteUri || ''
                            if (playingAudioUri === playbackUri) {
                              void stopAudioPlayback()
                            }
                            setJournalAudio((prev) => prev.filter((item) => item.id !== clip.id))
                          }}
                        >
                          <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <TextInput
                value={journalContent}
                onChangeText={setJournalContent}
                placeholder="Write your notes here..."
                placeholderTextColor="#8AA39D"
                multiline
                style={[styles.noteInput, { minHeight: 130 }]}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={saveJournalEntry}
                  disabled={journalSaving}
                  style={[styles.primaryActionButton, { flex: 1, opacity: journalSaving ? 0.6 : 1 }]}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                    {journalSaving ? 'Saving...' : editingJournalId ? 'Update entry' : 'Save entry'}
                  </Text>
                </Pressable>
                {editingJournalId ? (
                  <Pressable onPress={resetJournalForm} style={styles.secondaryActionButton}>
                    <Text style={{ color: theme.colors.muted, fontWeight: '800' }}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Saved journal entries</Text>
              <TextInput
                value={journalSearch}
                onChangeText={setJournalSearch}
                placeholder="Search entries"
                placeholderTextColor="#8AA39D"
                style={styles.singleInput}
              />
              {journalLoading ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : visibleJournalEntries.length === 0 ? (
                <Text style={{ marginTop: 10, color: theme.colors.muted }}>No journal entries yet.</Text>
              ) : (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {visibleJournalEntries.map((entry) => {
                    const tags = normalizeStringArray(entry.tags)
                    const images = normalizeStringArray(entry.images)
                    const audio = normalizeStringArray(entry.audio)
                    return (
                      <View key={entry.id} style={styles.listRow}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                          {entry.title || 'Untitled entry'}
                        </Text>
                        <Text style={{ marginTop: 2, color: theme.colors.muted, fontSize: 12 }}>
                          {formatEntryDateLabel(entry.localDate)} · {formatDateTime(entry.createdAt || '')}
                        </Text>
                        {!!entry.content ? (
                          <Text style={{ marginTop: 5, color: theme.colors.muted }}>
                            {String(entry.content).slice(0, 160)}
                            {String(entry.content).length > 160 ? '…' : ''}
                          </Text>
                        ) : null}
                        {(images.length > 0 || audio.length > 0) ? (
                          <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
                            {images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'}` : ''}
                            {images.length > 0 && audio.length > 0 ? ' · ' : ''}
                            {audio.length > 0 ? `${audio.length} voice note${audio.length === 1 ? '' : 's'}` : ''}
                          </Text>
                        ) : null}
                        {tags.length > 0 ? (
                          <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
                            {tags.join(' · ')}
                          </Text>
                        ) : null}
                        <View style={{ marginTop: 8, flexDirection: 'row', gap: 12 }}>
                          <Pressable onPress={() => editJournalEntry(entry)}>
                            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Edit</Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              Alert.alert('Delete entry', 'Delete this journal entry?', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Delete', style: 'destructive', onPress: () => void deleteJournalEntry(entry.id) },
                              ])
                            }
                          >
                            <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  tabsWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
    backgroundColor: '#F7FBF7',
  },
  tabButtonInactive: {
    backgroundColor: theme.colors.card,
  },
  tabText: {
    fontWeight: '700',
    fontSize: 14,
  },
  tabTextActive: {
    color: theme.colors.primary,
  },
  tabTextInactive: {
    color: theme.colors.muted,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
  },
  sectionTitle: {
    marginTop: 12,
    color: theme.colors.text,
    fontWeight: '800',
  },
  intensityCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E8EEF4',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    padding: 14,
  },
  intensityIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  intensityTrack: {
    marginTop: 4,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'visible',
    justifyContent: 'center',
  },
  intensityTrackFill: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#4CAF50',
  },
  intensityKnob: {
    position: 'absolute',
    top: -7,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 99,
    borderWidth: 4,
    borderColor: '#4CAF50',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  intensityRangeLabel: {
    color: '#98A2B3',
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  feelingChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  feelingChipActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  feelingGroupBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  feelingGroupBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  addChipButton: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderStyle: 'dashed',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  moreOptionsButton: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  influenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
  },
  influenceTileButton: {
    width: '33.333%',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 8,
  },
  influenceImageWrap: {
    padding: 4,
    borderRadius: 999,
  },
  influenceImageWrapActive: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  influenceImage: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  customInfluenceBadge: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  influenceCheckBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  customDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 99,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  influenceLabel: {
    textAlign: 'center',
    color: '#667085',
    fontSize: 13,
    fontWeight: '600',
  },
  influenceLabelActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  addInfluenceCircle: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  detailCard: {
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  detailHeader: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  detailTitle: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '700',
  },
  detailValue: {
    color: '#667085',
    fontSize: 12,
    marginTop: 1,
  },
  detailBody: {
    borderTopWidth: 1,
    borderTopColor: '#F2F4F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  detailHint: {
    color: '#667085',
    fontSize: 12,
  },
  scaleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 8,
  },
  scaleButtonActive: {
    borderColor: 'rgba(76,175,80,0.3)',
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  scaleButtonText: {
    color: '#334155',
    fontWeight: '700',
  },
  scaleButtonTextActive: {
    color: '#1F7A21',
    fontWeight: '800',
  },
  noteInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    minHeight: 90,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  logMoodButton: {
    marginTop: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    shadowColor: '#4CAF50',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  listRow: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 10,
    backgroundColor: '#FBFDFC',
  },
  tooltipCard: {
    marginTop: 8,
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  tooltipText: {
    color: '#D1D5DB',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#FBFDFC',
  },
  summaryLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryBig: {
    marginTop: 6,
    fontSize: 24,
  },
  summarySmall: {
    marginTop: 4,
    color: theme.colors.text,
    fontWeight: '700',
  },
  journalMediaButton: {
    borderWidth: 1,
    borderColor: '#D0DDE4',
    backgroundColor: '#F8FBFA',
    borderRadius: 999,
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  journalPhotoButton: {
    flex: 0.85,
    paddingHorizontal: 10,
  },
  journalVoiceButton: {
    flex: 1.15,
    paddingHorizontal: 14,
  },
  journalMediaButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#EAF8EE',
  },
  journalMediaButtonDisabled: {
    opacity: 0.65,
  },
  journalMediaIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.26)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  journalMediaIconWrapActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  journalMediaButtonText: {
    color: '#3A4B46',
    fontWeight: '800',
    fontSize: 13,
  },
  journalMediaButtonTextActive: {
    color: '#1F7A21',
  },
  monthGridWrap: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  monthCell: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  yearMonthCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#FBFDFC',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yearMonthLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    minWidth: 40,
  },
  singleInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryActionButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
