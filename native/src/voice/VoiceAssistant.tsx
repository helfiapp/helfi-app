import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, Vibration, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { API_BASE_URL } from '../config'
import { hasAiDataSharingPermission, requestAiDataSharingPermission } from '../lib/aiConsent'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { theme } from '../ui/theme'
import { hasNativeRealtimeVoiceSupport, startHelfiRealtimeVoiceSession } from './realtimeVoice'

export type VoiceAssistantLaunchContext = {
  section?:
    | 'dashboard'
    | 'food'
    | 'water'
    | 'journal'
    | 'symptoms'
    | 'health-image'
    | 'exercise'
    | 'mood'
    | 'check-in'
    | 'insights'
    | 'health-coach'
    | 'settings'
    | 'more'
    | 'billing'
    | 'devices'
    | 'support'
    | 'profile'
    | 'health-intake'
    | 'practitioner'
    | 'generic'
  title?: string
  mode?: 'voice' | 'food-photo' | 'health-image' | 'journal-photo'
  meal?: string
  date?: string
}

type OpenVoiceAssistantInput = {
  transcript?: string
  source?: 'siri' | 'button'
  autoSubmit?: boolean
  context?: VoiceAssistantLaunchContext
}

type VoiceAssistantContextValue = {
  openVoiceAssistant: (input?: OpenVoiceAssistantInput) => void
}

type VoiceDraft = {
  action: string
  transcript: string
  localDate?: string
  summary: string
  confirmationMessage: string
  canConfirm: boolean
  autoSave?: boolean
  recipe?: { text?: string }
  appTarget?: {
    title?: string
    path?: string
    buttonLabel?: string
    nativeTarget?: any
  }
  food?: {
    meal?: string
    entries?: Array<{ name: string; description?: string | null }>
    draftText?: string
    sourceDate?: string
    mealName?: string
    nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number }
  }
  water?: {
    amount?: number
    unit?: string
    label?: string
    drinkType?: string | null
  }
  exercise?: {
    exerciseTypeId?: number
    exerciseName?: string
    durationMinutes?: number
    distanceKm?: number | null
    steps?: number | null
    caloriesKcal?: number | null
    speedKph?: number | null
    intensity?: string | null
    estimatedDuration?: boolean
  }
  healthIntake?: {
	    items?: Array<{
	      type?: 'supplement' | 'medication' | string
	      name?: string
	      dosage?: string
	      timing?: string[]
	      catalogMatch?: { name?: string; source?: string; confidence?: string } | null
	    }>
	  }
  reviewToken?: string
}

type SaveSuccessNotice = {
  title: string
  message: string
}

type VoiceConversationTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type VisionChoice = 'food-photo' | 'journal-photo' | 'health-image' | 'supplement-bottle' | 'medication-bottle'
type SpokenReplyStatus = 'idle' | 'preparing' | 'playing' | 'failed' | 'unavailable'
type BottleLabelImageAsset = { uri: string; fileName?: string | null; mimeType?: string | null }
type StopRecordingOptions = { continueSession?: boolean }
type RealtimeVoiceStatus = 'idle' | 'connecting' | 'live' | 'speaking' | 'closed' | 'failed' | 'fallback'
type RealtimeActionHint = { action?: string; needsReview?: boolean }
type DraftRequestResult = {
  ok: boolean
  message: string
  saved?: boolean
  needsReview?: boolean
  action?: string
  reviewPrompt?: string
  status?: 'needs_clarification' | 'review_draft' | 'saved' | 'open_screen' | 'safe_refusal' | 'general_answer'
}
type RealtimeToolResult = DraftRequestResult & {
  spokenReply: string
  safeToClaimSaved: boolean
  instruction: string
}
type DraftRequestOptions = {
  audioUri?: string
  durationMillis?: number
  transcriptOverride?: string
  continuousVoice?: boolean
  realtimeActionHint?: RealtimeActionHint
  suppressSpokenReply?: boolean
  signal?: AbortSignal
}
type DraftRequestHandler = (options?: DraftRequestOptions) => Promise<DraftRequestResult>
type RealtimeActionGuard = {
  key: string
  startedAt: number
  promise: Promise<RealtimeToolResult>
}
type VoiceActivityItem = {
  id: number
  text: string
  state: 'active' | 'done' | 'error'
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null)
const VOICE_REPLY_KEY = 'helfi_voice_reply_enabled_v1'
const VOICE_CONVERSATION_MEMORY_KEY = 'helfi_voice_recent_conversation_v1'
const VOICE_CONVERSATION_MEMORY_TTL_MS = 30 * 60 * 1000
const FOOD_FAVORITES_KEY = 'helfi_native_food_favorites_v2'
const MAX_VOICE_FAVORITES = 120
const VOICE_ASSISTANT_OPENING_EVENT = 'helfi:voice-assistant-opening'
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'
const VOICE_ACCESS_FALLBACK_API_BASE_URL = 'https://helfi.ai'
const SPOKEN_REPLY_VOICE_NAME = 'Marin'
// The owner-approved single-screen voice experience is the native default.
// Do not gate it behind a build command: missing build flags previously restored the retired recorder UI.
const LIVE_VOICE_ENABLED = true
const LIVE_VOICE_DISABLED_MESSAGE = 'Live voice is paused while it is being rebuilt. Text and camera still work.'
const REALTIME_VOICE_CONNECT_TIMEOUT_MS = 8000
const NOT_SAVED_MESSAGE = 'No problem. I have not saved anything.'
const VOICE_TURN_SILENCE_MS = 750
const VOICE_TURN_MIN_MS = 650
const VOICE_TURN_MAX_MS = 8000
const VOICE_TURN_METER_THRESHOLD = -38

const DEFAULT_LAUNCH_CONTEXT: VoiceAssistantLaunchContext = { section: 'generic', title: 'Helfi' }
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeLaunchContext(input?: VoiceAssistantLaunchContext | null): VoiceAssistantLaunchContext {
  if (!input || typeof input !== 'object') return DEFAULT_LAUNCH_CONTEXT
  const date = cleanFavoriteText(input.date || '', 20)
  return {
    section: input.section || 'generic',
    title: cleanFavoriteText(input.title || '', 80) || 'Helfi',
    mode: input.mode,
    meal: cleanFavoriteText(input.meal || '', 40).toLowerCase() || undefined,
    date: ISO_DATE_PATTERN.test(date) ? date : undefined,
  }
}

function voiceResultStatusFromDraft(nextDraft: VoiceDraft | null, data?: any): DraftRequestResult['status'] {
  if (data?.confirmNow) return 'saved'
  if (data?.rejectNow) return 'general_answer'
  if (!nextDraft) return 'general_answer'
  if (nextDraft.canConfirm) return 'review_draft'
  if (nextDraft.appTarget?.path) return 'open_screen'
  if (/urgent|emergency|clinician|qualified health professional|not medical advice|not diagnose/i.test(nextDraft.confirmationMessage || '')) {
    return 'safe_refusal'
  }
  if (/what|which|how much|please tell me|try naming/i.test(nextDraft.confirmationMessage || '')) {
    return 'needs_clarification'
  }
  return 'general_answer'
}

function compactRecipeVoiceReply(value: unknown, fallback?: unknown) {
  const plain = String(value || fallback || '')
    .replace(/\*\*|__|#{1,6}\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const beforeDetails = plain.split(/\b(?:ingredients?|approx(?:imate)?\s+macros?|macros?|nutrients?|nutrition|recipe|steps?|method|instructions?)\b/i)[0]
  const title = cleanFavoriteText(beforeDetails.split(/[.!?]/)[0] || fallback || 'a meal that fits your day', 140)
    .replace(/^[-–—•\d.)\s]+/, '')
    .trim()
  return `My suggestion is ${title || 'a meal that fits your day'}. Would you like me to tell you the ingredients and nutrients, or the cooking steps?`
}

function spokenReplyTextForDraft(nextDraft: VoiceDraft | null) {
  if (!nextDraft) return ''
  if (nextDraft.recipe?.text) {
    return compactRecipeVoiceReply(nextDraft.recipe.text, nextDraft.summary)
  }
  return nextDraft.confirmationMessage || nextDraft.summary || ''
}

function reviewPromptForDraft(nextDraft: VoiceDraft | null) {
  if (!nextDraft?.canConfirm) return spokenReplyTextForDraft(nextDraft)
  const date = cleanFavoriteText(nextDraft.localDate || '', 20)
  let exactSummary = cleanFavoriteText(nextDraft.summary || nextDraft.confirmationMessage || '', 900)
  if (nextDraft.action === 'exercise' && nextDraft.exercise) {
    const exercise = nextDraft.exercise
    exactSummary = [
      cleanFavoriteText(exercise.exerciseName || '', 100) || 'exercise',
      exercise.durationMinutes ? `${exercise.estimatedDuration ? 'about ' : ''}${exercise.durationMinutes} minutes` : '',
      exercise.distanceKm ? `${exercise.distanceKm} km` : '',
      exercise.speedKph ? `${exercise.speedKph} km/h` : '',
      exercise.steps ? `${Math.round(exercise.steps).toLocaleString()} steps` : '',
      exercise.caloriesKcal ? `${Math.round(exercise.caloriesKcal)} calories` : '',
    ].filter(Boolean).join(', ')
  } else if (nextDraft.action === 'water' && nextDraft.water) {
    exactSummary = `${nextDraft.water.amount || ''} ${nextDraft.water.unit || ''} ${nextDraft.water.label || nextDraft.water.drinkType || 'water'}`.replace(/\s+/g, ' ').trim()
  } else if ((nextDraft.action === 'food_build_meal' || nextDraft.action === 'food_favorite' || nextDraft.action === 'food_copy_previous') && nextDraft.food) {
    const items = nextDraft.food.entries?.map((entry) => entry.description ? `${entry.name}, ${entry.description}` : entry.name).filter(Boolean).join('; ')
    exactSummary = [mealLabel(nextDraft.food.meal), items || nextDraft.food.draftText || nextDraft.summary].filter(Boolean).join(': ')
  }
  const datedSummary = date ? `${exactSummary}, dated ${date}` : exactSummary
  return `Here is what I am about to save: ${datedSummary}. Would you like me to save that for you?`
}

function realtimeToolResult(result: DraftRequestResult): RealtimeToolResult {
  const status = result.status || (result.saved ? 'saved' : result.needsReview ? 'review_draft' : 'general_answer')
  const saved = Boolean(result.saved && status === 'saved')
  const needsReview = Boolean(result.needsReview || status === 'review_draft')
  const defaultSpokenReply = cleanFavoriteText(
    result.reviewPrompt || result.message ||
      (saved
        ? 'Saved.'
        : needsReview
        ? 'Would you like me to save that for you?'
        : status === 'open_screen'
        ? 'That screen is ready.'
        : status === 'needs_clarification'
        ? 'I need one detail first.'
        : 'Done.'),
    500,
  )
  const spokenReply = result.action === 'recipe' && !saved
    ? compactRecipeVoiceReply(defaultSpokenReply)
    : defaultSpokenReply
  const instruction = saved
    ? 'You may say this was saved because the app confirmed a successful save.'
    : needsReview
    ? 'Read spokenReply exactly, including the exact proposal summary and the exact final question. Then automatically listen for a natural yes, no, or correction. Do not say it was saved, added, created, or logged.'
    : status === 'open_screen'
    ? 'Say the app screen is ready. Do not say anything was saved.'
    : status === 'safe_refusal'
    ? 'Give the safety message briefly. Do not claim an app action was saved.'
    : status === 'needs_clarification'
    ? 'Ask the clarification briefly. Do not guess and do not say anything was saved.'
    : 'Answer briefly. Do not say anything was saved unless safeToClaimSaved is true.'
  return {
    ...result,
    status,
    saved,
    needsReview,
    message: spokenReply,
    spokenReply,
    safeToClaimSaved: saved,
    instruction,
  }
}

function mealLabel(value?: string | null) {
  const text = cleanFavoriteText(value || '', 40).toLowerCase()
  if (text === 'snacks') return 'Snacks'
  if (text === 'uncategorized') return 'Other'
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Breakfast'
}

