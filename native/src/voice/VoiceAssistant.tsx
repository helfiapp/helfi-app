import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import * as WebBrowser from 'expo-web-browser'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { API_BASE_URL } from '../config'
import { NutrientCards } from '../components/NutrientCards'
import { hasAiDataSharingPermission, requestAiDataSharingPermission } from '../lib/aiConsent'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { useAppleHealthSync } from '../health/AppleHealthSyncProvider'
import { isAppleHealthSupportedDevice } from '../health/appleHealth'
import { theme } from '../ui/theme'
import { applyReviewedLocalPreference, captureLocalPreferenceReview, validateLocalPreference, type LocalPreference, type LocalPreferenceReview } from './localPreferenceActions'
import { acceptAdditionalVoiceReceipt, verifiedAdditionalVoiceReceipt, type AdditionalVoiceAction } from './additionalVoiceActions'
import { nativeReportPdfCompletionMessage, openReviewedNativeReportPdf, presentNativeReportPdfViewer } from './reportPdfActions'
import { validatedVoiceCapability, type VoiceCapabilityRequest } from './voiceCapabilityManifest'
import { verifiedClinicalVoiceResult, type ClinicalVoiceAction } from './clinicalVoiceActions'
import { sanitizeGeneralAssistantCommand, type GeneralAssistantCommand } from './generalAssistantActions'
import { acceptGeneralAssistantResponse, newGeneralAssistantSessionId } from './generalAssistantSession'
import { generalAssistantCompletionEvents } from './generalAssistantEffects'
import { readOwnedVoiceResult } from './voiceOwnedResultRecovery'
import { hasNativeRealtimeVoiceSupport, startHelfiRealtimeVoiceSession } from './realtimeVoice'
import { applyReviewedNativeDeviceAction, captureNativeDeviceReview, getSleepDeviceEditorState, validateNativeDeviceAction, type NativeDeviceAction, type NativeDeviceIo, type NativeDeviceReview } from './nativeDeviceActions'

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
  mode?: 'voice' | 'conversation' | 'text'
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
  localTime?: string
  tzOffsetMin?: number
  timeZone?: string
  timingNeedsClarification?: boolean
  summary: string
  confirmationMessage: string
  canConfirm: boolean
  autoSave?: boolean
  recipe?: { text?: string; importDraft?: Record<string, unknown> }
  recipeImport?: { userId: string; url: string; costCredits: number; localDate?: string; meal?: string; destination?: 'diary' | 'library' }
  supportAction?: { action: 'support.create' | 'support.reply' | 'support.end_chat' | 'support.feedback' | 'support.delete'; userId?: string; ticketId?: string; payload?: Record<string, unknown>; beforeHash?: string }
  reportAction?: { action: 'reports.weekly.generate' | 'reports.weekly.export_pdf'; userId?: string; reportId?: string; reportStatus?: 'READY'; sourceVersion?: string; beforeHash?: string; pricePolicy?: { minimumAvailableCredits: number; chargeMode: 'normal_usage_based' }; periodStart?: string; periodEnd?: string }
  additionalAction?: AdditionalVoiceAction
  foodManagement?: { action: string; userId: string; operation?: string; values: Record<string, unknown>; [key: string]: unknown }
  clinicalAction?: ClinicalVoiceAction
  clinicalResult?: { analysisId: string | null; threadId?: string; spokenMessage: string }
  deviceAction?: NativeDeviceAction
  requiresDeviceReview?: boolean
  mood?: { mood?: number; tags?: string[]; note?: string; context?: { intensityPercent?: number; feelings?: string[]; energyLevel?: number; sleepQuality?: number; nutrition?: number; supplements?: number; medicationEffect?: number; physicalActivity?: number; localHour?: number } }
  journal?: { title?: string; content?: string; tags?: string[]; journalType?: 'mood' | 'health' }
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
    sourceNote?: string
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
  assistantPlan?: { sessionId: string; revision: number; reviewId?: string }
  recordAction?: {
    operation: 'create' | 'update' | 'delete'
    entity: 'food' | 'water' | 'mood' | 'journal' | 'mood_journal' | 'exercise' | 'favorite' | 'custom_food' | 'symptom_note' | 'supplement' | 'medication'
    id: string
    changes?: Record<string, unknown>
    localDate?: string
    beforeHash?: string
    timeZone?: string
    ownerId?: string
    spokenReview?: string
  }
  notificationAction?: { action: 'notifications.mark_read' | 'notifications.delete' | 'notifications.mark_all_visible_read' | 'notifications.delete_all_visible'; userId?: string; ids?: string[]; values?: { ids?: string[]; titles?: string[] }; beforeHash?: string; summary?: string; preparedAt?: number }
  localPreference?: LocalPreference
  preferenceAction?: { action: string; userId?: string; values: Record<string, unknown>; beforeHash?: string; summary?: string; preparedAt?: number }
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
type RealtimeVoiceStatus = 'idle' | 'connecting' | 'live' | 'hearing' | 'thinking' | 'speaking' | 'closed' | 'failed' | 'fallback'
type RealtimeActionHint = { action?: string; needsReview?: boolean; capability?: VoiceCapabilityRequest; assistantCommand?: GeneralAssistantCommand }
type DraftRequestResult = {
  ok: boolean
  message: string
  saved?: boolean
  needsReview?: boolean
  action?: string
  reviewPrompt?: string
  voiceActionRunId?: string
  assistantContext?: unknown
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
  voiceActionRunId?: string
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
const VOICE_CONVERSATION_MEMORY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_VOICE_CONVERSATION_TURNS = 100
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
const REALTIME_VOICE_SERVER_TIMEOUT_MS = 12000
const REALTIME_VOICE_MEDIA_TIMEOUT_MS = 4000
const NOT_SAVED_MESSAGE = 'No problem. I have not saved anything.'
const VOICE_TURN_SILENCE_MS = 750
const VOICE_TURN_MIN_MS = 650
const VOICE_TURN_MAX_MS = 8000
const VOICE_TURN_METER_THRESHOLD = -38

const DEFAULT_LAUNCH_CONTEXT: VoiceAssistantLaunchContext = { section: 'generic', title: 'Helfi' }
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function newRealtimeBillingSessionId() {
  return `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function newVoiceActionRunId() {
  return `action_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

function voiceConversationStorageKey(userId: string) {
  return `${VOICE_CONVERSATION_MEMORY_KEY}:${encodeURIComponent(userId)}`
}

function traceVoiceAction(voiceActionRunId: string, event: string, action: unknown, status: string, reasonCode: string, startedAt: number) {
  const safeAction = /^(?:record_action|preference_action|local_preference_action|notification_action|support_action|report_action|device_action|recipe_import_url|app_read|additional_action|food_favorite|food_draft|food_build_meal|food_copy_previous|water|exercise|journal|symptom_note|mood|health_intake_items|app_handoff|health_question|recipe|general_chat|navigate|delete_conversation)$/.test(String(action)) ? String(action) : 'unknown'
  console.info('[helfi voice action]', JSON.stringify({ version: 1, voiceActionRunId, event, action: safeAction, status, reasonCode, durationMs: Math.max(0, Date.now() - startedAt) }))
}

function isConfirmedVoiceSave(data: any, action?: string) {
  if (data?.success !== true || !data.result || typeof data.result !== 'object') return false
  const result = data.result
  const expected = action?.startsWith('food_') ? ['food'] : action === 'device_action' ? ['native_device_action'] : action === 'health_intake_items' ? ['health_intake'] : action === 'journal' ? ['journal', 'health_journal'] : action ? [action] : null
  if (expected && !expected.includes(result.kind)) return false
  if (result.kind === 'native_device_action') return isValidNativeDeviceReceipt(result) && result.verified === true
  if (result.kind === 'notification_action') return ['notifications.mark_read', 'notifications.delete', 'notifications.mark_all_visible_read', 'notifications.delete_all_visible'].includes(result.id) && result.saved === true && ['saved', 'already_set'].includes(result.status) && result.entity === 'notification' && result.operation === (result.id === 'notifications.delete' || result.id === 'notifications.delete_all_visible' ? 'delete' : 'update') && !(result.operation === 'delete' && result.status === 'already_set') && typeof result.message === 'string' && Boolean(result.message.trim()) && Array.isArray(result.ids) && result.ids.length > 0 && result.ids.length <= 1000 && result.ids.every((id: unknown) => typeof id === 'string' && Boolean(id.trim())) && new Set(result.ids).size === result.ids.length
  if (result.kind === 'record_action') {
    if (typeof result.id !== 'string' || !result.id.trim() || !['create', 'update', 'delete'].includes(result.operation)) return false
    if (result.entity === 'symptom_note') return result.operation === 'delete' && result.message === 'Deleted the reviewed symptom note record.'
    if (result.entity === 'supplement' || result.entity === 'medication') return ['update', 'delete'].includes(result.operation) && result.message === `${result.operation === 'delete' ? 'Removed' : 'Corrected'} the item in your recorded ${result.entity} list.`
    return ['food', 'water', 'mood', 'journal', 'mood_journal', 'exercise', 'favorite', 'custom_food'].includes(result.entity)
  }
  if (result.kind === 'local_preference_action') return ['darkMode', 'hapticsEnabled', 'profileVisibility', 'dataAnalytics'].includes(result.id) && result.operation === 'update' && result.entity === 'device_preferences'
  if (result.kind === 'preference_action') return typeof result.id === 'string' && Boolean(result.id.trim()) && result.operation === 'update' && ['saved', 'already_set'].includes(result.status)
  if (result.kind === 'health_intake') return typeof result.path === 'string' && Number.isFinite(result.counts?.supplements) && result.counts.supplements >= 0 && Number.isFinite(result.counts?.medications) && result.counts.medications >= 0
  if (!['food', 'water', 'exercise', 'mood', 'journal', 'health_journal', 'symptom_note'].includes(result.kind)) return false
  return (typeof result.id === 'string' && Boolean(result.id.trim())) || (Array.isArray(result.ids) && result.ids.length > 0 && result.ids.every((id: unknown) => typeof id === 'string' && Boolean(id.trim())))
}

function isValidNativeDeviceReceipt(result: any, draft?: VoiceDraft | null) {
  if (result?.kind !== 'native_device_action' || !['apple_health.import', 'apple_health.automatic.update', 'apple_health.source.select'].includes(result.id) || (draft && result.id !== draft.deviceAction?.action)) return false
  const imported = result.id === 'apple_health.import'
  if (result.entity !== (result.id.startsWith('apple_health.') ? 'apple_health' : 'device_settings') || result.operation !== (imported ? 'import' : 'update')) return false
  if (imported) {
    if (typeof result.localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(result.localDate) || !Number.isFinite(Date.parse(`${result.localDate}T12:00:00Z`)) || new Date(`${result.localDate}T12:00:00Z`).toISOString().slice(0, 10) !== result.localDate || (draft && result.localDate !== draft.deviceAction?.values.localDate)) return false
    return result.status === 'imported' && result.verified === true && result.message === `Apple Health confirmed the activity import for ${result.localDate}.`
      || result.status === 'no_data' && result.verified === false && result.message === 'Apple Health did not confirm an import. There may be no available active-energy data or read permission; please check Devices.'
  }
  return result.status === 'setting_saved' && result.verified === true && result.message === 'The Apple Health setting was saved and checked on this phone. Health permissions were not changed.'
}

function nativeDeviceIoForVoice(health: () => ReturnType<typeof useAppleHealthSync>, accountId: () => string | null, isCurrent: () => boolean): NativeDeviceIo {
  const currentHealth = () => {
    if (!isCurrent()) throw new Error('This device request stopped. Please check Devices before retrying.')
    const snapshot = health().getSnapshot()
    if (!snapshot.ready || snapshot.userId !== accountId()) throw new Error('Apple Health settings are still loading or the account changed. Please wait and review again.')
    return snapshot
  }
  return {
    getItem: key => AsyncStorage.getItem(key), setItem: (key, value) => AsyncStorage.setItem(key, value), now: () => Date.now(), timeZone: () => nativeVoiceTimeZone() || 'UTC', accountId, isCurrent,
    sleepEditor: () => getSleepDeviceEditorState(accountId() || ''),
    health: { supported: isAppleHealthSupportedDevice, snapshot: () => { const value = currentHealth(); return { enabled: value.enabled, source: value.source, busy: value.busy } },
      setEnabled: async value => { currentHealth(); await health().setEnabled(value) }, setSource: async value => { currentHealth(); await health().setSource(value) },
      readSources: async date => { currentHealth(); return health().readSources(date) }, refresh: async (manual, date) => { currentHealth(); return health().refresh(manual, date) },
    },
  }
}

function reviewedNativeDevicePrompt(draft: VoiceDraft, review?: NativeDeviceReview | null) {
  if (!review || review.token !== draft.reviewToken || JSON.stringify(review.action) !== JSON.stringify(draft.deviceAction)) return 'The current phone state has not been reviewed. Please request this device change again.'
  if (review.sleep) return 'This device control is not available in Talk to Helfi. Please use an existing supported screen.'
  try {
    const current = JSON.parse(review.before)
    return `Current phone source: ${current.source?.sourceName || 'Apple Health totals'}. Automatic foreground updates are ${current.enabled ? 'on' : 'off'}. ${draft.confirmationMessage}`
  } catch { return 'Please review the current Apple Health settings again before confirming.' }
}

function isConfirmedRecipeImport(data: any, draft: VoiceDraft | null) {
  const result = data?.result, next = result?.nextRecipeDraft
  if (draft?.action !== 'recipe_import_url' || draft.recipeImport?.costCredits !== 10 || data?.success !== true || result?.kind !== 'recipe_import' || result.status !== 'imported_not_saved' || result.saved !== false || result.costCredits !== 10 || typeof result.actionId !== 'string' || !result.actionId.trim() || typeof result.message !== 'string' || !result.message.trim()) return false
  if (!next || typeof next !== 'object' || typeof next.transcript !== 'string' || typeof next.summary !== 'string' || !next.summary.trim() || typeof next.confirmationMessage !== 'string' || !next.confirmationMessage.trim() || next.localDate !== draft.localDate || next.autoSave === true) return false
  if (next.action === 'recipe') return next.canConfirm === false && Boolean(next.recipe?.importDraft && typeof next.recipe.importDraft === 'object' && !Array.isArray(next.recipe.importDraft))
  return next.canConfirm === true && typeof next.reviewToken === 'string' && Boolean(next.reviewToken.trim()) && (next.action === 'food_build_meal' ? Boolean(next.food) : next.action === 'record_action' && next.recordAction?.operation === 'create' && ['favorite', 'custom_food'].includes(next.recordAction?.entity || ''))
}

function verifiedActionCompletionMessage(data: any, draft: VoiceDraft | null) {
  if (draft?.action === 'additional_action') return verifiedAdditionalVoiceReceipt(data, draft)?.message || ''
  if (draft?.action === 'report_action' && draft.reportAction?.action === 'reports.weekly.export_pdf') return nativeReportPdfCompletionMessage(data, draft)
  const result = data?.result
  if (data?.success !== true || !result || result.saved === true || typeof result.actionId !== 'string' || !result.actionId.trim()) return ''
  if (draft?.action === 'support_action' && result.kind === 'support_action' && result.action === draft.supportAction?.action && result.status === 'completed' && typeof result.id === 'string' && result.id.trim()) {
    if (draft.supportAction?.ticketId && result.id !== draft.supportAction.ticketId) return ''
    const expected = result.action === 'support.delete' ? 'The selected support ticket was deleted.' : result.action === 'support.end_chat' ? 'The selected support chat was closed. Email delivery is not verified.' : 'The reviewed support action was saved. Email delivery is not verified.'
    if (result.message !== expected) return ''
    const messages: Record<string, string> = {
      'support.create': 'Your reviewed support ticket was created. Email delivery is not verified.',
      'support.reply': 'Your reviewed reply was added to the selected support ticket. Email delivery is not verified.',
      'support.feedback': 'Your reviewed feedback was recorded and the selected support ticket was closed. Email delivery is not verified.',
      'support.end_chat': expected,
      'support.delete': expected,
    }
    return messages[result.action] || ''
  }
  if (draft?.action === 'report_action' && draft.reportAction?.action === 'reports.weekly.generate' && result.kind === 'report_action' && result.action === 'reports.weekly.generate' && typeof result.reportId === 'string' && result.reportId.trim() && ['READY', 'RUNNING', 'LOCKED'].includes(result.reportStatus) && result.status === (result.reportStatus === 'RUNNING' ? 'preparing' : 'requested') && result.generated === false && result.unlocked === false && result.emailDeliveryVerified === false) {
    const expected = result.reportStatus === 'LOCKED' ? 'The report request is recorded, but the report is locked. Please review Billing.' : result.reportStatus === 'RUNNING' ? 'Your report request is recorded and is being prepared.' : 'Your report request is recorded. The report service reports its status as ready.'
    return result.message === expected ? expected : ''
  }
  return ''
}

function confirmationRequestResult(data: any, draft: VoiceDraft, voiceActionRunId: string, accountId?: string): DraftRequestResult {
  if (draft.action === 'assistant_plan') {
    const accepted = acceptGeneralAssistantResponse(data, accountId || '', draft.assistantPlan?.sessionId || '', draft.assistantPlan?.reviewId)
    return { ok: Boolean(accepted), saved: accepted?.saved || false, needsReview: accepted?.needsReview || false, status: accepted?.needsReview ? 'review_draft' : accepted?.saved ? 'saved' : accepted?.uncertain ? 'needs_clarification' : 'general_answer', action: draft.action, voiceActionRunId, assistantContext: accepted?.view, message: accepted?.message || 'The requested result has not been verified. Please check its normal screen.' }
  }
  if (draft.action === 'clinical_action') {
    const accepted = verifiedClinicalVoiceResult(data, draft)
    return { ok: Boolean(accepted), saved: false, needsReview: false, status: 'general_answer', action: draft.action, voiceActionRunId, message: accepted?.spoken || 'The symptom-notes result was not verified. Please check Symptom Notes before trying again.' }
  }
  if (draft.action === 'device_action' && data?.success === true && isValidNativeDeviceReceipt(data.result, draft) && data.result.status === 'no_data') return { ok: true, saved: false, needsReview: false, status: 'general_answer', action: draft.action, voiceActionRunId, message: data.result.message }
  const completionMessage = verifiedActionCompletionMessage(data, draft)
  if (completionMessage) return { ok: true, saved: false, needsReview: false, status: 'general_answer', action: draft.action, voiceActionRunId, message: completionMessage }
  if (isConfirmedRecipeImport(data, draft)) {
    const next = data.result.nextRecipeDraft as VoiceDraft
    const prompt = next.canConfirm ? spokenReviewPromptForDraft(next) : next.confirmationMessage
    return { ok: true, saved: false, needsReview: next.canConfirm, status: next.canConfirm ? 'review_draft' : 'needs_clarification', action: next.action, voiceActionRunId, reviewPrompt: `${data.result.message} ${prompt}`, message: `${data.result.message} ${prompt}` }
  }
  const saved = isConfirmedVoiceSave(data, draft.action)
  return { ok: saved, saved, status: saved ? 'saved' : 'general_answer', message: saved ? data.result.message || 'Saved.' : draft.action === 'recipe_import_url' ? 'The recipe import was not verified. Please check before trying again.' : ['support_action', 'report_action', 'additional_action', 'device_action'].includes(draft.action) ? 'This action was not verified. Please check its normal screen.' : 'I could not save that.', action: draft.action, voiceActionRunId }
}

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
  // A request to confirm is not proof that the separate save succeeded.
  if (data?.rejectNow) return 'general_answer'
  if (!nextDraft) return 'general_answer'
  if (nextDraft.canConfirm) return 'review_draft'
  if (nextDraft.appTarget?.path) return 'open_screen'
  if (/urgent|emergency|clinician|qualified health professional|not medical advice|not diagnose/i.test(nextDraft.confirmationMessage || '')) {
    return 'safe_refusal'
  }
  if (nextDraft.timingNeedsClarification || ['food_draft', 'water', 'exercise', 'mood', 'journal', 'health_intake_items', 'record_action', 'preference_action', 'local_preference_action', 'notification_action'].includes(nextDraft.action)) return 'needs_clarification'
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
  if (nextDraft.action === 'clinical_action' && nextDraft.clinicalResult) return nextDraft.clinicalResult.spokenMessage
  if (nextDraft.recipe?.text) {
    return compactRecipeVoiceReply(nextDraft.recipe.text, nextDraft.summary)
  }
  return nextDraft.confirmationMessage || nextDraft.summary || ''
}

function voiceFoodSourceNotice(nextDraft: VoiceDraft | null) {
  const explicit = cleanFavoriteText(nextDraft?.food?.sourceNote || '', 600)
  if (explicit) return explicit
  // Older servers include the same warning in the confirmation text only.
  return cleanFavoriteText(nextDraft?.confirmationMessage?.match(/The matching nutrition uses [^.]+ menu data\./i)?.[0] || '', 600)
}

function reviewPromptForDraft(nextDraft: VoiceDraft | null, deviceReview?: NativeDeviceReview | null) {
  if (!nextDraft?.canConfirm) return spokenReplyTextForDraft(nextDraft)
  if (nextDraft.action === 'device_action') return reviewedNativeDevicePrompt(nextDraft, deviceReview)
  if (nextDraft.action === 'clinical_action' || nextDraft.action === 'food_management_action' || nextDraft.action === 'support_action' || nextDraft.action === 'report_action' || nextDraft.action === 'additional_action') return nextDraft.confirmationMessage
  if (nextDraft.action === 'record_action' && ['food', 'water', 'favorite', 'custom_food'].includes(nextDraft.recordAction?.entity || '')) return nextDraft.confirmationMessage
  if (nextDraft.action === 'recipe_import_url') return `Recipe link: ${nextDraft.recipeImport?.url || ''}. ${nextDraft.confirmationMessage}`
  const date = cleanFavoriteText(nextDraft.localDate || '', 20)
  let exactSummary = cleanFavoriteText(nextDraft.summary || nextDraft.confirmationMessage || '', nextDraft.action === 'record_action' || nextDraft.action === 'preference_action' || nextDraft.action === 'local_preference_action' || nextDraft.action === 'notification_action' ? 6000 : 900)
  if (nextDraft.action === 'mood' && nextDraft.mood) {
    const context = nextDraft.mood.context
    const contextLabels = { energyLevel: 'energy', sleepQuality: 'sleep quality', nutrition: 'nutrition', supplements: 'supplements', medicationEffect: 'medication effect', physicalActivity: 'physical activity' } as const
    exactSummary = [
      `Mood ${nextDraft.mood.mood}/7`,
      nextDraft.mood.tags?.length ? `tags: ${nextDraft.mood.tags.map((tag) => cleanFavoriteText(tag, 1000)).join(', ')}` : '',
      nextDraft.mood.note ? `note: “${cleanFavoriteText(nextDraft.mood.note, 6000)}”` : '',
      typeof context?.intensityPercent === 'number' ? `intensity: ${context.intensityPercent}%` : '',
      context?.feelings?.length ? `feelings: ${context.feelings.map(feeling => cleanFavoriteText(feeling, 1000)).join(', ')}` : '',
      ...Object.entries(contextLabels).map(([key, label]) => typeof context?.[key as keyof typeof contextLabels] === 'number' ? `${label}: ${context[key as keyof typeof contextLabels]}/5` : ''),
      typeof context?.localHour === 'number' ? `local hour (0–23): ${context.localHour}` : '',
    ].filter(Boolean).join('; ')
  } else if (nextDraft.action === 'journal' && nextDraft.journal) {
    exactSummary = [
      nextDraft.journal.journalType === 'health' ? 'Health journal' : nextDraft.journal.journalType === 'mood' ? 'Mood journal' : 'Journal',
      nextDraft.journal.journalType !== 'health' && nextDraft.journal.title ? `title: “${nextDraft.journal.title}”` : '',
      nextDraft.journal.journalType !== 'health' && nextDraft.journal.tags?.length ? `tags: ${nextDraft.journal.tags.join(', ')}` : '',
      `note: “${nextDraft.journal.content || ''}”`,
    ].filter(Boolean).join('; ')
  } else if (nextDraft.action === 'exercise' && nextDraft.exercise) {
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
  const time = !(nextDraft.action === 'journal' && nextDraft.journal?.journalType === 'health') && /^([01]\d|2[0-3]):[0-5]\d$/.test(nextDraft.localTime || '') ? nextDraft.localTime : ''
  const datedSummary = [exactSummary, date ? `dated ${date}` : '', time ? `at ${time}` : ''].filter(Boolean).join(', ')
  const sourceNotice = voiceFoodSourceNotice(nextDraft)
  return `Here is what I am about to save: ${datedSummary}.${sourceNotice ? ` ${sourceNotice}` : ''} Would you like me to save that for you?`
}

function spokenReviewPromptForDraft(nextDraft: VoiceDraft | null, deviceReview?: NativeDeviceReview | null) {
  const full = reviewPromptForDraft(nextDraft, deviceReview)
  if (nextDraft?.canConfirm && nextDraft.action === 'record_action' && nextDraft.recordAction?.operation === 'create' && ['favorite', 'custom_food'].includes(nextDraft.recordAction.entity) && nextDraft.recordAction.spokenReview) return nextDraft.recordAction.spokenReview
  if (nextDraft?.canConfirm && nextDraft.action === 'recipe_import_url') return nextDraft.confirmationMessage
  if (!nextDraft?.canConfirm || ['clinical_action', 'food_management_action', 'mood', 'journal', 'support_action', 'report_action', 'additional_action', 'device_action'].includes(nextDraft.action) || (nextDraft.action === 'record_action' && ['food', 'water', 'favorite', 'custom_food'].includes(nextDraft.recordAction?.entity || '')) || full.length <= 500) return full
  const food = nextDraft.food
  const date = cleanFavoriteText(nextDraft.localDate || '', 20)
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(nextDraft.localTime || '') ? nextDraft.localTime : ''
  const entries = food?.entries || []
  const summary = food
    ? [mealLabel(food.meal), cleanFavoriteText(food.mealName || '', 90), entries.length ? `${entries.length} food items, starting with ${entries.slice(0, 2).map((entry) => cleanFavoriteText(entry.name, 80)).join(' and ')}` : cleanFavoriteText(food.draftText || nextDraft.summary, 180)].filter(Boolean).join(', ')
    : cleanFavoriteText(nextDraft.summary || nextDraft.confirmationMessage, 220)
  const datedSummary = [summary, date ? `dated ${date}` : '', time ? `at ${time}` : ''].filter(Boolean).join(', ')
  const sourceNotice = voiceFoodSourceNotice(nextDraft)
  return `Here is what I am about to save: ${datedSummary}. The full details are in your review.${sourceNotice ? ` ${sourceNotice}` : ''} Would you like me to save that for you?`
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
    needsReview ? result.action === 'record_action' ? 400000 : ['support_action', 'report_action', 'additional_action', 'mood', 'journal', 'device_action'].includes(result.action || '') ? 24000 : 4000 : 500,
  )
  const spokenReply = result.action === 'recipe' && !saved && status === 'general_answer'
    ? compactRecipeVoiceReply(defaultSpokenReply)
    : defaultSpokenReply
  const instruction = result.action === 'device_action'
    ? 'Read spokenReply exactly. Only claim the verified activity import or saved phone setting described. Never claim OS permission, sleep listening, or a sleep measurement. If safeToClaimSaved is false, do not claim an import or save.'
    : saved
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

function isExplicitNewVoiceCommand(value: unknown, reviewedDraft?: VoiceDraft | null) {
  const text = cleanFavoriteText(value, 1200).toLowerCase()
  if (!text) return false
  if (reviewedDraft && (reviewedDraft.canConfirm || isPendingFollowUpDraft(reviewedDraft))) {
    const separateEntry = /\b(?:new|another|separate|different)\s+(?:entry|meal|request|command)|\bstart (?:again|over)\b/.test(text)
    const correction = /\b(?:this|that|it|instead|actually|change|correct|replace|remove|without|only|half|double|portion|make (?:the|my) (?:meal|entry))\b/.test(text)
      || /\badd\b.+\bto\s+(?:my\s+)?(?:breakfast|lunch|dinner|snacks?|meal)\b/.test(text)
    const sameMeal = Boolean(reviewedDraft.food) && /\b(?:food|meal|breakfast|lunch|dinner|snacks?)\b/.test(text)
      && /\b(?:add|log|record|save|make|build)\b/.test(text) && !/\b(?:open|show|go to|take me to)\b/.test(text)
    const sameWater = reviewedDraft.action === 'water' && /\b(?:water|drink|coffee|tea|juice|milk)\b/.test(text)
      && /\b(?:add|log|record|save)\b/.test(text) && !/\b(?:open|show|go to|take me to)\b/.test(text)
    if ((correction || sameMeal || sameWater) && !separateEntry) return false
  }
  const hasCommand = /\b(add|log|record|save|open|show|go to|take me to|create|build|make|track|write)\b/.test(text)
  const hasTarget =
    /\b(food|meal|breakfast|lunch|dinner|snack|snacks|favourites?|favorites?|saved|diary|water|exercise|workout|mood|journal|symptom|symptoms|medication|medicine|supplement|vitamin|health image|photo|camera|insights)\b/.test(text)
  return hasCommand && hasTarget
}

function supportsNativeVoiceInput(os: string, isPad: boolean) {
  return !(os === 'ios' && isPad)
}

function isPendingFollowUpDraft(draft: VoiceDraft | null) {
  if (!draft || draft.canConfirm) return false
  if (draft.action === 'recipe' && draft.recipe?.importDraft) return true
  if (draft.action === 'clinical_action' || draft.action === 'food_management_action' || draft.action === 'record_action' || draft.action === 'preference_action' || draft.action === 'local_preference_action' || draft.action === 'notification_action' || draft.action === 'support_action' || draft.action === 'report_action' || draft.action === 'additional_action' || draft.action === 'device_action') return !draft.appTarget?.path
  if (draft.timingNeedsClarification && (draft.action === 'water' || Boolean(draft.food?.draftText))) return true
  if (draft.action === 'food_draft' && draft.food?.draftText) return true
  if (
    draft.action === 'water' &&
    /How much liquid should I log|What drink should I log|Should I log\s+.+?\s+as sugar-free, or with sugar or honey|How much\s+(?:sugar|honey|milk)\s+should I add/i.test(
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

function nativeVoiceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined } catch { return undefined }
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
  // Preparing an AI answer can debit credits before its response arrives.
  const res = await requestFactory(API_BASE_URL)
  const data: any = await res.json().catch(() => ({}))
  return { res, data }
}

async function fetchNativeVoiceTts(
  requestFactory: (baseUrl: string) => Promise<Response>,
) {
  // A lost spoken-reply response must never trigger a second paid request.
  const res = await requestFactory(API_BASE_URL)
  const data: any = await res.json().catch(() => ({}))
  return { res, data }
}

async function fetchNativeVoiceConfirm(
  requestFactory: (baseUrl: string) => Promise<Response>,
) {
  // A save may already have committed even when its response fails. Never
  // replay a mutating confirmation against another backend or app version.
  const res = await requestFactory(API_BASE_URL)
  const data: any = await res.json().catch(() => ({}))
  return { res, data }
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
  const appleHealthSync = useAppleHealthSync()
  const appleHealthSyncRef = useRef(appleHealthSync)
  appleHealthSyncRef.current = appleHealthSync
  const insets = useSafeAreaInsets()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<VoiceDraft | null>(null)
  const [conversationTurns, setConversationTurns] = useState<VoiceConversationTurn[]>([])
  const [conversationReviewOnly, setConversationReviewOnly] = useState(true)
  const [typedMode, setTypedMode] = useState(false)
  const [messageFocusRequest, setMessageFocusRequest] = useState(0)
  const [loadingConversationMemory, setLoadingConversationMemory] = useState(false)
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
  const messageScrollRef = useRef<ScrollView | null>(null)
  const messageInputRef = useRef<TextInput | null>(null)
  const messageSectionYRef = useRef<number | null>(null)
  const pendingMessageFocusRef = useRef<{ accountToken: string; run: number } | null>(null)
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
  const realtimeVoiceFlushRef = useRef<null | (() => void)>(null)
  const realtimeVoiceAbortRef = useRef<AbortController | null>(null)
  const realtimeActionAbortRef = useRef<AbortController | null>(null)
  const voiceSaveRequestsRef = useRef(0)
  const localPreferenceReviewRef = useRef<LocalPreferenceReview | null>(null)
  const nativeDeviceReviewRef = useRef<NativeDeviceReview | null>(null)
  const realtimeVoiceRunRef = useRef(0)
  const realtimeVoiceConnectedRef = useRef(false)
  const voiceAccountTokenRef = useRef('')
  voiceAccountTokenRef.current = mode === 'signedIn' ? session?.token || '' : ''
  const voiceProviderMountedRef = useRef(true)
  const realtimeBillingSessionIdRef = useRef(newRealtimeBillingSessionId())
  const voiceGreetingConversationRef = useRef('')

  const requestMessageInputFocus = useCallback(() => {
    pendingMessageFocusRef.current = { accountToken: voiceAccountTokenRef.current, run: realtimeVoiceRunRef.current }
    setMessageFocusRequest((value) => value + 1)
  }, [])

  const focusRequestedMessageInput = useCallback(() => {
    const pending = pendingMessageFocusRef.current
    if (!pending) return
    if (!openRef.current || !voiceProviderMountedRef.current || pending.accountToken !== voiceAccountTokenRef.current || pending.run !== realtimeVoiceRunRef.current) {
      pendingMessageFocusRef.current = null
      return
    }
    if (!typedMode || conversationReviewOnly || voiceSessionActive || loadingConversationMemory || messageSectionYRef.current === null || !messageScrollRef.current || !messageInputRef.current) return
    pendingMessageFocusRef.current = null
    messageScrollRef.current.scrollTo({ y: Math.max(0, messageSectionYRef.current - 12), animated: false })
    messageInputRef.current.focus()
  }, [conversationReviewOnly, loadingConversationMemory, typedMode, voiceSessionActive])

  useEffect(() => {
    if (!messageFocusRequest || !open || !typedMode || conversationReviewOnly || loadingConversationMemory || voiceSessionActive) return
    const frame = requestAnimationFrame(focusRequestedMessageInput)
    return () => cancelAnimationFrame(frame)
  }, [conversationReviewOnly, focusRequestedMessageInput, loadingConversationMemory, messageFocusRequest, open, typedMode, voiceSessionActive])

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
  const openAppTargetRef = useRef<(targetDraft: VoiceDraft) => void>(() => {})
  const openRef = useRef(false)
  const voiceSessionActiveRef = useRef(false)
  const recordingStoppingRef = useRef(false)
  const silenceStartedAtRef = useRef(0)
  const heardSpeechInTurnRef = useRef(false)
  const voiceTurnMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<(options?: StopRecordingOptions) => Promise<void>>(async () => {})
  const startRecordingRef = useRef<() => Promise<void>>(async () => {})
  const voiceRecordingSupported = supportsNativeVoiceInput(Platform.OS, Platform.OS === 'ios' && Platform.isPad)
  const liveVoiceEnabled = LIVE_VOICE_ENABLED && voiceRecordingSupported
  const voiceMemoryUserId = cleanFavoriteText(session?.user?.id || '', 120)
  const voiceAccountUserIdRef = useRef(voiceMemoryUserId)
  const generalAssistantSessionRef = useRef(newGeneralAssistantSessionId())
  const generalAssistantHeardRef = useRef('')
  const generalAssistantConfirmationConsumedRef = useRef(false)
  const generalAssistantCompletionIdsRef = useRef<string[]>([])
  const emitGeneralAssistantEffects = useCallback((view: unknown) => {
    if (!openRef.current || !voiceProviderMountedRef.current || voiceAccountUserIdRef.current !== voiceMemoryUserId || voiceAccountTokenRef.current !== session?.token) return
    const effects = generalAssistantCompletionEvents(view, voiceMemoryUserId, generalAssistantCompletionIdsRef.current)
    generalAssistantCompletionIdsRef.current = effects.seenIDs
    for (const event of effects.events) DeviceEventEmitter.emit(event.name, event.payload)
  }, [voiceMemoryUserId, session?.token])
  voiceAccountUserIdRef.current = voiceMemoryUserId

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
    if (liveVoiceEnabled) return
    if (!voiceSessionActiveRef.current || !openRef.current || !voiceRecordingSupported) return
    setTimeout(() => {
      if (!voiceSessionActiveRef.current || !openRef.current || recordingStoppingRef.current) return
      void startRecordingRef.current()
    }, delayMs)
  }, [liveVoiceEnabled, voiceRecordingSupported])

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
    const text = cleanFavoriteText(value, 6000)
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
      voiceConversationStorageKey(voiceMemoryUserId),
      JSON.stringify({
        userId: voiceMemoryUserId,
        assistantSessionId: generalAssistantSessionRef.current,
        savedAt: Date.now(),
        turns: turns.slice(-MAX_VOICE_CONVERSATION_TURNS).map((turn) => ({
          id: turn.id,
          role: turn.role,
          text: cleanFavoriteText(turn.text, 6000),
        })),
      }),
    ).catch(() => {})
  }, [voiceMemoryUserId])

  const loadConversationMemory = useCallback(async () => {
    if (!voiceMemoryUserId) return []
    const memoryAccountToken = voiceAccountTokenRef.current
    const memoryRun = realtimeVoiceRunRef.current
    try {
      const raw = await AsyncStorage.getItem(voiceConversationStorageKey(voiceMemoryUserId)) || await AsyncStorage.getItem(VOICE_CONVERSATION_MEMORY_KEY)
      if (voiceAccountTokenRef.current !== memoryAccountToken || realtimeVoiceRunRef.current !== memoryRun || !openRef.current) return []
      const parsed = raw ? JSON.parse(raw) : null
      if (cleanFavoriteText(parsed?.userId, 120) !== voiceMemoryUserId) {
        setConversationTurns([])
        return []
      }
      const savedAt = Number(parsed?.savedAt)
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > VOICE_CONVERSATION_MEMORY_TTL_MS) {
        return []
      }
      if (typeof parsed?.assistantSessionId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(parsed.assistantSessionId)) generalAssistantSessionRef.current = parsed.assistantSessionId
      const turns = Array.isArray(parsed?.turns)
        ? parsed.turns
            .map((turn: any) => ({
              id: cleanFavoriteText(turn?.id || `${Date.now()}-${Math.random()}`, 80),
              role: turn?.role === 'assistant' ? 'assistant' : 'user',
              text: cleanFavoriteText(turn?.text, 6000),
            }))
            .filter((turn: VoiceConversationTurn) => turn.text)
            .slice(-MAX_VOICE_CONVERSATION_TURNS)
        : []
      if (turns.length) setConversationTurns(turns)
      return turns
    } catch {
      // A fresh panel is fine if local memory cannot be read.
      return []
    }
  }, [voiceMemoryUserId])

  const appendConversationTurns = useCallback(
    (turns: Array<VoiceConversationTurn | null>) => {
      const nextTurns = turns.filter((turn): turn is VoiceConversationTurn => Boolean(turn))
      if (!nextTurns.length) return
      setConversationTurns((current) => {
        const updated = [...current, ...nextTurns].filter((turn, index, all) => index === 0 || turn.role !== all[index - 1].role || turn.text !== all[index - 1].text).slice(-MAX_VOICE_CONVERSATION_TURNS)
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
    realtimeVoiceFlushRef.current = null
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

  useEffect(() => {
    voiceProviderMountedRef.current = true
    return () => {
      voiceProviderMountedRef.current = false
      openRef.current = false
      voiceSessionActiveRef.current = false
      void stopRealtimeVoiceSession()
    }
  }, [stopRealtimeVoiceSession])

  const clearConversationData = useCallback(() => {
    generalAssistantCompletionIdsRef.current = []
    generalAssistantSessionRef.current = newGeneralAssistantSessionId()
    generalAssistantHeardRef.current = ''
    generalAssistantConfirmationConsumedRef.current = false
    setConversationTurns([])
    setPendingFollowUpDraft(null)
    setDraft(null)
    setReviewCorrectionActive(false)
    setSaveError('')
    setTranscript('')
    setChargedCredits(null)
    setVisionChoicesOpen(false)
    if (voiceMemoryUserId) {
      AsyncStorage.removeItem(voiceConversationStorageKey(voiceMemoryUserId)).catch(() => {})
      void AsyncStorage.getItem(VOICE_CONVERSATION_MEMORY_KEY).then((raw) => {
        try { if (raw && JSON.parse(raw)?.userId === voiceMemoryUserId) void AsyncStorage.removeItem(VOICE_CONVERSATION_MEMORY_KEY) } catch {}
      }).catch(() => {})
    }
  }, [voiceMemoryUserId])

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
    openRef.current = false
    setOpen(false)
  }, [clearConversationMemory])

  useEffect(() => {
    generalAssistantSessionRef.current = newGeneralAssistantSessionId()
    generalAssistantCompletionIdsRef.current = []
    generalAssistantHeardRef.current = ''
    generalAssistantConfirmationConsumedRef.current = false
    openRef.current = false
    nativeDeviceReviewRef.current = null
    setOpen(false)
    setConversationTurns([])
    setDraft(null)
    setPendingFollowUpDraft(null)
    setTranscript('')
    setConversationReviewOnly(true)
    setTypedMode(false)
    setContinuousVoiceSession(false)
    void stopRealtimeVoiceSession()
  }, [voiceMemoryUserId, setContinuousVoiceSession, stopRealtimeVoiceSession])

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
    pendingMessageFocusRef.current = null
    nativeDeviceReviewRef.current = null
    messageSectionYRef.current = null
    realtimeVoiceFlushRef.current?.()
    const stoppingVoice = stopRealtimeVoiceSession()
    const requestedMode = input?.mode || (input?.transcript || !voiceRecordingSupported ? 'text' : 'voice')
    const openingAccountToken = voiceAccountTokenRef.current
    const openingRun = realtimeVoiceRunRef.current
    Vibration.vibrate()
    DeviceEventEmitter.emit(VOICE_ASSISTANT_OPENING_EVENT)
    setVoiceActivity([])
    addVoiceActivity(voiceRecordingSupported ? 'Opening Talk to Helfi' : 'Ready for your typed request', voiceRecordingSupported ? 'active' : 'done')
    setDraft(null)
    setConversationReviewOnly(true)
    setTypedMode(requestedMode === 'text')
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
    realtimeBillingSessionIdRef.current = newRealtimeBillingSessionId()
    realtimeAutoStartRef.current = false
    setContinuousVoiceSession(false)
    setVoiceReplyPreference(false)
    setTranscript(input?.transcript || '')
    setLaunchContext(normalizeLaunchContext(input?.context))
    const shouldAutoSubmit = Boolean(input?.autoSubmit && input.transcript)
    openRef.current = true
    setOpen(true)
    await stoppingVoice
    if (!openRef.current || voiceAccountTokenRef.current !== openingAccountToken || realtimeVoiceRunRef.current !== openingRun) return
    if (!input?.transcript) {
      setLoadingConversationMemory(true)
      try { await loadConversationMemory() } finally { setLoadingConversationMemory(false) }
    }
    if (!openRef.current || voiceAccountTokenRef.current !== openingAccountToken || realtimeVoiceRunRef.current !== openingRun) return
    if (requestedMode === 'conversation') return
    setConversationReviewOnly(false)
    if (shouldAutoSubmit) setAutoSubmitToken((value) => value + 1)
    if (requestedMode === 'text') { requestMessageInputFocus(); return }
    setVoiceReplyPreference(true)
    const hasAccess = await ensureVoicePaidAccess()
    if (!hasAccess) {
      openRef.current = false
      setOpen(false)
      return
    }
    setVoicePaidAccessGranted(true)
  }, [addVoiceActivity, ensureVoicePaidAccess, loadConversationMemory, requestMessageInputFocus, setContinuousVoiceSession, setVoiceReplyPreference, stopRealtimeVoiceSession, voiceRecordingSupported])

  useEffect(() => {
    if (!open || !voicePaidAccessGranted || !session?.token || !voiceRecordingSupported) return
    if (!liveVoiceEnabled) {
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
    pendingMessageFocusRef.current = null
    nativeDeviceReviewRef.current = null
    realtimeVoiceFlushRef.current?.()
    if (voiceSaveRequestsRef.current > 0) appendConversationTurns([makeConversationTurn('assistant', 'The last save was not yet confirmed when this conversation ended. Please check the relevant diary or setting before retrying.')])
    openRef.current = false
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
  }, [appendConversationTurns, clearRealtimeConnectTimeout, clearVoiceTurnTimers, makeConversationTurn, recording, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return
      openRef.current = false
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
        setSaveError('')
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
    async (targetDraft: VoiceDraft | null, options?: { automatic?: boolean; signal?: AbortSignal; closeOnSuccess?: boolean; voiceActionRunId?: string }) => {
      if (!session?.token || !targetDraft?.canConfirm || voiceSaveRequestsRef.current > 0) return null
      if (options?.signal?.aborted) return null
      if (options?.automatic && ['clinical_action', 'food_management_action', 'assistant_plan'].includes(targetDraft.action)) return null
      const voiceActionRunId = options?.voiceActionRunId || newVoiceActionRunId()
      const startedAt = Date.now()
      const saveAccountToken = session.token
      const saveRun = realtimeVoiceRunRef.current
      const isCurrentDeviceSave = () => !saveSignal?.aborted && openRef.current && voiceProviderMountedRef.current && voiceAccountTokenRef.current === saveAccountToken && voiceAccountUserIdRef.current === voiceMemoryUserId && realtimeVoiceRunRef.current === saveRun
      traceVoiceAction(voiceActionRunId, 'save_started', targetDraft.action, 'pending', 'awaiting_server', startedAt)
      const saveAbortController = options?.signal ? null : new AbortController()
      if (saveAbortController) {
        draftRequestAbortRef.current?.abort()
        draftRequestAbortRef.current = saveAbortController
      }
      const saveSignal = options?.signal || saveAbortController?.signal
      const saveDestination = targetDraft.action === 'notification_action' ? 'notification inbox' : targetDraft.action === 'local_preference_action' ? 'device settings' : targetDraft.action === 'exercise'
        ? 'exercise log'
        : targetDraft.action.startsWith('food_')
        ? 'food diary'
        : targetDraft.action === 'water'
        ? 'water intake'
        : targetDraft.action === 'mood'
        ? 'mood history'
        : 'health record'
      addVoiceActivity(targetDraft.action === 'clinical_action' ? 'Running reviewed symptom-notes request' : targetDraft.action === 'food_management_action' ? 'Running reviewed food request' : targetDraft.action === 'recipe_import_url' ? 'Importing recipe for review' : targetDraft.action === 'device_action' ? 'Applying reviewed Apple Health action' : targetDraft.action === 'additional_action' ? 'Applying reviewed saved-item action' : targetDraft.action === 'support_action' ? 'Submitting reviewed support action' : targetDraft.action === 'report_action' ? targetDraft.reportAction?.action === 'reports.weekly.export_pdf' ? 'Preparing reviewed report PDF' : 'Requesting weekly report' : `Saving to your ${saveDestination}`)
      setConfirming(true)
      voiceSaveRequestsRef.current += 1
      let saveRequestOutstanding = true
      setSaveError('')
      try {
        const guardedRecord = targetDraft.action === 'record_action' && ['symptom_note', 'supplement', 'medication'].includes(targetDraft.recordAction?.entity || '')
        const recipeImport = targetDraft.action === 'recipe_import_url'
        const separateAction = targetDraft.action === 'support_action' || targetDraft.action === 'report_action'
        const additionalAction = targetDraft.action === 'additional_action'
        const deviceAction = targetDraft.action === 'device_action'
        const clinicalAction = targetDraft.action === 'clinical_action'
        const assistantAction = targetDraft.action === 'assistant_plan'
        if (assistantAction && (!isCurrentDeviceSave() || targetDraft.assistantPlan?.sessionId !== generalAssistantSessionRef.current || !targetDraft.assistantPlan.reviewId || targetDraft.autoSave !== false)) throw new Error('Please review this exact assistant action in the current account.')
        if (clinicalAction && (!isCurrentDeviceSave() || targetDraft.clinicalAction?.userId !== voiceMemoryUserId || targetDraft.autoSave === true)) throw new Error('Please review this exact symptom-notes request in the current account. Nothing has been submitted.')
        if (deviceAction && (!isCurrentDeviceSave() || !nativeDeviceReviewRef.current || nativeDeviceReviewRef.current.accountId !== voiceMemoryUserId || nativeDeviceReviewRef.current.token !== targetDraft.reviewToken || !['apple_health.import', 'apple_health.automatic.update', 'apple_health.source.select'].includes(targetDraft.deviceAction?.action || ''))) throw new Error('Please review the current Apple Health action again. Nothing has been sent to change it.')
        if (additionalAction && (!isCurrentDeviceSave() || targetDraft.additionalAction?.userId !== voiceMemoryUserId)) throw new Error('Please review this exact saved-item action in the current account. Nothing has been submitted.')
        if (separateAction && (!isCurrentDeviceSave() || (targetDraft.action === 'support_action' ? targetDraft.supportAction?.userId : targetDraft.reportAction?.userId) !== voiceMemoryUserId)) throw new Error('Please review this action again in the current account. Nothing has been submitted.')
        if (recipeImport && (!isCurrentDeviceSave() || targetDraft.recipeImport?.userId !== voiceMemoryUserId || targetDraft.recipeImport?.costCredits !== 10)) throw new Error('Please review this recipe import again in the current account. No import has been requested.')
        if (guardedRecord && (!isCurrentDeviceSave() || (targetDraft.recordAction?.ownerId && targetDraft.recordAction.ownerId !== voiceMemoryUserId))) throw new Error('Please review this recorded change again in the current account. Nothing has been sent to change it.')
        if (targetDraft.action === 'preference_action' && (!isCurrentDeviceSave() || targetDraft.preferenceAction?.userId !== voiceMemoryUserId)) throw new Error('Please review this exact setting change in the current account. Nothing has been submitted.')
        if (targetDraft.action === 'notification_action' && (!isCurrentDeviceSave() || targetDraft.notificationAction?.userId !== voiceMemoryUserId)) throw new Error('Please review these notifications again in the current account. Nothing has been sent to change them.')
        let { res, data } = await fetchNativeVoiceConfirm((baseUrl) => fetch(`${baseUrl}/api/native-voice-assistant-confirm`, {
          method: 'POST',
          headers: { ...buildNativeAuthHeaders(session.token, { json: true }), 'x-helfi-voice-capabilities': 'report-pdf-v1,report-pdf-inline-v1,additional-actions-v1,symptom-analysis-v1,food-management-v1,manual-action-catalog-v1', 'x-helfi-voice-action-id': voiceActionRunId },
          signal: saveSignal,
          body: JSON.stringify({ draft: targetDraft }),
        }))
        if (saveSignal?.aborted) return null
        if (targetDraft.action === 'preference_action' && !isCurrentDeviceSave()) return null
        if ((targetDraft.action === 'notification_action' || guardedRecord || recipeImport || separateAction || additionalAction || deviceAction || clinicalAction) && !isCurrentDeviceSave()) return null
        if (!res.ok) throw new Error(data?.error || 'Could not save that.')
        if (assistantAction) {
          const accepted = acceptGeneralAssistantResponse(data, voiceMemoryUserId, generalAssistantSessionRef.current, targetDraft.assistantPlan?.reviewId)
          if (!accepted || !isCurrentDeviceSave()) throw new Error('The app did not verify this exact assistant result. Please check its normal screen before trying again.')
          voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
          saveRequestOutstanding = false
          setDraft(accepted.draft)
          setPendingFollowUpDraft(null)
          setReviewCorrectionActive(false)
          appendConversationTurns([makeConversationTurn('assistant', accepted.message)])
          emitGeneralAssistantEffects(accepted.view)
          addVoiceActivity(accepted.uncertain ? 'Checking the saved result is still needed' : accepted.needsReview ? 'Next change ready for review' : 'Requested result verified', 'done')
          traceVoiceAction(voiceActionRunId, 'assistant_action_result', targetDraft.action, accepted.saved ? 'saved' : accepted.uncertain ? 'uncertain' : 'review_or_read', 'verified_session', startedAt)
          return data
        }
        if (clinicalAction) {
          const accepted = verifiedClinicalVoiceResult(data, targetDraft, voiceMemoryUserId)
          if (!accepted) throw new Error('The app did not verify the exact symptom-notes result. Please check Symptom Notes before trying again.')
          if (!isCurrentDeviceSave()) return null
          voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
          saveRequestOutstanding = false
          traceVoiceAction(voiceActionRunId, 'clinical_action_completed', targetDraft.action, accepted.result.status, data.idempotentReplay ? 'replayed_clinical_receipt' : 'verified_clinical_receipt', startedAt)
          appendConversationTurns([makeConversationTurn('assistant', accepted.readable)])
          const continuation: VoiceDraft = { ...targetDraft, canConfirm: false, autoSave: false, reviewToken: undefined, summary: accepted.result.message, confirmationMessage: accepted.readable, clinicalResult: { analysisId: accepted.result.analysisId, ...(accepted.result.threadId ? { threadId: accepted.result.threadId } : {}), spokenMessage: accepted.spoken }, clinicalAction: { action: 'symptoms.follow_up', userId: voiceMemoryUserId, values: { ...(accepted.result.analysisId ? { analysisId: accepted.result.analysisId } : {}), ...(accepted.result.threadId ? { threadId: accepted.result.threadId } : {}) } } }
          setDraft(continuation)
          setPendingFollowUpDraft(accepted.result.analysisId ? continuation : null)
          setReviewCorrectionActive(false)
          setTranscript('')
          setChargedCredits(Number.isFinite(accepted.result.chargedCredits) ? accepted.result.chargedCredits : null)
          if (accepted.result.historySaved) DeviceEventEmitter.emit('helfi:symptom-notes-changed', { source: 'voice-assistant', accountId: voiceMemoryUserId, kind: 'clinical_action' })
          addVoiceActivity(accepted.result.historySaved ? 'Symptom notes ready in history' : 'Symptom notes ready — history save not confirmed', 'done')
          return data
        }
        if (deviceAction) {
          const reviewed = validateNativeDeviceAction(targetDraft.deviceAction)
          const authorized = validateNativeDeviceAction(data?.authorizedDeviceAction)
          if (data?.success !== true || data?.deviceActionAuthorized !== true || data?.status !== 'device_authorized' || data?.safeToClaimSaved !== false || JSON.stringify(authorized) !== JSON.stringify(reviewed)) throw new Error('The server did not authorize the exact Apple Health action reviewed. Nothing has been changed by this request.')
          const snapshot = nativeDeviceReviewRef.current!
          const io = nativeDeviceIoForVoice(() => appleHealthSyncRef.current, () => voiceAccountUserIdRef.current || null, isCurrentDeviceSave)
          const receipt = await applyReviewedNativeDeviceAction(snapshot, targetDraft.reviewToken || '', voiceMemoryUserId, authorized, io)
          if (!isCurrentDeviceSave()) return null
          if (!isValidNativeDeviceReceipt(receipt, targetDraft)) throw new Error('The phone did not confirm the exact reviewed activity or setting. Please check Devices before retrying.')
          data = { success: true, result: receipt, voiceActionRunId, idempotentReplay: receipt.idempotentReplay }
          voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
          saveRequestOutstanding = false
          traceVoiceAction(voiceActionRunId, 'device_action_completed', targetDraft.action, receipt.status, receipt.verified ? 'verified_device_receipt' : 'no_import_verified', startedAt)
          appendConversationTurns([makeConversationTurn('assistant', receipt.message)])
          if (receipt.verified) {
            const localDate = receipt.localDate || targetDraft.localDate || todayLocalDate()
            DeviceEventEmitter.emit('helfi:voice-action-saved', { localDate, source: 'voice-assistant', kind: receipt.kind, entity: receipt.entity })
            if (receipt.status === 'imported') DeviceEventEmitter.emit('helfi:food-log-changed', { localDate, source: 'voice-assistant', kind: 'exercise' })
            DeviceEventEmitter.emit('helfi:navigate-native-web-tool', { title: 'Devices', path: '/devices', nativeTarget: { type: 'stack', route: 'Devices' } })
            setSaveSuccessNotice({ title: receipt.status === 'imported' ? 'Activity imported' : 'Device setting saved', message: receipt.message })
          }
          addVoiceActivity(receipt.verified ? 'Apple Health action verified' : 'No activity import confirmed', 'done')
          setDraft(null)
          setPendingFollowUpDraft(null)
          setReviewCorrectionActive(false)
          setTranscript('')
          setChargedCredits(null)
          if (receipt.verified && options?.closeOnSuccess !== false) closePanel()
          return data
        }
        if (additionalAction) {
          const accepted = acceptAdditionalVoiceReceipt(data, targetDraft, voiceMemoryUserId, isCurrentDeviceSave, Date.now())
          if (!accepted || !isCurrentDeviceSave()) return null
          data = { ...accepted, voiceActionRunId }
          const receipt = accepted.result
          voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
          saveRequestOutstanding = false
          traceVoiceAction(voiceActionRunId, 'action_completed', targetDraft.action, receipt.status, accepted.idempotentReplay ? 'replayed_saved_item_receipt' : 'verified_saved_item_receipt', startedAt)
          appendConversationTurns([makeConversationTurn('assistant', receipt.message)])
          DeviceEventEmitter.emit('helfi:voice-action-completed', { source: 'voice-assistant', accountId: voiceMemoryUserId, kind: receipt.kind, action: receipt.action, changedAreas: receipt.changedAreas })
          const target = receipt.kind === 'history_action' ? receipt.action === 'coach_history.delete' ? { title: 'Health Coach', path: '/health-tips/history', nativeTarget: { type: 'stack', route: 'SmartHealthCoach', params: { tab: 'history' } } } : { title: 'Daily Check-in', path: '/check-in?tab=history', nativeTarget: { type: 'stack', route: 'DailyCheckIn', params: { tab: 'history' } } }
            : receipt.kind === 'device_interest' ? { title: 'Devices', path: '/devices', nativeTarget: { type: 'stack', route: 'Devices' } }
            : receipt.kind === 'health_image_note' ? { title: 'Health Image Notes', path: '/medical-images', nativeTarget: { type: 'stack', route: 'HealthImageNotes' } }
            : { title: 'Chat History', path: `/chat?history=1&context=${targetDraft.additionalAction?.values.context}&voiceActionNonce=${Date.now()}`, nativeTarget: { type: 'stack', route: 'NativeWebTool', params: { title: 'Chat History', path: `/chat?history=1&context=${targetDraft.additionalAction?.values.context}&voiceActionNonce=${Date.now()}` } } }
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', target)
          setSaveSuccessNotice({ title: receipt.status === 'already_absent' ? 'Saved item already absent' : receipt.kind === 'device_interest' ? 'Device interest reviewed' : receipt.operation === 'rename' ? 'Saved chat title reviewed' : 'Saved item removed', message: receipt.message })
          addVoiceActivity(receipt.status === 'already_absent' ? 'Already absent — no deletion performed' : receipt.changed ? 'Reviewed saved-item action verified' : 'Reviewed value already matches', 'done')
          setDraft(null)
          setPendingFollowUpDraft(null)
          setReviewCorrectionActive(false)
          setTranscript('')
          setChargedCredits(null)
          if (options?.closeOnSuccess !== false) closePanel()
          return data
        }
        if (targetDraft.action === 'report_action' && targetDraft.reportAction?.action === 'reports.weekly.export_pdf') {
          const opened = await openReviewedNativeReportPdf(data, targetDraft, { apiBaseUrl: API_BASE_URL, accountId: voiceMemoryUserId, now: () => Date.now(), isCurrent: isCurrentDeviceSave, onStage: stage => traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, stage, stage, startedAt), openUrl: async url => {
            if (!isCurrentDeviceSave()) throw new Error('The PDF opening was cancelled.')
            // The external viewer must never inherit an active microphone. Do
            // not cancel this already-authorized action's own response signal.
            traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, 'shutdown_started', 'shutdown_started', startedAt)
            setContinuousVoiceSession(false)
            realtimeVoiceConnectedRef.current = false
            const stop = realtimeVoiceStopRef.current
            realtimeVoiceStopRef.current = null
            realtimeVoiceMuteRef.current = null
            realtimeVoicePromptRef.current = null
            realtimeVoiceFlushRef.current = null
            const connection = realtimeVoiceAbortRef.current
            realtimeVoiceAbortRef.current = null
            connection?.abort()
            clearRealtimeConnectTimeout()
            clearReviewSilenceTimer()
            setRealtimeVoiceStatus('closed')
            let shutdownFailure = 'transport_shutdown_failed'
            try {
              if (stop) await stop()
              traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, 'transport_stopped', 'transport_stopped', startedAt)
              shutdownFailure = 'playback_shutdown_failed'
              await stopPlayback()
              traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, 'playback_stopped', 'playback_stopped', startedAt)
              shutdownFailure = 'audio_mode_failed'
              await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true })
              traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, 'audio_mode_ready', 'audio_mode_ready', startedAt)
            } catch {
              traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, shutdownFailure, shutdownFailure, startedAt)
              throw new Error('The microphone shutdown was not confirmed.')
            }
            if (!isCurrentDeviceSave()) throw new Error('The PDF opening was cancelled.')
            if (new URL(url).searchParams.get('view') !== 'inline') {
              traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, 'inline_link_required', 'inline_link_required', startedAt)
              throw new Error('Please request a fresh PDF link for the viewer.')
            }
            if (Number(data.reportPdfAccess?.expiresAt) <= Date.now() + 1000) {
              traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, 'link_expired_before_viewer', 'link_expired_before_viewer', startedAt)
              throw new Error('Please request a fresh PDF link for the viewer.')
            }
            return presentNativeReportPdfViewer(url, {
              platform: Platform.OS, isCurrent: isCurrentDeviceSave,
              openBrowser: (verifiedUrl, browserOptions) => WebBrowser.openBrowserAsync(verifiedUrl, { ...browserOptions, presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN }),
              dismissBrowser: () => WebBrowser.dismissBrowser(),
              onStage: stage => traceVoiceAction(voiceActionRunId, 'report_pdf_io', targetDraft.action, stage, stage, startedAt),
            })
          } })
          if (!opened || !isCurrentDeviceSave()) return null
          // The signed URL lives only in this callback/helper; no transcript,
          // trace, returned action receipt or durable client storage contains it.
          data = { ...opened, voiceActionRunId }
          const message = nativeReportPdfCompletionMessage(data, targetDraft)
          if (!message) throw new Error('The phone did not verify this report PDF action. Please use Save as PDF in Insights.')
          voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
          saveRequestOutstanding = false
          traceVoiceAction(voiceActionRunId, 'report_pdf_completed', targetDraft.action, data.result.status, data.idempotentReplay ? 'replayed_pdf_handoff' : 'verified_pdf_handoff', startedAt)
          appendConversationTurns([makeConversationTurn('assistant', message)])
          DeviceEventEmitter.emit('helfi:voice-action-completed', { source: 'voice-assistant', accountId: voiceMemoryUserId, completionId: voiceActionRunId, kind: targetDraft.action, action: data.result.action })
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', { title: 'Insights', path: '/insights', nativeTarget: { type: 'tab', tab: 'Insights' } })
          setSaveSuccessNotice({ title: data.result.status === 'pdf_viewer_closed' ? 'PDF viewer closed' : data.result.openRequestAccepted ? 'PDF opening requested' : 'PDF prepared', message })
          addVoiceActivity(data.result.status === 'pdf_viewer_closed' ? 'PDF viewer closed' : data.result.openRequestAccepted ? 'Phone accepted the PDF opening request' : 'PDF opening not verified', 'done')
          setDraft(null)
          setPendingFollowUpDraft(null)
          setReviewCorrectionActive(false)
          setTranscript('')
          setChargedCredits(null)
          if (options?.closeOnSuccess !== false) closePanel()
          return data
        }
        if (separateAction) {
          const message = verifiedActionCompletionMessage(data, targetDraft)
          if (!message) throw new Error('The app did not verify the exact reviewed action. Please check its normal screen before retrying; email delivery or report generation is not being claimed.')
          voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
          saveRequestOutstanding = false
          traceVoiceAction(voiceActionRunId, 'action_completed', targetDraft.action, targetDraft.action === 'report_action' ? 'report_requested' : 'action_completed', data.idempotentReplay ? 'replayed_receipt' : 'verified_receipt', startedAt)
          appendConversationTurns([makeConversationTurn('assistant', message)])
          const report = targetDraft.action === 'report_action'
          DeviceEventEmitter.emit('helfi:voice-action-completed', { source: 'voice-assistant', accountId: voiceMemoryUserId, completionId: voiceActionRunId, kind: targetDraft.action, action: data.result.action, ...(targetDraft.action === 'support_action' ? { ticketId: data.result.id } : {}) })
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', report ? { title: 'Insights', path: '/insights', nativeTarget: { type: 'tab', tab: 'Insights' } } : { title: 'Support', path: '/support', nativeTarget: { type: 'stack', route: 'Support' } })
          setSaveSuccessNotice({ title: report ? 'Report requested' : 'Support action completed', message })
          addVoiceActivity(report ? 'Report request verified' : 'Support action verified', 'done')
          setDraft(null)
          setPendingFollowUpDraft(null)
          setReviewCorrectionActive(false)
          setTranscript('')
          setChargedCredits(null)
          if (options?.closeOnSuccess !== false) closePanel()
          return data
        }
        if (recipeImport) {
          if (!isConfirmedRecipeImport(data, targetDraft)) throw new Error('The app did not verify the recipe import and its next review. Please check the import before trying again; nothing is being reported as saved.')
          const next = data.result.nextRecipeDraft as VoiceDraft
          const nextReview = next.canConfirm ? reviewPromptForDraft(next) : next.confirmationMessage
          traceVoiceAction(voiceActionRunId, 'import_completed', targetDraft.action, 'imported_not_saved', data.idempotentReplay ? 'replayed_import' : 'verified_import', startedAt)
          appendConversationTurns([makeConversationTurn('assistant', `${data.result.message}${next.recipe?.text ? `\n${next.recipe.text}` : ''}\n${nextReview}`)])
          setDraft(next)
          setPendingFollowUpDraft(isPendingFollowUpDraft(next) ? next : null)
          setReviewCorrectionActive(false)
          setTranscript('')
          setChargedCredits(data.result.costCredits)
          addVoiceActivity('Recipe imported — review before saving', 'done')
          return data
        }
        if (targetDraft.action === 'local_preference_action') {
          const reviewed = validateLocalPreference(targetDraft.localPreference)
          const authorized = validateLocalPreference(data?.authorizedPreference)
          if (data?.success !== true || data?.localPreferenceAuthorized !== true || authorized.key !== reviewed.key || authorized.value !== reviewed.value) throw new Error('The server did not authorize the exact device setting you reviewed. Nothing has been changed on this device.')
          const snapshot = localPreferenceReviewRef.current
          if (!snapshot || snapshot.token !== targetDraft.reviewToken) throw new Error('Please review the current device setting again before applying it.')
          const receipt = await applyReviewedLocalPreference(snapshot, targetDraft.reviewToken || '', voiceMemoryUserId, authorized, isCurrentDeviceSave)
          data = { success: true, result: receipt, voiceActionRunId, idempotentReplay: receipt.idempotentReplay }
        }
        voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
        saveRequestOutstanding = false
        if (!isConfirmedVoiceSave(data, targetDraft.action)) throw new Error(targetDraft.action === 'notification_action' ? 'The server did not confirm this inbox change. Some notifications may have changed. Please check your inbox before retrying.' : 'The server did not confirm a saved entry. Please check your diary before retrying.')
        if (targetDraft.action === 'notification_action') {
          const reviewed = targetDraft.notificationAction
          const ids = reviewed?.ids
          if (!reviewed || !ids?.length || new Set(ids).size !== ids.length || data.result.id !== reviewed.action || data.result.ids.length !== ids.length || data.result.ids.some((id: string) => !ids.includes(id))) throw new Error('The server did not confirm every exact notification you reviewed. Some notifications may have changed. Please check your inbox before retrying.')
        }
        if (targetDraft.action === 'record_action' && (
          data.result.id !== targetDraft.recordAction?.id || data.result.entity !== targetDraft.recordAction?.entity || data.result.operation !== targetDraft.recordAction?.operation
        )) throw new Error('The server did not confirm the exact change you reviewed. Please check that record before retrying.')
        if (targetDraft.action === 'local_preference_action' && data.result.id !== targetDraft.localPreference?.key) throw new Error('The device did not confirm the exact setting you reviewed.')
        if (targetDraft.action === 'preference_action' && data.result.id !== targetDraft.preferenceAction?.action) throw new Error('The server did not confirm the exact setting you reviewed. Please check it before retrying.')
        traceVoiceAction(voiceActionRunId, 'save_completed', targetDraft.action, 'saved', data?.idempotentReplay ? 'replayed_receipt' : 'confirmed_receipt', startedAt)
        appendConversationTurns([makeConversationTurn('assistant', data.result.message || 'Your entry was saved.')])
        const resultKind = String(data?.result?.kind || '').toLowerCase()
        const changedEntity = String(data?.result?.entity || targetDraft.recordAction?.entity || '')
        const changedDate = targetDraft.recordAction?.localDate || targetDraft.localDate || todayLocalDate()
        const emitSavedRefresh = () => {
          if (voiceAccountTokenRef.current !== saveAccountToken || voiceAccountUserIdRef.current !== voiceMemoryUserId) return
          DeviceEventEmitter.emit('helfi:voice-action-saved', {
            localDate: changedDate,
            source: 'voice-assistant',
            kind: resultKind,
            entity: changedEntity,
          })
          if (resultKind === 'record_action') {
            const eventName = ['food', 'water', 'exercise', 'favorite', 'custom_food'].includes(changedEntity) ? 'helfi:food-log-changed'
              : changedEntity === 'mood' ? 'helfi:mood-log-changed'
              : changedEntity === 'journal' ? 'helfi:health-journal-changed'
              : changedEntity === 'mood_journal' ? 'helfi:mood-journal-changed'
              : changedEntity === 'symptom_note' ? 'helfi:symptom-notes-changed'
              : changedEntity === 'supplement' || changedEntity === 'medication' ? 'helfi:health-intake-changed' : null
            if (eventName) DeviceEventEmitter.emit(eventName, { localDate: changedDate, source: 'voice-assistant', kind: resultKind, entity: changedEntity })
          }
          if (resultKind === 'notification_action') DeviceEventEmitter.emit('helfi:notifications-inbox-changed', { source: 'voice-assistant', kind: resultKind })
          if (resultKind === 'local_preference_action') DeviceEventEmitter.emit('helfi:device-preference-changed', { key: data.result.id, source: 'voice-assistant' })
          if (resultKind === 'preference_action') DeviceEventEmitter.emit('helfi:settings-changed', { source: 'voice-assistant', accountId: voiceMemoryUserId, completionId: voiceActionRunId, kind: resultKind, action: targetDraft.preferenceAction?.action, values: targetDraft.preferenceAction?.values })
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
        if (resultKind === 'record_action' || resultKind === 'preference_action' || resultKind === 'local_preference_action' || resultKind === 'notification_action') {
          const target = resultKind === 'notification_action' ? { title: 'Notifications', path: '/notifications', nativeTarget: { type: 'stack', route: 'NotificationsInbox' } }
            : resultKind === 'preference_action' && targetDraft.preferenceAction?.action === 'coach_preferences.update' ? { title: 'Health Coach', path: '/health-tips?tab=settings', nativeTarget: { type: 'stack', route: 'SmartHealthCoach', params: { tab: 'settings' } } }
            : resultKind === 'preference_action' || resultKind === 'local_preference_action' ? { title: 'Settings', path: '/settings', nativeTarget: { type: 'tab', tab: 'Settings' } }
            : changedEntity === 'symptom_note' ? { title: 'Symptom Notes', path: '/symptoms', nativeTarget: { type: 'stack', route: 'SymptomNotes', params: { initialTab: 'history', voiceActionNonce: Date.now() } } }
            : changedEntity === 'supplement' || changedEntity === 'medication' ? { title: 'Health Intake', path: '/onboarding?step=6', nativeTarget: { type: 'stack', route: 'NativeWebTool', params: { title: 'Health Intake', path: `/onboarding?step=6&voiceActionNonce=${Date.now()}` } } }
            : changedEntity === 'journal' ? { title: 'Health Journal', path: '/health-journal', nativeTarget: { type: 'stack', route: 'HealthJournal', params: { initialTab: 'history', selectedDate: changedDate, voiceActionNonce: Date.now() } } }
            : changedEntity === 'mood' || changedEntity === 'mood_journal' ? { title: 'Mood Tracker', path: '/mood', nativeTarget: { type: 'stack', route: 'MoodTracker', params: { tab: changedEntity === 'mood' ? 'history' : 'journal' } } }
            : { title: 'Food Diary', path: '/food', nativeTarget: { type: 'tab', tab: 'Food' } }
          DeviceEventEmitter.emit('helfi:navigate-native-web-tool', target)
          setTimeout(emitSavedRefresh, 450)
          setTimeout(emitSavedRefresh, 1000)
        } else if (resultKind === 'food' || resultKind === 'exercise' || resultKind === 'water') {
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
          : resultKind === 'record_action' || resultKind === 'preference_action' || resultKind === 'local_preference_action' || resultKind === 'notification_action' ? 'Change' : 'Entry'
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
        if (targetDraft.action === 'local_preference_action') DeviceEventEmitter.emit('helfi:device-preference-changed', { key: targetDraft.localPreference?.key, source: 'voice-assistant' })
        traceVoiceAction(voiceActionRunId, 'save_completed', targetDraft.action, 'not_confirmed', saveSignal?.aborted ? 'cancelled_check_diary' : 'save_not_confirmed', startedAt)
        if (saveSignal?.aborted || error?.name === 'AbortError') return null
        const message = error?.message || 'Please check your internet connection and try again.'
        appendConversationTurns([makeConversationTurn('assistant', `${targetDraft.action === 'recipe_import_url' ? 'I could not confirm the recipe import.' : ['clinical_action', 'food_management_action', 'support_action', 'report_action', 'additional_action', 'device_action'].includes(targetDraft.action) ? 'I could not confirm this action.' : 'I could not confirm the save.'} ${message}`)])
        addVoiceActivity(['clinical_action', 'food_management_action', 'recipe_import_url', 'support_action', 'report_action', 'additional_action', 'device_action'].includes(targetDraft.action) ? 'Action not verified — check before retrying' : 'Save failed — ready to retry', 'error')
        setSaveError(message)
        Alert.alert(targetDraft.action === 'recipe_import_url' ? 'Import not verified' : ['clinical_action', 'food_management_action', 'support_action', 'report_action', 'additional_action', 'device_action'].includes(targetDraft.action) ? 'Action not verified' : 'Could not save', message)
        return null
      } finally {
        if (saveRequestOutstanding) voiceSaveRequestsRef.current = Math.max(0, voiceSaveRequestsRef.current - 1)
        if (saveAbortController && draftRequestAbortRef.current === saveAbortController) {
          draftRequestAbortRef.current = null
        }
        setConfirming(false)
      }
    },
    [addVoiceActivity, appendConversationTurns, clearRealtimeConnectTimeout, clearReviewSilenceTimer, closePanel, emitGeneralAssistantEffects, makeConversationTurn, session?.token, setContinuousVoiceSession, stopPlayback, voiceMemoryUserId],
  )

  const sendDraftRequest = useCallback(
    async (options?: DraftRequestOptions): Promise<DraftRequestResult> => {
      if (!session?.token) return { ok: false, message: 'Please sign in first.' }
      if (options?.signal?.aborted) return { ok: false, message: 'Live voice has stopped.' }
      if (voiceSaveRequestsRef.current > 0) return { ok: false, saved: false, status: 'needs_clarification', message: 'Your previous save is still being confirmed. Please wait for its result before changing that entry.' }
      const voiceActionRunId = options?.voiceActionRunId || newVoiceActionRunId()
      const startedAt = Date.now()
      traceVoiceAction(voiceActionRunId, 'request_started', options?.realtimeActionHint?.action, 'pending', 'app_brain', startedAt)
      const rawTypedTranscript = (options?.transcriptOverride ?? transcript).trim()
      const usingGeneralAssistant = !options?.audioUri && (Boolean(options?.realtimeActionHint?.assistantCommand) || !options?.realtimeActionHint?.action && (!draft || draft.action === 'assistant_plan'))
      const generalRequestAccountToken = session.token
      const generalRequestAccountId = voiceMemoryUserId
      const generalRequestRun = realtimeVoiceRunRef.current
      const generalRequestSessionId = generalAssistantSessionRef.current
      const isCurrentGeneralRequest = () => !usingGeneralAssistant || !options?.signal?.aborted && openRef.current && voiceProviderMountedRef.current && voiceAccountTokenRef.current === generalRequestAccountToken && voiceAccountUserIdRef.current === generalRequestAccountId && realtimeVoiceRunRef.current === generalRequestRun && generalAssistantSessionRef.current === generalRequestSessionId
      if (!isCurrentGeneralRequest()) return { ok: false, saved: false, message: 'This assistant request has stopped.' }
      const explicitNewCommand = usingGeneralAssistant ? false : isExplicitNewVoiceCommand(rawTypedTranscript, draft || pendingFollowUpDraft)
      const draftIsReviewOrHandoff = Boolean(draft?.canConfirm || draft?.appTarget?.path) && !explicitNewCommand
      if (!options?.audioUri && draft?.canConfirm && isConfirmingDraftText(rawTypedTranscript)) {
        setTranscript(rawTypedTranscript)
        appendConversationTurns([makeConversationTurn('user', rawTypedTranscript)])
        const saved = await saveDraft(draft, { signal: options?.signal, closeOnSuccess: !options?.realtimeActionHint?.action, voiceActionRunId })
        return confirmationRequestResult(saved, draft, voiceActionRunId, voiceMemoryUserId)
      }
      if (!options?.audioUri && draftIsReviewOrHandoff && draft && isRejectingDraftText(rawTypedTranscript)) {
        if (draft.action === 'assistant_plan' && draft.assistantPlan?.reviewId) {
          try {
            const { res, data } = await fetchNativeVoiceAssistant(baseUrl => fetch(`${baseUrl}/api/native/assistant`, {
              method: 'POST', headers: buildNativeAuthHeaders(session.token, { json: true }), signal: options?.signal,
              body: JSON.stringify({ sessionId: generalAssistantSessionRef.current, localDate: draft.localDate, timeZone: draft.timeZone || nativeVoiceTimeZone(), text: '', channel: 'typed', command: { type: 'decline', reviewId: draft.assistantPlan!.reviewId }, controlId: `decline:${draft.assistantPlan!.reviewId}` }),
            }))
            if (!isCurrentGeneralRequest()) return { ok: false, saved: false, message: 'This assistant request has stopped.' }
            const accepted = res.ok && acceptGeneralAssistantResponse(data, voiceMemoryUserId, generalAssistantSessionRef.current)
            if (!accepted) throw new Error('The stopped request could not be verified. Please check before starting another change.')
            generalAssistantSessionRef.current = newGeneralAssistantSessionId()
          } catch (error: any) { return { ok: false, saved: false, message: error?.message || 'The request could not be stopped.' } }
        }
        setTranscript(rawTypedTranscript)
        setDraft(null)
        setPendingFollowUpDraft(null)
        setChargedCredits(null)
        appendConversationTurns([makeConversationTurn('user', rawTypedTranscript), makeConversationTurn('assistant', NOT_SAVED_MESSAGE)])
        traceVoiceAction(voiceActionRunId, 'request_completed', draft.action, 'general_answer', 'user_discarded', startedAt)
        if (voiceReply && !options?.suppressSpokenReply) {
          void requestVoiceReply(NOT_SAVED_MESSAGE)
        }
        Alert.alert('Not saved', NOT_SAVED_MESSAGE)
        return { ok: true, message: NOT_SAVED_MESSAGE, saved: false, status: 'general_answer', action: draft.action, voiceActionRunId }
      }
      const nextFollowUpTranscript = usingGeneralAssistant || options?.audioUri || explicitNewCommand || pendingFollowUpDraft?.action === 'water' || pendingFollowUpDraft?.action === 'food_draft' || pendingFollowUpDraft?.timingNeedsClarification
        ? null
        : followUpTranscript(pendingFollowUpDraft, rawTypedTranscript)
      const typedTranscript = nextFollowUpTranscript || rawTypedTranscript
      const shouldSpeakReply = !options?.suppressSpokenReply && Boolean(options?.audioUri || voiceReply)
      if (!options?.audioUri && !typedTranscript) {
        Alert.alert('Nothing heard', 'Please record or type a request first.')
        return { ok: false, message: 'Nothing heard.' }
      }

      const aiAllowed = await requestAiDataSharingPermission()
      if (!isCurrentGeneralRequest()) return { ok: false, saved: false, message: 'This assistant request has stopped.' }
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
        if (requestSignal?.aborted || !isCurrentGeneralRequest()) return { ok: false, message: 'Live voice has stopped.' }
        const requestContext = normalizeLaunchContext(launchContext)
        const requestLocalDate = usingGeneralAssistant ? todayLocalDate() : (!explicitNewCommand && (draft?.canConfirm ? draft.localDate : pendingFollowUpDraft?.localDate)) || requestContext.date || todayLocalDate()
        const confirmationDraftPayload = !explicitNewCommand && draft?.canConfirm ? draft : null
        const requestTzOffsetMin = new Date().getTimezoneOffset()
        const requestTimeZone = nativeVoiceTimeZone() || confirmationDraftPayload?.timeZone || pendingFollowUpDraft?.timeZone
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
            form.append('tzOffsetMin', String(requestTzOffsetMin))
            if (requestTimeZone) form.append('timeZone', requestTimeZone)
            form.append('voiceReply', 'false')
            form.append('favorites', JSON.stringify(favorites))
            form.append('launchContext', JSON.stringify(requestContext))
            form.append('conversationHistory', JSON.stringify(requestConversationHistory))
            if (confirmationDraftPayload) form.append('confirmationDraft', JSON.stringify(confirmationDraftPayload))
            if (followUpDraftPayload) form.append('followUpDraft', JSON.stringify(followUpDraftPayload))
            if (options.realtimeActionHint?.action) form.append('realtimeActionHint', JSON.stringify(options.realtimeActionHint))
            form.append('aiConsentGranted', 'true')
            return fetch(`${baseUrl}/api/native-voice-assistant`, {
              method: 'POST',
              headers: { ...buildNativeAuthHeaders(session.token), 'x-helfi-voice-capabilities': 'report-pdf-v1,report-pdf-inline-v1,additional-actions-v1,symptom-analysis-v1,food-management-v1,manual-action-catalog-v1', 'x-helfi-voice-action-id': voiceActionRunId },
              signal: requestSignal,
              body: form,
            })
          })
        } else {
          responseData = await fetchNativeVoiceAssistant((baseUrl) => fetch(`${baseUrl}/api/native-voice-assistant`, {
            method: 'POST',
            headers: { ...buildNativeAuthHeaders(session.token, { json: true }), 'x-helfi-voice-capabilities': 'report-pdf-v1,report-pdf-inline-v1,additional-actions-v1,symptom-analysis-v1,food-management-v1,manual-action-catalog-v1,general-assistant-v1', 'x-helfi-voice-action-id': voiceActionRunId },
            signal: requestSignal,
            body: JSON.stringify({
              transcript: typedTranscript,
              ...(usingGeneralAssistant ? { assistantSessionId: generalAssistantSessionRef.current, ...(requestContext.date ? { selectedLocalDate: requestContext.date } : {}), ...(options?.realtimeActionHint?.assistantCommand ? { assistantCommand: options.realtimeActionHint.assistantCommand } : {}) } : {}),
              localDate: requestLocalDate,
              tzOffsetMin: requestTzOffsetMin,
              timeZone: requestTimeZone,
              voiceReply: false,
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
        if (requestSignal?.aborted || !isCurrentGeneralRequest()) return { ok: false, message: 'Live voice has stopped.' }
        if (!res.ok) {
          throw new Error(data?.error || 'Helfi could not process that request.')
        }
        setTranscript(String(data?.transcript || typedTranscript || '').trim())
        const nextDraft = data?.draft || null
        if (!nextDraft && !data?.rejectNow) throw new Error('Helfi returned no completed answer. Nothing is confirmed saved.')
        if (usingGeneralAssistant && !acceptGeneralAssistantResponse(data, voiceMemoryUserId, generalAssistantSessionRef.current)) throw new Error('The app did not verify this assistant conversation result.')
        if (usingGeneralAssistant) emitGeneralAssistantEffects(data.assistant)
        if (nextDraft?.action === 'local_preference_action' && nextDraft.canConfirm) {
          const currentToken = session.token
          const currentRun = realtimeVoiceRunRef.current
          const isCurrent = () => !requestSignal?.aborted && openRef.current && voiceProviderMountedRef.current && voiceAccountTokenRef.current === currentToken && voiceAccountUserIdRef.current === voiceMemoryUserId && realtimeVoiceRunRef.current === currentRun
          const existingReview = localPreferenceReviewRef.current
          if (!existingReview || existingReview.token !== nextDraft.reviewToken) {
            localPreferenceReviewRef.current = await captureLocalPreferenceReview(nextDraft.reviewToken || '', voiceMemoryUserId, nextDraft.localPreference, isCurrent)
          } else {
            const proposed = validateLocalPreference(nextDraft.localPreference)
            if (proposed.key !== existingReview.preference.key || proposed.value !== existingReview.preference.value) throw new Error('This device setting review changed. Please request a fresh review.')
          }
          if (!isCurrent()) return { ok: false, message: 'This device setting request has stopped.' }
        }
        const actionNeedsFreshConfirmation = Boolean(nextDraft?.canConfirm && (nextDraft.action === 'assistant_plan' || ['clinical_action', 'food_management_action'].includes(nextDraft.action) && (!draft?.canConfirm || draft.action !== nextDraft.action || !draft.reviewToken || draft.reviewToken !== nextDraft.reviewToken || JSON.stringify(draft.clinicalAction || draft.foodManagement) !== JSON.stringify(nextDraft.clinicalAction || nextDraft.foodManagement))))
        let deviceNeedsFreshConfirmation = false
        if (nextDraft?.action === 'device_action' && nextDraft.canConfirm && !data?.rejectNow) {
          const proposed = validateNativeDeviceAction(nextDraft.deviceAction)
          if (nextDraft.requiresDeviceReview !== true || !['apple_health.import', 'apple_health.automatic.update', 'apple_health.source.select'].includes(proposed.action)) throw new Error('Please use the existing Apple Health controls in Devices. This phone action is not supported here.')
          const currentToken = session.token, currentRun = realtimeVoiceRunRef.current
          const isCurrent = () => !requestSignal?.aborted && openRef.current && voiceProviderMountedRef.current && voiceAccountTokenRef.current === currentToken && voiceAccountUserIdRef.current === voiceMemoryUserId && realtimeVoiceRunRef.current === currentRun
          const existing = nativeDeviceReviewRef.current
          deviceNeedsFreshConfirmation = Boolean(data?.confirmNow && (!existing || existing.token !== nextDraft.reviewToken || existing.accountId !== voiceMemoryUserId || JSON.stringify(existing.action) !== JSON.stringify(proposed)))
          if (!existing || existing.token !== nextDraft.reviewToken || existing.accountId !== voiceMemoryUserId) {
            nativeDeviceReviewRef.current = await captureNativeDeviceReview(nextDraft.reviewToken || '', voiceMemoryUserId, proposed, nativeDeviceIoForVoice(() => appleHealthSyncRef.current, () => voiceAccountUserIdRef.current || null, isCurrent))
          } else if (JSON.stringify(existing.action) !== JSON.stringify(proposed)) throw new Error('This Apple Health review changed. Please request a fresh review.')
          if (!isCurrent()) return { ok: false, message: 'This Apple Health request has stopped.' }
        }
        traceVoiceAction(voiceActionRunId, 'request_completed', nextDraft?.action, voiceResultStatusFromDraft(nextDraft, data) || 'general_answer', data?.rejectNow ? 'user_discarded' : 'app_response', startedAt)
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
        if (nextDraft && (!nextDraft.reviewToken || nextDraft.reviewToken !== draft?.reviewToken)) setSaveError('')
        setDraft(nextDraft)
        if (nextDraft?.canConfirm || data?.confirmNow || data?.rejectNow) setReviewCorrectionActive(false)
        setPendingFollowUpDraft(isPendingFollowUpDraft(nextDraft) ? nextDraft : null)
        setChargedCredits(Number.isFinite(Number(data?.chargedCredits)) ? Number(data.chargedCredits) : null)
        const assistantText = data?.rejectNow
          ? NOT_SAVED_MESSAGE
          : data?.confirmNow && !deviceNeedsFreshConfirmation && !actionNeedsFreshConfirmation
          ? ''
          : nextDraft?.action === 'device_action' && nextDraft.canConfirm ? reviewPromptForDraft(nextDraft, nativeDeviceReviewRef.current) : nextDraft?.recipe?.text || nextDraft?.confirmationMessage || nextDraft?.summary || ''
        const userText = options?.audioUri ? data?.transcript || typedTranscript : rawTypedTranscript || typedTranscript
        appendConversationTurns([
          makeConversationTurn('user', userText),
          ...(assistantText ? [makeConversationTurn('assistant', assistantText)] : []),
        ])
        if (data?.confirmNow && nextDraft?.canConfirm && !deviceNeedsFreshConfirmation && !actionNeedsFreshConfirmation) {
          const saved = await saveDraft(nextDraft, { signal: requestSignal, closeOnSuccess: !options?.realtimeActionHint?.action, voiceActionRunId })
          return confirmationRequestResult(saved, nextDraft, voiceActionRunId, voiceMemoryUserId)
        }
        if (data?.rejectNow) {
          setDraft(null)
          setPendingFollowUpDraft(null)
          if (shouldSpeakReply) {
            void requestVoiceReply(NOT_SAVED_MESSAGE)
          }
          Alert.alert('Not saved', NOT_SAVED_MESSAGE)
          return { ok: true, message: NOT_SAVED_MESSAGE, saved: false, status: 'general_answer', action: nextDraft?.action, voiceActionRunId }
        }
        if (shouldSpeakReply && nextDraft) {
          const speechText = (nextDraft.action === 'clinical_action' || nextDraft.action === 'food_management_action' || nextDraft.action === 'device_action' || nextDraft.action === 'journal') && nextDraft.canConfirm ? spokenReviewPromptForDraft(nextDraft, nativeDeviceReviewRef.current) : spokenReplyTextForDraft(nextDraft)
          void requestVoiceReply(String(speechText))
        }
        if (nextDraft?.appTarget?.path && !nextDraft.canConfirm && (nextDraft.action === 'app_handoff' || nextDraft.action === 'preference_action' || options?.realtimeActionHint?.action === 'navigate')) {
          openAppTargetRef.current(nextDraft)
        }
        return {
          ok: true,
          saved: false,
          needsReview: Boolean(nextDraft?.canConfirm),
          reviewPrompt: nextDraft?.canConfirm ? spokenReviewPromptForDraft(nextDraft, nativeDeviceReviewRef.current) : undefined,
          status: voiceResultStatusFromDraft(nextDraft, data),
          action: nextDraft?.action,
          voiceActionRunId,
          ...(usingGeneralAssistant ? { assistantContext: data.assistant } : {}),
          message: assistantText || (nextDraft ? 'Review is ready.' : 'Done.'),
        }
      } catch (error: any) {
        if (!isCurrentGeneralRequest()) return { ok: false, saved: false, message: 'This assistant request has stopped.' }
        traceVoiceAction(voiceActionRunId, 'request_completed', options?.realtimeActionHint?.action, 'error', requestSignal?.aborted ? 'cancelled' : 'request_failed', startedAt)
        if (requestSignal?.aborted || error?.name === 'AbortError') {
          return { ok: false, message: 'Live voice has stopped.' }
        }
        if (usingGeneralAssistant && options?.suppressSpokenReply && options?.realtimeActionHint?.assistantCommand) {
          // The server checks the existing owned result after this failed
          // delivery. Never suggest a blind retry or interrupt that check
          // with an alert while a save could already have happened.
          addVoiceActivity('Checking the existing result')
          return { ok: false, saved: false, message: 'The reply was interrupted. Helfi is checking the existing result.', voiceActionRunId }
        }
        const message = error?.message || 'Helfi could not process that request.'
        appendConversationTurns([makeConversationTurn('user', rawTypedTranscript || typedTranscript), makeConversationTurn('assistant', `I could not complete that request. ${message} Nothing is confirmed saved.`)])
        addVoiceActivity('Request failed — ready to retry', 'error')
        if (options?.continuousVoice && /no speech|nothing heard/i.test(String(message))) {
          resumeVoiceSessionListening(600)
        } else {
          Alert.alert('Try again', message)
        }
        return { ok: false, message, voiceActionRunId }
      } finally {
        if (draftRequestAbortController && draftRequestAbortRef.current === draftRequestAbortController) {
          draftRequestAbortRef.current = null
        }
        if (isCurrentGeneralRequest()) setBusy(false)
      }
    },
    [addVoiceActivity, appendConversationTurns, draft, emitGeneralAssistantEffects, launchContext, makeConversationTurn, pendingFollowUpDraft, requestConversationHistory, requestVoiceReply, resumeVoiceSessionListening, saveDraft, session?.token, transcript, voiceReply, voiceMemoryUserId],
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
    if (!liveVoiceEnabled) {
      setRealtimeVoiceAvailable(false)
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError(LIVE_VOICE_DISABLED_MESSAGE)
      return
    }
    if (!voiceRecordingSupported) {
      Alert.alert('Type your request instead', 'Voice input is iPhone only for now. You can type your request here on iPad.')
      return
    }
    if (!session?.token || !openRef.current || !voiceProviderMountedRef.current) return
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
    const realtimeRunId = realtimeVoiceRunRef.current + 1
    realtimeVoiceRunRef.current = realtimeRunId
    const startupAccountToken = session.token
    const aiAllowed = await requestAiDataSharingPermission()
    if (
      realtimeVoiceRunRef.current !== realtimeRunId || !openRef.current ||
      !voiceProviderMountedRef.current || voiceAccountTokenRef.current !== startupAccountToken ||
      AppState.currentState !== 'active'
    ) return
    if (!aiAllowed) {
      Alert.alert('AI request not sent', 'No microphone data was sent. You can still type your request.')
      return
    }
    setVoiceReplyPreference(true)
    setContinuousVoiceSession(true)
    realtimeVoiceConnectedRef.current = false
    realtimeActionGuardRef.current = null
    const abortController = new AbortController()
    realtimeVoiceAbortRef.current?.abort()
    realtimeVoiceAbortRef.current = abortController
    setRealtimeVoiceStatus('connecting')
    setRealtimeVoiceError('')
    const failSlowConnection = () => {
      if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
      realtimeVoiceRunRef.current += 1
      realtimeVoiceConnectedRef.current = false
      realtimeVoiceAbortRef.current?.abort()
      realtimeVoiceAbortRef.current = null
      realtimeVoiceStopRef.current = null
      setContinuousVoiceSession(false)
      setRealtimeVoiceStatus('failed')
      setRealtimeVoiceError('Live voice took too long to connect. Please tap Try again.')
      addVoiceActivity('Connection timed out — tap Try again', 'error')
    }
    const armRealtimeConnectTimeout = (delayMs: number) => {
      clearRealtimeConnectTimeout()
      realtimeVoiceConnectTimeoutRef.current = setTimeout(failSlowConnection, delayMs)
    }
    armRealtimeConnectTimeout(REALTIME_VOICE_SERVER_TIMEOUT_MS)
    try {
      const billingSessionId = realtimeBillingSessionIdRef.current
      const greetOnConnect = voiceGreetingConversationRef.current !== billingSessionId
      const realtimeSession = await startHelfiRealtimeVoiceSession({
        greetOnConnect,
        token: session.token,
        billingSessionId,
        assistantSessionId: generalAssistantSessionRef.current,
        localDate: todayLocalDate(),
        timeZone: nativeVoiceTimeZone() || undefined,
        signal: abortController.signal,
        callbacks: {
          onConnectStage: (stage) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            // Connecting the microphone is not proof that the welcome played.
            // Failed or interrupted playback must remain eligible on retry.
            if (greetOnConnect && (stage === 'welcome-finished' || stage === 'welcome-user-first')) voiceGreetingConversationRef.current = billingSessionId
            if (stage === 'local-offer-ready') {
              armRealtimeConnectTimeout(REALTIME_VOICE_SERVER_TIMEOUT_MS)
            }
            if (stage === 'server-answer-received') {
              armRealtimeConnectTimeout(REALTIME_VOICE_MEDIA_TIMEOUT_MS)
            }
            const message = stage === 'microphone-ready'
              ? 'Microphone opened — connecting securely'
              : stage === 'local-offer-ready'
              ? 'Contacting Helfi voice'
              : stage === 'server-answer-received'
              ? 'Voice service answered — checking live audio'
              : stage === 'remote-answer-applied'
              ? 'Secure audio link received'
              : stage === 'peer-connected'
              ? 'Live audio link connected'
              : stage === 'data-channel-ready'
              ? 'Conversation link connected'
              : stage === 'session-ready'
              ? 'Helfi voice session ready'
              : stage === 'remote-audio-ready'
              ? 'Speaker audio ready'
              : stage === 'microphone-sending'
              ? 'Microphone stream connected — speak now'
              : stage === 'response-recovery'
              ? 'Helfi heard you — requesting a reply'
              : ''
            if (message) addVoiceActivity(message, stage === 'microphone-sending' ? 'done' : 'active')
          },
          onError: (message) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            const detail = cleanFavoriteText(message, 260) || 'The live voice service reported an error. Please tap Try again.'
            setRealtimeVoiceError(detail)
            addVoiceActivity(detail, 'error')
          },
          onNotice: (message) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            setRealtimeVoiceError('')
            addVoiceActivity(cleanFavoriteText(message, 260) || 'Ready — speak when you are ready', 'done')
          },
          onActionRecovery: async (recovery) => {
            const accountToken = session?.token, accountId = voiceMemoryUserId, sessionId = generalAssistantSessionRef.current
            const timeZone = nativeVoiceTimeZone()
            const isCurrent = () => Boolean(accountToken && realtimeVoiceRunRef.current === realtimeRunId && voiceSessionActiveRef.current && openRef.current && voiceProviderMountedRef.current && voiceAccountTokenRef.current === accountToken && voiceAccountUserIdRef.current === accountId && generalAssistantSessionRef.current === sessionId)
            if (!isCurrent()) return
            if (recovery.transportRecovery.status === 'verified_owned_result' && recovery.assistantContext && accountToken && timeZone) {
              const data = await readOwnedVoiceResult({ baseUrl: API_BASE_URL, token: accountToken, accountId, sessionId, pointer: recovery.assistantContext, localDate: todayLocalDate(), timeZone, signal: realtimeVoiceAbortRef.current?.signal, isCurrent })
              if (!isCurrent()) return
              const accepted = data && acceptGeneralAssistantResponse(data, accountId, sessionId)
              if (accepted) {
                setDraft(accepted.draft)
                setSaveError('')
                setReviewCorrectionActive(false)
                pendingReviewAnswerRef.current = Boolean(accepted.needsReview)
                appendConversationTurns([makeConversationTurn('assistant', accepted.message)])
                emitGeneralAssistantEffects(data.assistant)
                addVoiceActivity(accepted.needsReview ? 'Review recovered — ready for your decision' : 'Existing result verified', 'done')
                return
              }
            }
            if (!isCurrent()) return
            const message = 'The result could not be verified. Check its normal screen before repeating a change.'
            appendConversationTurns([makeConversationTurn('assistant', message)])
            addVoiceActivity(message, 'done')
          },
          onAudioRoute: (route) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            addVoiceActivity(`Audio: ${cleanFavoriteText(route, 80)}`, 'done')
          },
          onStatus: (status) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            if (status === 'live') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = true
              setRealtimeVoiceStatus('live')
              addVoiceActivity('Connected — speak now', 'done')
              return
            }
            if (status === 'hearing' || status === 'thinking') {
              if (!realtimeVoiceConnectedRef.current) return
              setRealtimeVoiceStatus(status)
              setRealtimeVoiceError('')
              addVoiceActivity(status === 'hearing' ? 'Hearing you' : 'Understanding your request')
              return
            }
            if (status === 'speaking') {
              if (!realtimeVoiceConnectedRef.current) return
              setRealtimeVoiceStatus('speaking')
              setRealtimeVoiceError('')
              addVoiceActivity('Helfi is speaking')
              return
            }
            if (status === 'closed' || status === 'disconnected') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = false
              realtimeVoiceRunRef.current += 1
              realtimeVoiceAbortRef.current?.abort()
              realtimeVoiceAbortRef.current = null
              void realtimeVoiceStopRef.current?.().catch(() => {})
              realtimeVoiceStopRef.current = null
              realtimeVoiceMuteRef.current = null
              realtimeVoicePromptRef.current = null
              setContinuousVoiceSession(false)
              setRealtimeVoiceStatus(status === 'disconnected' ? 'failed' : 'closed')
              if (status === 'disconnected') {
                setRealtimeVoiceError((current) => current || 'The voice connection was interrupted. Check your internet or Bluetooth audio, then tap Try again.')
                addVoiceActivity('Connection interrupted — ready to retry', 'error')
              }
              return
            }
            if (status === 'failed') {
              clearRealtimeConnectTimeout()
              realtimeVoiceConnectedRef.current = false
              realtimeVoiceRunRef.current += 1
              realtimeVoiceAbortRef.current?.abort()
              realtimeVoiceAbortRef.current = null
              void realtimeVoiceStopRef.current?.().catch(() => {})
              realtimeVoiceStopRef.current = null
              realtimeVoiceMuteRef.current = null
              realtimeVoicePromptRef.current = null
              setContinuousVoiceSession(false)
              setRealtimeVoiceStatus('failed')
              setRealtimeVoiceError((current) => current || 'Voice audio was interrupted. Check your internet, speaker, or Bluetooth connection, then tap Try again.')
              addVoiceActivity('Audio interrupted — ready to retry', 'error')
              return
            }
            if (realtimeVoiceConnectedRef.current) {
              setRealtimeVoiceStatus((current) => (current === 'speaking' ? 'speaking' : 'live'))
              return
            }
            setRealtimeVoiceStatus('connecting')
          },
          onUserSpeech: () => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current) return
            generalAssistantHeardRef.current = ''
            generalAssistantConfirmationConsumedRef.current = false
            clearReviewSilenceTimer()
            pendingReviewAnswerRef.current = false
            if (voiceSaveRequestsRef.current > 0) {
              setRealtimeVoiceError('Your save is still being confirmed. I will check its result before making another change.')
              return
            }
            const preparing = Boolean(realtimeActionAbortRef.current || draftRequestAbortRef.current)
            realtimeActionAbortRef.current?.abort()
            realtimeActionAbortRef.current = null
            draftRequestAbortRef.current?.abort()
            draftRequestAbortRef.current = null
            realtimeActionGuardRef.current = null
            if (preparing) {
              setBusy(false)
              addVoiceActivity('Stopped preparing — listening to your change', 'done')
            }
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
          onHumanTranscript: (text) => {
            if (realtimeVoiceRunRef.current !== realtimeRunId || !voiceSessionActiveRef.current || !text) return
            generalAssistantHeardRef.current = text
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
            const requestedAction = cleanFavoriteText(args.action || '', 40)
            const assistantCommand = requestedAction === 'assistant_plan' ? sanitizeGeneralAssistantCommand(args.assistantCommand) : null
            if (requestedAction === 'assistant_plan' && !assistantCommand) return { ok: false, saved: false, safeToClaimSaved: false, message: 'The assistant needs a supported structured request.' }
            const request = requestedAction === 'assistant_plan' ? generalAssistantHeardRef.current.trim().slice(0, 20000) : cleanFavoriteText(args.request || '', 2000)
            if (!request) return { ok: false, message: 'Please finish saying the request before it is submitted.' }
            if (requestedAction === 'assistant_plan' && (assistantCommand?.type === 'confirm' || assistantCommand?.type === 'decline' || isConfirmingDraftText(request) || isRejectingDraftText(request))) {
              if (generalAssistantConfirmationConsumedRef.current) return { ok: false, saved: false, safeToClaimSaved: false, message: 'That spoken confirmation was already used. Please use this review’s confirmation button.' }
              // Consume before asynchronous dispatch. Caption fragments and a
              // second model call cannot authorize the following review. Only
              // a genuine new speech-start event resets spoken consent.
              generalAssistantConfirmationConsumedRef.current = true
              generalAssistantHeardRef.current = ''
            }
            const capability = requestedAction === 'capability_action' ? validatedVoiceCapability(args.capability) : null
            if (requestedAction === 'capability_action' && !capability) return { ok: false, saved: false, safeToClaimSaved: false, message: 'Please give a supported app action with its exact details.' }
            const savedHistoryTarget = /\b(?:saved|history|previous|older)\b/i.test(request)
            const action = requestedAction === 'delete_conversation' && savedHistoryTarget ? 'additional_action' : requestedAction
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
            if (!assistantCommand && !savedHistoryTarget && (action === 'delete_conversation' || (action !== 'additional_action' && /\bdelete (?:this |the )?(?:chat|conversation)\b/i.test(request)))) {
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
            const guardKey = `${action.toLowerCase()}|${request.toLowerCase()}|${Boolean(args.needsReview)}|${capability ? JSON.stringify(capability) : ''}|${assistantCommand ? JSON.stringify(assistantCommand) : ''}`
            const guard = realtimeActionGuardRef.current
            if (guard?.key === guardKey && Date.now() - guard.startedAt < 5000) {
              return guard.promise
            }
            if (voiceSaveRequestsRef.current > 0) {
              return realtimeToolResult({
                ok: false,
                saved: false,
                status: 'needs_clarification',
                message: 'The previous save is still being confirmed. Please wait for its result before changing that entry. I cannot promise it was cancelled.',
              })
            }
            const actionAbortController = new AbortController()
            realtimeActionAbortRef.current?.abort()
            realtimeActionAbortRef.current = actionAbortController
            const promise = sendDraftRequestRef.current({
              transcriptOverride: request,
              suppressSpokenReply: true,
              signal: actionAbortController.signal,
              voiceActionRunId: newVoiceActionRunId(),
              realtimeActionHint: {
                action,
                needsReview: Boolean(args.needsReview),
                ...(capability ? { capability } : {}),
                ...(assistantCommand ? { assistantCommand } : {}),
              },
            }).then(realtimeToolResult).then((result) => {
              if (actionAbortController.signal.aborted || realtimeVoiceRunRef.current !== realtimeRunId) return result
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
      realtimeVoiceStopRef.current = realtimeSession.stop
      realtimeVoiceMuteRef.current = realtimeSession.setMicrophoneMuted
      realtimeVoicePromptRef.current = realtimeSession.promptAssistant
      realtimeVoiceFlushRef.current = realtimeSession.flushTranscript
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
    if (!liveVoiceEnabled || typedMode || conversationReviewOnly || !open || !voicePaidAccessGranted || realtimeVoiceAvailable !== true || voiceSessionActiveRef.current) return
    if (realtimeAutoStartRef.current) return
    realtimeAutoStartRef.current = true
    void startVoiceSession()
  }, [conversationReviewOnly, liveVoiceEnabled, open, realtimeVoiceAvailable, startVoiceSession, typedMode, voicePaidAccessGranted])

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
    pendingMessageFocusRef.current = null
    nativeDeviceReviewRef.current = null
    messageSectionYRef.current = null
    realtimeVoiceFlushRef.current?.()
    if (voiceSaveRequestsRef.current > 0) appendConversationTurns([makeConversationTurn('assistant', 'The last save was not yet confirmed when this conversation ended. Please check the relevant diary or setting before retrying.')])
    setConversationReviewOnly(true)
    setTypedMode(false)
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
  }, [appendConversationTurns, clearRealtimeConnectTimeout, clearVoiceTurnTimers, makeConversationTurn, recording, setContinuousVoiceSession, stopPlayback, stopRealtimeVoiceSession])

  const closeCameraMode = useCallback(() => {
    setBottleCameraOpen(false)
    if (voiceSessionActiveRef.current) {
      endVoiceSession()
    }
  }, [endVoiceSession])

  const confirmDraft = useCallback(async () => {
    if (busy || confirming) return
    await saveDraft(draft)
  }, [busy, confirming, draft, saveDraft])

  const rejectDraft = useCallback(() => {
    if (voiceSaveRequestsRef.current > 0) {
      setSaveError('Your save is still being confirmed. Please check its result before making another change.')
      return
    }
    openRef.current = false
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

	  const openAppTarget = useCallback((targetDraft: VoiceDraft | null = draft) => {
	    const path = targetDraft?.appTarget?.path
	    if (!path) return
	    const nativeTarget = targetDraft.appTarget?.nativeTarget || fallbackNativeTargetForAppTarget(targetDraft.appTarget) || null
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
	      title: targetDraft.appTarget?.title || 'Helfi',
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

  openAppTargetRef.current = openAppTarget

  const draftIsActionable = Boolean(draft?.canConfirm || draft?.appTarget?.path)
  const showDraftCard = Boolean(draft && draftIsActionable && !reviewCorrectionActive)
  const primaryFooterIsHandoff = Boolean(draft?.appTarget?.path && !draft?.canConfirm)
  const primaryFooterLabel = primaryFooterIsHandoff ? draft?.appTarget?.buttonLabel || 'Open Helfi tool' : draft?.action === 'recipe_import_url' ? 'Import recipe · 10 credits' : draft?.action === 'device_action' ? 'Apply reviewed action' : draft?.action === 'clinical_action' || draft?.action === 'food_management_action' ? 'Confirm reviewed request' : draft?.action === 'additional_action' ? 'Confirm reviewed action' : draft?.action === 'support_action' ? 'Confirm support action' : draft?.action === 'report_action' ? draft.reportAction?.action === 'reports.weekly.export_pdf' ? 'Open report PDF' : 'Request report' : 'Save this'
  const primaryFooterDisabled = !draft || busy || confirming || (!draft.canConfirm && !primaryFooterIsHandoff)
  const discardFooterLabel = primaryFooterIsHandoff ? 'Cancel' : draft?.action === 'recipe_import_url' ? "Don't import" : ['support_action', 'report_action', 'additional_action', 'device_action'].includes(draft?.action || '') ? 'Cancel' : "Don't save"
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
  const showingConversationReview = !voiceSessionActive && !typedMode && conversationReviewOnly
  const showingLiveVoiceExperience = liveVoiceEnabled && !typedMode && !showingConversationReview && !showDraftCard
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
  const restartVoiceSession = useCallback(async () => {
    if (loadingConversationMemory) return
    pendingMessageFocusRef.current = null
    setConversationReviewOnly(false)
    setTypedMode(false)
    setVoicePaidAccessGranted(false)
    realtimeBillingSessionIdRef.current = newRealtimeBillingSessionId()
    realtimeAutoStartRef.current = false
    setTranscript('')
    setDraft(null)
    setPendingFollowUpDraft(null)
    setSpokenReplyStatus('idle')
    setRealtimeVoiceStatus(realtimeVoiceUnavailable ? 'failed' : 'idle')
    setRealtimeVoiceError(realtimeVoiceUnavailable ? LIVE_VOICE_DISABLED_MESSAGE : '')
    const accountToken = voiceAccountTokenRef.current
    const hasAccess = await ensureVoicePaidAccess()
    if (!openRef.current || voiceAccountTokenRef.current !== accountToken) return
    if (!hasAccess) { setConversationReviewOnly(true); return }
    setVoicePaidAccessGranted(true)
  }, [ensureVoicePaidAccess, loadingConversationMemory, realtimeVoiceUnavailable])

  const typeVoiceMessage = useCallback(() => {
    if (loadingConversationMemory) return
    endVoiceSession()
    setConversationReviewOnly(false)
    setTypedMode(true)
    setVoiceReplyPreference(false)
    requestMessageInputFocus()
  }, [endVoiceSession, loadingConversationMemory, requestMessageInputFocus, setVoiceReplyPreference])

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
      {visibleForUser && (
        <>
          <Modal visible={open} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => closePanel()}>
            <View style={[styles.panel, showingLiveVoiceExperience && styles.liveVoicePanel]}>
              {!showingLiveVoiceExperience ? <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 12, paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
                <View style={styles.headerCopy}>
                  <Text style={styles.title} numberOfLines={1}>{launchCopy.title}</Text>
                  <Text style={styles.subtitle} numberOfLines={2}>{launchCopy.subtitle}</Text>
                </View>
                <View style={styles.headerActions}>
                  {typedMode ? <Pressable accessibilityRole="button" accessibilityLabel="Read voice transcript" onPress={endVoiceSession} style={styles.iconButton}>
                    <Feather name="file-text" size={20} color={theme.colors.text} />
                  </Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete chat" accessibilityHint="Clear the saved conversation on this device" onPress={deleteChatAndClose} style={styles.deleteChatButton}>
                    <Feather name="trash-2" size={20} color="#B42318" />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => closePanel()} style={styles.iconButton}>
                    <Feather name="x" size={22} color={theme.colors.text} />
                  </Pressable>
                </View>
              </View> : null}

              <ScrollView
                ref={messageScrollRef}
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
                          {realtimeVoiceStatus === 'live' || realtimeVoiceStatus === 'hearing' || realtimeVoiceStatus === 'thinking' || realtimeVoiceStatus === 'speaking' ? (
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
                          : realtimeVoiceStatus === 'hearing'
                          ? 'Hearing you'
                          : realtimeVoiceStatus === 'thinking'
                          ? 'Thinking'
                          : realtimeVoiceStatus === 'live'
                          ? microphoneMuted ? 'Muted' : 'Ready — speak now'
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
                        <Text style={styles.voiceReviewFallbackTitle}>{draft.action === 'recipe_import_url' ? 'Ready to import · 10 credits' : draft.action === 'device_action' ? 'Ready to apply reviewed action' : draft.action === 'report_action' ? draft.reportAction?.action === 'reports.weekly.export_pdf' ? 'Ready to open report PDF' : 'Ready to request report' : draft.action === 'additional_action' ? 'Ready to confirm reviewed action' : draft.action === 'support_action' ? 'Ready to confirm support action' : 'Ready to save'}</Text>
                        <Text style={styles.voiceReviewFallbackSummary} numberOfLines={2}>{draft.summary}</Text>
                        <View style={styles.voiceReviewFallbackButtons}>
                          <Pressable accessibilityRole="button" accessibilityLabel={discardFooterLabel} onPress={rejectDraft} disabled={confirming} style={styles.voiceReviewDiscardButton}>
                            <Text style={styles.voiceReviewDiscardText}>{discardFooterLabel}</Text>
                          </Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel={primaryFooterLabel} onPress={() => void confirmDraft()} disabled={confirming || busy} style={[styles.voiceReviewSaveButton, (confirming || busy) && styles.confirmDisabled]}>
                            {confirming ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.voiceReviewSaveText}>{primaryFooterLabel}</Text>}
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
                      <Pressable accessibilityRole="button" accessibilityLabel="End voice chat" onPress={endVoiceSession} style={styles.voiceControlItem}>
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
                      <Text style={styles.transcriptReviewTitle}>Recent conversation</Text>
                      <Text style={styles.transcriptReviewSubtitle}>{loadingConversationMemory ? 'Loading your transcript…' : 'Saved on this device. The microphone is off.'}</Text>
                    </View>
                    {!loadingConversationMemory && conversationTurns.length === 0 ? <Text style={styles.conversationText}>No recent conversation is saved on this device yet.</Text> : null}
                    <Pressable accessibilityRole="button" accessibilityLabel="Type a message to Helfi" disabled={loadingConversationMemory} onPress={typeVoiceMessage} style={styles.newChatButton}>
                      <Text style={styles.newChatText}>Type a message</Text>
                    </Pressable>
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

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview ? (
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

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview && voiceReply ? (
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

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview ? (
                <View style={styles.contextBox}>
                  <Text style={styles.contextText}>{launchCopy.opener}</Text>
                </View>
                ) : null}

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview && launchCopy.visionLabel ? (
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

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview && visionChoicesOpen ? (
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

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview && voiceRecordingSupported ? (
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
                  (!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview ? (
                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeTitle}>{voiceRecordingSupported ? 'Type a message' : 'Type-only on iPad'}</Text>
                    <Text style={styles.noticeText}>{voiceRecordingSupported ? 'Type your request below. The microphone is off.' : 'Voice input is iPhone only for now. Type your request below.'}</Text>
                  </View>
                  ) : null
                )}
                {!voiceSessionActive && !showingConversationReview && realtimeVoiceError ? (
                  <View style={realtimeVoiceUnavailable ? styles.liveVoiceUnavailableBox : styles.liveVoiceErrorBox}>
                    <Feather name={realtimeVoiceUnavailable ? 'info' : 'alert-circle'} size={18} color={realtimeVoiceUnavailable ? '#226B2C' : '#B42318'} />
                    <Text style={realtimeVoiceUnavailable ? styles.liveVoiceUnavailableText : styles.liveVoiceErrorText}>{realtimeVoiceError}</Text>
                  </View>
                ) : null}

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview && conversationTurns.length > 0 ? (
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

                {(!liveVoiceEnabled || typedMode) && !voiceSessionActive && !showingConversationReview ? (
                <View style={styles.section} onLayout={(event) => {
                  messageSectionYRef.current = event.nativeEvent.layout.y
                  focusRequestedMessageInput()
                }}>
                  <Text style={styles.label}>Message Helfi</Text>
                  <TextInput
                    ref={messageInputRef}
                    value={transcript}
                    onChangeText={(value) => {
                      setTranscript(value)
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
	                    disabled={busy || confirming || !transcript.trim()}
	                    style={[styles.secondaryButton, (busy || confirming || !transcript.trim()) && styles.secondaryDisabled]}
                  >
                    <Text style={styles.secondaryText}>Ask Helfi</Text>
                  </Pressable>
                </View>
                ) : null}

                {!voiceSessionActive && !showingConversationReview && showDraftCard && draft && (
                  <View style={styles.section}>
                    <Text style={styles.label}>{draftIsActionable ? "Helfi's plan" : 'Helfi'}</Text>
                    <Text style={styles.summary}>{draft.summary}</Text>
                    <Text style={styles.message}>{draft.canConfirm ? reviewPromptForDraft(draft, nativeDeviceReviewRef.current) : draft.recipe?.text || draft.confirmationMessage}</Text>
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
                    {draft.food?.nutrition ? (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.creditText}>Estimated nutrition</Text>
                        <NutrientCards values={draft.food.nutrition} />
                      </View>
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
                        <Text style={styles.liveVoiceErrorText}>Save not confirmed: {saveError} Please check the relevant app screen for its current status.</Text>
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
                      accessibilityLabel={voiceRecordingSupported ? 'Start live voice' : 'Type a message to Helfi'}
                      onPress={voiceRecordingSupported ? restartVoiceSession : typeVoiceMessage}
                      disabled={loadingConversationMemory}
                      style={[styles.confirmButton, loadingConversationMemory && styles.confirmDisabled]}
                    >
                      <Text style={styles.confirmText}>{voiceRecordingSupported ? 'Start voice' : 'Type message'}</Text>
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
                          disabled={busy || confirming || !transcript.trim()}
                          style={[styles.confirmButton, (busy || confirming || !transcript.trim()) && styles.confirmDisabled]}
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCE8DF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  deleteChatButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1F0' },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
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