function splitVoiceFoodList(value?: string | null) {
  return String(value || '')
    .split(',')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function hasVagueFoodAmount(value: string) {
  return /\b(?:some|a few|few|couple(?: of)?|a couple(?: of)?|handful(?: of)?|a handful(?: of)?|bit(?: of)?|a bit(?: of)?|little(?: bit)?(?: of)?|a little(?: bit)?(?: of)?|several)\b/i.test(value)
}

function firstClarificationFoodName(draft: VoiceDraft | null) {
  const message = cleanFavoriteText(draft?.confirmationMessage || '', 220)
  const match = message.match(/How much\s+(.+?)\s+should I use/i)
  const raw = cleanFavoriteText(match?.[1] || '', 120)
  if (!raw) return ''
  return raw.split(',')[0]?.trim() || raw
}

function answerLooksLikeAmount(value: string) {
  const text = normalizeSpokenFollowUpAnswer(value)
  return /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s*(?:g|gram|grams|kg|ml|l|oz|ounce|ounces|cup|cups|tbsp|tablespoon|tsp|teaspoon|handful|handfuls|piece|pieces|small|medium|large)?\b/i.test(text)
}

function normalizeSpokenFollowUpAnswer(value: string) {
  return cleanFavoriteText(value, 260)
    .replace(/,/g, '.')
    .replace(/(^|\s)(еден|една|едно)(?=\s|$)/gi, '$1one')
    .replace(/(^|\s)(два|две)(?=\s|$)/gi, '$1two')
    .replace(/(^|\s)три(?=\s|$)/gi, '$1three')
    .replace(/(^|\s)четири(?=\s|$)/gi, '$1four')
    .replace(/(^|\s)пет(?=\s|$)/gi, '$1five')
    .replace(/(^|\s)шест(?=\s|$)/gi, '$1six')
    .replace(/(^|\s)седум(?=\s|$)/gi, '$1seven')
    .replace(/(^|\s)осум(?=\s|$)/gi, '$1eight')
    .replace(/(^|\s)девет(?=\s|$)/gi, '$1nine')
    .replace(/(^|\s)десет(?=\s|$)/gi, '$1ten')
    .replace(/(^|\s)половина(?=\s|$)/gi, '$1half')
    .replace(/(^|\s)(uno|una|un|une)(?=\s|$)/gi, '$1one')
    .replace(/(^|\s)(dos|deux)(?=\s|$)/gi, '$1two')
    .replace(/(^|\s)(tres|trois)(?=\s|$)/gi, '$1three')
    .replace(/(^|\s)(cuatro|quatre)(?=\s|$)/gi, '$1four')
    .replace(/(^|\s)(cinco|cinq)(?=\s|$)/gi, '$1five')
    .replace(/(^|\s)(seis|six)(?=\s|$)/gi, '$1six')
    .replace(/(^|\s)(siete|sept)(?=\s|$)/gi, '$1seven')
    .replace(/(^|\s)(ocho|huit)(?=\s|$)/gi, '$1eight')
    .replace(/(^|\s)(nueve|neuf)(?=\s|$)/gi, '$1nine')
    .replace(/(^|\s)(diez|dix)(?=\s|$)/gi, '$1ten')
    .replace(/(^|\s)(medio|media|demi|demie)(?=\s|$)/gi, '$1half')
    .replace(/(^|\s)(uno|una)(?=\s|$)/gi, '$1one')
    .replace(/(^|\s)due(?=\s|$)/gi, '$1two')
    .replace(/(^|\s)tre(?=\s|$)/gi, '$1three')
    .replace(/(^|\s)quattro(?=\s|$)/gi, '$1four')
    .replace(/(^|\s)cinque(?=\s|$)/gi, '$1five')
    .replace(/(^|\s)sei(?=\s|$)/gi, '$1six')
    .replace(/(^|\s)sette(?=\s|$)/gi, '$1seven')
    .replace(/(^|\s)otto(?=\s|$)/gi, '$1eight')
    .replace(/(^|\s)nove(?=\s|$)/gi, '$1nine')
    .replace(/(^|\s)dieci(?=\s|$)/gi, '$1ten')
    .replace(/(^|\s)mezz[oa](?=\s|$)/gi, '$1half')
    .replace(/(^|\s)(um|uma)(?=\s|$)/gi, '$1one')
    .replace(/(^|\s)(dois|duas)(?=\s|$)/gi, '$1two')
    .replace(/(^|\s)três(?=\s|$)/gi, '$1three')
    .replace(/(^|\s)tres(?=\s|$)/gi, '$1three')
    .replace(/(^|\s)quatro(?=\s|$)/gi, '$1four')
    .replace(/(^|\s)cinco(?=\s|$)/gi, '$1five')
    .replace(/(^|\s)seis(?=\s|$)/gi, '$1six')
    .replace(/(^|\s)sete(?=\s|$)/gi, '$1seven')
    .replace(/(^|\s)oito(?=\s|$)/gi, '$1eight')
    .replace(/(^|\s)nove(?=\s|$)/gi, '$1nine')
    .replace(/(^|\s)dez(?=\s|$)/gi, '$1ten')
    .replace(/(^|\s)mei[oa](?=\s|$)/gi, '$1half')
    .replace(/(^|\s)(ein|eine|einen)(?=\s|$)/gi, '$1one')
    .replace(/(^|\s)zwei(?=\s|$)/gi, '$1two')
    .replace(/(^|\s)drei(?=\s|$)/gi, '$1three')
    .replace(/(^|\s)vier(?=\s|$)/gi, '$1four')
    .replace(/(^|\s)fünf(?=\s|$)/gi, '$1five')
    .replace(/(^|\s)sechs(?=\s|$)/gi, '$1six')
    .replace(/(^|\s)sieben(?=\s|$)/gi, '$1seven')
    .replace(/(^|\s)acht(?=\s|$)/gi, '$1eight')
    .replace(/(^|\s)neun(?=\s|$)/gi, '$1nine')
    .replace(/(^|\s)zehn(?=\s|$)/gi, '$1ten')
    .replace(/(^|\s)halb(?:e|er|es)?(?=\s|$)/gi, '$1half')
    .replace(/(\d+(?:\.\d+)?)\s*(грама|грам|гр|г)(?=\s|$)/gi, '$1 g')
    .replace(/(\d+(?:\.\d+)?)\s*(килограми?|кг)(?=\s|$)/gi, '$1 kg')
    .replace(/(\d+(?:\.\d+)?)\s*(милилитри?|мл)(?=\s|$)/gi, '$1 ml')
    .replace(/(\d+(?:\.\d+)?)\s*(литри?|л)(?=\s|$)/gi, '$1 l')
    .replace(/(\d+(?:\.\d+)?)\s*(gramos?|grammes?|gramo|gramme)(?=\s|$)/gi, '$1 g')
    .replace(/(\d+(?:\.\d+)?)\s*(kilogramos?|kilos?|kilogrammes?)(?=\s|$)/gi, '$1 kg')
    .replace(/(\d+(?:\.\d+)?)\s*(mililitros?|millilitres?)(?=\s|$)/gi, '$1 ml')
    .replace(/(\d+(?:\.\d+)?)\s*(litros?|litres?)(?=\s|$)/gi, '$1 l')
    .replace(/(\d+(?:\.\d+)?)\s*(gramm|gramme)(?=\s|$)/gi, '$1 g')
    .replace(/(\d+(?:\.\d+)?)\s*(kilogramm|kilo)(?=\s|$)/gi, '$1 kg')
    .replace(/(\d+(?:\.\d+)?)\s*(milliliter|millilitre)(?=\s|$)/gi, '$1 ml')
    .replace(/(\d+(?:\.\d+)?)\s*(liter)(?=\s|$)/gi, '$1 l')
    .replace(/(\d+(?:\.\d+)?)\s*(grammi?|gr)(?=\s|$)/gi, '$1 g')
    .replace(/(\d+(?:\.\d+)?)\s*(chilogrammi?|chili?)(?=\s|$)/gi, '$1 kg')
    .replace(/(\d+(?:\.\d+)?)\s*(millilitri?)(?=\s|$)/gi, '$1 ml')
    .replace(/(\d+(?:\.\d+)?)\s*(litri?)(?=\s|$)/gi, '$1 l')
    .replace(/(\d+(?:\.\d+)?)\s*(gramas?)(?=\s|$)/gi, '$1 g')
    .replace(/(\d+(?:\.\d+)?)\s*(quilogramas?|quilos?)(?=\s|$)/gi, '$1 kg')
    .replace(/(\d+(?:\.\d+)?)\s*(mililitros?)(?=\s|$)/gi, '$1 ml')
    .replace(/(\d+(?:\.\d+)?)\s*(litros?)(?=\s|$)/gi, '$1 l')
    .replace(/(^|\s)(чаша|шоља)(?=\s|$)/gi, '$1cup')
    .replace(/(^|\s)(парче|парчиња)(?=\s|$)/gi, '$1piece')
    .replace(/(^|\s)(taza|vaso|verre|tasse)(?=\s|$)/gi, '$1cup')
    .replace(/(^|\s)(pieza|pedazo|morceau)(?=\s|$)/gi, '$1piece')
    .replace(/(^|\s)вода(?=\s|$)/gi, '$1water')
    .replace(/(^|\s)кафе(?=\s|$)/gi, '$1coffee')
    .replace(/(^|\s)(чај|чаj)(?=\s|$)/gi, '$1tea')
    .replace(/(^|\s)сок(?=\s|$)/gi, '$1juice')
    .replace(/(^|\s)млеко(?=\s|$)/gi, '$1milk')
    .replace(/(^|\s)(agua|eau)(?=\s|$)/gi, '$1water')
    .replace(/(^|\s)wasser(?=\s|$)/gi, '$1water')
    .replace(/(^|\s)acqua(?=\s|$)/gi, '$1water')
    .replace(/(^|\s)(água|agua)(?=\s|$)/gi, '$1water')
    .replace(/(^|\s)(café|cafe)(?=\s|$)/gi, '$1coffee')
    .replace(/(^|\s)kaffee(?=\s|$)/gi, '$1coffee')
    .replace(/(^|\s)(caffè|caffe)(?=\s|$)/gi, '$1coffee')
    .replace(/(^|\s)(café|cafe)(?=\s|$)/gi, '$1coffee')
    .replace(/(^|\s)(té|te|thé|the)(?=\s|$)/gi, '$1tea')
    .replace(/(^|\s)tee(?=\s|$)/gi, '$1tea')
    .replace(/(^|\s)(tè)(?=\s|$)/gi, '$1tea')
    .replace(/(^|\s)(chá|cha)(?=\s|$)/gi, '$1tea')
    .replace(/(^|\s)(jugo|zumo|jus)(?=\s|$)/gi, '$1juice')
    .replace(/(^|\s)saft(?=\s|$)/gi, '$1juice')
    .replace(/(^|\s)succo(?=\s|$)/gi, '$1juice')
    .replace(/(^|\s)suco(?=\s|$)/gi, '$1juice')
    .replace(/(^|\s)(leche|lait)(?=\s|$)/gi, '$1milk')
    .replace(/(^|\s)milch(?=\s|$)/gi, '$1milk')
    .replace(/(^|\s)latte(?=\s|$)/gi, '$1milk')
    .replace(/(^|\s)leite(?=\s|$)/gi, '$1milk')
    .replace(/\b(sin\s+azúcar|sin\s+azucar|sans\s+sucre|senza\s+zucchero|sem\s+açúcar|sem\s+acucar|ohne\s+zucker)\b/gi, 'no sugar')
    .replace(/(^|\s)(шеќер|шеќерот|шеќерна)(?=\s|$)/gi, '$1sugar')
    .replace(/(^|\s)мед(?=\s|$)/gi, '$1honey')
    .replace(/(^|\s)(azúcar|azucar|sucre)(?=\s|$)/gi, '$1sugar')
    .replace(/(^|\s)(miel|mel)(?=\s|$)/gi, '$1honey')
    .replace(/(^|\s)zucker(?=\s|$)/gi, '$1sugar')
    .replace(/(^|\s)honig(?=\s|$)/gi, '$1honey')
    .replace(/(^|\s)zucchero(?=\s|$)/gi, '$1sugar')
    .replace(/(^|\s)miele(?=\s|$)/gi, '$1honey')
    .replace(/(^|\s)(açúcar|acucar)(?=\s|$)/gi, '$1sugar')
    .replace(/(^|\s)mel(?=\s|$)/gi, '$1honey')
    .replace(/\s+/g, ' ')
    .trim()
}

function followUpFoodTranscript(draft: VoiceDraft | null, answerRaw: string) {
  if (draft?.action !== 'food_draft') return null
  const draftText = cleanFavoriteText(draft.food?.draftText || '', 900)
  const answer = normalizeSpokenFollowUpAnswer(answerRaw)
  if (!draftText || !answer || !answerLooksLikeAmount(answer)) return null

  const parts = splitVoiceFoodList(draftText)
  const clearParts = parts.filter((part) => !hasVagueFoodAmount(part))
  const targetName = firstClarificationFoodName(draft)
  const answerHasTarget = targetName ? answer.toLowerCase().includes(targetName.toLowerCase()) : true
  const clarified = targetName && !answerHasTarget ? `${answer} ${targetName}` : answer
  const meal = draft.food?.meal || 'snacks'
  return `add ${[...clearParts, clarified].filter(Boolean).join(', ')} to ${mealLabel(meal)}`
}

function amountTextFromWaterDraft(draft: VoiceDraft | null) {
  const water = draft?.water
  if (water?.amount && water?.unit) return `${water.amount} ${water.unit}`
  const transcript = cleanFavoriteText(draft?.transcript || '', 220)
  const match = transcript.match(/\b(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?)\b/i)
  return cleanFavoriteText(match?.[0] || '', 60)
}

function drinkTextFromWaterDraft(draft: VoiceDraft | null) {
  const label = cleanFavoriteText(draft?.water?.label || draft?.water?.drinkType || '', 80)
  if (label) return label
  const transcript = cleanFavoriteText(draft?.transcript || '', 220).toLowerCase()
  if (/\bcoffee|espresso|latte|cappuccino|flat white\b/.test(transcript)) return 'coffee'
  if (/\btea\b/.test(transcript)) return 'tea'
  if (/\bjuice\b/.test(transcript)) return 'juice'
  if (/\bmilk\b/.test(transcript)) return 'milk'
  if (/\bsoft drink|soda|coke|cola|lemonade\b/.test(transcript)) return 'soft drink'
  return 'water'
}

function followUpWaterTranscript(draft: VoiceDraft | null, answerRaw: string) {
  if (draft?.action !== 'water' || draft.canConfirm) return null
  const answer = normalizeSpokenFollowUpAnswer(answerRaw)
  const message = cleanFavoriteText(draft.confirmationMessage || '', 220)
  if (!answer) return null

  if (/How much liquid should I log/i.test(message) && answerLooksLikeAmount(answer)) {
    const hasDrink = /\b(water|coffee|tea|juice|milk|soft drink|soda|coke|cola|hot chocolate)\b/i.test(answer)
    return `log ${answer}${hasDrink ? '' : ` ${drinkTextFromWaterDraft(draft)}`}`
  }

  if (/What drink should I log/i.test(message)) {
    const amountText = amountTextFromWaterDraft(draft)
    if (!amountText) return null
    return `log ${amountText} ${answer}`
  }

  if (/Should I log\s+.+?\s+as sugar-free, or with sugar or honey/i.test(message)) {
    const amountText = amountTextFromWaterDraft(draft)
    const drinkText = drinkTextFromWaterDraft(draft)
    if (!amountText) return null
    const detail = /^(?:with\b|as\b|sugar[-\s]?free|no sugar|without sugar|black|plain|unsweetened|zero)/i.test(answer)
      ? answer
      : `with ${answer}`
    return `log ${amountText} ${drinkText} ${detail}`
  }

  const sweetenerMatch = message.match(/How much\s+(sugar|honey)\s+should I add/i)
  if (sweetenerMatch?.[1]) {
    const amountText = amountTextFromWaterDraft(draft)
    const drinkText = drinkTextFromWaterDraft(draft)
    if (!amountText || !answerLooksLikeAmount(answer)) return null
    return `log ${amountText} ${drinkText} with ${answer} ${sweetenerMatch[1]}`
  }

  return null
}

function followUpExerciseTranscript(draft: VoiceDraft | null, answerRaw: string) {
  if (draft?.action !== 'exercise' || draft.canConfirm) return null
  const answer = cleanFavoriteText(answerRaw, 600)
  const message = cleanFavoriteText(draft.confirmationMessage || '', 220)
  if (!answer) return null
  if (/What exercise should I log/i.test(message)) return `log exercise: ${answer}`
  if (/How long did the .+ take/i.test(message)) {
    const exercise = draft.exercise
    const details = [
      `log ${cleanFavoriteText(exercise?.exerciseName || 'exercise', 80)} for ${answer}`,
      exercise?.distanceKm ? `${exercise.distanceKm} km` : '',
      exercise?.speedKph ? `${exercise.speedKph} km/h` : '',
      exercise?.steps ? `${exercise.steps} steps` : '',
      exercise?.caloriesKcal ? `${exercise.caloriesKcal} calories` : '',
    ].filter(Boolean)
    return details.join(', ')
  }
  return null
}

function followUpMoodTranscript(draft: VoiceDraft | null, answerRaw: string) {
  if (draft?.action !== 'mood' || draft.canConfirm) return null
  const answer = cleanFavoriteText(answerRaw, 600)
  const message = cleanFavoriteText(draft.confirmationMessage || '', 220)
  if (!answer || !/How are you feeling/i.test(message)) return null
  return `log mood: ${answer}`
}

function followUpJournalTranscript(draft: VoiceDraft | null, answerRaw: string) {
  if (draft?.action !== 'journal' || draft.canConfirm) return null
  const answer = cleanFavoriteText(answerRaw, 1200)
  const message = cleanFavoriteText(draft.confirmationMessage || '', 220)
  if (!answer || !/What would you like me to write in the journal/i.test(message)) return null
  return `write journal note: ${answer}`
}

function followUpTranscript(draft: VoiceDraft | null, answerRaw: string) {
  return (
    followUpFoodTranscript(draft, answerRaw) ||
    followUpWaterTranscript(draft, answerRaw) ||
    followUpExerciseTranscript(draft, answerRaw) ||
    followUpMoodTranscript(draft, answerRaw) ||
    followUpJournalTranscript(draft, answerRaw)
  )
}

function isExplicitNewVoiceCommand(value: unknown) {
  const text = cleanFavoriteText(value, 1200).toLowerCase()
  if (!text) return false
  const hasCommand = /\b(add|log|record|save|open|show|go to|take me to|create|build|make|track|write)\b/.test(text)
  const hasTarget =
    /\b(food|meal|breakfast|lunch|dinner|snack|snacks|favourites?|favorites?|saved|diary|water|exercise|workout|mood|journal|symptom|symptoms|medication|medicine|supplement|vitamin|health image|photo|camera|insights)\b/.test(text)
  return hasCommand && hasTarget
}

function isPendingFollowUpDraft(draft: VoiceDraft | null) {
  if (!draft || draft.canConfirm) return false
  if (draft.action === 'food_draft' && draft.food?.draftText) return true
  if (
    draft.action === 'water' &&
    /How much liquid should I log|What drink should I log|Should I log\s+.+?\s+as sugar-free, or with sugar or honey|How much\s+(?:sugar|honey)\s+should I add/i.test(
      draft.confirmationMessage || '',
    )
  ) {
    return true
  }
  if (
    (draft.action === 'exercise' && /What exercise should I log|How long did the .+ take/i.test(draft.confirmationMessage || '')) ||
    (draft.action === 'mood' && /How are you feeling/i.test(draft.confirmationMessage || '')) ||
    (draft.action === 'journal' && /What would you like me to write in the journal/i.test(draft.confirmationMessage || ''))
  ) {
    return true
  }
  return false
}

function normalizeControlText(value: string) {
  return cleanFavoriteText(value, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!?。！？]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const CONFIRM_DRAFT_TEXTS = new Set([
  'yes',
  'yes please',
  'yeah',
  'yep',
  'correct',
  'confirm',
  'confirm it',
  'save',
  'save it',
  'save this',
  'log it',
  'add it',
  'do it',
  'go ahead',
  'looks good',
  'that looks good',
  "that's right",
  'thats right',
  'ok',
  'okay',
  'sure',
  'please save',
  'please save it',
  'si',
  'si por favor',
  'claro',
  'confirmar',
  'confirma',
  'guardar',
  'guardalo',
  'oui',
  'oui merci',
  'daccord',
  "d'accord",
  'enregistrer',
  'ja',
  'genau',
  'speichern',
  'sim',
  'salvar',
  'salve',
  'conferma',
  'salva',
  'はい',
  '保存',
  '是',
  '确认',
  '확인',
  '저장',
  'да',
])

const REJECT_DRAFT_TEXTS = new Set([
  'no',
  'no thanks',
  'no thank you',
  'cancel',
  'cancel it',
  'discard',
  'discard it',
  'do not save',
  "don't save",
  'dont save',
  'stop',
  'nope',
  'nah',
  'cancelar',
  'cancela',
  'no guardar',
  'no gracias',
  'non',
  'annuler',
  'annule',
  'nein',
  'abbrechen',
  'nicht speichern',
  'nao',
  'nao salvar',
  'annulla',
  'cancella',
  'non salvare',
  'いいえ',
  'キャンセル',
  '取消',
  '不保存',
  '否',
  '아니요',
  '취소',
  'нет',
  'отмена',
])

function isConfirmingDraftText(value: string) {
  return CONFIRM_DRAFT_TEXTS.has(normalizeControlText(value))
}

function isRejectingDraftText(value: string) {
  return REJECT_DRAFT_TEXTS.has(normalizeControlText(value))
}

function copyForLaunchContext(context: VoiceAssistantLaunchContext) {
  const meal = mealLabel(context.meal)
  switch (context.section) {
    case 'food':
      return {
        title: 'Talk to Helfi',
        subtitle: `Food Diary${context.meal ? ` - ${meal}` : ''}`,
        opener:
          context.mode === 'food-photo'
            ? 'Show me what you are eating, or tell me what to log.'
            : 'How can I help with your food diary?',
        placeholder: 'Example: add two apples and some peanuts to snacks.',
        visionLabel: 'Show food / add by photo',
      }
    case 'water':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Water Intake',
        opener: 'What drink should I log or update?',
        placeholder: 'Example: log 500 ml water.',
      }
    case 'journal':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Health Journal',
        opener: 'What would you like to add to your journal?',
        placeholder: 'Example: add a health journal note for today.',
        visionLabel: 'Add journal photo',
      }
    case 'symptoms':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Symptom Notes',
        opener: 'Tell me what you want to record. I can help with notes, but not diagnosis.',
        placeholder: 'Example: create a symptom note for a headache today.',
        visionLabel: 'Add health image note',
      }
    case 'health-image':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Health Image Notes',
        opener: 'I can help you record a health image note. I cannot diagnose from photos.',
        placeholder: 'Example: open health image notes.',
        visionLabel: 'Add health image note',
      }
    case 'mood':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Mood Tracker',
        opener: 'How are you feeling, and what should I record?',
        placeholder: 'Example: log my mood as stressed with a short note.',
      }
    case 'exercise':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Exercise',
        opener: 'What exercise should I log or update?',
        placeholder: 'Example: log a 5 km walk.',
      }
    case 'check-in':
      return {
        title: 'Talk to Helfi',
        subtitle: "Today's Check-in",
        opener: 'What would you like to check in or open?',
        placeholder: "Example: open today's check-in.",
      }
    case 'dashboard':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Dashboard',
        opener: 'How can I help with your day in Helfi?',
        placeholder: 'Example: what should I focus on next?',
        visionLabel: 'Use camera/photo',
      }
    case 'insights':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Insights',
        opener: 'What would you like to understand from your insights?',
        placeholder: 'Example: open my insights.',
      }
    case 'health-coach':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Health Coach',
        opener: 'What would you like help with from your health coach?',
        placeholder: 'Example: open health coach.',
      }
    case 'settings':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Settings',
        opener: 'What setting or account area do you need?',
        placeholder: 'Example: open billing.',
      }
    case 'billing':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Billing',
        opener: 'What billing or credit question can I help with?',
        placeholder: 'Example: open my credit usage.',
      }
    case 'devices':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Devices',
        opener: 'What device area would you like to open or check?',
        placeholder: 'Example: open Garmin Connect.',
      }
    case 'support':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Help & Support',
        opener: 'What do you need help with?',
        placeholder: 'Example: open support.',
      }
    case 'profile':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Profile',
        opener: 'What profile or account area would you like to open?',
        placeholder: 'Example: open account settings.',
      }
    case 'health-intake':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Health Intake',
        opener: 'Tell me the medications, vitamins, or supplements you already take, or add a bottle label.',
        placeholder: 'Example: I take vitamin D, fish oil, and metformin.',
        visionLabel: 'Add bottle label',
      }
    case 'practitioner':
      return {
        title: 'Talk to Helfi',
        subtitle: 'Practitioners',
        opener: 'What practitioner area would you like to open?',
        placeholder: 'Example: find a practitioner.',
      }
    case 'more':
      return {
        title: 'Talk to Helfi',
        subtitle: 'More',
        opener: 'What would you like to open or update?',
        placeholder: 'Example: open health journal.',
        visionLabel: 'Use camera/photo',
      }
    default:
      return {
        title: 'Talk to Helfi',
        subtitle: 'Helfi assistant',
        opener: 'How can I help?',
        placeholder: 'Type or say what you want Helfi to do.',
        visionLabel: 'Use camera/photo',
      }
  }
}

async function waitForActiveApp(timeoutMs = 1200) {
  if (AppState.currentState === 'active') return true
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      subscription.remove()
      resolve(value)
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish(true)
    })
    const timer = setTimeout(() => finish(AppState.currentState === 'active'), timeoutMs)
  })
}

function audioMimeFromUri(uri: string) {
  const lower = uri.toLowerCase()
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  return 'audio/mp4'
}

function todayLocalDate() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fallbackNativeTargetForAppTarget(appTarget?: VoiceDraft['appTarget'] | null) {
  const title = cleanFavoriteText(appTarget?.title || appTarget?.buttonLabel || '', 120).toLowerCase()
  const path = cleanFavoriteText(appTarget?.path || '', 200).toLowerCase()

  const foodActionTarget = (action: string) => ({
    type: 'stack',
    route: 'TrackCalories',
    params: { voiceAction: action, voiceMeal: 'breakfast', voiceActionNonce: Date.now() },
  })

  if (title.includes('add food entry')) return foodActionTarget('openAddFoodEntry')
  if (path.startsWith('/food/build-meal')) return null
  if (title.includes('build a meal')) return foodActionTarget('openBuildMeal')
  if (title.includes('favorites') || title.includes('favourites')) return foodActionTarget('openFavorites')
  if (title.includes('exercise')) return foodActionTarget('openExercise')
  if (title.includes('food diary') || path === '/food') return { type: 'tab', tab: 'Food' }
  if (title.includes('dashboard') || path === '/dashboard') return { type: 'tab', tab: 'Dashboard' }
  if (title.includes('insights') || path.startsWith('/insights')) return { type: 'tab', tab: 'Insights' }
  if (title.includes('settings') || path.startsWith('/settings')) return { type: 'tab', tab: 'Settings' }
  if (title.includes('water')) return { type: 'stack', route: 'WaterIntake' }
  if (title.includes('mood journal')) return { type: 'stack', route: 'MoodTracker', params: { tab: 'journal' } }
  if (title.includes('mood tracker') || title === 'mood') return { type: 'stack', route: 'MoodTracker', params: { tab: 'checkin' } }
  if (title.includes('health journal') || path.startsWith('/health-journal')) return { type: 'stack', route: 'HealthJournal' }
  if (title.includes('symptom') || path.startsWith('/symptoms')) return { type: 'stack', route: 'SymptomNotes' }
  if (title.includes('health image') || path.startsWith('/medical-images')) return { type: 'stack', route: 'HealthImageNotes' }
  if (title.includes('health intake') || path.startsWith('/onboarding')) return { type: 'stack', route: 'HealthSetup' }
  if (title.includes('billing') || path === '/billing') return { type: 'stack', route: 'Billing' }
  if (title.includes('practitioner')) return { type: 'stack', route: 'Practitioners' }
  return null
}

function cleanFavoriteText(value: unknown, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hasPaidVoiceAccess(data: any) {
  const plan = cleanFavoriteText(data?.plan || '', 40)
  const topUpsAvailable = Array.isArray(data?.topUps)
    ? data.topUps.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.availableCents || 0)), 0)
    : 0
  const additionalAvailable = Math.max(0, Number(data?.additionalAvailableCents ?? data?.credits?.additionalRemaining ?? 0))
  const totalAvailable = Math.max(0, Number(data?.totalAvailableCents ?? data?.credits?.total ?? 0))
  return Boolean(plan) || topUpsAvailable > 0 || additionalAvailable > 0 || totalAvailable > 0
}

function usesLocalDevApiBase() {
  return Boolean(__DEV__ && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL))
}

function shouldRetryVoiceAccessOnLive(data: any, error?: unknown) {
  return Boolean(usesLocalDevApiBase() && (error || data?.degraded))
}

function shouldRetryVoiceAssistantOnLive(data: any, error?: unknown, status?: number) {
  const message = cleanFavoriteText(data?.error || data?.message || error, 180).toLowerCase()
  return Boolean(
    usesLocalDevApiBase() &&
      (error ||
        data?.degraded ||
        (Number.isFinite(status) && Number(status) >= 500) ||
        message.includes('ai service not configured') ||
        message.includes('voice reply is not configured') ||
        message.includes('database')),
  )
}

async function fetchVoiceAccessStatus(token: string) {
  const headers = buildNativeAuthHeaders(token, { includeCookie: true })
  let firstError: unknown = null

  const requestStatus = async (baseUrl: string) => {
    const res = await fetch(`${baseUrl}/api/credit/status?feature=talk-to-helfi`, { headers })
    const data: any = await res.json().catch(() => ({}))
    return { res, data }
  }

  try {
    const first = await requestStatus(API_BASE_URL)
    if (first.res.ok && hasPaidVoiceAccess(first.data)) return first
    if (!usesLocalDevApiBase()) return first
  } catch (error) {
    firstError = error
    if (!shouldRetryVoiceAccessOnLive(null, error)) throw error
  }

  try {
    return await requestStatus(VOICE_ACCESS_FALLBACK_API_BASE_URL)
  } catch (error) {
    throw firstError || error
  }
}

async function fetchNativeVoiceAssistant(
  requestFactory: (baseUrl: string) => Promise<Response>,
) {
  let firstError: unknown = null
  try {
    const res = await requestFactory(API_BASE_URL)
    const data: any = await res.json().catch(() => ({}))
    if (!shouldRetryVoiceAssistantOnLive(data, undefined, res.status)) return { res, data }
  } catch (error) {
    firstError = error
    if (!shouldRetryVoiceAssistantOnLive(null, error)) throw error
  }

  try {
    const res = await requestFactory(VOICE_ACCESS_FALLBACK_API_BASE_URL)
    const data: any = await res.json().catch(() => ({}))
    return { res, data }
  } catch (error) {
    throw firstError || error
  }
}

async function fetchNativeVoiceTts(
  requestFactory: (baseUrl: string) => Promise<Response>,
) {
  let firstError: unknown = null
  try {
    const res = await requestFactory(API_BASE_URL)
    const data: any = await res.json().catch(() => ({}))
    if (!shouldRetryVoiceAssistantOnLive(data, undefined, res.status)) return { res, data }
  } catch (error) {
    firstError = error
    if (!shouldRetryVoiceAssistantOnLive(null, error)) throw error
  }

  try {
    const res = await requestFactory(VOICE_ACCESS_FALLBACK_API_BASE_URL)
    const data: any = await res.json().catch(() => ({}))
    return { res, data }
  } catch (error) {
    throw firstError || error
  }
}

async function fetchNativeVoiceConfirm(
  requestFactory: (baseUrl: string) => Promise<Response>,
) {
  let firstError: unknown = null
  try {
    const res = await requestFactory(API_BASE_URL)
    const data: any = await res.json().catch(() => ({}))
    if (!shouldRetryVoiceAssistantOnLive(data, undefined, res.status)) return { res, data }
  } catch (error) {
    firstError = error
    if (!shouldRetryVoiceAssistantOnLive(null, error)) throw error
  }

  try {
    const res = await requestFactory(VOICE_ACCESS_FALLBACK_API_BASE_URL)
    const data: any = await res.json().catch(() => ({}))
    return { res, data }
  } catch (error) {
    throw firstError || error
  }
}

async function playableAudioUri(audioUri: string) {
  const match = /^data:(audio\/[^;]+);base64,(.+)$/s.exec(audioUri)
  if (!match) return audioUri
  if (!LegacyFileSystem.cacheDirectory) return audioUri
  const mime = match[1].toLowerCase()
  const ext = mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : 'm4a'
  const fileUri = `${LegacyFileSystem.cacheDirectory}helfi-voice-${Date.now()}.${ext}`
  await LegacyFileSystem.writeAsStringAsync(fileUri, match[2], { encoding: LegacyFileSystem.EncodingType.Base64 })
  return fileUri
}

function normalizeVoiceFavorite(raw: any, source: 'saved' | 'library') {
  if (!raw || typeof raw !== 'object') return null
  const label = cleanFavoriteText(raw?.label || raw?.name || raw?.description || raw?.raw?.label || raw?.raw?.name)
  if (!label) return null
  const description = cleanFavoriteText(raw?.description || raw?.raw?.description || label, 500)
  const meal = cleanFavoriteText(raw?.meal || raw?.category || raw?.persistedCategory || raw?.raw?.meal || raw?.raw?.category, 40).toLowerCase()
  const nutrition = raw?.nutrition || raw?.nutrients || raw?.total || raw?.raw?.nutrition || raw?.raw?.nutrients || raw?.raw?.total || null
  return {
    id: source === 'saved' ? cleanFavoriteText(raw?.id, 120) : '',
    label,
    description: description || label,
    meal,
    nutrition,
    total: raw?.total || nutrition,
    items: Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.raw?.items) ? raw.raw.items : null,
  }
}

async function loadVoiceFavorites(sessionToken?: string | null, signal?: AbortSignal) {
  const byLabel = new Map<string, any>()
  const add = (favorite: any) => {
    const normalized = normalizeVoiceFavorite(favorite, favorite?.__voiceSource === 'library' ? 'library' : 'saved')
    if (!normalized?.label) return
    const key = normalized.label.toLowerCase()
    if (!byLabel.has(key)) byLabel.set(key, normalized)
  }

  try {
    const raw = await AsyncStorage.getItem(FOOD_FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed) ? parsed : []
    list.forEach(add)
  } catch {
    // Recent foods from the server can still make voice matching useful.
  }

  if (sessionToken) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/food-log/library?limit=200`, {
        headers: buildNativeAuthHeaders(sessionToken, { includeCookie: true }),
        signal,
      })
      const data: any = await res.json().catch(() => ({}))
      const logs = Array.isArray(data?.logs) ? data.logs : []
      logs.forEach((entry: any) => add({ ...entry, __voiceSource: 'library' }))
    } catch {
      // Voice still works for directly named foods if the recent-food list is unavailable.
    }
  }

  return Array.from(byLabel.values()).slice(0, MAX_VOICE_FAVORITES)
}

export function VoiceAssistantProvider({ children }: { children: React.ReactNode }) {
  const { mode, session } = useAppMode()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<VoiceDraft | null>(null)
  const [conversationTurns, setConversationTurns] = useState<VoiceConversationTurn[]>([])
  const [visionChoicesOpen, setVisionChoicesOpen] = useState(false)
  const [pendingFollowUpDraft, setPendingFollowUpDraft] = useState<VoiceDraft | null>(null)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [recordingStarting, setRecordingStarting] = useState(false)
  const [recordingStartedAt, setRecordingStartedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [voiceSessionActive, setVoiceSessionActive] = useState(false)
  const [realtimeVoiceStatus, setRealtimeVoiceStatus] = useState<RealtimeVoiceStatus>('idle')
  const [realtimeVoiceError, setRealtimeVoiceError] = useState('')
  const [realtimeVoiceAvailable, setRealtimeVoiceAvailable] = useState<boolean | null>(null)
  const [realtimeVoiceName, setRealtimeVoiceName] = useState(SPOKEN_REPLY_VOICE_NAME)
  const [checkingRealtimeVoice, setCheckingRealtimeVoice] = useState(false)
  const [voicePaidAccessGranted, setVoicePaidAccessGranted] = useState(false)
  const [reviewCorrectionActive, setReviewCorrectionActive] = useState(false)
  const [microphoneMuted, setMicrophoneMuted] = useState(false)
  const [voiceReply, setVoiceReply] = useState(true)
  const [spokenReplyStatus, setSpokenReplyStatus] = useState<SpokenReplyStatus>('idle')
  const [launchContext, setLaunchContext] = useState<VoiceAssistantLaunchContext>(DEFAULT_LAUNCH_CONTEXT)
  const [chargedCredits, setChargedCredits] = useState<number | null>(null)
  const [bottleCameraOpen, setBottleCameraOpen] = useState(false)
  const [bottleCameraItemType, setBottleCameraItemType] = useState<'supplement' | 'medication'>('supplement')
  const [bottleCameraReady, setBottleCameraReady] = useState(false)
  const [bottleCameraError, setBottleCameraError] = useState('')
  const [autoSubmitToken, setAutoSubmitToken] = useState(0)
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<SaveSuccessNotice | null>(null)
  const [saveError, setSaveError] = useState('')
  const [voiceActivity, setVoiceActivity] = useState<VoiceActivityItem[]>([])
  const autoSubmittedRef = useRef(0)
  const conversationTurnSeqRef = useRef(0)
  const voiceActivitySeqRef = useRef(0)
  const soundRef = useRef<Audio.Sound | null>(null)
  const spokenReplyRunRef = useRef(0)
  const spokenReplyAbortRef = useRef<AbortController | null>(null)
  const draftRequestAbortRef = useRef<AbortController | null>(null)
  const voiceImageAbortRef = useRef<AbortController | null>(null)
  const realtimeVoiceStopRef = useRef<null | (() => Promise<void>)>(null)
  const realtimeVoiceMuteRef = useRef<null | ((muted: boolean) => void)>(null)
  const realtimeVoicePromptRef = useRef<null | ((instruction: string) => void)>(null)
  const realtimeVoiceAbortRef = useRef<AbortController | null>(null)
  const realtimeActionAbortRef = useRef<AbortController | null>(null)
  const realtimeVoiceRunRef = useRef(0)
  const realtimeVoiceConnectedRef = useRef(false)

  useEffect(() => {
    if (!saveSuccessNotice) return
    const timer = setTimeout(() => setSaveSuccessNotice(null), 2600)
    return () => clearTimeout(timer)
  }, [saveSuccessNotice])
  const realtimeVoiceConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeActionGuardRef = useRef<RealtimeActionGuard | null>(null)
  const realtimeAutoStartRef = useRef(false)
  const pendingVoiceDeleteRef = useRef(false)
  const pendingReviewAnswerRef = useRef(false)
  const reviewSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceAccessGrantedAtRef = useRef(0)
  const voiceAccessTokenRef = useRef('')
  const sendDraftRequestRef = useRef<DraftRequestHandler>(async () => ({ ok: false, message: 'Voice action is not ready yet.' }))
  const openRef = useRef(false)
  const voiceSessionActiveRef = useRef(false)
  const recordingStoppingRef = useRef(false)
  const silenceStartedAtRef = useRef(0)
  const heardSpeechInTurnRef = useRef(false)
  const voiceTurnMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<(options?: StopRecordingOptions) => Promise<void>>(async () => {})
  const startRecordingRef = useRef<() => Promise<void>>(async () => {})
  const voiceRecordingSupported = !(Platform.OS === 'ios' && windowWidth >= 700)
  const voiceMemoryUserId = cleanFavoriteText(session?.user?.id || '', 120)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const setContinuousVoiceSession = useCallback((value: boolean) => {
    voiceSessionActiveRef.current = value
    setVoiceSessionActive(value)
  }, [])

  const addVoiceActivity = useCallback((text: string, state: VoiceActivityItem['state'] = 'active') => {
    const safeText = cleanFavoriteText(text, 180)
    if (!safeText) return
    setVoiceActivity((current) => {
      const last = current[current.length - 1]
      if (last?.text === safeText && last.state === state) return current
      voiceActivitySeqRef.current += 1
      const settled = current.map((item) => item.state === 'active' ? { ...item, state: 'done' as const } : item)
      return [...settled, { id: voiceActivitySeqRef.current, text: safeText, state }].slice(-5)
    })
  }, [])

  const resumeVoiceSessionListening = useCallback((delayMs = 450) => {
    if (!voiceSessionActiveRef.current || !openRef.current || !voiceRecordingSupported) return
    setTimeout(() => {
      if (!voiceSessionActiveRef.current || !openRef.current || recordingStoppingRef.current) return
      void startRecordingRef.current()
    }, delayMs)
  }, [voiceRecordingSupported])

  const clearVoiceTurnTimers = useCallback(() => {
    if (voiceTurnMaxTimerRef.current) {
      clearTimeout(voiceTurnMaxTimerRef.current)
      voiceTurnMaxTimerRef.current = null
    }
    silenceStartedAtRef.current = 0
    heardSpeechInTurnRef.current = false
  }, [])

  const clearRealtimeConnectTimeout = useCallback(() => {
    if (realtimeVoiceConnectTimeoutRef.current) {
      clearTimeout(realtimeVoiceConnectTimeoutRef.current)
      realtimeVoiceConnectTimeoutRef.current = null
    }
  }, [])

  const clearReviewSilenceTimer = useCallback(() => {
    if (reviewSilenceTimerRef.current) {
      clearTimeout(reviewSilenceTimerRef.current)
      reviewSilenceTimerRef.current = null
    }
  }, [])

  const makeConversationTurn = useCallback((role: VoiceConversationTurn['role'], value: unknown): VoiceConversationTurn | null => {
    const text = cleanFavoriteText(value, 1800)
    if (!text) return null
    conversationTurnSeqRef.current += 1
    return {
      id: `${Date.now()}-${conversationTurnSeqRef.current}`,
      role,
      text,
    }
  }, [])

  const saveConversationMemory = useCallback((turns: VoiceConversationTurn[]) => {
    if (!voiceMemoryUserId) return
    AsyncStorage.setItem(
      VOICE_CONVERSATION_MEMORY_KEY,
      JSON.stringify({
        userId: voiceMemoryUserId,
        savedAt: Date.now(),
        turns: turns.slice(-8).map((turn) => ({
          id: turn.id,
          role: turn.role,
          text: cleanFavoriteText(turn.text, 1800),
        })),
      }),
    ).catch(() => {})
  }, [voiceMemoryUserId])

  const loadConversationMemory = useCallback(async () => {
    if (!voiceMemoryUserId) return
    try {
      const raw = await AsyncStorage.getItem(VOICE_CONVERSATION_MEMORY_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (cleanFavoriteText(parsed?.userId, 120) !== voiceMemoryUserId) {
        setConversationTurns([])
        return
      }
      const savedAt = Number(parsed?.savedAt)
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > VOICE_CONVERSATION_MEMORY_TTL_MS) {
        await AsyncStorage.removeItem(VOICE_CONVERSATION_MEMORY_KEY).catch(() => {})
        return
      }
      const turns = Array.isArray(parsed?.turns)
        ? parsed.turns
            .map((turn: any) => ({
              id: cleanFavoriteText(turn?.id || `${Date.now()}-${Math.random()}`, 80),
              role: turn?.role === 'assistant' ? 'assistant' : 'user',
              text: cleanFavoriteText(turn?.text, 1800),
            }))
            .filter((turn: VoiceConversationTurn) => turn.text)
            .slice(-8)
        : []
      if (turns.length) setConversationTurns(turns)
    } catch {
      // A fresh panel is fine if local memory cannot be read.
    }
  }, [voiceMemoryUserId])

  const appendConversationTurns = useCallback(
    (turns: Array<VoiceConversationTurn | null>) => {
      const nextTurns = turns.filter((turn): turn is VoiceConversationTurn => Boolean(turn))
      if (!nextTurns.length) return
      setConversationTurns((current) => {
        const updated = [...current, ...nextTurns].slice(-8)
        saveConversationMemory(updated)
        return updated
      })
    },
    [saveConversationMemory],
  )

  const requestConversationHistory = useMemo(
    () =>
      conversationTurns.slice(-6).map((turn) => ({
        role: turn.role,
        text: cleanFavoriteText(turn.text, 500),
      })),
    [conversationTurns],
  )

  useEffect(() => {
    AsyncStorage.getItem(VOICE_REPLY_KEY)
      .then((value) => setVoiceReply(value !== '0'))
      .catch(() => {})
  }, [])

  const setVoiceReplyPreference = useCallback((value: boolean) => {
    setVoiceReply(value)
    if (!value) {
      spokenReplyRunRef.current += 1
      setContinuousVoiceSession(false)
      setSpokenReplyStatus('idle')
    }
    AsyncStorage.setItem(VOICE_REPLY_KEY, value ? '1' : '0').catch(() => {})
  }, [setContinuousVoiceSession])

  const stopPlayback = useCallback(async () => {
    const sound = soundRef.current
    soundRef.current = null
    if (sound) {
      await sound.unloadAsync().catch(() => {})
    }
  }, [])

  const stopRealtimeVoiceSession = useCallback(async () => {
    realtimeVoiceRunRef.current += 1
    realtimeVoiceConnectedRef.current = false
    realtimeActionGuardRef.current = null
    clearRealtimeConnectTimeout()
    const abortController = realtimeVoiceAbortRef.current
    realtimeVoiceAbortRef.current = null
    abortController?.abort()
    const actionAbortController = realtimeActionAbortRef.current
    realtimeActionAbortRef.current = null
    actionAbortController?.abort()
    const draftAbortController = draftRequestAbortRef.current
    draftRequestAbortRef.current = null
    draftAbortController?.abort()
    const spokenAbortController = spokenReplyAbortRef.current
    spokenReplyAbortRef.current = null
    spokenAbortController?.abort()
    const imageAbortController = voiceImageAbortRef.current
    voiceImageAbortRef.current = null
    imageAbortController?.abort()
    const stop = realtimeVoiceStopRef.current
    realtimeVoiceStopRef.current = null
    realtimeVoiceMuteRef.current = null
    realtimeVoicePromptRef.current = null
    pendingReviewAnswerRef.current = false
    clearReviewSilenceTimer()
    setMicrophoneMuted(false)
    setRealtimeVoiceStatus('idle')
    if (stop) {
      await stop().catch(() => {})
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {})
  }, [clearRealtimeConnectTimeout, clearReviewSilenceTimer])

  const clearConversationData = useCallback(() => {
    setConversationTurns([])
    setPendingFollowUpDraft(null)
    setDraft(null)
    setReviewCorrectionActive(false)
    setSaveError('')
    setTranscript('')
    setChargedCredits(null)
    setVisionChoicesOpen(false)
    AsyncStorage.removeItem(VOICE_CONVERSATION_MEMORY_KEY).catch(() => {})
  }, [])

  const clearConversationMemory = useCallback(() => {
    spokenReplyRunRef.current += 1
    realtimeVoiceRunRef.current += 1
    realtimeVoiceConnectedRef.current = false
    realtimeActionGuardRef.current = null
    clearRealtimeConnectTimeout()
    setContinuousVoiceSession(false)
    void stopRealtimeVoiceSession()
    clearConversationData()
    setSpokenReplyStatus('idle')
    setRecordingStarting(false)
    recordingStoppingRef.current = false
    setBusy(false)
    setConfirming(false)
    stopPlayback().catch(() => {})
  }, [clearConversationData, clearRealtimeConnectTimeout, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

  const deleteChatAndClose = useCallback(() => {
    clearConversationMemory()
    setOpen(false)
  }, [clearConversationMemory])

  const playAudio = useCallback(
    async (audioUri?: string | null, shouldKeepPlaying: () => boolean = () => true) => {
      if (!audioUri) return false
      try {
        if (!shouldKeepPlaying()) return false
        await stopPlayback()
        const uri = await playableAudioUri(audioUri)
        if (!shouldKeepPlaying()) return false
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        }).catch(() => {})
        const created = await Audio.Sound.createAsync({ uri }, { shouldPlay: true })
        if (!shouldKeepPlaying()) {
          await created.sound.unloadAsync().catch(() => {})
          return false
        }
        soundRef.current = created.sound
        created.sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status?.didJustFinish) {
            setSpokenReplyStatus('idle')
            if (shouldKeepPlaying()) {
              resumeVoiceSessionListening()
            }
          }
        })
        setSpokenReplyStatus('playing')
        return true
      } catch (error: any) {
        console.warn('[voice assistant] spoken reply playback failed', String(error?.message || error || 'unknown error'))
        setSpokenReplyStatus('failed')
        return false
      }
    },
    [resumeVoiceSessionListening, stopPlayback],
  )

  const requestVoiceReply = useCallback(
    async (text: string) => {
      if (!session?.token || !text.trim()) return false
      const spokenReplyAbortController = new AbortController()
      spokenReplyAbortRef.current?.abort()
      spokenReplyAbortRef.current = spokenReplyAbortController
      const spokenReplyRunId = spokenReplyRunRef.current + 1
      spokenReplyRunRef.current = spokenReplyRunId
      const shouldKeepPlaying = () => (
        spokenReplyRunRef.current === spokenReplyRunId &&
        !spokenReplyAbortController.signal.aborted &&
        openRef.current &&
        AppState.currentState === 'active'
      )
      try {
        setSpokenReplyStatus('preparing')
        if (!(await hasAiDataSharingPermission())) {
          if (shouldKeepPlaying()) setSpokenReplyStatus('idle')
          return false
        }
        if (!shouldKeepPlaying()) return false
        const { res, data } = await fetchNativeVoiceTts((baseUrl) => fetch(`${baseUrl}/api/native-voice-assistant-tts`, {
          method: 'POST',
          headers: buildNativeAuthHeaders(session.token, { json: true }),
          signal: spokenReplyAbortController.signal,
          body: JSON.stringify({ text, aiConsentGranted: true }),
        }))
        if (!shouldKeepPlaying()) return false
        if (!res.ok) {
          console.warn('[voice assistant] spoken reply request failed', res.status, cleanFavoriteText(data?.error || '', 160))
          setSpokenReplyStatus('unavailable')
          resumeVoiceSessionListening(900)
          return false
        }
        setChargedCredits((current) => {
          const extra = Number(data?.chargedCredits)
          if (!Number.isFinite(extra)) return current
          return (current || 0) + extra
        })
        if (data?.audio) {
          return await playAudio(String(data.audio), shouldKeepPlaying)
        }
        console.warn('[voice assistant] spoken reply response had no audio')
        setSpokenReplyStatus('unavailable')
        resumeVoiceSessionListening(900)
        return false
      } catch (error: any) {
        if (!shouldKeepPlaying()) return false
        console.warn('[voice assistant] spoken reply request failed', String(error?.message || error || 'unknown error'))
        setSpokenReplyStatus('unavailable')
        resumeVoiceSessionListening(900)
        return false
      } finally {
        if (spokenReplyAbortRef.current === spokenReplyAbortController) {
          spokenReplyAbortRef.current = null
        }
      }
    },
    [playAudio, resumeVoiceSessionListening, session?.token],
  )

  const openVoiceBilling = useCallback(() => {
    DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
      title: 'Subscription & Billing',
      path: '/billing',
      nativeTarget: { type: 'stack', route: 'Billing' },
    })
  }, [])

  const ensureVoicePaidAccess = useCallback(async () => {
    if (mode !== 'signedIn' || !session?.token) {
      Alert.alert('Log in needed', 'Please log in before using Talk to Helfi.')
      return false
    }
    if (voiceAccessTokenRef.current === session.token && Date.now() - voiceAccessGrantedAtRef.current < 5 * 60 * 1000) {
      return true
    }
    try {
      const { res, data } = await fetchVoiceAccessStatus(session.token)
      if (res.ok && hasPaidVoiceAccess(data)) {
        voiceAccessTokenRef.current = session.token
        voiceAccessGrantedAtRef.current = Date.now()
        return true
      }
      Alert.alert('Subscription needed', VOICE_PAID_ACCESS_MESSAGE, [
        { text: 'Not now', style: 'cancel' },
        { text: 'View plans', onPress: openVoiceBilling },
      ])
      return false
    } catch {
      Alert.alert('Could not check access', 'Please try again.')
      return false
    }
  }, [mode, openVoiceBilling, session?.token])

  useEffect(() => {
    const token = session?.token
    if (mode !== 'signedIn' || !token || voiceAccessTokenRef.current === token) return
    let cancelled = false
    void fetchVoiceAccessStatus(token)
      .then(({ res, data }) => {
        if (cancelled || !res.ok || !hasPaidVoiceAccess(data)) return
        voiceAccessTokenRef.current = token
        voiceAccessGrantedAtRef.current = Date.now()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mode, session?.token])

  const openVoiceAssistant = useCallback(async (input?: OpenVoiceAssistantInput) => {
    Vibration.vibrate()
    DeviceEventEmitter.emit(VOICE_ASSISTANT_OPENING_EVENT)
    setVoiceActivity([])
    addVoiceActivity('Opening Talk to Helfi')
    setDraft(null)
    setConversationTurns([])
    setPendingFollowUpDraft(null)
    setVisionChoicesOpen(false)
    setChargedCredits(null)
    setSpokenReplyStatus('idle')
    setRealtimeVoiceStatus('idle')
    setRealtimeVoiceError('')
    setRealtimeVoiceAvailable(null)
    setRealtimeVoiceName(SPOKEN_REPLY_VOICE_NAME)
    setCheckingRealtimeVoice(false)
    setVoicePaidAccessGranted(false)
    setReviewCorrectionActive(false)
    setMicrophoneMuted(false)
    realtimeAutoStartRef.current = false
    setContinuousVoiceSession(false)
    setVoiceReplyPreference(true)
    setTranscript(input?.transcript || '')
    setLaunchContext(normalizeLaunchContext(input?.context))
    const shouldAutoSubmit = Boolean(input?.autoSubmit && input.transcript)
    if (!input?.transcript) {
      void loadConversationMemory()
    }
    setOpen(true)
    if (shouldAutoSubmit) setAutoSubmitToken((value) => value + 1)
    const hasAccess = await ensureVoicePaidAccess()
    if (!hasAccess) {
      setOpen(false)
      return
    }
    setVoicePaidAccessGranted(true)
  }, [addVoiceActivity, ensureVoicePaidAccess, loadConversationMemory, setContinuousVoiceSession, setVoiceReplyPreference])

  useEffect(() => {
    if (!open || !voicePaidAccessGranted || !session?.token || !voiceRecordingSupported) return
    if (!LIVE_VOICE_ENABLED) {
      setRealtimeVoiceAvailable(false)
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError(LIVE_VOICE_DISABLED_MESSAGE)
      return
    }
    setCheckingRealtimeVoice(false)
    setRealtimeVoiceAvailable(true)
    setRealtimeVoiceError('')
    setRealtimeVoiceStatus('idle')
  }, [open, session?.token, voicePaidAccessGranted, voiceRecordingSupported])

  const closePanel = useCallback(() => {
    spokenReplyRunRef.current += 1
    realtimeVoiceRunRef.current += 1
    realtimeVoiceConnectedRef.current = false
    realtimeActionGuardRef.current = null
    clearRealtimeConnectTimeout()
    setContinuousVoiceSession(false)
    void stopRealtimeVoiceSession()
    clearVoiceTurnTimers()
    setBottleCameraOpen(false)
    if (recording) {
      recording.stopAndUnloadAsync().catch(() => {})
      setRecording(null)
    }
    setPendingFollowUpDraft(null)
    setDraft(null)
    setReviewCorrectionActive(false)
    setTranscript('')
    setChargedCredits(null)
    setVisionChoicesOpen(false)
    setSpokenReplyStatus('idle')
    setRecordingStarting(false)
    recordingStoppingRef.current = false
    setBusy(false)
    setConfirming(false)
    stopPlayback().catch(() => {})
    setOpen(false)
  }, [clearRealtimeConnectTimeout, clearVoiceTurnTimers, recording, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return
      spokenReplyRunRef.current += 1
      realtimeVoiceRunRef.current += 1
      realtimeVoiceConnectedRef.current = false
      realtimeActionGuardRef.current = null
      clearRealtimeConnectTimeout()
      setContinuousVoiceSession(false)
      void stopRealtimeVoiceSession()
      clearVoiceTurnTimers()
      setBottleCameraOpen(false)
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {})
        setRecording(null)
      }
      setRecordingStarting(false)
      recordingStoppingRef.current = false
      setBusy(false)
      setDraft(null)
      setPendingFollowUpDraft(null)
      setReviewCorrectionActive(false)
      setTranscript('')
      setChargedCredits(null)
      setSpokenReplyStatus('idle')
      stopPlayback().catch(() => {})
      setOpen(false)
    })
    return () => subscription.remove()
  }, [clearRealtimeConnectTimeout, clearVoiceTurnTimers, recording, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

  const submitHealthIntakeBottleImage = useCallback(
    async (itemType: 'supplement' | 'medication', asset: BottleLabelImageAsset) => {
      if (!session?.token) return

      const imageAbortController = new AbortController()
      voiceImageAbortRef.current?.abort()
      voiceImageAbortRef.current = imageAbortController

      try {
        const requestContext = normalizeLaunchContext(launchContext)
        const requestLocalDate = requestContext.date || todayLocalDate()
        const form = new FormData()
        form.append('image', {
          uri: asset.uri,
          name: asset.fileName || asset.uri.split('/').pop() || `${itemType}-label-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        } as any)
        form.append('scanType', itemType)
        form.append('scanId', `voice-${itemType}-${Date.now()}`)
        form.append('voiceReview', 'true')
        form.append('aiConsentGranted', 'true')
        form.append('localDate', requestLocalDate)

        setBusy(true)
        setDraft(null)
        setPendingFollowUpDraft(null)
        setChargedCredits(null)

        const res = await fetch(`${API_BASE_URL}/api/analyze-supplement-image`, {
          method: 'POST',
          headers: buildNativeAuthHeaders(session.token),
          signal: imageAbortController.signal,
          body: form,
        })
        if (imageAbortController.signal.aborted) return
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Helfi could not read that label.')
        const nextDraft: VoiceDraft | null = data?.draft || null
        if (!nextDraft) throw new Error('Helfi could not prepare a review for that label.')

        const name = cleanFavoriteText(data?.supplementName || nextDraft?.summary || '', 160)
        const userText = `Showed a ${itemType} bottle label${name ? `: ${name}` : ''}`
        setTranscript(userText)
        setDraft(nextDraft)
        setPendingFollowUpDraft(isPendingFollowUpDraft(nextDraft) ? nextDraft : null)
        setVisionChoicesOpen(false)
        appendConversationTurns([
          makeConversationTurn('user', userText),
          makeConversationTurn('assistant', nextDraft.confirmationMessage || nextDraft.summary),
        ])
        if (voiceReply) {
          void requestVoiceReply(nextDraft.confirmationMessage || nextDraft.summary || '')
        }
      } catch (error: any) {
        if (imageAbortController.signal.aborted || error?.name === 'AbortError') return
        Alert.alert('Try again', error?.message || 'Helfi could not read that label.')
      } finally {
        if (voiceImageAbortRef.current === imageAbortController) {
          voiceImageAbortRef.current = null
        }
        setBusy(false)
      }
    },
    [appendConversationTurns, launchContext, makeConversationTurn, requestVoiceReply, session?.token, voiceReply],
  )

  const openHealthIntakeLiveCamera = useCallback(
    async (itemType: 'supplement' | 'medication') => {
      if (!(await ensureVoicePaidAccess())) return
      const aiAllowed = await requestAiDataSharingPermission()
      if (!aiAllowed) {
        Alert.alert('AI request not sent', 'No camera or voice data was sent. You can still type the item name.')
        return
      }
      setBottleCameraItemType(itemType)
      setBottleCameraReady(false)
      setBottleCameraError('')
      setBottleCameraOpen(true)
      if (!cameraPermission?.granted && cameraPermission?.canAskAgain !== false) {
        void requestCameraPermission()
      }
    },
    [cameraPermission?.canAskAgain, cameraPermission?.granted, ensureVoicePaidAccess, requestCameraPermission],
  )

  const openHealthIntakeCameraMode = useCallback(
    (itemType: 'supplement' | 'medication') => {
      void openHealthIntakeLiveCamera(itemType)
    },
    [openHealthIntakeLiveCamera],
  )

  const openVisionChoice = useCallback(
    (choice: VisionChoice) => {
      setVisionChoicesOpen(false)
      if (choice === 'supplement-bottle' || choice === 'medication-bottle') {
        openHealthIntakeCameraMode(choice === 'medication-bottle' ? 'medication' : 'supplement')
        return
      }

      if (choice === 'food-photo') {
        DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
          title: 'Food photo',
          path: '/food',
          nativeTarget: {
            type: 'foodAction',
            action: 'openPhoto',
            meal: launchContext.meal || 'breakfast',
          },
        })
        closePanel()
        return
      }

      if (choice === 'health-image') {
        DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
          title: 'Health Image Notes',
          path: '/medical-images',
          nativeTarget: { type: 'stack', route: 'HealthImageNotes' },
        })
        const emitHealthImageAction = () => {
          DeviceEventEmitter.emit('helfi:health-image-voice-action', { action: 'pickImage' })
        }
        setTimeout(emitHealthImageAction, 500)
        setTimeout(emitHealthImageAction, 1100)
        closePanel()
        return
      }

      DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
        title: 'Health Journal',
        path: '/health-journal',
        nativeTarget: { type: 'stack', route: 'HealthJournal' },
      })
      const emitJournalAction = () => {
        DeviceEventEmitter.emit('helfi:journal-voice-action', { action: 'pickPhoto' })
      }
      setTimeout(emitJournalAction, 500)
      setTimeout(emitJournalAction, 1100)
      closePanel()
    },
    [closePanel, launchContext.meal, openHealthIntakeCameraMode],
  )

  const openContextVision = useCallback(() => {
    if (launchContext.section === 'food') {
      openVisionChoice('food-photo')
      return
    }

    if (launchContext.section === 'health-image' || launchContext.section === 'symptoms') {
      openVisionChoice('health-image')
      return
    }

    if (launchContext.section === 'journal') {
      openVisionChoice('journal-photo')
      return
    }

    Alert.alert('Camera', 'What would you like to add?', [
      { text: 'Food photo', onPress: () => openVisionChoice('food-photo') },
      { text: 'Journal photo', onPress: () => openVisionChoice('journal-photo') },
      { text: 'Health image note', onPress: () => openVisionChoice('health-image') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [launchContext.section, openVisionChoice])

  const renderVisionChoice = useCallback(
    (choice: VisionChoice, label: string, detail: string, icon: keyof typeof Feather.glyphMap) => (
      <Pressable
        key={choice}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => openVisionChoice(choice)}
        style={styles.visionChoice}
      >
        <View style={styles.visionChoiceIcon}>
          <Feather name={icon} size={18} color="#226B2C" />
        </View>
        <View style={styles.visionChoiceCopy}>
          <Text style={styles.visionChoiceTitle}>{label}</Text>
          <Text style={styles.visionChoiceDetail}>{detail}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={theme.colors.muted} />
      </Pressable>
    ),
    [openVisionChoice],
  )

  const saveDraft = useCallback(
    async (targetDraft: VoiceDraft | null, options?: { automatic?: boolean; signal?: AbortSignal; closeOnSuccess?: boolean }) => {
      if (!session?.token || !targetDraft?.canConfirm) return null
      if (options?.signal?.aborted) return null
      const saveAbortController = options?.signal ? null : new AbortController()
      if (saveAbortController) {
        draftRequestAbortRef.current?.abort()
        draftRequestAbortRef.current = saveAbortController
      }
      const saveSignal = options?.signal || saveAbortController?.signal
      const saveDestination = targetDraft.action === 'exercise'
        ? 'exercise log'
        : targetDraft.action.startsWith('food_')
        ? 'food diary'
        : targetDraft.action === 'water'
        ? 'water intake'
        : targetDraft.action === 'mood'
        ? 'mood history'
        : 'health record'
      addVoiceActivity(`Saving to your ${saveDestination}`)
      setConfirming(true)
      setSaveError('')
      try {
        const { res, data } = await fetchNativeVoiceConfirm((baseUrl) => fetch(`${baseUrl}/api/native-voice-assistant-confirm`, {
          method: 'POST',
          headers: buildNativeAuthHeaders(session.token, { json: true }),
          signal: saveSignal,
          body: JSON.stringify({ draft: targetDraft }),
        }))
        if (saveSignal?.aborted) return null
        if (!res.ok) throw new Error(data?.error || 'Could not save that.')
        const resultKind = String(data?.result?.kind || '').toLowerCase()
        const changedDate = targetDraft.localDate || todayLocalDate()
        const emitSavedRefresh = () => {
          DeviceEventEmitter.emit('helfi:voice-action-saved', {
            localDate: changedDate,
            source: 'voice-assistant',
            kind: resultKind,
          })
          if (resultKind === 'food' || resultKind === 'exercise' || resultKind === 'water') {
            DeviceEventEmitter.emit('helfi:food-log-changed', {
              localDate: changedDate,
              source: 'voice-assistant',
              kind: resultKind,
            })
          }
          if (resultKind === 'health_journal') {
            DeviceEventEmitter.emit('helfi:health-journal-changed', {
              localDate: changedDate,
              source: 'voice-assistant',
              kind: resultKind,
            })
          }
          if (resultKind === 'journal') {
            DeviceEventEmitter.emit('helfi:mood-journal-changed', {
              localDate: changedDate,
              source: 'voice-assistant',
              kind: resultKind,
            })
          }
          if (resultKind === 'mood') {
            DeviceEventEmitter.emit('helfi:mood-log-changed', {
              localDate: changedDate,
              source: 'voice-assistant',
              kind: resultKind,
            })
          }
          if (resultKind === 'symptom_note') {
            DeviceEventEmitter.emit('helfi:symptom-notes-changed', {
              localDate: changedDate,
              source: 'voice-assistant',
              kind: resultKind,
            })
          }
          if (resultKind === 'health_intake') {
            DeviceEventEmitter.emit('helfi:health-intake-changed', {
              localDate: changedDate,
              source: 'voice-assistant',
              kind: resultKind,
            })
          }
        }

        emitSavedRefresh()
        if (resultKind === 'food' || resultKind === 'exercise' || resultKind === 'water') {
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
            title: 'Food Diary',
            path: '/food',
            nativeTarget: { type: 'tab', tab: 'Food' },
          })
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        } else if (resultKind === 'health_journal') {
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
            title: 'Health Journal',
            path: '/health-journal',
            nativeTarget: {
              type: 'stack',
              route: 'HealthJournal',
              params: { initialTab: 'history', selectedDate: changedDate, voiceActionNonce: Date.now() },
            },
          })
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        } else if (resultKind === 'journal') {
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
            title: 'Mood Journal',
            path: '/mood',
            nativeTarget: { type: 'stack', route: 'MoodTracker', params: { tab: 'journal' } },
          })
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        } else if (resultKind === 'mood') {
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
            title: 'Mood Tracker',
            path: '/mood',
            nativeTarget: { type: 'stack', route: 'MoodTracker', params: { tab: 'history' } },
          })
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        } else if (resultKind === 'symptom_note') {
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
            title: 'Symptom Notes',
            path: '/symptoms',
            nativeTarget: {
              type: 'stack',
              route: 'SymptomNotes',
              params: { initialTab: 'history', voiceActionNonce: Date.now() },
            },
          })
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        } else if (resultKind === 'health_intake') {
          const intakePath = data?.result?.path || '/onboarding?step=6'
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
            title: 'Health Intake',
            path: intakePath,
            nativeTarget: { type: 'stack', route: 'NativeWebTool', params: { title: 'Health Intake', path: intakePath } },
          })
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        }
        const savedLabel = resultKind === 'exercise'
          ? 'Exercise'
          : resultKind === 'food'
          ? 'Food'
          : resultKind === 'water'
          ? 'Water'
          : 'Entry'
        setSaveSuccessNotice({
          title: `${savedLabel} saved`,
          message: resultKind === 'exercise'
            ? 'Added to your exercise log.'
            : resultKind === 'food'
            ? 'Added to your food diary.'
            : resultKind === 'water'
            ? 'Added to your water intake.'
            : String(data?.result?.message || 'Your entry has been saved.'),
        })
        addVoiceActivity(`Saved to your ${saveDestination}`, 'done')
        setDraft(null)
        setPendingFollowUpDraft(null)
        setReviewCorrectionActive(false)
        setTranscript('')
        setChargedCredits(null)
        if (options?.closeOnSuccess !== false) closePanel()
        return data
      } catch (error: any) {
        if (saveSignal?.aborted || error?.name === 'AbortError') return null
        const message = error?.message || 'Please check your internet connection and try again.'
        addVoiceActivity('Save failed — ready to retry', 'error')
        setSaveError(message)
        Alert.alert('Could not save', message)
        return null
      } finally {
        if (saveAbortController && draftRequestAbortRef.current === saveAbortController) {
          draftRequestAbortRef.current = null
        }
        setConfirming(false)
      }
    },
    [addVoiceActivity, closePanel, session?.token],
  )

  const sendDraftRequest = useCallback(
    async (options?: DraftRequestOptions): Promise<DraftRequestResult> => {
      if (!session?.token) return { ok: false, message: 'Please sign in first.' }
      if (options?.signal?.aborted) return { ok: false, message: 'Live voice has stopped.' }
      const rawTypedTranscript = (options?.transcriptOverride ?? transcript).trim()
      const explicitNewCommand = isExplicitNewVoiceCommand(rawTypedTranscript)
      const draftIsReviewOrHandoff = Boolean(draft?.canConfirm || draft?.appTarget?.path) && !explicitNewCommand
      if (!options?.audioUri && draft?.canConfirm && isConfirmingDraftText(rawTypedTranscript)) {
        setTranscript(rawTypedTranscript)
        const saved = await saveDraft(draft, { signal: options?.signal, closeOnSuccess: !options?.realtimeActionHint?.action })
        return {
          ok: Boolean(saved),
          saved: Boolean(saved),
          status: saved ? 'saved' : 'general_answer',
          message: saved?.result?.message || (saved ? 'Saved.' : 'I could not save that.'),
          action: draft.action,
        }
      }
      if (!options?.audioUri && draftIsReviewOrHandoff && draft && isRejectingDraftText(rawTypedTranscript)) {
        setTranscript(rawTypedTranscript)
        setDraft(null)
        setPendingFollowUpDraft(null)
        setChargedCredits(null)
        if (voiceReply && !options?.suppressSpokenReply) {
          void requestVoiceReply(NOT_SAVED_MESSAGE)
        }
        Alert.alert('Not saved', NOT_SAVED_MESSAGE)
        return { ok: true, message: NOT_SAVED_MESSAGE, saved: false, status: 'general_answer', action: draft.action }
      }
      const nextFollowUpTranscript = options?.audioUri || explicitNewCommand
        ? null
        : followUpTranscript(pendingFollowUpDraft, rawTypedTranscript)
      const typedTranscript = nextFollowUpTranscript || rawTypedTranscript
      const shouldSpeakReply = !options?.suppressSpokenReply && Boolean(options?.audioUri || voiceReply)
      if (!options?.audioUri && !typedTranscript) {
        Alert.alert('Nothing heard', 'Please record or type a request first.')
        return { ok: false, message: 'Nothing heard.' }
      }

      const aiAllowed = await requestAiDataSharingPermission()
      if (!aiAllowed) {
        Alert.alert('AI request not sent', 'No data was sent. You can still use non-AI tracking in Helfi.')
        return { ok: false, message: 'AI request was not sent because consent was not granted.' }
      }

      if (options?.signal?.aborted) return { ok: false, message: 'Live voice has stopped.' }
      const draftRequestAbortController = options?.signal ? null : new AbortController()
      if (draftRequestAbortController) {
        draftRequestAbortRef.current?.abort()
        draftRequestAbortRef.current = draftRequestAbortController
      }
      const requestSignal = options?.signal || draftRequestAbortController?.signal

      setBusy(true)
      addVoiceActivity('Understanding your request')
      if (!draftIsReviewOrHandoff) setDraft(null)
      setChargedCredits(null)
      try {
        const favorites = await loadVoiceFavorites(session.token, requestSignal)
        if (requestSignal?.aborted) return { ok: false, message: 'Live voice has stopped.' }
        const requestContext = normalizeLaunchContext(launchContext)
        const requestLocalDate = (!explicitNewCommand && pendingFollowUpDraft?.localDate) || requestContext.date || todayLocalDate()
        const confirmationDraftPayload = !explicitNewCommand && draft?.canConfirm ? draft : null
        const followUpDraftPayload = !explicitNewCommand && !nextFollowUpTranscript
          ? isPendingFollowUpDraft(pendingFollowUpDraft)
            ? pendingFollowUpDraft
            : draft?.action === 'recipe' && !draft?.canConfirm
            ? draft
            : null
          : null
        let responseData: { res: Response; data: any }
        if (options?.audioUri) {
          const audioUri = options.audioUri
          responseData = await fetchNativeVoiceAssistant((baseUrl) => {
            const form = new FormData()
            const name = audioUri.split('/').pop() || `helfi-voice-${Date.now()}.m4a`
            form.append('audio', { uri: audioUri, name, type: audioMimeFromUri(audioUri) } as any)
            form.append('durationMillis', String(options.durationMillis || 0))
            form.append('localDate', requestLocalDate)
            form.append('tzOffsetMin', String(new Date().getTimezoneOffset()))
            form.append('voiceReply', shouldSpeakReply ? 'true' : 'false')
            form.append('favorites', JSON.stringify(favorites))
            form.append('launchContext', JSON.stringify(requestContext))
            form.append('conversationHistory', JSON.stringify(requestConversationHistory))
            if (confirmationDraftPayload) form.append('confirmationDraft', JSON.stringify(confirmationDraftPayload))
            if (followUpDraftPayload) form.append('followUpDraft', JSON.stringify(followUpDraftPayload))
            if (options.realtimeActionHint?.action) form.append('realtimeActionHint', JSON.stringify(options.realtimeActionHint))
            form.append('aiConsentGranted', 'true')
            return fetch(`${baseUrl}/api/native-voice-assistant`, {
              method: 'POST',
              headers: buildNativeAuthHeaders(session.token),
              signal: requestSignal,
              body: form,
            })
          })
        } else {
          responseData = await fetchNativeVoiceAssistant((baseUrl) => fetch(`${baseUrl}/api/native-voice-assistant`, {
            method: 'POST',
            headers: buildNativeAuthHeaders(session.token, { json: true }),
            signal: requestSignal,
            body: JSON.stringify({
              transcript: typedTranscript,
              localDate: requestLocalDate,
              tzOffsetMin: new Date().getTimezoneOffset(),
              voiceReply: shouldSpeakReply,
              favorites,
              launchContext: requestContext,
              conversationHistory: requestConversationHistory,
              confirmationDraft: confirmationDraftPayload,
              followUpDraft: followUpDraftPayload,
              realtimeActionHint: options?.realtimeActionHint?.action ? options.realtimeActionHint : undefined,
              aiConsentGranted: true,
            }),
          }))
        }

        const { res, data } = responseData
        if (requestSignal?.aborted) return { ok: false, message: 'Live voice has stopped.' }
        if (!res.ok) {
          throw new Error(data?.error || 'Helfi could not process that request.')
        }
        setTranscript(String(data?.transcript || typedTranscript || '').trim())
        const nextDraft = data?.draft || null
        if (nextDraft?.canConfirm) {
          addVoiceActivity('Review ready — waiting for your answer', 'done')
        } else if (nextDraft) {
          addVoiceActivity('Response ready', 'done')
        }
        if (nextDraft?.action === 'exercise') {
          setLaunchContext({ section: 'exercise', title: 'Exercise', date: nextDraft.localDate })
        } else if (nextDraft?.action === 'water') {
          setLaunchContext({ section: 'water', title: 'Water Intake', date: nextDraft.localDate })
        } else if (nextDraft?.action === 'mood') {
          setLaunchContext({ section: 'mood', title: 'Mood Tracker', date: nextDraft.localDate })
        } else if (nextDraft?.action === 'journal') {
          setLaunchContext({ section: 'journal', title: 'Health Journal', date: nextDraft.localDate })
        }
        setDraft(nextDraft)
        if (nextDraft?.canConfirm || data?.confirmNow || data?.rejectNow) setReviewCorrectionActive(false)
        setPendingFollowUpDraft(isPendingFollowUpDraft(nextDraft) ? nextDraft : null)
        setChargedCredits(Number.isFinite(Number(data?.chargedCredits)) ? Number(data.chargedCredits) : null)
        const assistantText = nextDraft
          ? nextDraft?.recipe?.text || nextDraft?.confirmationMessage || nextDraft?.summary || ''
          : data?.rejectNow
          ? NOT_SAVED_MESSAGE
          : ''
        const userText = options?.audioUri ? data?.transcript || typedTranscript : rawTypedTranscript || typedTranscript
        appendConversationTurns([
          makeConversationTurn('user', userText),
          makeConversationTurn('assistant', assistantText),
        ])
        if (data?.confirmNow && nextDraft?.canConfirm) {
          const saved = await saveDraft(nextDraft, { signal: requestSignal })
          return {
            ok: Boolean(saved),
            saved: Boolean(saved),
            status: saved ? 'saved' : 'general_answer',
            message: saved?.result?.message || (saved ? 'Saved.' : 'I could not save that.'),
            action: nextDraft.action,
          }
        }
        if (data?.rejectNow) {
          setDraft(null)
          setPendingFollowUpDraft(null)
          if (shouldSpeakReply) {
            void requestVoiceReply(NOT_SAVED_MESSAGE)
          }
          Alert.alert('Not saved', NOT_SAVED_MESSAGE)
          return { ok: true, message: NOT_SAVED_MESSAGE, saved: false, status: 'general_answer', action: nextDraft?.action }
        }
        if (shouldSpeakReply && nextDraft) {
          const speechText = spokenReplyTextForDraft(nextDraft)
          void requestVoiceReply(String(speechText))
        }
        return {
          ok: true,
          saved: false,
          needsReview: Boolean(nextDraft?.canConfirm),
          reviewPrompt: nextDraft?.canConfirm ? reviewPromptForDraft(nextDraft) : undefined,
          status: voiceResultStatusFromDraft(nextDraft, data),
          action: nextDraft?.action,
          message: assistantText || (nextDraft ? 'Review is ready.' : 'Done.'),
        }
      } catch (error: any) {
        if (requestSignal?.aborted || error?.name === 'AbortError') {
          return { ok: false, message: 'Live voice has stopped.' }
        }
        const message = error?.message || 'Helfi could not process that request.'
        addVoiceActivity('Request failed — ready to retry', 'error')
        if (options?.continuousVoice && /no speech|nothing heard/i.test(String(message))) {
          resumeVoiceSessionListening(600)
        } else {
          Alert.alert('Try again', message)
        }
        return { ok: false, message }
      } finally {
        if (draftRequestAbortController && draftRequestAbortRef.current === draftRequestAbortController) {
          draftRequestAbortRef.current = null
        }
        setBusy(false)
      }
    },
    [addVoiceActivity, appendConversationTurns, draft, launchContext, makeConversationTurn, pendingFollowUpDraft, requestConversationHistory, requestVoiceReply, resumeVoiceSessionListening, saveDraft, session?.token, transcript, voiceReply],
  )

  useEffect(() => {
    sendDraftRequestRef.current = sendDraftRequest
  }, [sendDraftRequest])

  useEffect(() => {
    if (!open || !transcript || autoSubmittedRef.current === autoSubmitToken) return
    if (autoSubmitToken <= 0) return
    autoSubmittedRef.current = autoSubmitToken
    void sendDraftRequest({ transcriptOverride: transcript })
  }, [autoSubmitToken, open, sendDraftRequest, transcript])

  const startRecording = useCallback(async () => {
    try {
      if (!voiceRecordingSupported) {
        setContinuousVoiceSession(false)
        Alert.alert('Type your request instead', 'Voice input is iPhone only for now. You can type your request here on iPad.')
        return
      }
      if (recording) return
      setRecordingStarting(true)
      clearVoiceTurnTimers()
      setDraft(null)
      setChargedCredits(null)
      const aiAllowed = await requestAiDataSharingPermission()
      if (!aiAllowed) {
        setContinuousVoiceSession(false)
        Alert.alert('AI request not sent', 'No microphone data was recorded or sent. You can still type your request.')
        return
      }
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        setContinuousVoiceSession(false)
        Alert.alert('Permission needed', 'Please allow microphone access to use Helfi voice.')
        return
      }
      const appIsActive = await waitForActiveApp()
      if (!appIsActive) {
        setContinuousVoiceSession(false)
        Alert.alert('Listening unavailable', 'Please keep Helfi open, then tap the microphone again.')
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      })
      const created = new Audio.Recording()
      const startedAt = Date.now()
      await created.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY)
      created.setProgressUpdateInterval(250)
      created.setOnRecordingStatusUpdate((status: any) => {
        if (!voiceSessionActiveRef.current || recordingStoppingRef.current) return
        const durationMillis = Number(status?.durationMillis || Date.now() - startedAt)
        const metering = Number(status?.metering)
        const heardSpeech = Number.isFinite(metering) && metering > VOICE_TURN_METER_THRESHOLD
        const now = Date.now()
        if (heardSpeech) {
          heardSpeechInTurnRef.current = true
          silenceStartedAtRef.current = 0
          return
        }
        if (durationMillis >= VOICE_TURN_MAX_MS) {
          void stopRecordingRef.current({ continueSession: true })
          return
        }
        if (durationMillis < VOICE_TURN_MIN_MS || !heardSpeechInTurnRef.current) return
        if (!silenceStartedAtRef.current) {
          silenceStartedAtRef.current = now
          return
        }
        if (now - silenceStartedAtRef.current >= VOICE_TURN_SILENCE_MS) {
          void stopRecordingRef.current({ continueSession: true })
        }
      })
      await created.startAsync()
      silenceStartedAtRef.current = 0
      heardSpeechInTurnRef.current = false
      setRecording(created)
      setRecordingStartedAt(startedAt)
      if (voiceSessionActiveRef.current) {
        voiceTurnMaxTimerRef.current = setTimeout(() => {
          void stopRecordingRef.current({ continueSession: true })
        }, VOICE_TURN_MAX_MS)
      }
    } catch (error: any) {
      setContinuousVoiceSession(false)
      const message = String(error?.message || '')
      Alert.alert(
        'Could not listen',
        message.toLowerCase().includes('background')
          ? 'Please keep Helfi open, then tap the microphone again.'
          : 'Please try again.',
      )
    } finally {
      setRecordingStarting(false)
    }
  }, [clearVoiceTurnTimers, recording, setContinuousVoiceSession, voiceRecordingSupported])

  const stopRecording = useCallback(async (options?: StopRecordingOptions) => {
    if (!recording) return
    if (recordingStoppingRef.current) return
    recordingStoppingRef.current = true
    try {
      setBusy(true)
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {})
      const uri = recording.getURI()
      const durationMillis = Math.max(0, Date.now() - recordingStartedAt)
      setRecording(null)
      if (uri) {
        await sendDraftRequest({ audioUri: uri, durationMillis, continuousVoice: Boolean(options?.continueSession) })
      }
    } catch (error: any) {
      Alert.alert('Could not hear that', error?.message || 'Please try again.')
    } finally {
      clearVoiceTurnTimers()
      recordingStoppingRef.current = false
      setBusy(false)
    }
  }, [clearVoiceTurnTimers, recording, recordingStartedAt, sendDraftRequest])

  useEffect(() => {
    startRecordingRef.current = startRecording
  }, [startRecording])

  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  const startVoiceSession = useCallback(async () => {
    addVoiceActivity('Starting microphone and speaker')
    if (!LIVE_VOICE_ENABLED) {
      setRealtimeVoiceAvailable(false)
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError(LIVE_VOICE_DISABLED_MESSAGE)
      return
    }
    if (!voiceRecordingSupported) {
      Alert.alert('Type your request instead', 'Voice input is iPhone only for now. You can type your request here on iPad.')
      return
    }
    if (!session?.token) return
    if (checkingRealtimeVoice) {
      setRealtimeVoiceError('Checking live voice availability. Text and camera still work.')
      return
    }
    if (realtimeVoiceAvailable === false) {
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError(realtimeVoiceError || 'Live voice is not available on this server. Text and camera still work.')
      return
    }
    if (!hasNativeRealtimeVoiceSupport()) {
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError('This app build does not include live voice yet. Rebuild the iPhone app, then try again.')
      return
    }
    const aiAllowed = await requestAiDataSharingPermission()
    if (!aiAllowed) {
      Alert.alert('AI request not sent', 'No microphone data was sent. You can still type your request.')
      return
    }
    setVoiceReplyPreference(true)
    setContinuousVoiceSession(true)
    const realtimeRunId = realtimeVoiceRunRef.current + 1
    realtimeVoiceRunRef.current = realtimeRunId
    realtimeVoiceConnectedRef.current = false
    realtimeActionGuardRef.current = null
    const abortController = new AbortController()
    realtimeVoiceAbortRef.current?.abort()
    realtimeVoiceAbortRef.current = abortController
    setRealtimeVoiceStatus('connecting')
    setRealtimeVoiceError('')
    clearRealtimeConnectTimeout()
    realtimeVoiceConnectTimeoutRef.current = setTimeout(() => {
      if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
      realtimeVoiceRunRef.current += 1
      realtimeVoiceConnectedRef.current = false
      realtimeVoiceAbortRef.current?.abort()
      realtimeVoiceAbortRef.current = null
      realtimeVoiceStopRef.current = null
      setContinuousVoiceSession(false)
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError('Live voice could not connect quickly enough. Please try again after it is rebuilt.')
      addVoiceActivity('Connection timed out — tap Try again', 'error')
      void Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {})
    }, REALTIME_VOICE_CONNECT_TIMEOUT_MS)
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      }).catch(() => {})
      const realtimeSession = await startHelfiRealtimeVoiceSession({
        token: session.token,
        signal: abortController.signal,
        callbacks: {
          onConnectStage: (stage) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            const message = stage === 'microphone-ready'
              ? 'Microphone ready — connecting securely'
              : stage === 'local-offer-ready'
              ? 'Contacting Helfi voice'
              : stage === 'server-answer-received'
              ? 'Voice service answered'
              : stage === 'remote-answer-applied'
              ? 'Voice connection ready'
              : ''
            if (message) addVoiceActivity(message, stage === 'remote-answer-applied' ? 'done' : 'active')
          },
          onStatus: (status) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            if (status === 'live' || status === 'connected') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = true
              setRealtimeVoiceStatus('live')
              addVoiceActivity('Connected — listening', 'done')
              return
            }
            if (status === 'speaking') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = true
              setRealtimeVoiceStatus('speaking')
              addVoiceActivity('Helfi is speaking')
              return
            }
            if (status === 'closed' || status === 'disconnected') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = false
              setContinuousVoiceSession(false)
              setRealtimeVoiceStatus(status === 'disconnected' ? 'failed' : 'closed')
              if (status === 'disconnected') {
                setRealtimeVoiceError('The voice connection was interrupted. Check your internet or Bluetooth audio, then tap Try again.')
                addVoiceActivity('Connection interrupted — ready to retry', 'error')
              }
              return
            }
            if (status === 'failed') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = false
              setContinuousVoiceSession(false)
              setRealtimeVoiceStatus('failed')
              setRealtimeVoiceError('Voice audio was interrupted. Check your internet, speaker, or Bluetooth connection, then tap Try again.')
              addVoiceActivity('Audio interrupted — ready to retry', 'error')
              return
            }
            if (realtimeVoiceConnectedRef.current) {
              setRealtimeVoiceStatus((current) => (current === 'speaking' ? 'speaking' : 'live'))
              return
            }
            setRealtimeVoiceStatus('connecting')
          },
          onTranscript: (text) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            if (!text) return
            clearReviewSilenceTimer()
            pendingReviewAnswerRef.current = false
            setRealtimeVoiceError('')
            setTranscript(text)
            addVoiceActivity(`Heard: “${cleanFavoriteText(text, 80)}”`, 'done')
            appendConversationTurns([makeConversationTurn('user', text)])
          },
          onAssistantText: (text) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            if (!text) return
            if (pendingVoiceDeleteRef.current) {
              pendingVoiceDeleteRef.current = false
              clearConversationData()
              return
            }
            appendConversationTurns([makeConversationTurn('assistant', text)])
            if (pendingReviewAnswerRef.current) {
              clearReviewSilenceTimer()
              reviewSilenceTimerRef.current = setTimeout(() => {
                if (!pendingReviewAnswerRef.current || !voiceSessionActiveRef.current || !openRef.current) return
                pendingReviewAnswerRef.current = false
                setRealtimeVoiceError("I didn't hear an answer. Please say yes, no, or tell me what to change.")
                realtimeVoicePromptRef.current?.("Say exactly: I didn't hear an answer. Please say yes, no, or tell me what to change. Then listen again.")
              }, 12000)
            }
          },
          onActionRequest: (args) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) {
              return { ok: false, message: 'Live voice has stopped.' }
            }
            const request = cleanFavoriteText(args.request || '', 2000)
            if (!request) return { ok: false, message: 'No app action was requested.' }
            const action = cleanFavoriteText(args.action || '', 40)
            const actionLabel = action === 'exercise'
              ? 'exercise entry'
              : action.startsWith('food_')
              ? 'food entry'
              : action === 'water'
              ? 'water entry'
              : action === 'mood'
              ? 'mood entry'
              : action === 'journal'
              ? 'journal entry'
              : 'app action'
            addVoiceActivity(`Preparing ${actionLabel}`)
            if (action === 'delete_conversation' || /\bdelete (?:this |the )?(?:chat|conversation)\b/i.test(request)) {
              pendingVoiceDeleteRef.current = true
              clearConversationData()
              return {
                ok: true,
                saved: false,
                status: 'general_answer',
                message: 'This conversation has been deleted. Saved health records were not changed.',
                spokenReply: 'This conversation has been deleted. Your saved health records were not changed.',
                safeToClaimSaved: false,
                instruction: 'Briefly confirm that only this conversation was deleted and saved health records were not changed.',
              }
            }
            const guardKey = `${action.toLowerCase()}|${request.toLowerCase()}|${Boolean(args.needsReview)}`
            const guard = realtimeActionGuardRef.current
            if (guard?.key === guardKey && Date.now() - guard.startedAt < 5000) {
              return guard.promise
            }
            const actionAbortController = new AbortController()
            realtimeActionAbortRef.current?.abort()
            realtimeActionAbortRef.current = actionAbortController
            const promise = sendDraftRequestRef.current({
              transcriptOverride: request,
              suppressSpokenReply: true,
              signal: actionAbortController.signal,
              realtimeActionHint: {
                action,
                needsReview: Boolean(args.needsReview),
              },
            }).then(realtimeToolResult).then((result) => {
              if (result.needsReview || result.saved) {
                setReviewCorrectionActive(false)
              }
              pendingReviewAnswerRef.current = Boolean(result.needsReview)
              return result
            })
            realtimeActionGuardRef.current = { key: guardKey, startedAt: Date.now(), promise }
            promise.finally(() => {
              if (realtimeActionGuardRef.current?.promise === promise) {
                realtimeActionGuardRef.current = null
              }
              if (realtimeActionAbortRef.current === actionAbortController) {
                realtimeActionAbortRef.current = null
              }
            })
            return promise
          },
        },
      })
      if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current || !openRef.current) {
        await realtimeSession.stop().catch(() => {})
        return
      }
      clearRealtimeConnectTimeout()
      realtimeVoiceConnectedRef.current = true
      setRealtimeVoiceStatus((current) => (current === 'speaking' ? 'speaking' : 'live'))
      realtimeVoiceStopRef.current = realtimeSession.stop
      realtimeVoiceMuteRef.current = realtimeSession.setMicrophoneMuted
      realtimeVoicePromptRef.current = realtimeSession.promptAssistant
    } catch (error: any) {
      clearRealtimeConnectTimeout()
      if (realtimeVoiceAbortRef.current === abortController) {
        realtimeVoiceAbortRef.current = null
      }
      if (realtimeVoiceRunRef.current !== realtimeRunId) return
      realtimeVoiceConnectedRef.current = false
      setContinuousVoiceSession(false)
      setRealtimeVoiceStatus('failed')
      const reason = cleanFavoriteText(error?.message || '', 260)
      setRealtimeVoiceError(reason || 'Live voice could not start. Check your internet, microphone, speaker, or Bluetooth connection, then tap Try again.')
    }
  }, [addVoiceActivity, appendConversationTurns, checkingRealtimeVoice, clearConversationData, clearRealtimeConnectTimeout, clearReviewSilenceTimer, makeConversationTurn, realtimeVoiceAvailable, realtimeVoiceError, session?.token, setContinuousVoiceSession, setVoiceReplyPreference, stopRealtimeVoiceSession, voiceRecordingSupported])

  useEffect(() => {
    if (!LIVE_VOICE_ENABLED || !open || !voicePaidAccessGranted || realtimeVoiceAvailable !== true || voiceSessionActiveRef.current) return
    if (realtimeAutoStartRef.current) return
    realtimeAutoStartRef.current = true
    void startVoiceSession()
  }, [open, realtimeVoiceAvailable, startVoiceSession, voicePaidAccessGranted])

  const toggleRealtimeMicrophone = useCallback(() => {
    const nextMuted = !microphoneMuted
    realtimeVoiceMuteRef.current?.(nextMuted)
    setMicrophoneMuted(nextMuted)
    Vibration.vibrate()
  }, [microphoneMuted])

  const retryRealtimeVoice = useCallback(() => {
    addVoiceActivity('Retrying voice connection')
    realtimeAutoStartRef.current = true
    void startVoiceSession()
  }, [addVoiceActivity, startVoiceSession])

  const endVoiceSession = useCallback(() => {
    spokenReplyRunRef.current += 1
    realtimeVoiceRunRef.current += 1
    realtimeVoiceConnectedRef.current = false
    realtimeActionGuardRef.current = null
    clearRealtimeConnectTimeout()
    setContinuousVoiceSession(false)
    setReviewCorrectionActive(false)
    void stopRealtimeVoiceSession()
    clearVoiceTurnTimers()
    setBottleCameraOpen(false)
    if (recording) {
      recording.stopAndUnloadAsync().catch(() => {})
      setRecording(null)
    }
    setRecordingStarting(false)
    setBusy(false)
    setSpokenReplyStatus('idle')
    stopPlayback().catch(() => {})
  }, [clearRealtimeConnectTimeout, clearVoiceTurnTimers, recording, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

  const closeCameraMode = useCallback(() => {
    setBottleCameraOpen(false)
    if (voiceSessionActiveRef.current) {
      endVoiceSession()
    }
  }, [endVoiceSession])

  const confirmDraft = useCallback(async () => {
    await saveDraft(draft)
  }, [draft, saveDraft])

  const rejectDraft = useCallback(() => {
    addVoiceActivity('Draft discarded — nothing saved', 'done')
    spokenReplyRunRef.current += 1
    spokenReplyAbortRef.current?.abort()
    spokenReplyAbortRef.current = null
    draftRequestAbortRef.current?.abort()
    draftRequestAbortRef.current = null
    voiceImageAbortRef.current?.abort()
    voiceImageAbortRef.current = null
    realtimeActionAbortRef.current?.abort()
    realtimeActionAbortRef.current = null
    setContinuousVoiceSession(false)
    clearVoiceTurnTimers()
    void stopRealtimeVoiceSession()
    stopPlayback().catch(() => {})
    setReviewCorrectionActive(false)
    setDraft(null)
    setPendingFollowUpDraft(null)
    setTranscript('')
    setChargedCredits(null)
    setSaveError('')
    setSpokenReplyStatus('idle')
    setRecordingStarting(false)
    recordingStoppingRef.current = false
    setBusy(false)
    setConfirming(false)
    setOpen(false)
  }, [addVoiceActivity, clearVoiceTurnTimers, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

	  const openAppTarget = useCallback(() => {
	    const path = draft?.appTarget?.path
	    if (!path) return
	    const nativeTarget = draft.appTarget?.nativeTarget || fallbackNativeTargetForAppTarget(draft.appTarget) || null
    if (nativeTarget?.type === 'voiceAction' && nativeTarget.action === 'openHealthIntakeLiveCamera') {
      setLaunchContext({ section: 'health-intake', title: 'Health Intake' })
      openHealthIntakeCameraMode(nativeTarget.itemType === 'medication' ? 'medication' : 'supplement')
      return
    }
	    if (nativeTarget?.type === 'voiceAction' && nativeTarget.action === 'openHealthIntakeBottleChoices') {
	      setLaunchContext({ section: 'health-intake', title: 'Health Intake' })
	      setVisionChoicesOpen(true)
	      return
	    }
	    DeviceEventEmitter.emit('helfi:navigate-native-web-tool', {
	      title: draft.appTarget?.title || 'Helfi',
	      path,
      nativeTarget,
    })
    if (nativeTarget?.type === 'foodAction' && typeof nativeTarget.action === 'string') {
      const emitFoodAction = () => {
        DeviceEventEmitter.emit('helfi:food-voice-action', {
          action: nativeTarget.action,
          meal: typeof nativeTarget.meal === 'string' ? nativeTarget.meal : 'breakfast',
          recipeDraft: nativeTarget.recipeDraft || null,
        })
      }
      setTimeout(emitFoodAction, 500)
      setTimeout(emitFoodAction, 1100)
    }
    if (nativeTarget?.type === 'stack' && nativeTarget.route === 'HealthImageNotes' && nativeTarget.action === 'pickImage') {
      const emitHealthImageAction = () => {
        DeviceEventEmitter.emit('helfi:health-image-voice-action', { action: 'pickImage' })
      }
      setTimeout(emitHealthImageAction, 500)
      setTimeout(emitHealthImageAction, 1100)
    }
    if (nativeTarget?.type === 'stack' && nativeTarget.route === 'HealthJournal' && nativeTarget.action === 'pickPhoto') {
      const emitJournalAction = () => {
        DeviceEventEmitter.emit('helfi:journal-voice-action', { action: 'pickPhoto' })
      }
      setTimeout(emitJournalAction, 500)
      setTimeout(emitJournalAction, 1100)
    }
    closePanel()
	  }, [closePanel, draft, openHealthIntakeCameraMode])

  const draftIsActionable = Boolean(draft?.canConfirm || draft?.appTarget?.path)
  const showDraftCard = Boolean(draft && draftIsActionable && !reviewCorrectionActive)
  const primaryFooterIsHandoff = Boolean(draft?.appTarget?.path && !draft?.canConfirm)
  const primaryFooterLabel = primaryFooterIsHandoff ? draft?.appTarget?.buttonLabel || 'Open Helfi tool' : 'Save this'
  const primaryFooterDisabled = !draft || confirming || (!draft.canConfirm && !primaryFooterIsHandoff)
  const discardFooterLabel = primaryFooterIsHandoff ? 'Cancel' : "Don't save"
  const primaryFooterPress = useCallback(() => {
    if (primaryFooterIsHandoff) {
      openAppTarget()
      return
    }
    void confirmDraft()
  }, [confirmDraft, openAppTarget, primaryFooterIsHandoff])

  const value = useMemo(() => ({ openVoiceAssistant }), [openVoiceAssistant])
  const visibleForUser = mode === 'signedIn' && Boolean(session?.token)
  const launchCopy = copyForLaunchContext(launchContext)
  const bottleCameraLabel = bottleCameraItemType === 'medication' ? 'medication' : 'supplement'
  const showingConversationReview = !voiceSessionActive && conversationTurns.length > 0 && !showDraftCard && !reviewCorrectionActive
  const showingLiveVoiceExperience = LIVE_VOICE_ENABLED && !showingConversationReview && !showDraftCard
  const realtimeVoiceUnavailable = realtimeVoiceAvailable === false
  const realtimeVoiceButtonDisabled = !voiceSessionActive && (busy || checkingRealtimeVoice || realtimeVoiceUnavailable || realtimeVoiceStatus === 'connecting')
  const realtimeVoiceButtonLabel = checkingRealtimeVoice
    ? 'Checking live voice'
    : realtimeVoiceUnavailable
    ? 'Live voice unavailable'
    : realtimeVoiceStatus === 'connecting'
    ? 'Opening live voice...'
    : voiceSessionActive
    ? 'Voice chat is live'
    : 'Start live voice'
  const restartVoiceSession = useCallback(() => {
    clearConversationMemory()
    setTranscript('')
    setDraft(null)
    setPendingFollowUpDraft(null)
    setSpokenReplyStatus('idle')
    setRealtimeVoiceStatus(realtimeVoiceUnavailable ? 'failed' : 'idle')
    setRealtimeVoiceError(realtimeVoiceUnavailable ? LIVE_VOICE_DISABLED_MESSAGE : '')
  }, [clearConversationMemory, realtimeVoiceUnavailable])

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
      {visibleForUser && (
        <>
          <Modal visible={open} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => closePanel()}>
            <View style={[styles.panel, showingLiveVoiceExperience && styles.liveVoicePanel]}>
              {!showingLiveVoiceExperience ? <View style={styles.header}>
                <View>
                  <Text style={styles.title}>{launchCopy.title}</Text>
                  <Text style={styles.subtitle}>{launchCopy.subtitle}</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete chat" onPress={deleteChatAndClose} style={styles.deleteChatButton}>
                    <Feather name="trash-2" size={16} color="#B42318" />
                    <Text style={styles.deleteChatText}>Delete chat</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => closePanel()} style={styles.iconButton}>
                    <Feather name="x" size={22} color={theme.colors.text} />
                  </Pressable>
                </View>
              </View> : null}

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={showingLiveVoiceExperience ? styles.liveVoiceContent : [styles.content, styles.contentWithFooterSpace]}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={!showingLiveVoiceExperience}
              >
                {voiceSessionActive || showingLiveVoiceExperience ? (
                  <View style={[styles.voiceCallScreen, { paddingTop: Math.max(insets.top + 8, 24) }]}>
                    <Text style={styles.voiceBrand}>Talk to Helfi</Text>
                    <View style={styles.voiceCallStage}>
                      <View style={styles.voiceOrb}>
                        <View style={styles.voiceOrbInner}>
                          {realtimeVoiceStatus === 'live' || realtimeVoiceStatus === 'speaking' ? (
                            <View style={styles.voiceBarsLarge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                              <View style={[styles.voiceBarLarge, styles.voiceBarLargeShort]} />
                              <View style={[styles.voiceBarLarge, styles.voiceBarLargeTall]} />
                              <View style={styles.voiceBarLarge} />
                              <View style={[styles.voiceBarLarge, styles.voiceBarLargeTall]} />
                              <View style={[styles.voiceBarLarge, styles.voiceBarLargeShort]} />
                            </View>
                          ) : !voicePaidAccessGranted || checkingRealtimeVoice || realtimeVoiceStatus === 'connecting' || busy ? (
                            <ActivityIndicator size="large" color="#FFFFFF" />
                          ) : (
                            <Feather name={realtimeVoiceStatus === 'failed' ? 'alert-circle' : 'mic'} size={42} color="#FFFFFF" />
                          )}
                        </View>
                      </View>
                      <Text style={styles.voiceCallTitle}>
                        {!voicePaidAccessGranted || checkingRealtimeVoice || realtimeVoiceStatus === 'connecting'
                          ? 'Connecting'
                          : realtimeVoiceStatus === 'speaking'
                          ? 'Speaking'
                          : realtimeVoiceStatus === 'live'
                          ? microphoneMuted ? 'Muted' : 'Listening'
                          : realtimeVoiceStatus === 'failed'
                          ? 'Could not connect'
                          : busy
                          ? 'Working on it'
                          : 'Ready'}
                      </Text>
                      {realtimeVoiceError ? <Text style={styles.voiceCallError}>{realtimeVoiceError}</Text> : null}
                      {voiceActivity.length > 0 ? (
                        <View style={styles.voiceActivityCard} accessibilityLabel="Live Helfi activity">
                          <Text style={styles.voiceActivityTitle}>Live activity</Text>
                          {voiceActivity.map((item) => (
                            <View key={item.id} style={styles.voiceActivityRow}>
                              {item.state === 'active' ? (
                                <ActivityIndicator size="small" color="#226B2C" />
                              ) : (
                                <Feather
                                  name={item.state === 'error' ? 'alert-circle' : 'check-circle'}
                                  size={16}
                                  color={item.state === 'error' ? '#B42318' : '#226B2C'}
                                />
                              )}
                              <Text style={[styles.voiceActivityText, item.state === 'error' && styles.voiceActivityErrorText]}>
                                {item.text}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    {!voiceSessionActive && realtimeVoiceStatus === 'failed' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Try live voice again"
                        onPress={retryRealtimeVoice}
                        style={styles.voiceRetryButton}
                      >
                        <Feather name="refresh-cw" size={20} color="#12351A" />
                        <Text style={styles.voiceControlText}>Try again</Text>
                      </Pressable>
                    ) : null}
                    {voiceSessionActive && draft?.canConfirm ? (
                      <View style={styles.voiceReviewFallback}>
                        <Text style={styles.voiceReviewFallbackTitle}>Ready to save</Text>
                        <Text style={styles.voiceReviewFallbackSummary} numberOfLines={2}>{draft.summary}</Text>
                        <View style={styles.voiceReviewFallbackButtons}>
                          <Pressable accessibilityRole="button" accessibilityLabel="Don't save" onPress={rejectDraft} style={styles.voiceReviewDiscardButton}>
                            <Text style={styles.voiceReviewDiscardText}>Don't save</Text>
                          </Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel="Save this" onPress={() => void confirmDraft()} disabled={confirming} style={[styles.voiceReviewSaveButton, confirming && styles.confirmDisabled]}>
                            {confirming ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.voiceReviewSaveText}>Save this</Text>}
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                    <View style={[styles.voiceControls, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Camera" onPress={openContextVision} style={styles.voiceControlItem}>
                        <View style={styles.voiceControlCircle}>
                          <Feather name="video" size={25} color="#12351A" />
                        </View>
                        <Text style={styles.voiceControlLabel}>Camera</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Delete chat" onPress={deleteChatAndClose} style={styles.voiceControlItem}>
                        <View style={styles.voiceControlCircle}>
                          <Feather name="trash-2" size={24} color="#B42318" />
                        </View>
                        <Text style={styles.voiceControlLabel}>Delete chat</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
                        onPress={toggleRealtimeMicrophone}
                        disabled={!voiceSessionActive}
                        style={[styles.voiceControlItem, !voiceSessionActive && styles.voiceControlDisabled]}
                      >
                        <View style={styles.voiceControlCircle}>
                          <Feather name={microphoneMuted ? 'mic-off' : 'mic'} size={25} color="#12351A" />
                        </View>
                        <Text style={styles.voiceControlLabel}>{microphoneMuted ? 'Unmute' : 'Mute'}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="End voice chat" onPress={() => closePanel()} style={styles.voiceControlItem}>
                        <View style={styles.voiceEndCircle}>
                          <Feather name="x" size={31} color="#FFFFFF" />
                        </View>
                        <Text style={styles.voiceEndLabel}>End</Text>
                      </Pressable>
                    </View>
                    {voiceSessionActive && launchContext.section === 'health-intake' && visionChoicesOpen ? (
                      <View style={styles.voiceCallVisionChoices}>
                        {renderVisionChoice('supplement-bottle', 'Supplement camera', 'Health Intake review', 'camera')}
                        {renderVisionChoice('medication-bottle', 'Medication camera', 'Health Intake review', 'camera')}
                      </View>
                    ) : null}
                  </View>
                ) : showingConversationReview ? (
                  <View style={styles.transcriptReview}>
                    <View style={styles.transcriptReviewHeader}>
                      <Text style={styles.transcriptReviewTitle}>Voice chat ended</Text>
                      <Text style={styles.transcriptReviewSubtitle}>Transcript</Text>
                    </View>
                    {conversationTurns.map((turn) => (
                      <View
                        key={turn.id}
                        style={[
                          styles.transcriptBubble,
                          turn.role === 'user' ? styles.transcriptUserBubble : styles.transcriptHelfiBubble,
                        ]}
                      >
                        <Text style={styles.conversationRole}>{turn.role === 'user' ? 'You' : 'Helfi'}</Text>
                        <Text style={styles.conversationText}>{turn.text}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview ? (
                <View style={styles.replyRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Text reply"
                    onPress={() => setVoiceReplyPreference(false)}
                    style={[styles.segment, !voiceReply && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, !voiceReply && styles.segmentTextActive]}>Text reply</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Spoken reply"
                    onPress={() => setVoiceReplyPreference(true)}
                    style={[styles.segment, voiceReply && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, voiceReply && styles.segmentTextActive]}>Spoken reply</Text>
                  </Pressable>
                </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview && voiceReply ? (
                  <View style={[styles.spokenReplyBox, (spokenReplyStatus === 'failed' || spokenReplyStatus === 'unavailable') && styles.spokenReplyFailed]}>
                    {spokenReplyStatus === 'preparing' ? <ActivityIndicator size="small" color="#226B2C" /> : null}
                    <Feather
                      name={spokenReplyStatus === 'failed' || spokenReplyStatus === 'unavailable' ? 'alert-circle' : 'volume-2'}
                      size={16}
                      color={spokenReplyStatus === 'failed' || spokenReplyStatus === 'unavailable' ? '#B42318' : '#226B2C'}
                    />
                    <Text style={[styles.spokenReplyText, (spokenReplyStatus === 'failed' || spokenReplyStatus === 'unavailable') && styles.spokenReplyFailedText]}>
                      {spokenReplyStatus === 'preparing'
                        ? 'Preparing spoken reply'
                        : spokenReplyStatus === 'playing'
                        ? 'Playing spoken reply'
                        : spokenReplyStatus === 'unavailable'
                        ? 'Spoken reply unavailable'
                        : spokenReplyStatus === 'failed'
                        ? 'Could not play spoken reply'
                        : `Voice: ${realtimeVoiceName || SPOKEN_REPLY_VOICE_NAME}`}
                    </Text>
                  </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview ? (
                <View style={styles.contextBox}>
                  <Text style={styles.contextText}>{launchCopy.opener}</Text>
                </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview && launchCopy.visionLabel ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={launchCopy.visionLabel}
                    onPress={openContextVision}
                    style={styles.visionButton}
                  >
                    <Feather name={launchContext.section === 'health-image' || launchContext.section === 'symptoms' ? 'image' : 'camera'} size={18} color="#226B2C" />
                    <Text style={styles.visionText}>{launchCopy.visionLabel}</Text>
                  </Pressable>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview && visionChoicesOpen ? (
                  <View style={styles.visionChoiceBox}>
                    {launchContext.section === 'health-intake' ? (
                      <>
                        {renderVisionChoice('supplement-bottle', 'Supplement camera', 'Health Intake review', 'camera')}
                        {renderVisionChoice('medication-bottle', 'Medication camera', 'Health Intake review', 'camera')}
                      </>
                    ) : (
                      <>
                        {renderVisionChoice('food-photo', 'Food photo', `${mealLabel(launchContext.meal)} entry`, 'camera')}
                        {renderVisionChoice('journal-photo', 'Journal photo', 'Health journal', 'image')}
                        {renderVisionChoice('health-image', 'Health image note', 'Record only, no diagnosis', 'file-text')}
                      </>
                    )}
                  </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview && voiceRecordingSupported ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={voiceSessionActive ? 'End live voice' : realtimeVoiceButtonLabel}
                    onPress={voiceSessionActive ? endVoiceSession : startVoiceSession}
                    disabled={realtimeVoiceButtonDisabled}
                    style={[styles.recordButton, voiceSessionActive && styles.listeningButton, realtimeVoiceButtonDisabled && styles.disabled]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        {recording ? (
                          <View style={styles.voiceBars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                            <View style={[styles.voiceBar, styles.voiceBarShort]} />
                            <View style={[styles.voiceBar, styles.voiceBarTall]} />
                            <View style={styles.voiceBar} />
                            <View style={[styles.voiceBar, styles.voiceBarTall]} />
                            <View style={[styles.voiceBar, styles.voiceBarShort]} />
                          </View>
                        ) : (
                          <Feather name="mic" size={22} color="#FFFFFF" />
                        )}
                        <View style={styles.voiceButtonCopy}>
                          <Text style={styles.recordText}>
                            {recording
                              ? 'Listening...'
                              : checkingRealtimeVoice || realtimeVoiceUnavailable || realtimeVoiceStatus === 'connecting'
                              ? realtimeVoiceButtonLabel
                              : voiceSessionActive && spokenReplyStatus === 'playing'
                              ? 'Helfi is speaking'
                              : voiceSessionActive
                              ? 'Voice chat is live'
                              : 'Start live voice'}
                          </Text>
                          {voiceSessionActive ? <Text style={styles.voiceHintText}>Hands-free conversation</Text> : null}
                        </View>
                      </>
                    )}
                  </Pressable>
                ) : (
                  !LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview ? (
                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeTitle}>Type-only on iPad</Text>
                    <Text style={styles.noticeText}>Voice input is iPhone only for now. Type your request below.</Text>
                  </View>
                  ) : null
                )}
                {!voiceSessionActive && !showingConversationReview && realtimeVoiceError ? (
                  <View style={realtimeVoiceUnavailable ? styles.liveVoiceUnavailableBox : styles.liveVoiceErrorBox}>
                    <Feather name={realtimeVoiceUnavailable ? 'info' : 'alert-circle'} size={18} color={realtimeVoiceUnavailable ? '#226B2C' : '#B42318'} />
                    <Text style={realtimeVoiceUnavailable ? styles.liveVoiceUnavailableText : styles.liveVoiceErrorText}>{realtimeVoiceError}</Text>
                  </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview && conversationTurns.length > 0 ? (
                  <View style={styles.conversationBox}>
                    <View style={styles.conversationHeader}>
                      <Text style={styles.label}>Conversation</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="New chat"
                        onPress={clearConversationMemory}
                        style={styles.newChatButton}
                      >
                        <Feather name="refresh-ccw" size={14} color="#226B2C" />
                        <Text style={styles.newChatText}>New chat</Text>
                      </Pressable>
                    </View>
                    {conversationTurns.map((turn) => (
                      <View
                        key={turn.id}
                        style={[
                          styles.conversationBubble,
                          turn.role === 'user' ? styles.userBubble : styles.assistantBubble,
                        ]}
                      >
                        <Text style={styles.conversationRole}>{turn.role === 'user' ? 'You' : 'Helfi'}</Text>
                        <Text style={styles.conversationText}>{turn.text}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {!LIVE_VOICE_ENABLED && !voiceSessionActive && !showingConversationReview ? (
                <View style={styles.section}>
                  <Text style={styles.label}>Message Helfi</Text>
                  <TextInput
                    value={transcript}
                    onChangeText={(value) => {
                      setTranscript(value)
                      setDraft(null)
	                    }}
	                    placeholder={voiceRecordingSupported ? launchCopy.placeholder : 'Type your request here.'}
	                    accessibilityLabel="Talk to Helfi message"
	                    accessibilityHint="Type your request for Helfi"
	                    testID="talk-to-helfi-message-input"
	                    multiline
	                    style={styles.input}
	                  />
	                  <Pressable
	                    accessibilityRole="button"
	                    accessibilityLabel="Ask Helfi"
	                    testID="talk-to-helfi-inline-submit"
	                    onPress={() => sendDraftRequest()}
	                    disabled={busy || !transcript.trim()}
	                    style={[styles.secondaryButton, (busy || !transcript.trim()) && styles.secondaryDisabled]}
                  >
                    <Text style={styles.secondaryText}>Ask Helfi</Text>
                  </Pressable>
                </View>
                ) : null}

                {!voiceSessionActive && !showingConversationReview && showDraftCard && draft && (
                  <View style={styles.section}>
                    <Text style={styles.label}>{draftIsActionable ? "Helfi's plan" : 'Helfi'}</Text>
                    <Text style={styles.summary}>{draft.summary}</Text>
                    <Text style={styles.message}>{draft.canConfirm ? reviewPromptForDraft(draft) : draft.recipe?.text || draft.confirmationMessage}</Text>
                    {draft.food?.entries?.length ? (
                      <View style={styles.entryList}>
                        {draft.food.entries.map((entry, index) => (
                          <View key={`${entry.name}-${index}`} style={styles.entryRow}>
                            <Text style={styles.entryText}>
                              {index + 1}. {entry.name}
                            </Text>
                            {entry.description ? <Text style={styles.entrySubtext}>{entry.description}</Text> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {draft.food?.nutrition?.calories ? (
                      <Text style={styles.creditText}>
                        Estimate: {Math.round(Number(draft.food.nutrition.calories) || 0)} kcal
                      </Text>
                    ) : null}
                    {draft.food?.draftText ? <Text style={styles.message}>{draft.food.draftText}</Text> : null}
                    {draft.healthIntake?.items?.length ? (
                      <View style={styles.entryList}>
	                        {draft.healthIntake.items.map((item, index) => {
	                          const typeLabel = item.type === 'medication' ? 'Medication' : 'Supplement'
	                          const dose = cleanFavoriteText(item.dosage || '', 80) || 'dose not specified'
	                          const timing = Array.isArray(item.timing) && item.timing.length ? item.timing.join(', ') : 'timing not specified'
	                          const matchName = cleanFavoriteText(item.catalogMatch?.name || '', 160)
	                          return (
	                            <View key={`${item.name || typeLabel}-${index}`} style={styles.entryRow}>
	                              <Text style={styles.entryText}>
	                                {index + 1}. {typeLabel}: {item.name || 'Unnamed item'}
	                              </Text>
	                              <Text style={styles.entrySubtext}>{dose} · {timing}</Text>
	                              {matchName ? <Text style={styles.entrySubtext}>Possible match: {matchName}</Text> : null}
	                            </View>
	                          )
	                        })}
                      </View>
                    ) : null}
                    {chargedCredits !== null && (
                      <Text style={styles.creditText}>Charged: {chargedCredits} credits</Text>
                    )}
                    {saveError ? (
                      <View style={styles.liveVoiceErrorBox}>
                        <Feather name="alert-circle" size={18} color="#B42318" />
                        <Text style={styles.liveVoiceErrorText}>Save failed: {saveError} Your review is still here; try Save this again.</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </ScrollView>

              {!showingLiveVoiceExperience ? <View style={[styles.footer, (primaryFooterIsHandoff || draftIsActionable) && styles.footerStacked, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
                {voiceSessionActive || showingLiveVoiceExperience ? null : showingConversationReview ? (
                  <>
                    <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => closePanel()} style={styles.cancelButton}>
                      <Text style={styles.cancelText}>Done</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="New voice chat"
                      onPress={restartVoiceSession}
                      style={styles.confirmButton}
                    >
                      <Text style={styles.confirmText}>New chat</Text>
                    </Pressable>
                  </>
                ) : primaryFooterIsHandoff && draftIsActionable ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={primaryFooterLabel}
                      onPress={primaryFooterPress}
                      disabled={primaryFooterDisabled}
                      style={[styles.confirmButton, styles.fullWidthFooterButton, primaryFooterDisabled && styles.confirmDisabled]}
                    >
                      {confirming ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                          {primaryFooterLabel}
                        </Text>
                      )}
                    </Pressable>
                    <View style={styles.footerRow}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => closePanel()} style={styles.cancelButton}>
                        <Text style={styles.cancelText}>Done</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={discardFooterLabel} onPress={rejectDraft} style={styles.discardButton}>
                        <Text style={styles.discardText}>{discardFooterLabel}</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    {!draftIsActionable ? (
                      <>
                        <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => closePanel()} style={styles.cancelButton}>
                          <Text style={styles.cancelText}>Done</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Ask Helfi"
                          testID="talk-to-helfi-footer-submit"
                          onPress={() => sendDraftRequest()}
                          disabled={busy || !transcript.trim()}
                          style={[styles.confirmButton, (busy || !transcript.trim()) && styles.confirmDisabled]}
                        >
                          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Ask Helfi</Text>}
                        </Pressable>
                      </>
                    ) : null}
                    {draftIsActionable ? (
                      <>
                        <View style={styles.footerRow}>
                          <Pressable accessibilityRole="button" accessibilityLabel={discardFooterLabel} onPress={rejectDraft} style={styles.discardButton}>
                            <Text style={styles.discardText}>{discardFooterLabel}</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={primaryFooterLabel}
                            onPress={primaryFooterPress}
                            disabled={primaryFooterDisabled}
                            style={[styles.confirmButton, primaryFooterDisabled && styles.confirmDisabled]}
                          >
                            {confirming ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>{primaryFooterLabel}</Text>}
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                  </>
                )}
              </View> : null}
            </View>
          </Modal>
          <Modal visible={bottleCameraOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeCameraMode}>
            <View style={styles.liveCameraPanel}>
              <View style={[styles.liveCameraHeader, { paddingTop: Math.max(insets.top, 12) }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close camera mode"
                  onPress={closeCameraMode}
                  style={styles.liveCameraIconButton}
                >
                  <Feather name="x" size={24} color="#FFFFFF" />
                </Pressable>
                <View style={styles.liveCameraTitleBlock}>
                  <Text style={styles.liveCameraTitle}>Talk to Helfi</Text>
                  <Text style={styles.liveCameraSubtitle}>Live {bottleCameraLabel} camera mode</Text>
                </View>
                <View style={styles.liveCameraIconSpacer} />
              </View>

              <View style={styles.liveCameraArea}>
                {cameraPermission?.granted ? (
                  <CameraView
                    style={styles.liveCameraPreview}
                    facing="back"
                    onCameraReady={() => setBottleCameraReady(true)}
                    onMountError={(event) => setBottleCameraError(event?.message || 'Camera unavailable')}
                  />
                ) : null}

                {!cameraPermission?.granted ? (
                  <View style={styles.liveCameraPermissionPanel}>
                    <Feather name="camera" size={34} color="#FFFFFF" />
                    <Text style={styles.liveCameraPermissionTitle}>Enable camera</Text>
                    <Text style={styles.liveCameraPermissionText}>Helfi needs camera access for live camera mode.</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Enable camera"
                      onPress={() => void requestCameraPermission()}
                      style={styles.liveCameraPrimaryButton}
                    >
                      <Text style={styles.liveCameraPrimaryText}>Enable camera</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View pointerEvents="none" style={styles.liveCameraOverlay}>
                  <View style={styles.liveCameraGuideText}>
                    <Text style={styles.liveCameraGuideTitle}>Show Helfi the item</Text>
                    <Text style={styles.liveCameraGuideSubtitle}>Keep the label clear while you talk</Text>
                  </View>
                  <View style={styles.liveCameraFrame}>
                    <View style={[styles.liveCameraCorner, styles.liveCameraCornerTopLeft]} />
                    <View style={[styles.liveCameraCorner, styles.liveCameraCornerTopRight]} />
                    <View style={[styles.liveCameraCorner, styles.liveCameraCornerBottomLeft]} />
                    <View style={[styles.liveCameraCorner, styles.liveCameraCornerBottomRight]} />
                  </View>
                  <View style={styles.liveCameraStatusPill}>
                    <Feather name={bottleCameraError ? 'alert-circle' : 'camera'} size={14} color="#FFFFFF" />
                    <Text style={styles.liveCameraStatusText}>
	                      {bottleCameraError || (voiceSessionActive ? 'Realtime voice with camera is live' : 'Camera mode ready')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.liveCameraFooter, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
	                {voiceRecordingSupported ? (
	                  <Pressable
	                    accessibilityRole="button"
		                    accessibilityLabel={voiceSessionActive ? 'End realtime voice with camera' : realtimeVoiceButtonLabel}
		                    onPress={voiceSessionActive ? endVoiceSession : startVoiceSession}
		                    disabled={realtimeVoiceButtonDisabled}
		                    style={[styles.liveCameraVoiceButton, voiceSessionActive && styles.liveCameraVoiceListening, realtimeVoiceButtonDisabled && styles.liveCameraVoiceDisabled]}
	                  >
	                    {busy ? (
	                      <ActivityIndicator color="#102017" />
	                    ) : voiceSessionActive ? (
	                      <View style={styles.voiceBars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
	                        <View style={[styles.voiceBarDark, styles.voiceBarShort]} />
	                        <View style={[styles.voiceBarDark, styles.voiceBarTall]} />
	                        <View style={styles.voiceBarDark} />
	                        <View style={[styles.voiceBarDark, styles.voiceBarTall]} />
	                        <View style={[styles.voiceBarDark, styles.voiceBarShort]} />
	                      </View>
	                    ) : (
	                      <Feather name="mic" size={22} color="#102017" />
	                    )}
	                    <Text style={styles.liveCameraVoiceText}>
	                        {voiceSessionActive ? 'End live voice' : realtimeVoiceButtonLabel}
                      </Text>
	                  </Pressable>
	                ) : null}
	                <Text style={styles.liveCameraSafetyText}>Helfi will show a review before anything is saved.</Text>
              </View>
            </View>
          </Modal>
          <Modal
            transparent
            visible={saveSuccessNotice != null}
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={() => setSaveSuccessNotice(null)}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss saved confirmation"
              onPress={() => setSaveSuccessNotice(null)}
              style={[styles.saveSuccessOverlay, { paddingTop: Math.max(insets.top + 12, 28) }]}
            >
              <View style={styles.saveSuccessCard}>
                <View style={styles.saveSuccessIcon}>
                  <Feather name="check" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.saveSuccessCopy}>
                  <Text style={styles.saveSuccessTitle}>{saveSuccessNotice?.title}</Text>
                  <Text style={styles.saveSuccessMessage}>{saveSuccessNotice?.message}</Text>
                </View>
              </View>
            </Pressable>
          </Modal>
        </>
      )}
    </VoiceAssistantContext.Provider>
  )
}

export function useVoiceAssistant() {
  const ctx = useContext(VoiceAssistantContext)
  if (!ctx) {
    throw new Error('useVoiceAssistant must be used inside VoiceAssistantProvider')
  }
  return ctx
}

const styles = StyleSheet.create({
  saveSuccessOverlay: { flex: 1, alignItems: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(8, 21, 13, 0.08)' },
  saveSuccessCard: {
    width: '100%',
    maxWidth: 430,
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B7E4C2',
    backgroundColor: '#F2FBF4',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#102017',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  saveSuccessIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#16803A', alignItems: 'center', justifyContent: 'center' },
  saveSuccessCopy: { flex: 1 },
  saveSuccessTitle: { color: '#12351A', fontSize: 17, fontWeight: '700' },
  saveSuccessMessage: { color: '#476451', fontSize: 14, fontWeight: '700', marginTop: 2 },
  panel: { flex: 1, backgroundColor: '#F7FAF9' },
  liveVoicePanel: { backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCE8DF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteChatButton: { minHeight: 42, paddingHorizontal: 10, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF1F0' },
  deleteChatText: { color: '#B42318', fontSize: 13, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  subtitle: { marginTop: 4, color: theme.colors.muted, fontWeight: '700' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF5F1' },
  liveCameraPanel: { flex: 1, backgroundColor: '#07110A' },
  liveCameraHeader: {
    minHeight: 86,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#07110A',
  },
  liveCameraIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  liveCameraIconSpacer: { width: 44, height: 44 },
  liveCameraTitleBlock: { flex: 1, alignItems: 'center', minWidth: 0 },
  liveCameraTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  liveCameraSubtitle: { color: '#CFE8D4', fontSize: 12, fontWeight: '600', marginTop: 3 },
  liveCameraArea: { flex: 1, backgroundColor: '#000000', position: 'relative', overflow: 'hidden' },
  liveCameraPreview: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  liveCameraPermissionPanel: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '27%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(7,17,10,0.86)',
    padding: 18,
    alignItems: 'center',
    gap: 10,
    zIndex: 3,
  },
  liveCameraPermissionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  liveCameraPermissionText: { color: '#D9E8DD', textAlign: 'center', lineHeight: 20, fontWeight: '700' },
  liveCameraPrimaryButton: { marginTop: 6, borderRadius: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 18, paddingVertical: 12 },
  liveCameraPrimaryText: { color: '#102017', fontWeight: '700' },
  liveCameraOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  liveCameraGuideText: { position: 'absolute', top: 34, left: 20, right: 20, alignItems: 'center' },
  liveCameraGuideTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  liveCameraGuideSubtitle: { color: '#DDF7E1', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 5 },
  liveCameraFrame: {
    width: '88%',
    aspectRatio: 1.18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    backgroundColor: 'rgba(0,0,0,0.05)',
    position: 'relative',
  },
  liveCameraCorner: { position: 'absolute', width: 34, height: 34, borderColor: '#FFFFFF' },
  liveCameraCornerTopLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  liveCameraCornerTopRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  liveCameraCornerBottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  liveCameraCornerBottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  liveCameraStatusPill: {
    position: 'absolute',
    bottom: 24,
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(7,17,10,0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveCameraStatusText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  liveCameraFooter: { paddingTop: 16, paddingHorizontal: 18, backgroundColor: '#07110A', alignItems: 'center', gap: 10 },
  liveCameraVoiceButton: {
    width: '100%',
    minHeight: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  liveCameraVoiceListening: { backgroundColor: '#DDF7E1' },
  liveCameraVoiceDisabled: { opacity: 0.58 },
  liveCameraVoiceText: { color: '#102017', fontSize: 17, fontWeight: '700' },
  liveCameraSafetyText: { color: '#CFE8D4', textAlign: 'center', fontWeight: '600', fontSize: 12 },
  content: { padding: 18, gap: 16 },
  contentWithFooterSpace: { paddingBottom: 132 },
  liveVoiceContent: { flexGrow: 1 },
  voiceCallScreen: {
    flex: 1,
    minHeight: 620,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  voiceBrand: { color: theme.colors.text, fontSize: 21, fontWeight: '700', textAlign: 'center' },
  voiceCallStage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 24 },
  voiceOrb: {
    width: 224,
    height: 224,
    borderRadius: 112,
    backgroundColor: '#E4F7E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceOrbInner: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: '#41AD49',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2E7D35',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  voiceBarsLarge: { height: 56, minWidth: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  voiceBarLarge: { width: 7, height: 38, borderRadius: 7, backgroundColor: '#FFFFFF' },
  voiceBarLargeShort: { height: 22, opacity: 0.78 },
  voiceBarLargeTall: { height: 52, opacity: 0.95 },
  voiceCallTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  voiceCallError: { marginTop: 10, maxWidth: 320, color: '#B42318', fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  voiceActivityCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CFE8D4',
    backgroundColor: '#F5FBF6',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  voiceActivityTitle: { color: '#12351A', fontSize: 13, fontWeight: '800' },
  voiceActivityRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceActivityText: { flex: 1, color: '#355B3D', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  voiceActivityErrorText: { color: '#B42318' },
  voiceReviewFallback: {
    width: '100%',
    maxWidth: 390,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CFE8D4',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 7,
  },
  voiceReviewFallbackTitle: { color: '#12351A', fontSize: 14, fontWeight: '800' },
  voiceReviewFallbackSummary: { color: '#476451', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  voiceReviewFallbackButtons: { flexDirection: 'row', gap: 10 },
  voiceReviewDiscardButton: { flex: 1, minHeight: 42, borderRadius: 21, backgroundColor: '#F2F4F2', alignItems: 'center', justifyContent: 'center' },
  voiceReviewDiscardText: { color: '#B42318', fontSize: 14, fontWeight: '800' },
  voiceReviewSaveButton: { flex: 1, minHeight: 42, borderRadius: 21, backgroundColor: '#16803A', alignItems: 'center', justifyContent: 'center' },
  voiceReviewSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  voiceControls: { width: '100%', maxWidth: 380, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  voiceControlItem: { width: 82, alignItems: 'center', justifyContent: 'flex-start', gap: 7 },
  voiceControlCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#F1F4F2', alignItems: 'center', justifyContent: 'center' },
  voiceEndCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#102017', alignItems: 'center', justifyContent: 'center' },
  voiceControlLabel: { color: '#12351A', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  voiceEndLabel: { color: '#102017', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  voiceControlDisabled: { opacity: 0.42 },
  voiceControlText: { color: '#12351A', fontSize: 12, fontWeight: '700' },
  voiceRetryButton: { minHeight: 48, borderRadius: 24, paddingHorizontal: 20, backgroundColor: '#EEF8F0', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 },
  voiceCallVisionChoices: { width: '100%', maxWidth: 420, marginBottom: 12 },
  transcriptReview: { gap: 10 },
  transcriptReviewHeader: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CFE8D4',
    backgroundColor: '#F2FBF4',
    padding: 12,
    alignItems: 'flex-start',
  },
  transcriptReviewTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  transcriptReviewSubtitle: { color: theme.colors.muted, fontSize: 12, fontWeight: '600', marginTop: 3 },
  newVoiceChatButton: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 11,
    backgroundColor: '#41AD49',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  newVoiceChatText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  transcriptBubble: { borderRadius: 8, padding: 12, borderWidth: 1 },
  transcriptUserBubble: { backgroundColor: '#EAF8EE', borderColor: '#CFE8D4' },
  transcriptHelfiBubble: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border },
  replyRow: { flexDirection: 'row', backgroundColor: '#E8F2EA', borderRadius: 8, padding: 4 },
  segment: { flex: 1, minHeight: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#FFFFFF' },
  segmentText: { color: theme.colors.muted, fontWeight: '600' },
  segmentTextActive: { color: theme.colors.text },
  spokenReplyBox: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CFE8D4',
    backgroundColor: '#F2FBF4',
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  spokenReplyFailed: { borderColor: '#F3C0BB', backgroundColor: '#FFF4F2' },
  spokenReplyText: { color: '#226B2C', fontWeight: '700', fontSize: 13 },
  spokenReplyFailedText: { color: '#B42318' },
  conversationBox: { gap: 8 },
  conversationHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  newChatButton: {
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#EEF8F0',
  },
  newChatText: { color: '#226B2C', fontSize: 12, fontWeight: '700' },
  conversationBubble: { borderRadius: 8, padding: 10, borderWidth: 1 },
  userBubble: { backgroundColor: '#EEF8F0', borderColor: '#CFE8D4' },
  assistantBubble: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border },
  conversationRole: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 3 },
  conversationText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  contextBox: { borderRadius: 8, borderWidth: 1, borderColor: '#CFE8D4', backgroundColor: '#F2FBF4', padding: 12 },
  contextText: { color: theme.colors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  visionButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBDDC4',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  visionText: { color: '#226B2C', fontWeight: '700', fontSize: 15 },
  visionChoiceBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6E4DA',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  visionChoice: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3EF',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  visionChoiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EEF8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionChoiceCopy: { flex: 1, minWidth: 0 },
  visionChoiceTitle: { color: theme.colors.text, fontWeight: '700', fontSize: 15 },
  visionChoiceDetail: { color: theme.colors.muted, fontWeight: '700', fontSize: 12, marginTop: 2 },
  recordButton: {
    minHeight: 58,
    borderRadius: 29,
    backgroundColor: '#41AD49',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  listeningButton: { backgroundColor: '#226B2C' },
  disabled: { opacity: 0.65 },
  recordText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  voiceButtonCopy: { alignItems: 'center', justifyContent: 'center', gap: 1 },
  voiceHintText: { color: '#DDF7E1', fontWeight: '600', fontSize: 12 },
  voiceBars: { height: 28, minWidth: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  voiceBar: { width: 4, height: 20, borderRadius: 4, backgroundColor: '#FFFFFF' },
  voiceBarDark: { width: 4, height: 20, borderRadius: 4, backgroundColor: '#102017' },
  voiceBarShort: { height: 12, opacity: 0.78 },
  voiceBarTall: { height: 26, opacity: 0.94 },
  voiceSessionBox: {
    minHeight: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFE4C6',
    backgroundColor: '#F2FBF4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 8,
  },
  voiceSessionTitle: { color: '#12351A', fontWeight: '700', fontSize: 22, textAlign: 'center' },
  voiceSessionText: { color: '#3B5F43', fontWeight: '700', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  liveVoiceErrorBox: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3C0BB',
    backgroundColor: '#FFF4F2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  liveVoiceErrorText: { color: '#B42318', fontWeight: '600', lineHeight: 19, flex: 1 },
  liveVoiceUnavailableBox: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CFE8D4',
    backgroundColor: '#F2FBF4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  liveVoiceUnavailableText: { color: '#226B2C', fontWeight: '600', lineHeight: 19, flex: 1 },
  noticeBox: { borderRadius: 8, borderWidth: 1, borderColor: '#CFE8D4', backgroundColor: '#F2FBF4', padding: 12, gap: 4 },
  noticeTitle: { color: theme.colors.text, fontWeight: '700' },
  noticeText: { color: theme.colors.muted, lineHeight: 20 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#DDE8E1', padding: 14, gap: 10 },
  label: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6E4DA',
    padding: 12,
    color: theme.colors.text,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 21,
    backgroundColor: '#FBFDFC',
  },
  secondaryButton: { minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F2EA' },
  secondaryDisabled: { opacity: 0.5 },
  secondaryText: { color: '#226B2C', fontWeight: '700' },
  summary: { color: theme.colors.text, fontWeight: '700', fontSize: 16 },
  message: { color: theme.colors.text, lineHeight: 21 },
  entryList: { gap: 8, paddingTop: 4 },
  entryRow: { gap: 2 },
  entryText: { color: theme.colors.text, fontWeight: '700' },
  entrySubtext: { color: theme.colors.muted, fontSize: 12 },
  creditText: { color: theme.colors.muted, fontWeight: '700' },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCE8DF',
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  footerStacked: { flexDirection: 'column' },
  footerRow: { flexDirection: 'row', gap: 12 },
  continueTalkingButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#E8F2EA',
    borderWidth: 1,
    borderColor: '#C8DDCE',
  },
  continueTalkingText: { color: '#0B3B2E', fontWeight: '700' },
  fullWidthFooterButton: { width: '100%', flex: 0 },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF3F0' },
  cancelText: { color: theme.colors.text, fontWeight: '700' },
  discardButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626' },
  discardText: { color: '#FFFFFF', fontWeight: '700' },
  confirmButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#41AD49' },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { color: '#FFFFFF', fontWeight: '700' },
})
