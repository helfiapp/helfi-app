import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import OpenAI from 'openai'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { CreditManager } from '@/lib/credit-system'
import { chatCompletionWithCost } from '@/lib/metered-openai'
import { logAiUsageEvent } from '@/lib/ai-usage-logger'
import { buildFoodDiarySnapshot } from '@/lib/food-diary-context'
import { estimateTextToSpeechCostCents, estimateTranscriptionCostCents } from '@/lib/cost-meter'
import { searchLocalFoods, type NormalizedFoodItem } from '@/lib/food-data'
import { searchCustomFoodMacros } from '@/lib/food/custom-foods'
import { signNativeVoiceDraft } from '@/lib/native-voice-review-token'
import { assertAiUsageAllowed, isAiSafetyError } from '@/lib/ai-safety'
import { createNativeVoicePromptHandoff } from '@/lib/native-voice-prompt-handoff'
import { findHealthIntakeReviewMatch, type HealthIntakeReviewMatch } from '@/lib/health-intake-review-match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMMAND_MODEL = process.env.HELFI_VOICE_COMMAND_MODEL || 'gpt-5.5'
const COMMAND_FAST_MODEL = process.env.HELFI_VOICE_COMMAND_FAST_MODEL || 'gpt-4o-mini'
const FALLBACK_MODEL = process.env.HELFI_VOICE_COMMAND_FALLBACK_MODEL || 'gpt-5.2'
const TRANSCRIBE_MODEL = process.env.HELFI_VOICE_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
const TTS_MODEL = process.env.HELFI_VOICE_TTS_MODEL || 'gpt-4o-mini-tts'
const SIMPLE_MIN_CREDITS = 3
const VOICE_REPLY_MIN_CREDITS = 2
const RECIPE_MIN_CREDITS = 10
const MAX_AUDIO_BYTES = 12 * 1024 * 1024
const VOICE_PAID_ACCESS_MESSAGE = 'Talk to Helfi needs an active subscription or purchased credits.'

type VoiceAction =
  | 'exercise'
  | 'mood'
  | 'journal'
  | 'food_copy_previous'
  | 'food_favorite'
  | 'food_build_meal'
  | 'food_draft'
  | 'water'
  | 'health_intake_items'
  | 'recipe'
  | 'symptom_analysis'
  | 'symptom_note'
  | 'health_question'
  | 'app_handoff'
  | 'confirm_draft'
  | 'reject_draft'
  | 'unknown'

type VoiceFoodFavorite = {
  id?: string | null
  label: string
  description?: string | null
  meal?: string | null
  nutrition?: any
  total?: any
  items?: any
  raw?: any
}

type VoiceLaunchContext = {
  section: string
  title: string
  mode?: string
  meal?: string
  date?: string
}

type VoiceConversationTurn = {
  role: 'user' | 'assistant'
  text: string
}

type HealthIntakeItemType = 'supplement' | 'medication'

type HealthIntakeVoiceItem = {
  type: HealthIntakeItemType
  name: string
  dosage?: string
  timing?: string[]
  scheduleInfo?: string
  method?: 'voice' | 'photo' | 'manual'
  imageUrl?: string | null
  source?: string
  catalogMatch?: HealthIntakeReviewMatch | null
}

type VoiceDraft = {
  action: VoiceAction
  transcript: string
  localDate: string
  summary: string
  confirmationMessage: string
  canConfirm: boolean
  autoSave?: boolean
  exercise?: {
    exerciseTypeId: number
    exerciseName: string
    durationMinutes: number
    distanceKm?: number | null
    steps?: number | null
    caloriesKcal?: number | null
    intensity?: string | null
    estimatedDuration?: boolean
  }
  mood?: {
    mood: number
    tags: string[]
    note: string
  }
  journal?: {
    title: string
    content: string
    tags: string[]
    journalType?: 'mood' | 'health'
  }
  food?: {
    meal: string
    mealName?: string
    nutrition?: any
    items?: any[]
    sourceDate?: string
    sourceLogIds?: string[]
    entries?: Array<{ name: string; description?: string | null; meal?: string | null }>
    draftText?: string
    favorite?: VoiceFoodFavorite
  }
  recipe?: {
    text: string
    importDraft?: any
  }
  water?: {
    amount: number
    unit: 'ml' | 'l' | 'oz'
    amountMl: number
    label: string
    category?: string | null
    drinkType?: string | null
    sweetener?: {
      type: 'free' | 'sugar' | 'honey'
      amount?: number | null
      unit?: 'g' | 'tsp' | 'tbsp' | null
      grams?: number | null
    } | null
  }
  symptom?: {
    symptoms: string[]
    duration?: string | null
    notes?: string | null
  }
  healthIntake?: {
    items: HealthIntakeVoiceItem[]
  }
  appTarget?: {
    title: string
    path: string
    buttonLabel?: string
    nativeTarget?: any
  }
  reviewNonce?: string
  reviewIssuedAt?: number
  reviewToken?: string
}

const SELF_HARM_RISK_PATTERN =
  /\b(kill myself|hurt myself|hurting myself|harm myself|harming myself|end my life|suicide|suicidal|self[-\s]?harm|do not want to live|don't want to live|want to die|wish i was dead|can't go on|cant go on)\b/i
const MEDICAL_SAFETY_REQUEST_PATTERN =
  /\b(symptom|symptoms|headache|migraine|nausea|vomiting|diarrhea|fever|cough|sore throat|fatigue|dizzy|dizziness|pain|rash|itchy|hives|chest pain|shortness of breath|palpitations|bloating|heartburn|cramps|swelling|diagnose|diagnosis|red flag|red flags|treatment|treat|cure|what could this be|what might this be|what is this|medical image|medical photo|health image|skin photo|rash photo|scan this|check this image)\b/i
const MACEDONIAN_HEALTH_PATTERN =
  /(симптом|симптоми|главоболка|мигрена|мачнина|повраќање|повракање|пролив|дијареја|температура|треска|кашлица|грло|замор|вртоглавица|осип|чеша|градна болка|краток здив|палпитации|надуеност|жиговина|грчеви|оток|дијагноз|лечење|третман|лек|што може да биде|што е ова|дали е сериозно)/i
const MACEDONIAN_MEDICAL_ADVICE_PATTERN =
  /(што е|што може|дијагноз|лечење|третман|лек|совет|препорачај|препорачаj|дали е сериозно|дали треба|доктор|итно|\?)/i
const MACEDONIAN_PAIN_PATTERN = /(^|[^А-Яа-яЃѓЌќЅѕЉљЊњЈј])(болка|болки)(?=$|[^А-Яа-яЃѓЌќЅѕЉљЊњЈј])/i
const ROMANCE_HEALTH_PATTERN =
  /(síntoma|sintoma|symptôme|symptome|sintomi?|sintomas?|dolor\s+de\s+cabeza|mal\s+de\s+tête|mal\s+de\s+tete|mal\s+di\s+testa|dor\s+de\s+cabeça|dor\s+de\s+cabeca|migraña|migraine|emicrania|enxaqueca|náusea|nausea|nausée|nausee|náusea|nausea|vómito|vomito|vomissement|vomito|vômito|vomito|diarrea|diarrhée|diarrhee|diarreia|fiebre|fièvre|fievre|febbre|febre|tos|toux|tosse|dolor\s+de\s+garganta|mal\s+de\s+gorge|mal\s+di\s+gola|dor\s+de\s+garganta|fatiga|fatigue|stanchezza|fadiga|cansaço|cansaco|mareo|vertige|étourdi|etourdi|vertigini|tontura|dolor\s+de\s+pecho|douleur\s+thoracique|dolore\s+al\s+petto|dor\s+no\s+peito|falta\s+de\s+aire|essoufflement|fiato\s+corto|respiro\s+corto|falta\s+de\s+ar|palpitaciones|palpitations|palpitazioni|palpitações|palpitacoes|hinchazón|hinchazon|ballonnement|gonfiore|inchaço|inchaco|acidez|brûlure|brulure|bruciore|azia|calambres|crampes|crampi|cólicas|colicas|hinchazón|gonflement|erupción|erupcion|éruption|eruption|eruzione|erupção|erupcao|picazón|picazon|démangeaison|demangeaison|prurito|coceira|urticaria|urticaire|orticaria|urticária|urticaria|diagnóstico|diagnostico|diagnostic|diagnosi|diagnóstico|diagnostico|tratamiento|traitement|trattamento|tratamento|curar|guérir|guerir|curare|curar|qué\s+puede\s+ser|que\s+puede\s+ser|qu['’]?est-ce\s+que\s+ça\s+peut\s+être|qu['’]?est-ce\s+que\s+ca\s+peut\s+etre|cosa\s+può\s+essere|cosa\s+puo\s+essere|o\s+que\s+pode\s+ser|est-ce\s+grave|es\s+grave|è\s+grave|e\s+grave|é\s+grave|e\s+grave)/i
const ROMANCE_MEDICAL_ADVICE_PATTERN =
  /(qué\s+es|que\s+es|qué\s+puede|que\s+puede|diagnóstico|diagnostico|tratamiento|tratar|curar|consejo|recomienda|es\s+grave|debo|doctor|médico|medico|urgente|qu['’]?est-ce|diagnostic|traitement|soigner|guérir|guerir|conseil|recommande|est-ce\s+grave|docteur|médecin|medecin|urgent|cos['’]?è|cos['’]?e|cosa\s+può|cosa\s+puo|diagnosi|trattamento|curare|consiglio|consiglia|è\s+grave|e\s+grave|devo|dottore|medico|urgente|o\s+que\s+é|o\s+que\s+e|o\s+que\s+pode|diagnóstico|diagnostico|tratamento|tratar|curar|conselho|recomenda|é\s+grave|e\s+grave|devo|médico|medico|urgente|\?)/i
const GERMAN_HEALTH_PATTERN =
  /(symptom|symptome|kopfschmerzen|migräne|migraene|übelkeit|uebelkeit|erbrechen|durchfall|fieber|husten|halsschmerzen|müdigkeit|muedigkeit|schwindel|brustschmerz|atemnot|herzrasen|blähung|blaehung|sodbrennen|krämpfe|kraempfe|schwellung|ausschlag|juckreiz|nesselsucht|diagnose|behandlung|heilen|was\s+könnte\s+das\s+sein|was\s+koennte\s+das\s+sein|was\s+ist\s+das|ist\s+das\s+ernst)/i
const GERMAN_MEDICAL_ADVICE_PATTERN =
  /(was\s+ist|was\s+könnte|was\s+koennte|diagnose|behandlung|behandeln|heilen|rat|empfiehl|ist\s+das\s+ernst|sollte\s+ich|arzt|ärztin|aerztin|dringend|\?)/i

function hasSelfHarmRisk(value: unknown) {
  return SELF_HARM_RISK_PATTERN.test(String(value || ''))
}

function isMedicalSafetyRequest(value: unknown) {
  const text = String(value || '')
  return MEDICAL_SAFETY_REQUEST_PATTERN.test(text) || MACEDONIAN_HEALTH_PATTERN.test(text) || MACEDONIAN_PAIN_PATTERN.test(text) || ROMANCE_HEALTH_PATTERN.test(text) || GERMAN_HEALTH_PATTERN.test(text)
}

function isSymptomTrackingRequest(value: unknown) {
  const text = cleanText(value, 1200)
  if (isPlainHealthToolOpenRequest(text)) return false
  const lower = text.toLowerCase()
  const hasSymptomTerm = MEDICAL_SAFETY_REQUEST_PATTERN.test(lower) || MACEDONIAN_HEALTH_PATTERN.test(text) || MACEDONIAN_PAIN_PATTERN.test(text) || ROMANCE_HEALTH_PATTERN.test(text) || GERMAN_HEALTH_PATTERN.test(text)
  const wantsTracking =
    /\b(record|log|track|add|save|create|write|note|notes|journal)\b/.test(lower) ||
    /(запиши|додај|додаj|зачувај|зачуваj|сними|внеси|белешка|дневник)/i.test(text) ||
    /(registrar|registra|anotar|anota|agrega|añade|anade|guarda|escribe|nota|diario|enregistre|ajoute|écris|ecris|note|journal|registra|annota|aggiungi|salva|scrivi|diario|nota|registra|anota|adiciona|adicione|salva|escreve|escreva|diário|diario|nota|notiere|schreib|schreibe|speichere|trag|trage|tagebuch|notiz)/i.test(text)
  const asksForAdvice =
    /\b(what is this|what could this be|what might this be|diagnose|diagnosis|treat|treatment|cure|should i take|red flag|red flags|is this serious|do i need a doctor)\b/.test(lower) ||
    MACEDONIAN_MEDICAL_ADVICE_PATTERN.test(text) ||
    ROMANCE_MEDICAL_ADVICE_PATTERN.test(text) ||
    GERMAN_MEDICAL_ADVICE_PATTERN.test(text) ||
    lower.includes('?')
  return hasSymptomTerm && wantsTracking && !asksForAdvice
}

function isPlainHealthToolOpenRequest(value: unknown) {
  const raw = cleanText(value, 1200)
  const lower = raw.toLowerCase()
  return (
    /^\s*(?:open|show|go to|take me to)\s+(?:talk to healthy|symptom notes|symptoms|health image notes|health images|medical images|health journal)\s*$/.test(lower) ||
    /^\s*(?:отвори|покажи|оди\s+до|најди|наjди)\s+(?:симптоми|белешки\s+за\s+симптоми|здравствен(?:иот)?\s+дневник|здравствени\s+слики|здравствена\s+слика)\s*$/i.test(raw) ||
    /^\s*(?:öffne|offne|zeige|geh\s+zu|gehe\s+zu|finde)\s+(?:symptome|symptomnotizen|gesundheitstagebuch|gesundheitsbilder|gesundheitsbild)\s*$/i.test(raw)
  )
}

async function rewritePrivateChatPrompt(userId: string, draft: VoiceDraft): Promise<VoiceDraft> {
  const appTarget = draft.appTarget
  if (!appTarget) return draft
  const path = appTarget.path || ''
  if (!path.includes('voicePrompt=')) return draft

  try {
    const url = new URL(path, 'https://helfi.ai')
    const prompt = url.searchParams.get('voicePrompt') || ''
    if (url.pathname !== '/chat' || !prompt) return draft

    const handoff = await createNativeVoicePromptHandoff(userId, prompt)
    url.searchParams.delete('voicePrompt')
    url.searchParams.set('voicePromptToken', handoff.token)
    const nextQuery = url.searchParams.toString()

    return {
      ...draft,
      appTarget: {
        ...appTarget,
        path: `${url.pathname}${nextQuery ? `?${nextQuery}` : ''}`,
      },
    }
  } catch (error) {
    console.warn('[native voice assistant] private prompt handoff failed; opening Talk to Helfi without URL prompt', error)
    return {
      ...draft,
      appTarget: {
        ...appTarget,
        path: '/chat',
      },
    }
  }
}

async function sealReviewDraft(userId: string, draft: VoiceDraft): Promise<VoiceDraft> {
  const preparedDraft = await rewritePrivateChatPrompt(userId, draft)
  if (!preparedDraft?.canConfirm) return preparedDraft
  const enrichedDraft = await enrichHealthIntakeDraftWithCatalogMatches(userId, preparedDraft)
  const reviewableDraft = {
    ...enrichedDraft,
    reviewNonce: crypto.randomUUID(),
    reviewIssuedAt: Date.now(),
  }
  return {
    ...reviewableDraft,
    reviewToken: signNativeVoiceDraft(userId, reviewableDraft),
  }
}

function buildSelfHarmSupportDraft(transcript: string, localDate: string): VoiceDraft {
  const raw = cleanText(transcript, 1200)
  return {
    action: 'health_question',
    transcript: raw,
    localDate,
    summary: 'Urgent support',
    confirmationMessage:
      'If you might hurt yourself or are in immediate danger, call your local emergency number now. I can open Talk to Helfi with your message ready, but please contact urgent support right away.',
    canConfirm: false,
    autoSave: false,
    appTarget: {
      title: 'Talk to Helfi',
      path: `/chat?voicePrompt=${encodeQueryValue(raw, 1200)}`,
      buttonLabel: 'Open Talk to Helfi',
    },
  }
}

function buildMedicalSafetyDraft(transcript: string, localDate: string): VoiceDraft {
  const raw = cleanText(transcript, 1200)
  return {
    action: 'health_question',
    transcript: raw,
    localDate,
    summary: 'General health safety',
    confirmationMessage:
      'Helfi can help you track food, water, mood, and notes, but it cannot review symptoms or health photos, diagnose conditions, or tell you treatment. Please speak with a qualified health professional about symptoms, images, medication, or treatment questions. If symptoms feel urgent, call emergency services.',
    canConfirm: false,
    autoSave: false,
  }
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

async function resolveUser(request: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  const sessionUserId = typeof session?.user?.id === 'string' ? session.user.id : null
  const nativeUserId = sessionUserId ? null : await getUserIdFromNativeAuth(request)
  const userId = sessionUserId || nativeUserId
  if (!userId) return null
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  })
}

function hasPaidVoiceWalletAccess(wallet: any) {
  const topUpsAvailable = Array.isArray(wallet?.topUps)
    ? wallet.topUps.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.availableCents || 0)), 0)
    : 0
  const additionalAvailable = Math.max(0, Number(wallet?.additionalCreditsCents || 0))
  return Boolean(wallet?.plan) || topUpsAvailable > 0 || additionalAvailable > 0
}

function voicePaidAccessResponse() {
  return NextResponse.json(
    { error: VOICE_PAID_ACCESS_MESSAGE, code: 'voice_subscription_required', requiresSubscription: true },
    { status: 402 },
  )
}

function localDateFromRequest(raw: unknown, tzOffsetRaw: unknown) {
  const requested = typeof raw === 'string' ? raw.trim() : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested
  const offset = Number(tzOffsetRaw)
  const tzOffsetMin = Number.isFinite(offset) ? offset : new Date().getTimezoneOffset()
  return new Date(Date.now() - tzOffsetMin * 60 * 1000).toISOString().slice(0, 10)
}

function shiftLocalDate(localDate: string, deltaDays: number) {
  const [year, month, day] = localDate.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function cleanText(value: unknown, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hasAiConsentFlag(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'granted' || text === 'yes'
}

function cleanWakePhrase(value: unknown) {
  return cleanText(value, 2000)
    .replace(/^\s*(?:hey\s+)?(?:helfi|healthy|talk\s+to\s+helfi|talk\s+to\s+healthy)[,.\s:;-]+/i, '')
    .replace(/^\s*(?:hey\s+)?(?:helfi|healthy)\s*$/i, '')
    .trim()
}

function normalizeControlText(value: unknown) {
  return cleanText(value, 120)
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
  'зачувај',
  'потврди',
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
  'не',
  'откажи',
  'не зачувувај',
])

function isConfirmingDraftText(value: unknown) {
  return CONFIRM_DRAFT_TEXTS.has(normalizeControlText(value))
}

function isRejectingDraftText(value: unknown) {
  return REJECT_DRAFT_TEXTS.has(normalizeControlText(value))
}

function normalizeLaunchContext(raw: any): VoiceLaunchContext {
  const parsed =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw)
          } catch {
            return {}
          }
        })()
      : raw && typeof raw === 'object'
      ? raw
      : {}
  return {
    section: cleanText(parsed?.section || 'generic', 40).toLowerCase() || 'generic',
    title: cleanText(parsed?.title || 'Helfi', 80) || 'Helfi',
    mode: cleanText(parsed?.mode || '', 40).toLowerCase() || undefined,
    meal: cleanText(parsed?.meal || '', 40).toLowerCase() || undefined,
    date: cleanText(parsed?.date || '', 20) || undefined,
  }
}

function launchContextLine(context: VoiceLaunchContext) {
  const parts = [`section=${context.section}`, `title=${context.title}`]
  if (context.mode) parts.push(`mode=${context.mode}`)
  if (context.meal) parts.push(`meal=${context.meal}`)
  if (context.date) parts.push(`date=${context.date}`)
  return parts.join(', ')
}

function conversationHistoryLine(history: VoiceConversationTurn[]) {
  const lines = history
    .slice(-6)
    .map((turn) => `${turn.role === 'assistant' ? 'Helfi' : 'User'}: ${cleanText(turn.text, 220)}`)
    .filter(Boolean)
  return lines.length ? lines.join('\n') : 'No recent in-panel conversation.'
}

function encodeQueryValue(value: unknown, max = 1000) {
  return encodeURIComponent(cleanText(value, max))
}

function encodeUrlJson(value: any) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

const SUPPLEMENT_NAME_HINT_PATTERN =
  /\b(vitamin|supplement|magnesium|fish oil|omega|probiotic|creatine|zinc|iron|calcium|collagen|protein powder|ashwagandha|melatonin|coq10|coq-10|turmeric|curcumin|berberine|folate|b12|d3|multivitamin)\b/i
const MEDICATION_NAME_HINT_PATTERN =
  /\b(medication|medicine|prescription|metformin|atorvastatin|rosuvastatin|simvastatin|amlodipine|lisinopril|losartan|levothyroxine|thyroxine|insulin|ozempic|semaglutide|warfarin|apixaban|eliquis|xarelto|clopidogrel|aspirin|panadol|paracetamol|ibuprofen|omeprazole|pantoprazole|sertraline|fluoxetine)\b/i
const HEALTH_INTAKE_RECORD_PATTERN =
  /\b(i\s+take|i['’]?m\s+taking|i['’]?m\s+on|i\s+am\s+on|i\s+use|i['’]?m\s+prescribed|i\s+am\s+prescribed|prescribed|currently\s+taking|current\s+(?:medications?|medicines?|supplements?|vitamins?)|add\s+(?:these|my)?\s*(?:medications?|medicines?|supplements?|vitamins?)|record\s+(?:these|my)?\s*(?:medications?|medicines?|supplements?|vitamins?)|log\s+(?:these|my)?\s*(?:medications?|medicines?|supplements?|vitamins?)|(?:add|record|log)\b[\s\S]{1,180}\b(?:to\s+(?:my\s+)?health\s+intake|to\s+(?:my\s+)?onboarding))\b/i
const HEALTH_INTAKE_ADVICE_PATTERN =
  /\b(should\s+i|can\s+i|could\s+i|do\s+i\s+need|recommend|recommended|start|stop|change|increase|decrease|safe\s+to|interact|interaction|side\s+effect|side-effect|treat|treatment|diagnose|diagnosis)\b/i
const HEALTH_INTAKE_GROUP_WORDS = String.raw`(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)`
const HEALTH_INTAKE_EMPTY_PREFIX_WORDS = String.raw`(?:(?:i\s+do\s+not|i\s+don['’]?t|i\s+dont|i['’]?m\s+not|i\s+am\s+not)\s+(?:take|use|take\s+any|use\s+any|on|prescribed)\s+(?:any\s+)?|(?:i\s+take|i\s+use|i['’]?m\s+on|i\s+am\s+on)\s+(?:no|none|not\s+any|without)\s+|(?:no|none|not\s+any|without)\s+)`
const HEALTH_INTAKE_EMPTY_ITEM_LIST = String.raw`${HEALTH_INTAKE_EMPTY_PREFIX_WORDS}${HEALTH_INTAKE_GROUP_WORDS}(?:\s+(?:or|and)\s+${HEALTH_INTAKE_GROUP_WORDS})*`
const HEALTH_INTAKE_EMPTY_EXCEPTION_PATTERN = new RegExp(
  String.raw`${HEALTH_INTAKE_EMPTY_ITEM_LIST}\s*,?\s+(?:but|except|besides|other\s+than|apart\s+from|only|just)\b`,
  'i',
)
const HEALTH_INTAKE_EMPTY_EXCEPTION_SEPARATOR_PATTERN = new RegExp(
  String.raw`(${HEALTH_INTAKE_EMPTY_ITEM_LIST})\s*,?\s+(?:but|except|besides|other\s+than|apart\s+from|only|just)\b`,
  'gi',
)

function normalizeHealthIntakeType(raw: unknown, name: unknown, fallback?: HealthIntakeItemType): HealthIntakeItemType | null {
  const source = `${cleanText(raw, 80)} ${cleanText(name, 120)}`.toLowerCase()
  if (/\b(medication|medicine|prescription|drug|rx)\b/.test(source) || MEDICATION_NAME_HINT_PATTERN.test(source)) return 'medication'
  if (/\b(supplement|vitamin|mineral|herb|nutraceutical)\b/.test(source) || SUPPLEMENT_NAME_HINT_PATTERN.test(source)) return 'supplement'
  return fallback || null
}

function normalizeHealthIntakeTiming(value: any): string[] {
  const rawItems = Array.isArray(value) ? value : value ? [value] : []
  const normalized = rawItems
    .map((item) => {
      const text = cleanText(item, 80).toLowerCase()
      if (!text) return ''
      if (/twice\s+daily|twice\s+a\s+day|two\s+times\s+(?:daily|a\s+day)/.test(text)) return 'Twice Daily'
      if (/three\s+times\s+(?:daily|a\s+day)|3\s+times\s+(?:daily|a\s+day)/.test(text)) return 'Three Times Daily'
      if (/once\s+daily|once\s+a\s+day|daily|every\s+day/.test(text)) return 'Daily'
      if (/as\s+needed|when\s+needed|prn/.test(text)) return 'As Needed'
      if (/before\s+bed|bedtime|night/.test(text)) return 'Before Bed'
      if (/morning|breakfast/.test(text)) return 'Morning'
      if (/afternoon|lunch/.test(text)) return 'Afternoon'
      if (/evening|dinner/.test(text)) return 'Evening'
      return text.charAt(0).toUpperCase() + text.slice(1)
    })
    .filter(Boolean)
  return Array.from(new Set(normalized)).slice(0, 6)
}

function extractDoseText(raw: string) {
  const doseMatch = raw.match(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s*(?:mg|mcg|g|iu|ius|ml|tablet|tablets|capsule|capsules|drop|drops|tsp|tbsp)\b/i)
  return cleanText(doseMatch?.[0] || '', 80)
}

function extractTimingText(raw: string) {
  const timings: string[] = []
  if (/\b(?:once\s+(?:daily|a\s+day|per\s+day)|daily|every\s+day)\b/i.test(raw)) timings.push('Daily')
  if (/\b(?:twice\s+(?:daily|a\s+day|per\s+day)|two\s+times\s+(?:daily|a\s+day|per\s+day))\b/i.test(raw)) timings.push('Twice Daily')
  if (/\b(?:three\s+times\s+(?:daily|a\s+day|per\s+day)|3\s+times\s+(?:daily|a\s+day|per\s+day))\b/i.test(raw)) timings.push('Three Times Daily')
  if (/\b(?:as\s+needed|when\s+needed|prn)\b/i.test(raw)) timings.push('As Needed')
  if (/\b(?:in\s+the\s+)?morning|with\s+breakfast\b/i.test(raw)) timings.push('Morning')
  if (/\b(?:in\s+the\s+)?afternoon|with\s+lunch\b/i.test(raw)) timings.push('Afternoon')
  if (/\b(?:in\s+the\s+)?evening|with\s+dinner\b/i.test(raw)) timings.push('Evening')
  if (/\b(?:at\s+)?night|nightly|before\s+bed|bedtime\b/i.test(raw)) timings.push('Before Bed')
  return Array.from(new Set(timings))
}

function normalizeHealthIntakeItem(raw: any, fallbackType?: HealthIntakeItemType): HealthIntakeVoiceItem | null {
  const nameSource =
    raw && typeof raw === 'object'
      ? raw.name || raw.productName || raw.product || raw.label || raw.medication || raw.supplement || raw.vitamin
      : raw
  const name = cleanText(nameSource, 160)
  if (!name) return null
  const type = normalizeHealthIntakeType(raw?.type || raw?.itemType || raw?.category, name, fallbackType)
  if (!type) return null
  const dosage =
    cleanText(raw?.dosage || raw?.dose || raw?.amountText || raw?.strength || '', 80) ||
    (raw?.amount && raw?.unit ? cleanText(`${raw.amount} ${raw.unit}`, 80) : '')
  const timing = normalizeHealthIntakeTiming(raw?.timing || raw?.times || raw?.timeOfDay || raw?.time)
  return {
    type,
    name,
    dosage,
    timing,
    scheduleInfo: cleanText(raw?.scheduleInfo || raw?.schedule || '', 80) || 'Daily',
    method: raw?.method === 'photo' ? 'photo' : raw?.method === 'manual' ? 'manual' : 'voice',
    imageUrl: cleanText(raw?.imageUrl, 400) || null,
    source: cleanText(raw?.source, 80) || 'voice',
  }
}

function dedupeHealthIntakeItems(items: HealthIntakeVoiceItem[]) {
  const seen = new Set<string>()
  const result: HealthIntakeVoiceItem[] = []
  items.forEach((item) => {
    const timing = (item.timing || []).join('|').toLowerCase()
    const key = `${item.type}|${item.name.toLowerCase()}|${cleanText(item.dosage, 80).toLowerCase()}|${timing}`
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

async function enrichHealthIntakeDraftWithCatalogMatches(userId: string, draft: VoiceDraft) {
  if (draft.action !== 'health_intake_items' || !Array.isArray(draft.healthIntake?.items)) return draft
  const items = await Promise.all(
    draft.healthIntake.items.map(async (item) => ({
      ...item,
      catalogMatch: item.catalogMatch || (await findHealthIntakeReviewMatch(item.type, item.name)),
    })),
  )
  return { ...draft, healthIntake: { items } }
}

function healthIntakeItemLine(item: HealthIntakeVoiceItem) {
  const label = item.type === 'medication' ? 'Medication' : 'Supplement'
  const dose = cleanText(item.dosage, 80) || 'dose not specified'
  const timing = item.timing?.length ? item.timing.join(', ') : 'timing not specified'
  return `${label}: ${item.name} (${dose}; ${timing})`
}

function buildHealthIntakeItemsDraft(
  rawItems: any[],
  transcript: string,
  localDate: string,
  fallbackType?: HealthIntakeItemType,
): VoiceDraft | null {
  const items = dedupeHealthIntakeItems(
    rawItems
      .map((item) => normalizeHealthIntakeItem(item, fallbackType))
      .filter(Boolean) as HealthIntakeVoiceItem[],
  ).slice(0, 20)
  if (!items.length) return null
  const medications = items.filter((item) => item.type === 'medication').length
  const supplements = items.filter((item) => item.type === 'supplement').length
  const lines = items.map(healthIntakeItemLine)
  const counts = [
    medications ? `${medications} medication${medications === 1 ? '' : 's'}` : '',
    supplements ? `${supplements} supplement${supplements === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' and ')
  return {
    action: 'health_intake_items',
    transcript: cleanText(transcript, 1200),
    localDate,
    summary: `Health Intake: ${counts}`,
    confirmationMessage:
      `I can add these to Health Intake for review:\n${lines.join('\n')}\n\n` +
      'I am only recording what you already take. I am not recommending that you start, stop, or change any medication or supplement. For medication decisions, speak with your clinician.',
    canConfirm: true,
    autoSave: false,
    healthIntake: { items },
  }
}

function buildEmptyHealthIntakeItemsDraft(transcript: string, localDate: string): VoiceDraft {
  return {
    action: 'health_intake_items',
    transcript: cleanText(transcript, 1200),
    localDate,
    summary: 'Health Intake: no items to add',
    confirmationMessage:
      'Got it. I will not add any medications, vitamins, or supplements from that message. If you do take any, you can tell me their names or show me the bottle label for review.',
    canConfirm: false,
    autoSave: false,
    healthIntake: { items: [] },
  }
}

function cleanHealthIntakeNamePart(value: string) {
  return cleanText(value, 160)
    .replace(/\b(?:my\s+)?(?:current\s+)?vitamins?\s+(?:are|include|includes)\b/gi, ' ')
    .replace(/\b(?:i\s+do\s+not|i\s+don['’]?t|i\s+dont|i['’]?m\s+not|i\s+am\s+not|not)\s+(?:take|taking|on|using|prescribed)?\s*(?:any\s+)?(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)\b/gi, ' ')
    .replace(/\b(?:no|none)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)\b/gi, ' ')
    .replace(/\b(?:i\s+take|i['’]?m\s+taking|i['’]?m\s+on|i\s+am\s+on|i\s+use|i['’]?m\s+prescribed|i\s+am\s+prescribed|prescribed|currently\s+taking|my\s+current|current|medications?|medicines?|prescriptions?|drugs?|rx|supplements?|are|include|includes|add|record|log|these|to\s+my\s+onboarding|to\s+health\s+intake|to\s+my\s+health\s+intake)\b/gi, ' ')
    .replace(/\b(?:in\s+the\s+morning|in\s+the\s+afternoon|in\s+the\s+evening|at\s+night|before\s+bed|with\s+breakfast|with\s+lunch|with\s+dinner|once\s+(?:daily|a\s+day|per\s+day)|twice\s+(?:daily|a\s+day|per\s+day)|two\s+times\s+(?:daily|a\s+day|per\s+day)|three\s+times\s+(?:daily|a\s+day|per\s+day)|3\s+times\s+(?:daily|a\s+day|per\s+day)|daily|every\s+day|as\s+needed|when\s+needed|prn)\b/gi, ' ')
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s*(?:mg|mcg|g|iu|ius|ml|tablet|tablets|capsule|capsules|drop|drops|tsp|tbsp)\b/gi, ' ')
    .replace(/\b(?:but|just|only|except|besides|other\s+than|apart\s+from)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:of|for)\s+/i, '')
    .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
}

function isNegativeHealthIntakePart(value: string) {
  const text = cleanText(value, 220)
  return (
    /^(?:not|no|none|without)\b/i.test(text) ||
    /^(?:i\s+do\s+not|i\s+don['’]?t|i\s+dont|i['’]?m\s+not|i\s+am\s+not)\b/i.test(text) ||
    /^(?:take|use)\s+(?:no|none|not\s+any|without)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)\b/i.test(text) ||
    /\b(?:i\s+take|i\s+use|i['’]?m\s+on|i\s+am\s+on)\s+(?:no|none|not\s+any|without)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)\b/i.test(text)
  )
}

function isEmptyHealthIntakeRequest(value: string) {
  const text = cleanText(value, 300)
  const mentionsHealthIntakeItems = /\b(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)\b/i.test(text)
  if (!mentionsHealthIntakeItems) return false
  return (
    /\b(?:i\s+do\s+not|i\s+don['’]?t|i\s+dont|i['’]?m\s+not|i\s+am\s+not)\s+(?:take|use|take\s+any|use\s+any|on|prescribed)\s+(?:any\s+)?(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)(?:\s+(?:or|and)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?))*\b/i.test(text) ||
    /\b(?:i\s+take|i\s+use|i['’]?m\s+on|i\s+am\s+on)\s+(?:no|none|not\s+any|without)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)(?:\s+(?:or|and)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?))*\b/i.test(text) ||
    /\b(?:no|none|not\s+any|without)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?)(?:\s+(?:or|and)\s+(?:medications?|medicines?|prescriptions?|drugs?|rx|supplements?|vitamins?))*\b/i.test(text)
  )
}

function tryParseHealthIntakeItemsRequest(transcript: string, localDate: string, launchContext?: VoiceLaunchContext): VoiceDraft | null {
  const raw = cleanText(transcript, 1200)
  if (!raw || HEALTH_INTAKE_ADVICE_PATTERN.test(raw)) return null
  const inHealthIntake = launchContext?.section === 'health-intake'
  const emptyHealthIntakeRequest = isEmptyHealthIntakeRequest(raw)
  const looksRelevant =
    HEALTH_INTAKE_RECORD_PATTERN.test(raw) ||
    (inHealthIntake && (SUPPLEMENT_NAME_HINT_PATTERN.test(raw) || MEDICATION_NAME_HINT_PATTERN.test(raw) || emptyHealthIntakeRequest))
  const hasExceptionItem = HEALTH_INTAKE_EMPTY_EXCEPTION_PATTERN.test(raw)
  if (!looksRelevant) return null
  if (emptyHealthIntakeRequest && !hasExceptionItem) {
    return buildEmptyHealthIntakeItemsDraft(raw, localDate)
  }
  const fallbackType: HealthIntakeItemType | undefined =
    /\b(?:current\s+(?:medications?|medicines?)|i['’]?m\s+prescribed|i\s+am\s+prescribed|prescribed)\b/i.test(raw) &&
    !/\b(?:supplements?|vitamins?)\b/i.test(raw)
      ? 'medication'
      : /\b(?:current\s+(?:supplements?|vitamins?)|supplements?|vitamins?)\b/i.test(raw) &&
        !/\b(?:medications?|medicines?|prescriptions?|prescribed)\b/i.test(raw)
      ? 'supplement'
      : undefined

  const normalizedList = raw
    .replace(HEALTH_INTAKE_EMPTY_EXCEPTION_SEPARATOR_PATTERN, '$1,')
    .replace(/\band\b/gi, ',')
    .replace(/\bbut\b/gi, ',')
    .replace(/\bplus\b/gi, ',')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !isNegativeHealthIntakePart(part))

  const items = normalizedList
    .map((part) => {
      let name = cleanHealthIntakeNamePart(part)
      if (fallbackType === 'supplement' && /\bvitamins?\b/i.test(raw) && /^[a-z]\d*$/i.test(name)) {
        name = `vitamin ${name}`
      }
      if (!name) return null
      const statedType = normalizeHealthIntakeType(part, part)
      return {
        name,
        dosage: extractDoseText(part),
        timing: extractTimingText(part),
        type: statedType || normalizeHealthIntakeType('', name) || fallbackType || undefined,
        method: 'voice',
        source: 'voice',
      }
    })
    .filter(Boolean)

  return buildHealthIntakeItemsDraft(items, raw, localDate, fallbackType)
}

function compactFoodMatchText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|my|me|please|can|you|put|in|add|log|have|had|for|today|to|diary|meal)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const INGREDIENT_LOOKUP_FILLER_WORDS = new Set([
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'half',
  'small',
  'medium',
  'large',
  'extra',
  'xl',
  'slice',
  'slices',
  'gram',
  'grams',
  'g',
  'kg',
  'ml',
  'cup',
  'cups',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'teaspoon',
  'teaspoons',
  'tsp',
  'of',
])

function singularFoodToken(token: string) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (token.endsWith('es') && token.length > 3 && !/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2)
  if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function singularFoodText(value: string) {
  return compactFoodMatchText(value).split(' ').filter(Boolean).map(singularFoodToken).join(' ')
}

function stripIngredientLookupModifiers(value: unknown) {
  const tokens = compactFoodMatchText(value).split(' ').filter(Boolean)
  return tokens
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !INGREDIENT_LOOKUP_FILLER_WORDS.has(token))
    .join(' ')
}

function stripVoiceFoodCommandWords(value: string) {
  return cleanText(value, 1200)
    .replace(/\b(can you|could you|please|i want to|i need to|i would like to|i'd like to|help me)\b/gi, ' ')
    .replace(/\b(add|log|logged|lobbed|put|input|record|track|save|create|make|build|enter)\b/gi, ' ')
    .replace(/\b(new|a|an|my|this|that)\b/gi, ' ')
    .replace(/\b(food|foods|meal|meals|ingredient|ingredients|entry|diary|log)\b/gi, ' ')
    .replace(/\b(as|for)\s+(?:a\s+|an\s+|my\s+)?(breakfast|lunch|dinner|snacks?|meal)\b/gi, ' ')
    .replace(/\b(to|into|in)\s+(?:my\s+)?(?:food\s+)?(?:diary|log|breakfast|lunch|dinner|snacks?)\b/gi, ' ')
    .replace(/\b(breakfast|lunch|dinner|snacks?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildIngredientLookupQueries(query: string) {
  const compactQuery = compactFoodMatchText(query)
  const strippedQuery = stripIngredientLookupModifiers(query)
  const queries = new Set<string>()
  const add = (value: unknown) => {
    const cleaned = cleanText(value, 120)
    if (cleaned) queries.add(cleaned)
  }

  add(strippedQuery)
  add(singularFoodText(strippedQuery))
  if (strippedQuery.includes('greek yogurt') || strippedQuery.includes('greek yoghurt')) {
    add('greek yogurt')
    add('plain greek yogurt')
    add('greek yoghurt')
    add('plain greek yoghurt')
  }
  if (strippedQuery === 'rice') {
    add('cooked rice')
    add('white rice')
    add('brown rice')
  }
  if (strippedQuery === 'coffee') {
    add('brewed coffee')
    add('black coffee')
  }
  if (strippedQuery.includes('nashi')) {
    add('asian pear')
    add('pear')
    add('apple')
  }
  if (strippedQuery.includes('protein shake')) {
    add('protein shake')
    add('protein drink')
  }
  if (/\b(toast|bread|sourdough)\b/.test(strippedQuery) && !/\bfrench toast\b/.test(strippedQuery)) {
    add('sourdough toast')
    add('toasted bread')
    add('sourdough bread')
    add('bread')
  }
  add(compactQuery)
  add(query)
  return Array.from(queries)
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]
  }
  return prev[b.length]
}

function inferMealFromText(text: string, fallback?: string | null) {
  const normalized = compactFoodMatchText(text)
  if (/\bbreakfast\b/.test(normalized)) return 'breakfast'
  if (/\blunch\b/.test(normalized)) return 'lunch'
  if (/\bdinner\b/.test(normalized)) return 'dinner'
  if (/\bsnack|snacks\b/.test(normalized)) return 'snacks'
  return cleanText(fallback || 'uncategorized', 40).toLowerCase() || 'uncategorized'
}

function macedonianMealFromText(value: string) {
  if (/појадок/i.test(value)) return 'breakfast'
  if (/ручек/i.test(value)) return 'lunch'
  if (/вечера/i.test(value)) return 'dinner'
  if (/ужина/i.test(value)) return 'snacks'
  return ''
}

function localizedMealFromText(value: string) {
  const macedonianMeal = macedonianMealFromText(value)
  if (macedonianMeal) return macedonianMeal
  if (/(desayuno|petit[-\s]?déjeuner|petit[-\s]?dejeuner|frühstück|fruehstueck|colazione|café\s+da\s+manhã|cafe\s+da\s+manha|pequeno[-\s]?almoço|pequeno[-\s]?almoco|早餐|早饭|早飯|فطور|افطار|إفطار|نाश्ता)/i.test(value)) return 'breakfast'
  if (/(almuerzo|déjeuner|dejeuner|mittagessen|pranzo|almoço|almoco|午餐|午饭|午飯|غداء|غدائي|لंच|दोपहर का खाना|लंच)/i.test(value)) return 'lunch'
  if (/(cena|dîner|diner|abendessen|晚餐|晚饭|晚飯|عشاء|रात का खाना|डिनर)/i.test(value)) return 'dinner'
  if (/(merienda|collation|snack|zwischenmahlzeit|spuntino|lanche|零食|点心|點心|سناك|وجبة خفيفة|स्नैक)/i.test(value)) return 'snacks'
  if (/(朝食|朝ごはん)/i.test(value)) return 'breakfast'
  if (/(昼食|昼ごはん|ランチ)/i.test(value)) return 'lunch'
  if (/(夕食|晩ごはん|夕ごはん|ディナー)/i.test(value)) return 'dinner'
  if (/(おやつ|間食)/i.test(value)) return 'snacks'
  return ''
}

function macedonianFoodItemsFromText(value: string) {
  const text = cleanText(value, 1400).toLowerCase()
  const items: string[] = []

  if (/(?:едно|една|1)\s+јаболк[оа]?/i.test(text)) items.push('one apple')
  else if (/(?:две|2)\s+јаболк[а]?/i.test(text)) items.push('two apples')
  else if (/јаболк[оа]?/i.test(text)) items.push('apple')

  const peanutGramMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:г|гр|грама?)\s+кикирики/i)
  if (peanutGramMatch?.[1]) items.push(`${peanutGramMatch[1]} g peanuts`)
  else if (/(?:триесет)\s+грама?\s+кикирики/i.test(text)) items.push('30 g peanuts')
  else if (/(?:малку|неколку)\s+кикирики/i.test(text)) items.push('some peanuts')
  else if (/кикирики/i.test(text)) items.push('peanuts')

  if (/(?:една|1)\s+банан[а]?/i.test(text)) items.push('one banana')
  else if (/(?:две|2)\s+банан[и]?/i.test(text)) items.push('two bananas')
  else if (/банан[аи]?/i.test(text)) items.push('banana')

  return items
}

function romanceAndGermanFoodItemsFromText(value: string) {
  const text = cleanText(value, 1400).toLowerCase()
  const items: string[] = []

  if (/(?:una|un|une|uma|um|1)\s+pomm?e|(?:ein|eine|einen|1)\s+apfel|(?:una|un|1)\s+manzana|(?:una|un|1)\s+mela|(?:uma|um|1)\s+maçã|(?:uma|um|1)\s+maca/i.test(text)) items.push('one apple')
  else if (/(?:dos|deux|zwei|due|duas|dois|2)\s+(?:manzanas|pommes|äpfel|aepfel|mele|maçãs|macas)/i.test(text)) items.push('two apples')
  else if (/(manzana|pomme|apfel|äpfel|aepfel|mela|mele|maçã|maca|maçãs|macas)/i.test(text)) items.push('apple')

  const peanutGramMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos?|grammes?|gramm|grammi|gramas?)\s+(?:de\s+|d['’]\s*|di\s+|of\s+)?(?:cacahuetes|cacahuètes|arachides|maní|mani|erdnüsse|erdnusse|arachidi|noccioline|amendoim|amendoins)/i)
  if (peanutGramMatch?.[1]) items.push(`${peanutGramMatch[1].replace(',', '.')} g peanuts`)
  else if (/(?:treinta|trente|dreißig|dreissig|trenta|trinta)\s+(?:gramos?|grammes?|gramm|grammi|gramas?)\s+(?:de\s+|d['’]\s*|di\s+)?(?:cacahuetes|cacahuètes|arachides|maní|mani|erdnüsse|erdnusse|arachidi|noccioline|amendoim|amendoins)/i.test(text)) items.push('30 g peanuts')
  else if (/(?:algunos|unas pocas|quelques|un peu de|ein paar|etwas|un po'?\s+di|alcune|alguns|um pouco de)\s+(?:cacahuetes|cacahuètes|arachides|maní|mani|erdnüsse|erdnusse|arachidi|noccioline|amendoim|amendoins)/i.test(text)) items.push('some peanuts')
  else if (/(cacahuetes|cacahuètes|arachides|maní|mani|erdnüsse|erdnusse|arachidi|noccioline|amendoim|amendoins)/i.test(text)) items.push('peanuts')

  if (/(?:una|un|une|uma|um|1)\s+(?:banana|banane|plátano|platano)/i.test(text)) items.push('one banana')
  else if (/(?:dos|deux|zwei|due|duas|dois|2)\s+(?:bananas|bananes|plátanos|platanos)/i.test(text)) items.push('two bananas')
  else if (/(banana|banane|plátano|platano)/i.test(text)) items.push('banana')

  return items
}

function translateLocalizedFoodRequest(transcript: string, launchContext?: VoiceLaunchContext) {
  const text = cleanText(transcript, 1400)
  const hasFoodAction =
    /(додај|додаj|зачувај|зачуваj|запиши|внеси|логирај|логираj|јадев|jадев|изедов)/i.test(text) ||
    /(agrega|añade|anade|registra|guarda|comí|comi|he comido|j'ai mangé|j'ai mange|ajoute|enregistre|aggiungi|registra|salva|ho mangiato|adiciona|adicione|registra|salva|comi|eu comi|füge|fuge|trage|notiere|speichere|gegessen)/i.test(text) ||
    launchContext?.section === 'food'
  if (!hasFoodAction) return text

  const items = [...macedonianFoodItemsFromText(text), ...romanceAndGermanFoodItemsFromText(text)]
  if (!items.length) return text

  const meal = localizedMealFromText(text) || (launchContext?.section === 'food' ? launchContext.meal || 'breakfast' : '')
  return `add ${items.join(' and ')}${meal ? ` for ${meal}` : ''}`
}

function inferTargetMealFromText(text: string, fallback?: string | null) {
  const match = compactFoodMatchText(text).match(/\b(?:to|for|as|into|in)\s+(?:my\s+)?(breakfast|lunch|dinner|snacks?|snack)\b/)
  if (match?.[1]) return match[1].startsWith('snack') ? 'snacks' : match[1]
  return inferMealFromText(text, fallback)
}

function normalizeWaterUnit(value: string): 'ml' | 'l' | 'oz' | null {
  const unit = value.toLowerCase()
  if (unit === 'ml' || unit === 'мл' || unit.includes('millilitre') || unit.includes('milliliter') || unit.includes('милилит')) return 'ml'
  if (unit === 'l' || unit === 'л' || unit.includes('litre') || unit.includes('liter') || unit.includes('литар') || unit.includes('литри')) return 'l'
  if (unit === 'oz' || unit.includes('ounce')) return 'oz'
  return null
}

function waterAmountToMl(amount: number, unit: 'ml' | 'l' | 'oz') {
  if (unit === 'l') return Math.round(amount * 1000 * 10) / 10
  if (unit === 'oz') return Math.round(amount * 29.5735 * 10) / 10
  return Math.round(amount * 10) / 10
}

function parseWaterAmount(text: string): { amount: number; unit: 'ml' | 'l' | 'oz'; amountMl: number } | null {
  const lower = text.toLowerCase()
  const explicit = lower.match(/\b(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?)\b/)
  if (explicit) {
    const amount = Number(explicit[1])
    const unit = normalizeWaterUnit(explicit[2])
    if (Number.isFinite(amount) && amount > 0 && unit) return { amount, unit, amountMl: waterAmountToMl(amount, unit) }
  }
  const macedonianExplicit = lower.match(/(\d+(?:[.,]\d+)?)\s*(мл|милилитри?|л|литри?|литра|литар)/i)
  if (macedonianExplicit) {
    const amount = Number(macedonianExplicit[1].replace(',', '.'))
    const unit = normalizeWaterUnit(macedonianExplicit[2])
    if (Number.isFinite(amount) && amount > 0 && unit) return { amount, unit, amountMl: waterAmountToMl(amount, unit) }
  }
  if (/\b(glass|cup)\b/.test(lower)) return { amount: 250, unit: 'ml', amountMl: 250 }
  if (/\b(bottle)\b/.test(lower)) return { amount: 600, unit: 'ml', amountMl: 600 }
  if (/(чаша|шоља|шоља)/i.test(text)) return { amount: 250, unit: 'ml', amountMl: 250 }
  if (/(шише)/i.test(text)) return { amount: 600, unit: 'ml', amountMl: 600 }
  return null
}

function inferDrinkType(text: string) {
  const lower = text.toLowerCase()
  if (/\bhot chocolate|cocoa\b/.test(lower)) return 'Hot chocolate'
  if (/\bcoffee|espresso|latte|cappuccino|flat white\b/.test(lower)) return 'Coffee'
  if (/\btea\b/.test(lower)) return 'Tea'
  if (/\bjuice\b/.test(lower)) return 'Juice'
  if (/\bmilk\b/.test(lower)) return 'Milk'
  if (/\bsoft drink|soda|coke zero|coke|cola|lemonade\b/.test(lower)) return 'Soft drink'
  if (/\bwater|hydration\b/.test(lower)) return 'Water'
  if (/(кафе|еспресо|капучино|лате)/i.test(text)) return 'Coffee'
  if (/(чај|чаj)/i.test(text)) return 'Tea'
  if (/(сок)/i.test(text)) return 'Juice'
  if (/(млеко)/i.test(text)) return 'Milk'
  if (/(вода|хидратац)/i.test(text)) return 'Water'
  if (/(café|cafe)/i.test(text)) return 'Coffee'
  if (/(thé|té)/i.test(text)) return 'Tea'
  if (/(jus|jugo|zumo)/i.test(text)) return 'Juice'
  if (/(lait|leche)/i.test(text)) return 'Milk'
  if (/(eau|agua)/i.test(text)) return 'Water'
  if (/(caffè|caffe|espresso|latte|cappuccino)/i.test(text)) return 'Coffee'
  if (/(tè|te)/i.test(text)) return 'Tea'
  if (/(succo)/i.test(text)) return 'Juice'
  if (/(latte)/i.test(text)) return 'Milk'
  if (/(acqua)/i.test(text)) return 'Water'
  if (/(café|cafe)/i.test(text)) return 'Coffee'
  if (/(chá|cha)/i.test(text)) return 'Tea'
  if (/(suco)/i.test(text)) return 'Juice'
  if (/(leite)/i.test(text)) return 'Milk'
  if (/(água|agua)/i.test(text)) return 'Water'
  if (/(kaffee|espresso|latte|cappuccino)/i.test(text)) return 'Coffee'
  if (/(tee)/i.test(text)) return 'Tea'
  if (/(saft)/i.test(text)) return 'Juice'
  if (/(milch)/i.test(text)) return 'Milk'
  if (/(wasser)/i.test(text)) return 'Water'
  return ''
}

function sweetenerGrams(amount: number, unit: 'g' | 'tsp' | 'tbsp', type: 'sugar' | 'honey') {
  if (unit === 'g') return amount
  if (type === 'honey') return unit === 'tbsp' ? amount * 21 : amount * 7
  return unit === 'tbsp' ? amount * 12 : amount * 4
}

function parseSweetener(text: string): { type: 'free' | 'sugar' | 'honey'; amount?: number | null; unit?: 'g' | 'tsp' | 'tbsp' | null; grams?: number | null; needsAmount?: boolean } | null {
  const lower = text.toLowerCase()
  if (/\b(black|plain|unsweetened|sugar[-\s]?free|no sugar|without sugar|zero)\b/.test(lower)) return { type: 'free' }
  const sweetType: 'sugar' | 'honey' | null = /\bhoney\b/.test(lower) ? 'honey' : /\bsugar\b/.test(lower) ? 'sugar' : null
  if (!sweetType) return null
  const match = lower.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s*(g|grams?|tsp|teaspoons?|tbsp|tablespoons?)\s+(?:of\s+)?(?:sugar|honey)\b/)
  if (!match) return { type: sweetType, needsAmount: true }
  const amount = numberFromWords(match[1]) || Number(match[1])
  const rawUnit = match[2]
  const unit: 'g' | 'tsp' | 'tbsp' = rawUnit.startsWith('g') ? 'g' : rawUnit.startsWith('tbsp') || rawUnit.startsWith('tablespoon') ? 'tbsp' : 'tsp'
  const grams = Number.isFinite(amount) && amount > 0 ? sweetenerGrams(amount, unit, sweetType) : null
  return { type: sweetType, amount, unit, grams }
}

function tryParseWaterRequest(transcript: string, localDate: string, launchContext?: VoiceLaunchContext): VoiceDraft | null {
  const raw = cleanText(transcript, 800)
  const lower = raw.toLowerCase()
  const amount = parseWaterAmount(raw)
  const inWaterContext = launchContext?.section === 'water'
  const hasWaterAction =
    /\b(log|add|record|track)\b/.test(lower) ||
    /(додај|додаj|зачувај|зачуваj|запиши|внеси|логирај|логираj|испив|испиј|испиj)/i.test(raw) ||
    /\b(agrega|agregar|añade|anade|registrar|registra|guardar|guarda|bebí|bebi|tomé|tome|ajoute|ajouter|enregistre|noter|note|bu|aggiungi|aggiungere|registra|salva|bevo|bevuto|ho\s+bevuto|adiciona|adicione|adicionar|registra|salva|bebi|beber|füge|fuge|hinzufügen|hinzufugen|trage|trag|notiere|speichere|getrunken|trank)\b/i.test(raw)
  const hasDrinkWords =
    /\b(water|hydration|drink|liquid|coffee|tea|juice|milk|soft drink|soda|coke|cola|hot chocolate)\b/.test(lower) ||
    /(вода|хидратац|пијал|пиjал|кафе|чај|чаj|сок|млеко)/i.test(raw) ||
    /\b(agua|hidratación|hidratacion|bebida|café|cafe|té|te|jugo|zumo|leche|eau|hydratation|boisson|thé|jus|lait|acqua|idratazione|bevanda|caffè|caffe|tè|succo|latte|hidratação|hidratacao|bebida|café|cafe|chá|cha|suco|leite|wasser|getränk|getrank|trinken|kaffee|tee|saft|milch)\b/i.test(raw) ||
    /(água|agua)/i.test(raw)
  if (!(hasWaterAction && hasDrinkWords) && !(inWaterContext && (amount || hasDrinkWords))) return null

  const drinkType = inferDrinkType(raw) || (inWaterContext ? 'Water' : '')
  const meal = inferMealFromText(raw, 'other')
  const category = meal === 'uncategorized' ? 'other' : meal
  if (!amount) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: 'Water amount needed',
      confirmationMessage: 'How much liquid should I log? For example, say "Log 500 ml water."',
      canConfirm: false,
    }
  }
  if (!drinkType) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: 'Drink type needed',
      confirmationMessage: 'What drink should I log?',
      canConfirm: false,
    }
  }

  const sweetener = parseSweetener(raw)
  const isPlainWater = drinkType === 'Water'
  if (!isPlainWater && !sweetener) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: `${amount.amount} ${amount.unit} ${drinkType}`,
      confirmationMessage: `Should I log ${drinkType} as sugar-free, or with sugar or honey?`,
      canConfirm: false,
      water: { ...amount, label: drinkType, category, drinkType, sweetener: null },
    }
  }
  if (sweetener?.needsAmount) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: `${amount.amount} ${amount.unit} ${drinkType}`,
      confirmationMessage: `How much ${sweetener.type} should I add to the ${drinkType}?`,
      canConfirm: false,
      water: { ...amount, label: drinkType, category, drinkType, sweetener: null },
    }
  }

  const sweetenerLabel =
    sweetener && sweetener.type !== 'free' && sweetener.amount && sweetener.unit
      ? ` (${sweetener.type} ${sweetener.amount} ${sweetener.unit})`
      : ''
  const label = `${drinkType}${sweetenerLabel}`
  return {
    action: 'water',
    transcript: raw,
    localDate,
    summary: `${amount.amount} ${amount.unit} ${label}`,
    confirmationMessage: `I can log ${amount.amount} ${amount.unit} ${label}. Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    water: {
      ...amount,
      label,
      category,
      drinkType,
      sweetener: isPlainWater ? null : sweetener || { type: 'free' },
    },
  }
}

function normalizeFavoriteInput(raw: any): VoiceFoodFavorite | null {
  if (!raw || typeof raw !== 'object') return null
  const label = cleanText(raw.label || raw.name || raw.description || raw.raw?.label || raw.raw?.name, 160)
  if (!label) return null
  const description = cleanText(raw.description || raw.raw?.description || label, 500)
  const meal = cleanText(raw.meal || raw.category || raw.persistedCategory || raw.raw?.meal || raw.raw?.category, 40).toLowerCase()
  return {
    id: raw.id ? String(raw.id) : null,
    label,
    description: description || label,
    meal: meal || null,
    nutrition: raw.nutrition || raw.nutrients || raw.total || raw.raw?.nutrition || raw.raw?.nutrients || raw.raw?.total || null,
    total: raw.total || raw.nutrition || raw.nutrients || raw.raw?.total || raw.raw?.nutrition || raw.raw?.nutrients || null,
    items: Array.isArray(raw.items) ? raw.items : Array.isArray(raw.raw?.items) ? raw.raw.items : null,
    raw,
  }
}

function parseFavoritesJson(raw: unknown): VoiceFoodFavorite[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = Array.isArray((parsed as any)?.favorites) ? (parsed as any).favorites : Array.isArray(parsed) ? parsed : []
    return list
      .map((item: any) => normalizeFavoriteInput(item))
      .filter((item: VoiceFoodFavorite | null): item is VoiceFoodFavorite => Boolean(item))
  } catch {
    return []
  }
}

function parseConversationHistory(raw: unknown): VoiceConversationTurn[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as any)?.turns) ? (parsed as any).turns : []
    return list
      .map((item: any) => {
        const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : null
        const text = cleanText(item?.text, 500)
        return role && text ? { role, text } : null
      })
      .filter((item: VoiceConversationTurn | null): item is VoiceConversationTurn => Boolean(item))
      .slice(-6)
  } catch {
    return []
  }
}

function parseFollowUpDraft(raw: unknown) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    const action = cleanText((parsed as any).action, 40)
    const canConfirm = Boolean((parsed as any).canConfirm)
    if (action === 'food_draft') {
      const draftText = cleanText((parsed as any).food?.draftText, 1000)
      if (!draftText) return null
      return parsed
    }
    if (
      action === 'water' &&
      !canConfirm &&
      /How much liquid should I log|What drink should I log|Should I log\s+.+?\s+as sugar-free, or with sugar or honey|How much\s+(?:sugar|honey)\s+should I add/i.test(
        cleanText((parsed as any).confirmationMessage, 240),
      )
    ) {
      return parsed
    }
    if (action === 'recipe' && !canConfirm && cleanText((parsed as any).recipe?.text || (parsed as any).confirmationMessage, 1000)) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function parseConfirmationDraft(raw: unknown) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    if (!Boolean((parsed as any).canConfirm)) return null
    const action = cleanText((parsed as any).action, 40)
    if (!action) return null
    return parsed
  } catch {
    return null
  }
}

function reviewedDraftContextLine(draft: any) {
  if (!draft || typeof draft !== 'object') return 'No draft currently being reviewed.'
  const context: any = {
    action: cleanText(draft.action, 40),
    summary: cleanText(draft.summary, 180),
    confirmationMessage: cleanText(draft.confirmationMessage, 260),
    localDate: cleanText(draft.localDate, 20),
  }
  if (draft.exercise) {
    context.exercise = {
      exerciseName: cleanText(draft.exercise.exerciseName || draft.exercise.name, 80),
      durationMinutes: draft.exercise.durationMinutes,
      distanceKm: draft.exercise.distanceKm,
      steps: draft.exercise.steps,
      caloriesKcal: draft.exercise.caloriesKcal,
      intensity: cleanText(draft.exercise.intensity, 40),
    }
  }
  if (draft.mood) {
    context.mood = {
      mood: draft.mood.mood,
      tags: Array.isArray(draft.mood.tags) ? draft.mood.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : [],
      note: cleanText(draft.mood.note, 220),
    }
  }
  if (draft.journal) {
    context.journal = {
      title: cleanText(draft.journal.title, 100),
      content: cleanText(draft.journal.content, 400),
      journalType: cleanText(draft.journal.journalType, 20),
      tags: Array.isArray(draft.journal.tags) ? draft.journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : [],
    }
  }
  if (draft.food) {
    context.food = {
      meal: cleanText(draft.food.meal, 40),
      mealName: cleanText(draft.food.mealName, 100),
      draftText: cleanText(draft.food.draftText, 500),
      sourceDate: cleanText(draft.food.sourceDate, 20),
      entries: Array.isArray(draft.food.entries)
        ? draft.food.entries.map((entry: any) => ({ name: cleanText(entry?.name, 120), description: cleanText(entry?.description, 160), meal: cleanText(entry?.meal, 40) })).slice(0, 12)
        : [],
    }
  }
  if (draft.water) {
    context.water = {
      amount: draft.water.amount,
      unit: cleanText(draft.water.unit, 20),
      amountMl: draft.water.amountMl,
      label: cleanText(draft.water.label, 80),
      drinkType: cleanText(draft.water.drinkType, 80),
    }
  }
  if (draft.symptom) {
    context.symptom = {
      symptoms: Array.isArray(draft.symptom.symptoms) ? draft.symptom.symptoms.map((item: any) => cleanText(item, 80)).filter(Boolean).slice(0, 12) : [],
      duration: cleanText(draft.symptom.duration, 120),
      notes: cleanText(draft.symptom.notes, 400),
    }
  }
  if (draft.healthIntake) {
    context.healthIntake = {
      items: Array.isArray(draft.healthIntake.items)
        ? draft.healthIntake.items.map((item: any) => ({
            type: cleanText(item?.type, 24),
            name: cleanText(item?.name, 120),
            dosage: cleanText(item?.dosage, 80),
            timing: Array.isArray(item?.timing) ? item.timing.map((time: any) => cleanText(time, 60)).filter(Boolean).slice(0, 6) : [],
            scheduleInfo: cleanText(item?.scheduleInfo, 80),
          })).slice(0, 20)
        : [],
    }
  }
  return cleanText(JSON.stringify(context), 1800)
}

function mergeFavorites(primary: VoiceFoodFavorite[], secondary: VoiceFoodFavorite[]) {
  const byKey = new Map<string, VoiceFoodFavorite>()
  ;[...primary, ...secondary].forEach((favorite) => {
    const key = String(favorite.id || '').trim() || compactFoodMatchText(favorite.label)
    if (key && !byKey.has(key)) byKey.set(key, favorite)
  })
  return Array.from(byKey.values())
}

async function loadStoredFavorites(userId: string) {
  const stored = await prisma.healthGoal.findFirst({
    where: { userId, name: '__FOOD_FAVORITES__' },
    orderBy: { createdAt: 'desc' },
    select: { category: true },
  })
  return parseFavoritesJson(stored?.category || '')
}

async function loadRecentFoodLibraryFavorites(userId: string): Promise<VoiceFoodFavorite[]> {
  const logs = await prisma.foodLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      name: true,
      description: true,
      meal: true,
      category: true,
      nutrients: true,
      items: true,
    },
  })
  return logs
    .map((entry) =>
      normalizeFavoriteInput({
        id: entry.id,
        label: entry.name,
        description: entry.description || entry.name,
        meal: entry.meal || entry.category,
        nutrition: entry.nutrients,
        total: entry.nutrients,
        items: entry.items,
      }),
    )
    .filter((item: VoiceFoodFavorite | null): item is VoiceFoodFavorite => Boolean(item))
}

function findRequestedFavorite(transcript: string, favorites: VoiceFoodFavorite[]) {
  const request = compactFoodMatchText(transcript)
  if (!request || favorites.length === 0) return null
  const requestTokens = request.split(' ').filter((token) => token.length >= 3)
  const requestCompact = request.replace(/\s+/g, '')
  let best: { favorite: VoiceFoodFavorite; score: number; specificity: number } | null = null

  for (const favorite of favorites) {
    const label = compactFoodMatchText(favorite.label || favorite.description || '')
    if (!label) continue
    const labelTokens = label.split(' ').filter((token) => token.length >= 3)
    const labelCompact = label.replace(/\s+/g, '')
    const tokenMatches = labelTokens.filter((token) =>
      requestTokens.some((requestToken) => requestToken === token || levenshteinDistance(requestToken, token) <= 1),
    ).length
    let score = tokenMatches / Math.max(1, labelTokens.length)
    if (request.includes(label)) score = Math.max(score, 1)
    if (requestCompact.includes(labelCompact)) score = Math.max(score, 1)
    const compactDistance = levenshteinDistance(requestCompact, labelCompact)
    if (compactDistance <= 2) score = Math.max(score, 0.95)
    const specificity = labelTokens.length * 100 + label.length
    if (score >= 0.72 && (!best || score > best.score || (score === best.score && specificity > best.specificity))) {
      best = { favorite, score, specificity }
    }
  }

  return best?.favorite || null
}

function shouldUseFavoriteFood(transcript: string, favorites: VoiceFoodFavorite[]) {
  const request = compactFoodMatchText(transcript)
  if (!request || favorites.length === 0) return false
  const mentionsFavorite = /\b(favourites?|favorites?|saved)\b/i.test(transcript)
  const looksLikeHealthIntake =
    HEALTH_INTAKE_RECORD_PATTERN.test(transcript) ||
    SUPPLEMENT_NAME_HINT_PATTERN.test(transcript) ||
    MEDICATION_NAME_HINT_PATTERN.test(transcript)
  if (!mentionsFavorite && looksLikeHealthIntake) return false
  if (!mentionsFavorite && /\b(health journal|journal|mood|symptom|symptoms|medication|medicine|supplement|vitamin|health intake|health image|note)\b/i.test(transcript)) {
    return false
  }
  const directFood = tryParseIngredientMealRequest(transcript) || tryParseDirectFoodRequest(transcript, { section: 'food', title: 'Food Diary' })
  if ((directFood?.ingredients || []).length > 1 && !mentionsFavorite) return false
  if (findRequestedFavorite(transcript, favorites)) return true
  if (mentionsFavorite) return true
  return favorites.some((favorite) => {
    const label = compactFoodMatchText(favorite.label || favorite.description || '')
    const labelTokens = label.split(' ').filter(Boolean)
    if (!label || label.length < 10 || labelTokens.length < 2) return false
    return request.includes(label)
  })
}

function shouldAutoSaveFavoriteFood(transcript: string, launchContext?: VoiceLaunchContext | null) {
  const text = cleanText(transcript, 800).toLowerCase()
  if (!text) return false
  const inFoodContext = launchContext?.section === 'food'
  const mentionsSavedFood = /\b(favourites?|favorites?|saved)\b/.test(text)
  const wantsDiaryAdd =
    /\b(add|log|input|enter|put|include|record)\b/.test(text) ||
    /\b(add it|log it|save it|put it in|enter it)\b/.test(text)
  const avoidsAutoSave = /\b(review|show me|preview|open|don't save|do not save|not save)\b/.test(text)
  return inFoodContext && mentionsSavedFood && wantsDiaryAdd && !avoidsAutoSave
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function round1(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.max(0, n) * 10) / 10
}

function hasCoreNutrition(item: any) {
  return (
    Number.isFinite(Number(item?.calories ?? item?.calories_kcal)) &&
    Number.isFinite(Number(item?.protein_g ?? item?.protein)) &&
    Number.isFinite(Number(item?.carbs_g ?? item?.carbs)) &&
    Number.isFinite(Number(item?.fat_g ?? item?.fat))
  )
}

function servingGramsFromText(value: unknown) {
  const text = String(value || '').toLowerCase()
  const grams = text.match(/(\d+(?:\.\d+)?)\s*g\b/)
  if (grams) return Number(grams[1])
  const ml = text.match(/(\d+(?:\.\d+)?)\s*ml\b/)
  if (ml) return Number(ml[1])
  return null
}

function numberFromWords(value: unknown) {
  const text = String(value || '').toLowerCase().trim()
  const direct = Number(text)
  if (Number.isFinite(direct) && direct > 0) return direct
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    half: 0.5,
    quarter: 0.25,
  }
  return words[text] || null
}

function estimateIngredientGrams(nameRaw: string, quantityRaw: unknown, unitRaw: unknown) {
  const name = compactFoodMatchText(nameRaw)
  const unit = compactFoodMatchText(unitRaw)
  const quantity = numberFromWords(quantityRaw) || 1
  const explicit = servingGramsFromText(`${quantityRaw || ''} ${unitRaw || ''}`)
  if (explicit) return explicit
  if (unit.includes('gram')) return quantity
  if (unit.includes('kg') || unit.includes('kilogram')) return quantity * 1000
  if (unit.includes('ml')) return quantity
  if (unit.includes('cup')) return quantity * 240
  if (unit.includes('tbsp') || unit.includes('tablespoon')) return quantity * 15
  if (unit.includes('tsp') || unit.includes('teaspoon')) return quantity * 5
  if (name.includes('olive oil') || name.includes('cooking oil') || name === 'oil') return quantity * 15
  if (name.includes('coffee')) return quantity * 240
  if (name.includes('protein shake') || name.includes('smoothie')) return quantity * 300
  if (unit.includes('slice') || name.includes('toast') || name.includes('bread')) return quantity * 35
  if (unit.includes('egg') || name.includes('egg')) {
    if (name.includes('small')) return quantity * 38
    if (name.includes('medium')) return quantity * 44
    if (name.includes('extra large')) return quantity * 56
    if (name.includes('large')) return quantity * 50
    return quantity * 50
  }
  if (name.includes('banana')) {
    if (name.includes('small')) return quantity * 100
    if (name.includes('medium')) return quantity * 120
    if (name.includes('extra large')) return quantity * 160
    if (name.includes('large')) return quantity * 140
    return quantity * 120
  }
  if (name.includes('nashi') || name.includes('apple') || name.includes('pear')) {
    if (name.includes('small')) return quantity * 120
    if (name.includes('medium')) return quantity * 150
    if (name.includes('extra large')) return quantity * 220
    if (name.includes('large')) return quantity * 190
    return quantity * 150
  }
  if (unit.includes('avocado') || name.includes('avocado')) {
    if (name.includes('small')) return quantity * 120
    if (name.includes('medium')) return quantity * 170
    if (name.includes('extra large')) return quantity * 290
    if (name.includes('large')) return quantity * 230
    return quantity * 170
  }
  if (name.includes('yoghurt') || name.includes('yogurt')) return quantity * 170
  return quantity * 100
}

function normalizeIngredientRequest(raw: any) {
  const name = cleanText(raw?.name || raw?.food || raw?.ingredient || raw, 120)
  if (!name) return null
  return {
    name,
    quantity: raw?.quantity ?? raw?.amount ?? null,
    unit: cleanText(raw?.unit || raw?.measure, 40) || null,
    display: cleanText(raw?.display || raw?.text || name, 160) || name,
  }
}

function cleanVagueFoodName(value: unknown) {
  return cleanText(value, 120)
    .replace(/\b(?:some|a few|few|couple(?: of)?|a couple(?: of)?|handful(?: of)?|a handful(?: of)?|bit(?: of)?|a bit(?: of)?|little(?: bit)?(?: of)?|a little(?: bit)?(?: of)?|several)\b/gi, ' ')
    .replace(/\b(?:a|an|of)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitVoiceFoodList(value: unknown) {
  return cleanText(value, 1000)
    .split(',')
    .map((item) => cleanText(item, 180))
    .filter(Boolean)
}

function hasVagueFoodAmount(value: unknown) {
  return /\b(?:some|a few|few|couple(?: of)?|a couple(?: of)?|handful(?: of)?|a handful(?: of)?|bit(?: of)?|a bit(?: of)?|little(?: bit)?(?: of)?|a little(?: bit)?(?: of)?|several)\b/i.test(String(value || ''))
}

function firstClarificationFoodName(draft: any) {
  const message = cleanText(draft?.confirmationMessage, 220)
  const match = message.match(/How much\s+(.+?)\s+should I use/i)
  const raw = cleanText(match?.[1] || '', 120)
  if (!raw) return ''
  return cleanText(raw.split(',')[0] || raw, 80)
}

function answerLooksLikeFoodAmount(value: unknown) {
  const text = normalizeSpokenFollowUpAnswer(value)
  return /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s*(?:g|gram|grams|kg|ml|l|oz|ounce|ounces|cup|cups|tbsp|tablespoon|tsp|teaspoon|handful|handfuls|piece|pieces|small|medium|large)?\b/i.test(text)
}

function normalizeSpokenFollowUpAnswer(value: unknown) {
  return cleanText(value, 260)
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

function followUpFoodTranscript(draft: any, answerRaw: string) {
  if (draft?.action !== 'food_draft') return null
  const draftText = cleanText(draft?.food?.draftText, 1000)
  const answer = normalizeSpokenFollowUpAnswer(answerRaw)
  if (!draftText || !answer || !answerLooksLikeFoodAmount(answer)) return null
  const clearParts = splitVoiceFoodList(draftText).filter((part) => !hasVagueFoodAmount(part))
  const targetName = firstClarificationFoodName(draft)
  const answerHasTarget = targetName ? answer.toLowerCase().includes(targetName.toLowerCase()) : true
  const clarified = targetName && !answerHasTarget ? `${answer} ${targetName}` : answer
  const meal = cleanText(draft?.food?.meal || 'snacks', 40) || 'snacks'
  return `add ${[...clearParts, clarified].filter(Boolean).join(', ')} to ${meal}`
}

function amountTextFromWaterDraft(draft: any) {
  const water = draft?.water || {}
  if (water?.amount && water?.unit) return `${water.amount} ${water.unit}`
  const transcript = cleanText(draft?.transcript, 220)
  const match = transcript.match(/\b(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|oz|ounces?)\b/i)
  return cleanText(match?.[0] || '', 60)
}

function drinkTextFromWaterDraft(draft: any) {
  const water = draft?.water || {}
  const label = cleanText(water?.label || water?.drinkType, 80)
  if (label) return label
  const transcript = cleanText(draft?.transcript, 220).toLowerCase()
  if (/\bcoffee|espresso|latte|cappuccino|flat white\b/.test(transcript)) return 'coffee'
  if (/\btea\b/.test(transcript)) return 'tea'
  if (/\bjuice\b/.test(transcript)) return 'juice'
  if (/\bmilk\b/.test(transcript)) return 'milk'
  if (/\bsoft drink|soda|coke|cola|lemonade\b/.test(transcript)) return 'soft drink'
  return 'water'
}

function followUpWaterTranscript(draft: any, answerRaw: string) {
  if (draft?.action !== 'water' || draft?.canConfirm) return null
  const answer = normalizeSpokenFollowUpAnswer(answerRaw)
  const message = cleanText(draft?.confirmationMessage, 220)
  if (!answer) return null
  if (/How much liquid should I log/i.test(message) && answerLooksLikeFoodAmount(answer)) {
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
    if (!amountText || !answerLooksLikeFoodAmount(answer)) return null
    return `log ${amountText} ${drinkText} with ${answer} ${sweetenerMatch[1]}`
  }
  return null
}

function followUpExerciseTranscript(draft: any, answerRaw: string) {
  if (draft?.action !== 'exercise' || draft?.canConfirm) return null
  const answer = cleanText(answerRaw, 600)
  const message = cleanText(draft?.confirmationMessage, 220)
  if (!answer || !/What exercise should I log/i.test(message)) return null
  return `log exercise: ${answer}`
}

function followUpMoodTranscript(draft: any, answerRaw: string) {
  if (draft?.action !== 'mood' || draft?.canConfirm) return null
  const answer = cleanText(answerRaw, 600)
  const message = cleanText(draft?.confirmationMessage, 220)
  if (!answer || !/How are you feeling/i.test(message)) return null
  return `log mood: ${answer}`
}

function followUpJournalTranscript(draft: any, answerRaw: string) {
  if (draft?.action !== 'journal' || draft?.canConfirm) return null
  const answer = cleanText(answerRaw, 1200)
  const message = cleanText(draft?.confirmationMessage, 220)
  if (!answer || !/What would you like me to write in the journal/i.test(message)) return null
  return `write journal note: ${answer}`
}

function followUpTranscript(draft: any, answerRaw: string) {
  return (
    followUpFoodTranscript(draft, answerRaw) ||
    followUpWaterTranscript(draft, answerRaw) ||
    followUpExerciseTranscript(draft, answerRaw) ||
    followUpMoodTranscript(draft, answerRaw) ||
    followUpJournalTranscript(draft, answerRaw)
  )
}

function isExplicitNewVoiceCommand(value: unknown) {
  const text = cleanText(value, 1200).toLowerCase()
  if (!text) return false
  const hasCommand = /\b(add|log|record|save|open|show|go to|take me to|create|build|make|track|write)\b/.test(text)
  const hasTarget =
    /\b(food|meal|breakfast|lunch|dinner|snack|snacks|favourites?|favorites?|saved|diary|water|exercise|workout|mood|journal|symptom|symptoms|medication|medicine|supplement|vitamin|health image|photo|camera|insights)\b/.test(text)
  return hasCommand && hasTarget
}

function normalizeFoodAmountUnit(unitRaw: string) {
  const unit = cleanText(unitRaw, 24).toLowerCase()
  if (/^grams?$/.test(unit)) return 'g'
  if (/^(грама?|гр|г)$/.test(unit)) return 'g'
  if (/^tablespoons?$/.test(unit)) return 'tbsp'
  if (/^teaspoons?$/.test(unit)) return 'tsp'
  return unit
}

function foodPartTargetName(part: string) {
  return cleanText(stripIngredientLookupModifiers(part), 80) || cleanText(cleanVagueFoodName(part), 80)
}

function localizedFoodCorrectionAliases(value: string) {
  const aliases: string[] = []
  if (/кикирики/i.test(value)) aliases.push('peanuts')
  if (/јаболк|jаболк/i.test(value)) aliases.push('apple')
  if (/банан/i.test(value)) aliases.push('banana')
  return aliases.join(' ')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pluralizedFoodNameForCount(countRaw: string, targetNameRaw: string) {
  const count = numberFromWords(countRaw) || Number(countRaw)
  const singularName = singularFoodText(targetNameRaw) || compactFoodMatchText(targetNameRaw)
  if (!singularName) return cleanText(targetNameRaw, 80)
  if (Number.isFinite(count) && count === 1) return singularName
  if (singularName.endsWith('y')) return `${singularName.slice(0, -1)}ies`
  if (singularName.endsWith('s')) return singularName
  return `${singularName}s`
}

function reviewedFoodCountPartForTarget(raw: string, translated: string, targetNameRaw: string) {
  const targetName = singularFoodText(targetNameRaw) || compactFoodMatchText(targetNameRaw)
  if (!targetName) return ''
  const targetWords = targetName.split(' ').filter(Boolean).map(escapeRegex)
  const lastWord = targetWords.pop()
  if (!lastWord) return ''
  const targetPattern = [...targetWords, `${lastWord}s?`].join('\\s+')
  const countPattern = '(one|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:[.,]\\d+)?)'
  const match = `${raw} ${translated}`.match(new RegExp(`\\b${countPattern}\\s+${targetPattern}\\b`, 'i'))
  if (!match?.[1]) return ''
  const countText = match[1].replace(',', '.').toLowerCase()
  return cleanText(`${countText} ${pluralizedFoodNameForCount(countText, targetName)}`, 120)
}

function extractReviewedFoodAmountCorrection(draft: any, answerRaw: string) {
  if (!draft?.canConfirm || !['food_build_meal', 'food_draft'].includes(draft?.action)) return null
  const raw = cleanText(answerRaw, 800)
  const meal = cleanText(draft?.food?.meal, 40) || 'snacks'
  const translated = cleanText(translateLocalizedFoodRequest(raw, { section: 'food', title: 'Food Diary', meal }), 1000)
  const lower = translated.toLowerCase()
  const rawHasCorrectionWords = /\b(change|make|set|use|replace|instead|correct|update|adjust)\b/i.test(raw) || /(смени|намести|стави|коригирај|коригираj|замени)/i.test(raw)
  const amountMatch =
    translated.match(/(\d+(?:[.,]\d+)?)\s*(g|grams?|kg|ml|cup|cups|tbsp|tablespoons?|tsp|teaspoons?|slice|slices|piece|pieces|egg|eggs)\b/i) ||
    raw.match(/(\d+(?:[.,]\d+)?)\s*(грама?|гр|г)(?=$|[^А-Яа-яЃѓЌќЅѕЉљЊњЈј])/i)
  if (!amountMatch?.[1] || !amountMatch?.[2]) return null

  const draftText =
    cleanText(draft?.food?.draftText, 1200) ||
    (Array.isArray(draft?.food?.entries) ? draft.food.entries.map((entry: any) => cleanText(entry?.name, 120)).filter(Boolean).join(', ') : '')
  const parts = splitIngredientList(draftText)
  if (!parts.length) return null

  const targetIndex = parts.findIndex((part) => {
    const targetName = foodPartTargetName(part)
    if (!targetName) return false
    return compactFoodMatchText(`${lower} ${localizedFoodCorrectionAliases(raw)}`).includes(compactFoodMatchText(targetName))
  })
  if (targetIndex < 0) return null
  if (!rawHasCorrectionWords && !/\badd\b/i.test(translated)) return null

  const amount = amountMatch[1].replace(',', '.')
  const unit = normalizeFoodAmountUnit(amountMatch[2])
  const targetName = foodPartTargetName(parts[targetIndex])
  if (!targetName) return null
  const correctedParts = [...parts]
  correctedParts[targetIndex] = `${amount} ${unit} ${targetName}`
  return {
    correctedParts,
    meal,
    mealName: cleanText(draft?.food?.mealName, 120) || `${meal.charAt(0).toUpperCase()}${meal.slice(1)} from voice`,
  }
}

function extractReviewedFoodCountCorrection(draft: any, answerRaw: string) {
  if (!draft?.canConfirm || !['food_build_meal', 'food_draft'].includes(draft?.action)) return null
  const raw = cleanText(answerRaw, 800)
  if (!hasReviewedCorrectionWords(raw)) return null

  const meal = cleanText(draft?.food?.meal, 40) || 'snacks'
  const translated = cleanText(translateLocalizedFoodRequest(raw, { section: 'food', title: 'Food Diary', meal }), 1000)
  const draftText =
    cleanText(draft?.food?.draftText, 1200) ||
    (Array.isArray(draft?.food?.entries) ? draft.food.entries.map((entry: any) => cleanText(entry?.name, 120)).filter(Boolean).join(', ') : '')
  const parts = splitIngredientList(draftText)
  if (!parts.length) return null

  const correctionText = compactFoodMatchText(`${raw} ${translated} ${localizedFoodCorrectionAliases(raw)}`)
  const targetIndex = parts.findIndex((part) => {
    const targetName = foodPartTargetName(part)
    if (!targetName) return false
    return correctionText.includes(compactFoodMatchText(targetName))
  })
  if (targetIndex < 0) return null

  const targetName = foodPartTargetName(parts[targetIndex])
  const nextPart = reviewedFoodCountPartForTarget(raw, translated, targetName)
  if (!nextPart) return null

  const correctedParts = [...parts]
  correctedParts[targetIndex] = nextPart
  return {
    correctedParts,
    meal,
    mealName: cleanText(draft?.food?.mealName, 120) || voiceMealNameForMeal(meal),
  }
}

function hasReviewedCorrectionWords(value: string) {
  return (
    /\b(change|make|set|use|replace|instead|correct|update|adjust|remove|clear|delete|without)\b/i.test(value) ||
    /(смени|намести|стави|коригирај|коригираj|замени)/i.test(value)
  )
}

function voiceMealNameForMeal(meal: string) {
  const safeMeal = cleanText(meal, 40).toLowerCase()
  if (safeMeal === 'snacks') return 'Snacks from voice'
  if (!safeMeal || safeMeal === 'uncategorized') return 'Meal from voice'
  return `${safeMeal.charAt(0).toUpperCase()}${safeMeal.slice(1)} from voice`
}

function extractReviewedFoodMealCorrection(draft: any, answerRaw: string) {
  if (!draft?.canConfirm || !['food_build_meal', 'food_draft'].includes(draft?.action)) return null
  const raw = cleanText(answerRaw, 800)
  if (!hasReviewedCorrectionWords(raw)) return null

  const currentMeal = cleanText(draft?.food?.meal, 40).toLowerCase() || 'snacks'
  const translated = cleanText(translateLocalizedFoodRequest(raw, { section: 'food', title: 'Food Diary', meal: currentMeal }), 1000)
  const meal = localizedMealFromText(`${raw} ${translated}`) || inferMealFromText(translated || raw, '')
  if (!meal || meal === 'uncategorized' || meal === currentMeal) return null

  const draftText =
    cleanText(draft?.food?.draftText, 1200) ||
    (Array.isArray(draft?.food?.entries) ? draft.food.entries.map((entry: any) => cleanText(entry?.name, 120)).filter(Boolean).join(', ') : '')
  const correctedParts = splitIngredientList(draftText)
  if (!correctedParts.length) return null

  return {
    correctedParts,
    meal,
    mealName: voiceMealNameForMeal(meal),
  }
}

function extractReviewedFoodAddition(draft: any, answerRaw: string) {
  if (!draft?.canConfirm || !['food_build_meal', 'food_draft'].includes(draft?.action)) return null
  const raw = cleanText(answerRaw, 800)
  const currentMeal = cleanText(draft?.food?.meal, 40).toLowerCase() || 'snacks'
  const translated = cleanText(translateLocalizedFoodRequest(raw, { section: 'food', title: 'Food Diary', meal: currentMeal }), 1000)
  const wantsAdd =
    /\b(add|include|also add|put|with)\b/i.test(translated) ||
    /(додај|додаj|внеси|дополни)/i.test(raw)
  if (!wantsAdd) return null

  const draftText =
    cleanText(draft?.food?.draftText, 1200) ||
    (Array.isArray(draft?.food?.entries) ? draft.food.entries.map((entry: any) => cleanText(entry?.name, 120)).filter(Boolean).join(', ') : '')
  const existingParts = splitIngredientList(draftText)
  if (!existingParts.length) return null

  const addSourceText = /\b(add|include|also add|put|with)\b/i.test(raw) ? raw : translated
  const listText = cleanText(stripVoiceFoodCommandWords(addSourceText).replace(/\bwith\b/gi, ',').replace(/\band\b/gi, ','), 1000)
  const directIngredients = splitIngredientList(listText).map(parseIngredientPhrase).filter(Boolean)
  const parsedFood = directIngredients.length
    ? { meal: localizedMealFromText(`${raw} ${translated}`) || currentMeal, ingredients: directIngredients }
    : tryParseDirectFoodRequest(translated, { section: 'food', title: 'Food Diary', meal: currentMeal }) || tryParseIngredientMealRequest(translated)
  const additions = Array.isArray(parsedFood?.ingredients)
    ? parsedFood.ingredients
        .map((entry: any) => cleanText(entry?.display || entry?.name, 120))
        .filter(Boolean)
        .slice(0, 6)
    : []
  if (!additions.length) return null

  const meal = localizedMealFromText(`${raw} ${translated}`) || cleanText(parsedFood?.meal, 40).toLowerCase() || currentMeal
  return {
    correctedParts: [...existingParts, ...additions].slice(0, 12),
    meal,
    mealName: cleanText(draft?.food?.mealName, 120) || voiceMealNameForMeal(meal),
  }
}

function extractReviewedFoodRemoval(draft: any, answerRaw: string) {
  if (!draft?.canConfirm || !['food_build_meal', 'food_draft'].includes(draft?.action)) return null
  const raw = cleanText(answerRaw, 800)
  const currentMeal = cleanText(draft?.food?.meal, 40).toLowerCase() || 'snacks'
  const translated = cleanText(translateLocalizedFoodRequest(raw, { section: 'food', title: 'Food Diary', meal: currentMeal }), 1000)
  const wantsRemove =
    /\b(remove|delete|drop|take out|without|no)\b/i.test(`${raw} ${translated}`) ||
    /(тргни|отстрани|избриши|извади|без)/i.test(raw)
  if (!wantsRemove) return null

  const draftText =
    cleanText(draft?.food?.draftText, 1200) ||
    (Array.isArray(draft?.food?.entries) ? draft.food.entries.map((entry: any) => cleanText(entry?.name, 120)).filter(Boolean).join(', ') : '')
  const existingParts = splitIngredientList(draftText)
  if (existingParts.length < 2) return null

  const correctionText = compactFoodMatchText(`${raw} ${translated} ${localizedFoodCorrectionAliases(raw)}`)
  const targetIndex = existingParts.findIndex((part) => {
    const targetName = foodPartTargetName(part)
    if (!targetName) return false
    return correctionText.includes(compactFoodMatchText(targetName))
  })
  if (targetIndex < 0) return null

  const correctedParts = existingParts.filter((_, index) => index !== targetIndex)
  if (!correctedParts.length) return null

  return {
    correctedParts,
    meal: currentMeal,
    mealName: cleanText(draft?.food?.mealName, 120) || voiceMealNameForMeal(currentMeal),
  }
}

function parseReviewedFoodReplacementParts(raw: string) {
  const text = cleanText(raw, 800)
  const replaceMatch = text.match(/\b(?:replace|swap|change)\s+(?:the\s+)?(.+?)\s+(?:with|for|to)\s+(.+)$/i)
  if (replaceMatch?.[1] && replaceMatch?.[2]) return { targetText: replaceMatch[1], replacementText: replaceMatch[2] }

  const useInsteadMatch = text.match(/\buse\s+(.+?)\s+instead\s+of\s+(?:the\s+)?(.+)$/i)
  if (useInsteadMatch?.[1] && useInsteadMatch?.[2]) return { targetText: useInsteadMatch[2], replacementText: useInsteadMatch[1] }

  const macedonianMatch = text.match(/(?:замени|смени)\s+(.+?)\s+(?:со|сo|за|на)\s+(.+)$/i)
  if (macedonianMatch?.[1] && macedonianMatch?.[2]) return { targetText: macedonianMatch[1], replacementText: macedonianMatch[2] }

  return null
}

function extractReviewedFoodReplacement(draft: any, answerRaw: string) {
  if (!draft?.canConfirm || !['food_build_meal', 'food_draft'].includes(draft?.action)) return null
  const raw = cleanText(answerRaw, 800)
  const replacement = parseReviewedFoodReplacementParts(raw)
  if (!replacement) return null

  const currentMeal = cleanText(draft?.food?.meal, 40).toLowerCase() || 'snacks'
  const translatedReplacement = cleanText(translateLocalizedFoodRequest(replacement.replacementText, { section: 'food', title: 'Food Diary', meal: currentMeal }), 1000)
  const draftText =
    cleanText(draft?.food?.draftText, 1200) ||
    (Array.isArray(draft?.food?.entries) ? draft.food.entries.map((entry: any) => cleanText(entry?.name, 120)).filter(Boolean).join(', ') : '')
  const existingParts = splitIngredientList(draftText)
  if (!existingParts.length) return null

  const targetText = compactFoodMatchText(`${replacement.targetText} ${localizedFoodCorrectionAliases(replacement.targetText)}`)
  const targetIndex = existingParts.findIndex((part) => {
    const targetName = foodPartTargetName(part)
    if (!targetName) return false
    return targetText.includes(compactFoodMatchText(targetName)) || compactFoodMatchText(targetName).includes(targetText)
  })
  if (targetIndex < 0) return null

  const replacementText = /[А-Яа-яЃѓЌќЅѕЉљЊњЈј]/.test(replacement.replacementText) ? translatedReplacement : replacement.replacementText
  const listText = cleanText(stripVoiceFoodCommandWords(replacementText).replace(/\bwith\b/gi, ',').replace(/\band\b/gi, ','), 1000)
  const replacementParts = splitIngredientList(listText).map(parseIngredientPhrase).filter(Boolean)
  const additions = replacementParts
    .map((entry: any) => cleanText(entry?.display || entry?.name, 120))
    .filter(Boolean)
    .slice(0, 6)
  if (!additions.length) return null

  const correctedParts = [...existingParts]
  correctedParts.splice(targetIndex, 1, ...additions)

  return {
    correctedParts: correctedParts.slice(0, 12),
    meal: currentMeal,
    mealName: cleanText(draft?.food?.mealName, 120) || voiceMealNameForMeal(currentMeal),
  }
}

function extractReviewedNoteCorrectionText(value: string, max = 1200) {
  const raw = cleanText(value, max)
  if (!raw || !hasReviewedCorrectionWords(raw)) return null
  const cleaned = cleanText(
    raw
      .replace(/\binstead\b/gi, '')
      .replace(
        /^(?:change|make|set|use|replace|correct|update|adjust)\s+(?:it|this|that|the\s+(?:note|journal|entry|draft|mood|symptom\s+note|symptom\s+notes))?\s*(?:say\s+|to\s+say\s+|to\s+|as\s+|into\s+|:)?\s*/i,
        '',
      )
      .replace(
        /^(?:смени|намести|стави|коригирај|коригираj|замени)\s+(?:го\s+|ја\s+|jа\s+|ова\s+|белешката\s+|дневникот\s+|расположението\s+)?(?:да\s+пише\s+|на\s+|во\s+|дека\s+|:)?\s*/i,
        '',
      ),
    max,
  )
  return cleaned && cleaned !== raw ? cleaned : null
}

function buildReviewedWaterCorrection(draft: any, answerRaw: string, localDate: string): VoiceDraft | null {
  if (draft?.action !== 'water' || !draft?.canConfirm) return null
  const raw = cleanText(answerRaw, 800)
  const amount = parseWaterAmount(raw)
  if (!amount || !hasReviewedCorrectionWords(raw)) return null

  const drinkType = cleanText(draft?.water?.drinkType || draft?.water?.label || inferDrinkType(raw) || 'Water', 48) || 'Water'
  const sweetener = draft?.water?.sweetener || (drinkType === 'Water' ? null : { type: 'free' })
  const sweetenerLabel =
    sweetener && sweetener.type !== 'free' && sweetener.amount && sweetener.unit
      ? ` (${sweetener.type} ${sweetener.amount} ${sweetener.unit})`
      : ''
  const label = `${drinkType}${sweetenerLabel}`
  return {
    action: 'water',
    transcript: raw,
    localDate,
    summary: `${amount.amount} ${amount.unit} ${label}`,
    confirmationMessage: `I can update this water draft to ${amount.amount} ${amount.unit} ${label}. Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    water: {
      ...amount,
      label,
      category: cleanText(draft?.water?.category, 40) || 'other',
      drinkType,
      sweetener,
    },
  }
}

function extractExerciseDurationMinutes(value: string) {
  const raw = cleanText(value, 800)
  const lower = raw.toLowerCase()
  const durationMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/)
  const macedonianDurationMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(минути?|мин|часа|час)(?=$|[^А-Яа-яЃѓЌќЅѕЉљЊњЈј])/i)
  if (!durationMatch && !macedonianDurationMatch) return null
  const amount = durationMatch ? Number(durationMatch[1]) : Number(macedonianDurationMatch?.[1].replace(',', '.'))
  const unit = durationMatch?.[2] || macedonianDurationMatch?.[2] || ''
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.max(1, Math.round(amount * (/hour|hr|час/i.test(unit) ? 60 : 1)))
}

function buildReviewedExerciseCorrection(draft: any, answerRaw: string, localDate: string): VoiceDraft | null {
  if (draft?.action !== 'exercise' || !draft?.canConfirm || !draft?.exercise) return null
  const raw = cleanText(answerRaw, 800)
  const durationMinutes = extractExerciseDurationMinutes(raw)
  if (!durationMinutes || !hasReviewedCorrectionWords(raw)) return null

  const exercise = {
    ...draft.exercise,
    durationMinutes,
    estimatedDuration: false,
  }
  const distanceLine = exercise.distanceKm ? `, ${exercise.distanceKm} km` : ''
  return {
    action: 'exercise',
    transcript: raw,
    localDate,
    summary: `${cleanText(exercise.name, 80) || 'exercise'}, ${durationMinutes} minutes${distanceLine}`,
    confirmationMessage: `I can update this exercise draft to ${durationMinutes} minutes. Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    exercise,
  }
}

function buildReviewedJournalCorrection(draft: any, answerRaw: string, localDate: string): VoiceDraft | null {
  if (draft?.action !== 'journal' || !draft?.canConfirm || !draft?.journal) return null
  const raw = cleanText(answerRaw, 1200)
  const content = extractReviewedNoteCorrectionText(raw, 1200)
  if (!content) return null

  const journalType = draft.journal.journalType === 'health' ? 'health' : 'mood'
  const journalLabel = journalType === 'health' ? 'health journal' : 'journal'
  const title = cleanText(draft.journal.title, 120) || (journalType === 'health' ? 'Voice health journal note' : 'Voice journal note')
  const tags = Array.isArray(draft.journal.tags) ? draft.journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : []
  return {
    action: 'journal',
    transcript: raw,
    localDate,
    summary: title,
    confirmationMessage: `I can update this ${journalLabel} note: "${content.slice(0, 160)}${content.length > 160 ? '...' : ''}" Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    journal: { title, content, tags, journalType },
  }
}

function buildReviewedMoodCorrection(draft: any, answerRaw: string, localDate: string): VoiceDraft | null {
  if (draft?.action !== 'mood' || !draft?.canConfirm || !draft?.mood) return null
  const raw = cleanText(answerRaw, 800)
  const note = extractReviewedNoteCorrectionText(raw, 600)
  if (!note) return null

  const parsed = tryParseMoodRequest(`log mood: ${note}`, { section: 'mood', title: 'Mood Tracker' })
  const mood = parsed?.mood || draft.mood
  const safeMood = {
    mood: clampNumber(mood?.mood, 1, 7, clampNumber(draft.mood.mood, 1, 7, 4)),
    tags: Array.isArray(mood?.tags) ? mood.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : [],
    note,
  }
  const tagLine = safeMood.tags.length ? `, ${safeMood.tags.join(', ')}` : ''
  const summary = `Mood ${safeMood.mood}/7${tagLine}`
  return {
    action: 'mood',
    transcript: raw,
    localDate,
    summary,
    confirmationMessage: `I can update this mood draft: ${summary}. Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    mood: safeMood,
  }
}

function buildReviewedSymptomNoteCorrection(draft: any, answerRaw: string, localDate: string): VoiceDraft | null {
  if (draft?.action !== 'symptom_note' || !draft?.canConfirm || !draft?.symptom) return null
  const raw = cleanText(answerRaw, 1200)
  const notes = extractReviewedNoteCorrectionText(raw, 1200)
  if (!notes || !isSymptomTrackingRequest(`record symptom note: ${notes}`)) return null

  const parsedDraft = buildSymptomNotesHandoffDraft(notes, localDate)
  const symptoms = parsedDraft.symptom?.symptoms?.length ? parsedDraft.symptom.symptoms : draft.symptom.symptoms || []
  const duration = parsedDraft.symptom?.duration || draft.symptom.duration || null
  const nextDraft = {
    ...parsedDraft,
    transcript: raw,
    symptom: {
      symptoms,
      duration,
      notes,
    },
  }
  return {
    ...nextDraft,
    appTarget: {
      title: nextDraft.appTarget?.title || 'Symptom Notes',
      path: nextDraft.appTarget?.path || '/symptoms',
      buttonLabel: nextDraft.appTarget?.buttonLabel || 'Open Symptom Notes',
      nativeTarget: {
        ...nextDraft.appTarget?.nativeTarget,
        params: {
          ...nextDraft.appTarget?.nativeTarget?.params,
          voiceSymptoms: symptoms,
          voiceDuration: duration,
          voiceNotes: notes,
        },
      },
    },
  }
}

function healthIntakeReplacementLooksLikeNonName(value: string) {
  const cleaned = cleanText(value, 160).toLowerCase()
  if (!cleaned) return true
  if (/^(?:a\s+|an\s+|the\s+)?(?:medication|medicine|prescription|drug|rx|supplement|vitamin|mineral|herb)s?$/.test(cleaned)) return true
  if (extractDoseText(cleaned) === cleaned) return true
  if (extractTimingText(cleaned).length && cleaned.split(/\s+/).length <= 4) return true
  if (/^(?:dose|dosage|strength|time|timing|schedule)\b/.test(cleaned)) return true
  return false
}

function extractHealthIntakeNameCorrection(raw: string, target: HealthIntakeVoiceItem, hasOtherChange: boolean) {
  const targetName = cleanText(target?.name, 160)
  const targetPattern = targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const candidates: string[] = []
  const directName = raw.match(/\b(?:change|set|update|correct|rename)\s+(?:the\s+)?name\s+(?:to|as)\s+(.+)$/i)
  if (directName?.[1]) candidates.push(directName[1])
  const calledName = raw.match(/\b(?:call|name)\s+(?:it|this|that|the\s+item)\s+(.+)$/i)
  if (calledName?.[1]) candidates.push(calledName[1])
  const replaceWith = raw.match(/\breplace\s+(.+?)\s+with\s+(.+)$/i)
  if (replaceWith?.[2]) candidates.push(replaceWith[2])
  if (targetPattern) {
    const targetChange = raw.match(new RegExp(`\\b(?:change|update|correct|replace|rename)\\s+(?:the\\s+)?${targetPattern}\\s+(?:to|as|with)\\s+(.+)$`, 'i'))
    if (targetChange?.[1]) candidates.push(targetChange[1])
  }

  for (const candidate of candidates) {
    const replacement = cleanHealthIntakeNamePart(candidate)
    if (!replacement || replacement.toLowerCase() === targetName.toLowerCase()) continue
    if (healthIntakeReplacementLooksLikeNonName(replacement)) continue
    return replacement
  }

  return hasOtherChange ? '' : ''
}

function buildReviewedHealthIntakeCorrection(draft: any, answerRaw: string, localDate: string): VoiceDraft | null {
  if (draft?.action !== 'health_intake_items' || !draft?.canConfirm) return null
  const raw = cleanText(answerRaw, 800)
  if (!raw || !hasReviewedCorrectionWords(raw)) return null
  const items = Array.isArray(draft?.healthIntake?.items)
    ? draft.healthIntake.items.map((item: any) => normalizeHealthIntakeItem(item)).filter(Boolean) as HealthIntakeVoiceItem[]
    : []
  if (!items.length) return null

  const lower = raw.toLowerCase()
  const typeChange = /\b(medication|medicine|prescription|drug|rx)\b/i.test(raw)
    ? 'medication'
    : /\b(supplement|vitamin|mineral|herb)\b/i.test(raw)
    ? 'supplement'
    : null
  const dosage = extractDoseText(raw)
  const timing = extractTimingText(raw)
  const hasClearWord = /\b(?:remove|clear|delete|no|without)\b/i.test(raw)
  const clearDosage = (hasClearWord && /\b(?:dose|dosage|strength)\b/i.test(raw)) || /\b(?:dose|dosage|strength)\s+(?:not\s+specified|unspecified|unknown)\b/i.test(raw)
  const clearTiming = (hasClearWord && /\b(?:time|timing|schedule)\b/i.test(raw)) || /\b(?:time|timing|schedule)\s+(?:not\s+specified|unspecified|unknown)\b/i.test(raw)

  const explicitTarget = items.find((item) => item.name && lower.includes(item.name.toLowerCase()))
  const typeTarget = !explicitTarget && typeChange ? items.find((item) => item.type !== typeChange) : null
  const target = explicitTarget || typeTarget || (items.length === 1 ? items[0] : null)
  if (!target) return null

  const nameReplacement = extractHealthIntakeNameCorrection(raw, target, Boolean(typeChange || dosage || timing.length || clearDosage || clearTiming))

  let changed = false
  const nextItems = items.map((item) => {
    if (item !== target) return item
    const nextItem = {
      ...item,
      type: typeChange || item.type,
      name: nameReplacement || item.name,
      dosage: clearDosage ? '' : dosage || item.dosage || '',
      timing: clearTiming ? [] : timing.length ? timing : item.timing || [],
    }
    changed =
      changed ||
      nextItem.type !== item.type ||
      nextItem.name !== item.name ||
      cleanText(nextItem.dosage, 80) !== cleanText(item.dosage, 80) ||
      (nextItem.timing || []).join('|') !== (item.timing || []).join('|')
    return nextItem
  })
  if (!changed) return null

  return buildHealthIntakeItemsDraft(nextItems, raw, localDate)
}

async function buildReviewedDraftCorrection(draft: any, answerRaw: string, localDate: string): Promise<VoiceDraft | null> {
  const symptomNoteCorrection = buildReviewedSymptomNoteCorrection(draft, answerRaw, localDate)
  if (symptomNoteCorrection) return symptomNoteCorrection

  const healthIntakeCorrection = buildReviewedHealthIntakeCorrection(draft, answerRaw, localDate)
  if (healthIntakeCorrection) return healthIntakeCorrection

  const journalCorrection = buildReviewedJournalCorrection(draft, answerRaw, localDate)
  if (journalCorrection) return journalCorrection

  const moodCorrection = buildReviewedMoodCorrection(draft, answerRaw, localDate)
  if (moodCorrection) return moodCorrection

  const exerciseCorrection = buildReviewedExerciseCorrection(draft, answerRaw, localDate)
  if (exerciseCorrection) return exerciseCorrection

  const waterCorrection = buildReviewedWaterCorrection(draft, answerRaw, localDate)
  if (waterCorrection) return waterCorrection

  const correction =
    extractReviewedFoodAmountCorrection(draft, answerRaw) ||
    extractReviewedFoodCountCorrection(draft, answerRaw) ||
    extractReviewedFoodReplacement(draft, answerRaw) ||
    extractReviewedFoodRemoval(draft, answerRaw) ||
    extractReviewedFoodAddition(draft, answerRaw) ||
    extractReviewedFoodMealCorrection(draft, answerRaw)
  if (!correction) return null
  const draftText = correction.correctedParts.join(', ')
  return buildVoiceMealDraft(
    {
      meal: correction.meal,
      mealName: correction.mealName,
      draftText,
      ingredients: correction.correctedParts.map(parseIngredientPhrase).filter(Boolean),
    },
    `Correct reviewed food draft: ${draftText}`,
    localDate,
  )
}

function ingredientNeedsAmountClarification(ingredient: any) {
  const display = cleanText([ingredient?.display, ingredient?.quantity, ingredient?.name].filter(Boolean).join(' '), 180)
  if (!/\b(?:some|a few|few|couple(?: of)?|a couple(?: of)?|handful(?: of)?|a handful(?: of)?|bit(?: of)?|a bit(?: of)?|little(?: bit)?(?: of)?|a little(?: bit)?(?: of)?|several)\b/i.test(display)) return false
  if (numberFromWords(ingredient?.quantity)) return false
  if (servingGramsFromText(display)) return false
  if (cleanText(ingredient?.unit, 40)) return false
  return true
}

function splitIngredientList(value: string) {
  return String(value || '')
    .replace(/\band\b/gi, ',')
    .split(',')
    .map((part) => cleanText(part.replace(/[.?!]+$/g, ''), 120))
    .filter(Boolean)
    .slice(0, 12)
}

function parseIngredientPhrase(value: string) {
  const text = cleanText(value, 160)
  const match = text.match(
    /^(?:(one|two|three|four|five|six|seven|eight|nine|ten|half|\d+(?:\.\d+)?)\s+)?(?:(cup|cups|slice|slices|egg|eggs|gram|grams|g|kg|ml|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp)\s+(?:of\s+)?)?(.+)$/i,
  )
  if (!match) return normalizeIngredientRequest(text)
  const quantity = match[1] || null
  const unit = match[2] || null
  const name = cleanText(match[3] || text, 120)
  return normalizeIngredientRequest({ name, quantity, unit, display: text })
}

function naturalFoodListFromSpeech(value: string) {
  const text = cleanText(value, 1400)
  const match = text.match(/\b(?:i(?:'m| am)?\s+)?(?:eat|eating|ate|having|have had|had)\b\s+(.+)$/i)
  const candidate = cleanText(match?.[1] || '', 1000)
    .replace(/\b(?:while|when|because)\b.+$/i, ' ')
    .replace(/\.$/, '')
    .trim()
  return candidate || null
}

function tryParseIngredientMealRequest(transcript: string) {
  const text = cleanText(translateLocalizedFoodRequest(transcript), 1400)
  const lower = text.toLowerCase()
  const asksForFood =
    /\b(build|make|create|add|log|put|input|record|track|save|enter)\b/.test(lower) &&
    /\b(breakfast|lunch|dinner|snack|meal|food|ingredient|ingredients)\b/.test(lower)
  if (!asksForFood) return null

  const meal = inferMealFromText(text, lower.includes('snack') || lower.includes('coffee') || lower.includes('drink') ? 'snacks' : 'uncategorized')
  const withMatch = text.match(/^(.*?)\b(?:with|using|including|contains|made of|made from)\b\s+(.+)$/i)
  const beforeWith = cleanText(
    withMatch?.[1]
      ?.replace(/\b(build|make|create|add|log|logged|lobbed|put|input|record|track|save|enter)\b/gi, ' ')
      .replace(/\b(me|a|an|my|breakfast|lunch|dinner|snacks?|meal|food|ingredient|ingredients)\b/gi, ' '),
    500,
  )
  const afterWith = withMatch?.[2]
  const afterColon = text.includes(':') ? text.split(':').slice(1).join(':') : ''
  const explicitList = cleanText([beforeWith, afterWith || afterColon].filter(Boolean).join(', '), 1000)
  const fallbackList = stripVoiceFoodCommandWords(text)
  const listText = cleanText(explicitList || fallbackList, 1000)
  if (!listText) return null
  const ingredients = splitIngredientList(listText).map(parseIngredientPhrase).filter(Boolean)
  if (ingredients.length < 2) return null
  const mealName = meal === 'uncategorized' ? 'Meal' : `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
  return {
    meal,
    mealName,
    draftText: ingredients.map((entry: any) => entry.display || entry.name).join(', '),
    ingredients,
  }
}

function tryParseDirectFoodRequest(transcript: string, launchContext?: VoiceLaunchContext) {
  const text = cleanText(translateLocalizedFoodRequest(transcript, launchContext), 1400)
  const lower = text.toLowerCase()
  const hasSaveCommand = /\b(add|log|logged|lobbed|put|input|record|track|save|enter)\b/.test(lower)
  const inFoodContext = launchContext?.section === 'food'
  const naturalFoodList = naturalFoodListFromSpeech(text)
  const hasKnownFoodWords =
    /\b(food|meal|breakfast|lunch|dinner|snack|snacks|ingredient|ingredients)\b/.test(lower) ||
    /\b(coffee|tea|banana|shake|smoothie|yogurt|yoghurt|egg|eggs|toast|avocado|chicken|rice|milk|salmon|beef|steak|pork|tuna|turkey|bread|oats?|potato|sweet potato|broccoli|spinach|apple|apples|nashi|orange|berries|blueberries|peanut|peanuts|nuts|protein|pasta|noodles|wrap|sandwich|soup|salad)\b/.test(lower)
  const hasNaturalFoodSpeech = Boolean(naturalFoodList && (inFoodContext || hasKnownFoodWords))
  if (!hasSaveCommand && !hasNaturalFoodSpeech) return null
  const clearlyFoodRequest =
    hasKnownFoodWords ||
    /\b(to|into|in|for|as)\s+(?:my\s+)?(breakfast|lunch|dinner|snacks?)\b/.test(lower)
  if (!clearlyFoodRequest) return null
  if (/\b(favourite|favorite|saved|same|yesterday|previous)\b/.test(lower)) return null

  const meal = inferMealFromText(text, lower.includes('snack') || lower.includes('coffee') || lower.includes('drink') ? 'snacks' : 'uncategorized')
  const withoutCommand = naturalFoodList || stripVoiceFoodCommandWords(text)
  const listText = cleanText(withoutCommand.replace(/\bwith\b/gi, ',').replace(/\band\b/gi, ','), 1000)
  const ingredients = splitIngredientList(listText).map(parseIngredientPhrase).filter(Boolean)
  if (ingredients.length === 0) return null
  const mealName = meal === 'uncategorized' ? 'Food' : `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
  return {
    meal,
    mealName,
    draftText: ingredients.map((entry: any) => entry.display || entry.name).join(', '),
    ingredients,
  }
}

function parseVoiceNumber(value: string | undefined | null) {
  const normalized = String(value || '').replace(/,/g, '').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function tryParseExerciseRequest(transcript: string, launchContext?: VoiceLaunchContext) {
  const raw = cleanText(transcript, 600)
  const lower = raw.toLowerCase()
  const distanceMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(k|km|kilometre|kilometer|kilometres|kilometers|mi|mile|miles)\b/)
  const macedonianDistanceMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(км|километри?|километар|километра)/i)
  const durationMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/)
  const macedonianDurationMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(минути?|мин|часа|час)/i)
  const stepsMatch = lower.match(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:steps?|step count)\b/)
  const caloriesMatch = lower.match(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:kcal|calories?|cals?)\b/)
  const steps = parseVoiceNumber(stepsMatch?.[1])
  const caloriesKcal = parseVoiceNumber(caloriesMatch?.[1])
  const inExerciseContext = launchContext?.section === 'exercise'
  const hasExerciseAction =
    /\b(log|add|record|track|did|done|completed|finished|went|ran|walked|walking|jogged|jogging|biked|biking|cycled|cycling|rode|riding|exercised)\b/.test(lower) ||
    /(запиши|додај|додаj|зачувај|зачуваj|сними|внеси|пешачев|одев|трчав|возев|вежбав)/i.test(raw) ||
    /(registra|registrar|agrega|añade|anade|hice|caminé|camine|corrí|corri|monté|monte|entrené|entrene|enregistre|ajoute|j'ai fait|marché|marche|couru|vélo|velo|entraîné|entraine|aggiungi|registra|ho fatto|camminato|corso|allenato|bici|bicicletta|registra|adicione|adiciona|caminhei|corri|treinei|bicicleta|trage|trag|notiere|speichere|ging|gegangen|gelaufen|gerannt|trainiert|fahrrad|rad gefahren)/i.test(raw)
  const hasExerciseWords =
    /\b(walk(?:ed|ing)?|run|running|ran|jog(?:ged|ging)?|gym|workout|bike(?:d|ing)?|cycl(?:e|ed|ing)|rode|riding|exercise(?:d)?)\b/.test(lower) ||
    /(пешач|одев|трч|џог|jог|теретана|вежб|велосипед|точак|возев)/i.test(raw) ||
    /(caminar|caminé|camine|caminata|correr|corrí|corri|gimnasio|entreno|bicicleta|bici|marcher|marché|marche|course|couru|vélo|velo|sport|entraînement|entrainement|camminare|camminato|corsa|correre|corso|palestra|allenamento|bicicletta|bici|andare in bici|caminhar|caminhei|corrida|correr|corri|academia|treino|bicicleta|gehen|gegangen|spazieren|laufen|gelaufen|rennen|gerannt|joggen|fitnessstudio|training|fahrrad|radfahren|rad gefahren)/i.test(raw)
  if (!(hasExerciseAction && (hasExerciseWords || steps || caloriesKcal)) && !(inExerciseContext && (hasExerciseWords || distanceMatch || macedonianDistanceMatch || durationMatch || macedonianDurationMatch || steps || caloriesKcal))) return null
  const distanceKm = distanceMatch
    ? Number(distanceMatch[1]) * (distanceMatch[2].startsWith('mi') || distanceMatch[2].startsWith('mile') ? 1.609 : 1)
    : macedonianDistanceMatch
    ? Number(macedonianDistanceMatch[1].replace(',', '.'))
    : steps && hasExerciseWords
    ? steps * 0.0008
    : null
  const durationRaw = durationMatch ? Number(durationMatch[1]) : macedonianDurationMatch ? Number(macedonianDurationMatch[1].replace(',', '.')) : null
  const durationMinutes = durationRaw
    ? durationRaw * (/hour|hr|час/.test(durationMatch?.[2] || macedonianDurationMatch?.[2] || '') ? 60 : 1)
    : distanceKm
    ? lower.includes('run') || /трч|џог|jог|corr|couru|course|correre|corso|corsa|correr|corri|corrida|laufen|gelaufen|rennen|gerannt|joggen/i.test(raw)
      ? Math.max(10, Math.round(distanceKm * 7))
      : lower.includes('bike') || lower.includes('cycling') || lower.includes('cycle') || lower.includes('ride') || lower.includes('rode') || /велосипед|точак|возев|bicicleta|bici|vélo|velo|bicicletta|bici|bicicleta|fahrrad|radfahren|rad gefahren/i.test(raw)
      ? Math.max(10, Math.round(distanceKm * 4))
      : Math.max(10, Math.round(distanceKm * 12))
    : lower.includes('gym') || lower.includes('workout') || /теретана|вежб|gimnasio|entreno|sport|entraînement|entrainement|palestra|allenamento|academia|treino|fitnessstudio|training/i.test(raw)
    ? 45
    : 30
  const name = /\b(run|ran|running|jog|jogged|jogging)\b/.test(lower) || /трч|џог|jог|corr|couru|course|correre|corso|corsa|correr|corri|corrida|laufen|gelaufen|rennen|gerannt|joggen/i.test(raw)
    ? 'running'
    : lower.includes('bike') || lower.includes('cycling') || lower.includes('cycle') || lower.includes('ride') || lower.includes('rode') || /велосипед|точак|возев|bicicleta|bici|vélo|velo|bicicletta|bici|bicicleta|fahrrad|radfahren|rad gefahren/i.test(raw)
    ? 'cycling'
    : lower.includes('gym') || lower.includes('workout') || /теретана|вежб|gimnasio|entreno|sport|entraînement|entrainement|palestra|allenamento|academia|treino|fitnessstudio|training/i.test(raw)
    ? 'gym'
    : 'walking'
  const intensity = lower.includes('hard') || lower.includes('intense') || /тешк|интензив/i.test(raw)
    ? 'hard'
    : lower.includes('easy') || lower.includes('light') || /лесн|полесн/i.test(raw)
    ? 'light'
    : lower.includes('moderate') || /умерен/i.test(raw)
    ? 'moderate'
    : null
  return {
    action: 'exercise',
    summary: raw,
    exercise: {
      name,
      durationMinutes,
      distanceKm: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
      steps: steps && steps > 0 ? Math.round(steps) : null,
      caloriesKcal: caloriesKcal && caloriesKcal > 0 ? Math.round(caloriesKcal) : null,
      intensity,
      estimatedDuration: !durationMatch && !macedonianDurationMatch,
    },
  }
}

function tryParseMoodRequest(transcript: string, launchContext?: VoiceLaunchContext) {
  const raw = cleanText(transcript, 600)
  const lower = raw.toLowerCase()
  const inMoodContext = launchContext?.section === 'mood'
  const hasMoodWords =
    /\b(feel|feeling|felt|mood|sad|down|anxious|anxiety|great|happy|good|better|okay|ok|low|stressed|stress|overwhelmed|angry|upset|calm)\b/.test(lower) ||
    /(се чувствувам|расположение|таж|лошо|анксиозн|вознемир|среќ|добро|подобро|стрес|преплавен|лут|вознемирен|смирен|мирно)/i.test(raw) ||
    /\b(me siento|estado de ánimo|estado de animo|triste|ansioso|ansiosa|estresado|estresada|feliz|bien|mejor|tranquilo|tranquila|calmado|calmada|je me sens|humeur|triste|anxieux|anxieuse|stressé|stressée|stresse|heureux|heureuse|bien|mieux|calme|mi sento|umore|triste|ansioso|ansiosa|stressato|stressata|felice|bene|meglio|tranquillo|tranquilla|calmo|calma|me sinto|humor|triste|ansioso|ansiosa|estressado|estressada|feliz|bem|melhor|tranquilo|tranquila|calmo|calma|ich fühle mich|ich fuehle mich|stimmung|traurig|ängstlich|aengstlich|gestresst|glücklich|gluecklich|gut|besser|ruhig|wütend|wuetend)\b/i.test(raw)
  if (!hasMoodWords && !inMoodContext) return null
  const mood = /\b(terrible|awful|very low|really low|crisis)\b/.test(lower) || /(многу лошо|криза|ужасно)/i.test(raw) || /\b(muy mal|terrible|horrible|crisis|très mal|tres mal|crise)\b/i.test(raw)
    ? 1
    : /\b(great|happy|excellent|amazing)\b/.test(lower) || /(одлично|среќ|прекрасно)/i.test(raw) || /\b(feliz|excelente|genial|heureux|heureuse|excellent|felice|eccellente|benissimo|feliz|excelente|ótimo|otimo|glücklich|gluecklich|ausgezeichnet)\b/i.test(raw)
    ? 6
    : /\b(good|better|calm|okay|ok)\b/.test(lower) || /(добро|подобро|смирен|мирно)/i.test(raw) || /\b(bien|mejor|tranquilo|tranquila|calmado|calmada|mieux|calme|bene|meglio|tranquillo|tranquilla|calmo|calma|bem|melhor|tranquilo|tranquila|calmo|calma|gut|besser|ruhig)\b/i.test(raw)
    ? 5
    : /\b(sad|low|down|angry|upset)\b/.test(lower) || /(таж|лошо|лут|вознемирен)/i.test(raw) || /\b(triste|bajo|baja|enojado|enojada|triste|bas|basse|fâché|fache|arrabbiato|arrabbiata|giù|giu|traurig|wütend|wuetend|niedergeschlagen)\b/i.test(raw)
    ? 2
    : /\b(anxious|anxiety|stressed|stress|overwhelmed)\b/.test(lower) || /(анксиозн|стрес|преплавен)/i.test(raw) || /\b(ansioso|ansiosa|ansiedad|estresado|estresada|anxieux|anxieuse|stressé|stressée|stresse|ansia|stressato|stressata|stress|sopraffatto|sopraffatta|ansioso|ansiosa|ansiedade|estressado|estressada|estresse|sobrecarregado|sobrecarregada|ängstlich|aengstlich|angst|gestresst|stress|überfordert|ueberfordert)\b/i.test(raw)
    ? 3
    : 4
  const tags = [
    /\b(sad|low|down)\b/.test(lower) || /таж|лошо/i.test(raw) || /\b(triste|bajo|baja|bas|basse|giù|giu|traurig|niedergeschlagen)\b/i.test(raw) ? 'sad' : '',
    /\b(anxious|anxiety)\b/.test(lower) || /анксиозн/i.test(raw) || /\b(ansioso|ansiosa|ansiedad|anxieux|anxieuse|ansia|ansiedade|ängstlich|aengstlich|angst)\b/i.test(raw) ? 'anxious' : '',
    /\b(stressed|stress|overwhelmed)\b/.test(lower) || /стрес|преплавен/i.test(raw) || /\b(estresado|estresada|stressé|stressée|stresse|stressato|stressata|stress|sopraffatto|sopraffatta|estressado|estressada|estresse|sobrecarregado|sobrecarregada|gestresst|stress|überfordert|ueberfordert)\b/i.test(raw) ? 'stressed' : '',
    /\b(angry|upset)\b/.test(lower) || /лут|вознемирен/i.test(raw) || /\b(enojado|enojada|fâché|fache|arrabbiato|arrabbiata|wütend|wuetend)\b/i.test(raw) ? 'angry' : '',
    /\b(calm)\b/.test(lower) || /смирен|мирно/i.test(raw) || /\b(tranquilo|tranquila|calmado|calmada|calme|tranquillo|tranquilla|calmo|calma|tranquilo|tranquila|ruhig)\b/i.test(raw) ? 'calm' : '',
    /\b(great|happy|good|better|excellent|amazing)\b/.test(lower) || /среќ|добро|подобро|одлично/i.test(raw) || /\b(feliz|bien|mejor|excelente|genial|heureux|heureuse|mieux|excellent|felice|bene|meglio|eccellente|benissimo|bem|melhor|ótimo|otimo|glücklich|gluecklich|gut|besser|ausgezeichnet)\b/i.test(raw) ? 'positive' : '',
  ].filter(Boolean)
  return { action: 'mood', mood: { mood, tags, note: raw } }
}

function tryParseJournalRequest(transcript: string, launchContext?: VoiceLaunchContext) {
  const raw = cleanText(transcript, 1200)
  const lower = raw.toLowerCase()
  const inJournalContext = launchContext?.section === 'journal'
  const hasMacedonianJournalWord = /(дневник|белешка|белешки)/i.test(raw)
  const hasRomanceJournalWord = /\b(diario|diário|journal|nota|note|carnet)\b/i.test(raw)
  const hasGermanJournalWord = /\b(?:gesundheit(?:s)?tagebuch|tagebuch|notiz|notizen)\b/i.test(raw)
  if (!/\b(journal|note|diary)\b/.test(lower) && !hasMacedonianJournalWord && !hasRomanceJournalWord && !hasGermanJournalWord && !inJournalContext) return null
  if (/\b(open|show|go to|take me to|use|find)\b/.test(lower) || /(отвори|покажи|оди до|најди|наjди|öffne|offne|zeige|geh zu|gehe zu|finde|benutze)/i.test(raw)) return null
  const hasJournalAction =
    /\b(add|save|record|log|write|update|create|journal that|note that|diary that)\b/.test(lower) ||
    /(запиши|додај|додаj|зачувај|зачуваj|сними|внеси)/i.test(raw) ||
    /(escribe|escribir|agrega|añade|anade|guarda|registrar|registra|écris|ecris|ajoute|enregistre|note|scrivi|aggiungi|registra|salva|annota|escreve|escreva|adicione|adiciona|registra|salva|anota|schreib|schreibe|speichere|notiere|trag|trage)/i.test(raw)
  if (!hasJournalAction && !inJournalContext) return null
  const journalType = /\bhealth journal\b/.test(lower) || /(здравствен|здравје|здравjе)/i.test(raw) || /(salud|santé|sante|salute|saúde|saude|gesundheit)/i.test(raw) || inJournalContext ? 'health' : 'mood'
  const content = hasJournalAction
    ? cleanText(
        raw
          .replace(/^add this to my journal:?\s*/i, '')
          .replace(/^journal that\s*/i, '')
          .replace(/^(?:add|save|record|log|write|update|create)\s+(?:this\s+)?(?:(?:to|in|into)\s+)?(?:a\s+|my\s+|the\s+)?(?:mood\s+|health\s+)?(?:journal|note|diary)(?:\s+(?:entry|note))?(?:\s+for\s+today)?(?:\s+that|:)?\s*/i, '')
          .replace(/^(?:запиши|додај|додаj|зачувај|зачуваj|сними|внеси)\s+(?:го\s+|ја\s+|jа\s+)?(?:ова\s+)?(?:во\s+)?(?:мојот\s+|моjот\s+|мојата\s+|моjата\s+)?(?:здравствен(?:иот)?\s+)?(?:дневник(?:от)?|белешка|белешки)(?:\s+(?:дека|:))?\s*/i, '')
          .replace(/^(?:запиши|додај|додаj|зачувај|зачуваj|сними|внеси)\s+(?:дека|:)\s*/i, '')
          .replace(/^(?:escribe|escribir|agrega|añade|anade|guarda|registrar|registra)\s+(?:esto\s+)?(?:en\s+)?(?:mi\s+)?(?:diario\s+de\s+salud|diario|nota)(?:\s+(?:que|:))?\s*/i, '')
          .replace(/^(?:écris|ecris|ajoute|enregistre|note)\s+(?:ça\s+|ca\s+)?(?:dans\s+)?(?:mon\s+)?(?:journal\s+de\s+santé|journal\s+de\s+sante|journal|note)(?:\s+(?:que|:))?\s*/i, '')
          .replace(/^(?:scrivi|aggiungi|registra|salva|annota)\s+(?:questo\s+)?(?:nel\s+|nella\s+|in\s+)?(?:mio\s+|mia\s+)?(?:diario\s+di\s+salute|diario|nota)(?:\s+(?:che|:))?\s*/i, '')
          .replace(/^(?:escreve|escreva|adicione|adiciona|registra|salva|anota)\s+(?:isso\s+)?(?:no\s+|na\s+|em\s+)?(?:meu\s+|minha\s+)?(?:diário\s+de\s+saúde|diario\s+de\s+saude|diário|diario|nota)(?:\s+(?:que|:))?\s*/i, '')
          .replace(/^(?:schreib|schreibe|speichere|notiere|trag|trage)\s+(?:das\s+)?(?:in\s+)?(?:mein(?:em|en)?\s+)?(?:gesundheit(?:s)?\s*)?(?:tagebuch|notiz|notizen)(?:\s+(?:dass|:))?\s*/i, ''),
        1200,
      )
    : raw
  if (!content) return null
  return {
    action: 'journal',
    journal: {
      title: journalType === 'health' ? 'Voice health journal note' : 'Voice journal note',
      content,
      tags: [],
      journalType,
    },
  }
}

function buildQuickJournalDraft(parsed: any, transcript: string, localDate: string): VoiceDraft | null {
  if (parsed?.action !== 'journal') return null
  const journal = parsed.journal || {}
  const content = cleanText(journal.content || transcript, 2000)
  if (!content) return null
  const title = cleanText(journal.title || 'Voice journal note', 120)
  const tags = Array.isArray(journal.tags) ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : []
  const journalTypeRaw = String(journal.journalType || journal.type || '').toLowerCase()
  const journalType = journalTypeRaw === 'health' || /\bhealth journal\b/i.test(transcript) ? 'health' : 'mood'
  const journalLabel = journalType === 'health' ? 'health journal' : 'journal'
  return {
    action: 'journal',
    transcript,
    localDate,
    summary: title,
    confirmationMessage: `I can add this ${journalLabel} note: "${content.slice(0, 160)}${content.length > 160 ? '...' : ''}" Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    journal: { title, content, tags, journalType },
  }
}

function tryParseCopyPreviousRequest(transcript: string) {
  const raw = cleanText(transcript, 600)
  const lower = raw.toLowerCase()
  if (!/\b(add|log|copy|same|repeat)\b/.test(lower)) return null
  if (!/\b(same|yesterday|previous)\b/.test(lower)) return null
  if (!/\b(breakfast|lunch|dinner|snack|snacks|meal|food)\b/.test(lower)) return null
  return {
    action: 'food_copy_previous',
    food: {
      meal: inferMealFromText(raw, 'breakfast'),
    },
  }
}

const RECIPE_PLAIN_INGREDIENTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(chicken breast|chicken)\b/i, label: '150 g chicken breast' },
  { pattern: /\b(cooked rice|brown rice|white rice|rice)\b/i, label: '120 g cooked rice' },
  { pattern: /\bavocado\b/i, label: '75 g avocado' },
  { pattern: /\b(greek yogh?urt|yogh?urt|yogurt)\b/i, label: '170 g plain Greek yogurt' },
  { pattern: /\b(egg|eggs)\b/i, label: '2 large eggs' },
  { pattern: /\b(toast|bread|sourdough)\b/i, label: '1 slice sourdough toast' },
  { pattern: /\b(oats?|rolled oats)\b/i, label: '1 cup rolled oats' },
  { pattern: /\bblueberr(?:y|ies)\b/i, label: '100 g blueberries' },
  { pattern: /\bbanana\b/i, label: '1 banana' },
  { pattern: /\b(salmon)\b/i, label: '150 g salmon' },
  { pattern: /\b(sweet potato)\b/i, label: '150 g sweet potato' },
  { pattern: /\b(broccoli)\b/i, label: '100 g broccoli' },
  { pattern: /\b(spinach)\b/i, label: '75 g spinach' },
  { pattern: /\b(chickpeas?|chick peas?)\b/i, label: '100 g chickpeas' },
  { pattern: /\b(olive oil|oil)\b/i, label: '1 tbsp olive oil' },
]

function requestedRecipeIngredients(transcript: string) {
  const match = transcript.match(/\b(?:with|using|including|from|made of)\b\s+(.+)$/i)
  if (!match?.[1]) return []
  const text = cleanText(match[1].replace(/[.?!]+$/g, ''), 500)
  const found = RECIPE_PLAIN_INGREDIENTS
    .map((entry) => {
      const ingredientMatch = text.match(entry.pattern)
      return ingredientMatch?.index === undefined ? null : { index: ingredientMatch.index, label: entry.label }
    })
    .filter((entry): entry is { index: number; label: string } => Boolean(entry))
    .sort((a, b) => a.index - b.index)
  const unique = Array.from(new Set(found.map((entry) => entry.label)))
  if (unique.length > 0) return unique.slice(0, 10)

  return splitIngredientList(text)
    .map((part) => parseIngredientPhrase(part))
    .filter(Boolean)
    .map((entry: any) => entry.display || entry.name)
    .slice(0, 10)
}

function isFoodDiaryLaunchContext(launchContext?: VoiceLaunchContext) {
  const section = cleanText(launchContext?.section || '', 40).toLowerCase()
  const title = cleanText(launchContext?.title || '', 80).toLowerCase()
  return section === 'food' || title.includes('food diary')
}

function isFoodRecommendationRequest(transcript: string, launchContext?: VoiceLaunchContext) {
  const raw = cleanText(transcript, 1000)
  const lower = raw.toLowerCase()
  const inFoodContext = isFoodDiaryLaunchContext(launchContext)
  const asksForMealAdvice =
    /\b(what should i eat|what can i eat|what to eat|what should i have|what can i have|what meal should i have|what meal fits|suggest a meal|suggest me a meal|suggest something to eat|recommend (?:i|that i|something to) eat|recommend a meal|recommend breakfast|recommend lunch|recommend dinner|recommend a snack|meal recommendation|food recommendation)\b/.test(lower) ||
    /\b(remaining calories|current calories|calories left|remaining protein|current protein|protein left|remaining carbs|current carbs|carbs left|remaining carbohydrates|current carbohydrates|carbohydrates left|remaining fat|current fat|fat left|remaining fats|current fats|fats left|remaining fibre|current fibre|fibre left|remaining fiber|current fiber|fiber left|remaining macros|current macros|remaining nutrients|current nutrients|nutrients left|remaining nutrition|current nutrition|fit my calories|fit my macros|fit my nutrients|fits my calories|fits my macros|fits my nutrients)\b/.test(lower) ||
    /\bbased on (?:my )?(?:current\s+)?(?:calories|macros|nutrients|nutrition|food diary|diary|today|remaining|what i'?ve eaten|what i have eaten|what i'?ve logged|what i have logged|what i'?ve had|what i have had|what i'?ve consumed|what i have consumed)\b/.test(lower) ||
    /(што\s+да\s+јадам|што\s+да\s+jадам|што\s+можам\s+да\s+јадам|што\s+можам\s+да\s+jадам|препорачај\s+(?:ми\s+)?(?:оброк|појадок|ручек|вечера|ужина)|предложи\s+(?:ми\s+)?(?:оброк|појадок|ручек|вечера|ужина)|оброк\s+што\s+(?:одговара|пасува))/i.test(raw) ||
    /(преостанати\s+(?:калории|протеини|јаглехидрати|масти|нутриенти)|калории\s+(?:што\s+)?(?:ми\s+)?(?:остануваат|останале)|според\s+(?:моите\s+)?(?:калории|макроа|нутриенти|дневникот|денешниот\s+дневник))/i.test(raw) ||
    /(qué\s+debo\s+comer|que\s+debo\s+comer|qué\s+puedo\s+comer|que\s+puedo\s+comer|qué\s+comer|que\s+comer|recomienda(?:me)?\s+(?:un\s+)?(?:desayuno|almuerzo|cena|merienda|comida)|sugiere(?:me)?\s+(?:un\s+)?(?:desayuno|almuerzo|cena|merienda|comida)|que\s+devrais-je\s+manger|qu['’]?est-ce\s+que\s+je\s+devrais\s+manger|que\s+puis-je\s+manger|recommande(?:-moi)?\s+(?:un\s+)?(?:petit-déjeuner|petit\s+dejeuner|déjeuner|dejeuner|dîner|diner|repas|collation)|suggère(?:-moi)?\s+(?:un\s+)?(?:repas|dîner|diner|déjeuner|dejeuner|collation))/i.test(raw) ||
    /(calor[ií]as?\s+(?:restantes|que\s+me\s+quedan)|prote[ií]nas?\s+restantes|carbohidratos?\s+restantes|grasas?\s+restantes|macros?\s+restantes|seg[uú]n\s+(?:mis\s+)?(?:calor[ií]as|macros|nutrientes|diario)|calories?\s+restantes?|prot[ée]ines?\s+restantes?|glucides?\s+restants?|lipides?\s+restants?|macros?\s+restantes?|selon\s+(?:mes\s+)?(?:calories|macros|nutriments|journal))/i.test(raw) ||
    /(cosa\s+dovrei\s+mangiare|cosa\s+posso\s+mangiare|cosa\s+mangiare|consiglia(?:mi)?\s+(?:una\s+)?(?:colazione|pranzo|cena|spuntino|pasto)|suggerisci(?:mi)?\s+(?:una\s+)?(?:colazione|pranzo|cena|spuntino|pasto))/i.test(raw) ||
    /(calorie\s+restanti|proteine\s+restanti|carboidrati\s+restanti|grassi\s+restanti|macro\s+restanti|secondo\s+(?:le\s+mie\s+)?(?:calorie|macro|nutrienti|diario))/i.test(raw) ||
    /(o\s+que\s+devo\s+comer|o\s+que\s+posso\s+comer|o\s+que\s+comer|recomenda(?:-me)?\s+(?:um\s+)?(?:café\s+da\s+manhã|cafe\s+da\s+manha|pequeno[-\s]?almoço|pequeno[-\s]?almoco|almoço|almoco|jantar|lanche|refeição|refeicao)|sugere(?:-me)?\s+(?:um\s+)?(?:café\s+da\s+manhã|cafe\s+da\s+manha|pequeno[-\s]?almoço|pequeno[-\s]?almoco|almoço|almoco|jantar|lanche|refeição|refeicao))/i.test(raw) ||
    /(calorias\s+restantes|proteínas\s+restantes|proteinas\s+restantes|carboidratos\s+restantes|gorduras\s+restantes|macros?\s+restantes|segundo\s+(?:as\s+minhas\s+|minhas\s+)?(?:calorias|macros|nutrientes|diário|diario))/i.test(raw) ||
    /(was\s+soll\s+ich\s+essen|was\s+kann\s+ich\s+essen|was\s+essen|empfiehl(?:\s+mir)?\s+(?:ein\s+)?(?:frühstück|fruehstueck|mittagessen|abendessen|snack|mahlzeit)|schlag(?:\s+mir)?\s+(?:ein\s+)?(?:frühstück|fruehstueck|mittagessen|abendessen|snack|mahlzeit)\s+vor|mahlzeit\s+die\s+(?:passt|zu\s+mir\s+passt))/i.test(raw) ||
    /(verbleibende\s+(?:kalorien|proteine|kohlenhydrate|fette|makros|nährstoffe|naehrstoffe)|kalorien\s+(?:übrig|uebrig|restlich)|protein\s+(?:übrig|uebrig|restlich)|nach\s+(?:meinen\s+)?(?:kalorien|makros|nährstoffen|naehrstoffen|tagebuch))/i.test(raw)
  const hasFoodMeaning =
    /\b(eat|meal|food|breakfast|lunch|dinner|snack|recipe|calorie|calories|macro|macros|protein|carb|carbs|carbohydrate|carbohydrates|fat|fats|fibre|fiber|nutrient|nutrients|nutrition|food diary)\b/.test(lower) ||
    /(јадам|jадам|оброк|храна|појадок|ручек|вечера|ужина|рецепт|калории|протеини|јаглехидрати|масти|нутриенти|дневник)/i.test(raw) ||
    /(comer|comida|desayuno|almuerzo|cena|merienda|receta|calor[ií]as|prote[ií]na|carbohidrato|grasa|nutriente|diario|manger|repas|petit-déjeuner|petit\s+dejeuner|déjeuner|dejeuner|dîner|diner|collation|recette|calories|prot[ée]ine|glucide|lipide|nutriment|journal|mangiare|pasto|colazione|pranzo|cena|spuntino|ricetta|calorie|proteine|carboidrati|grassi|macro|nutrienti|diario|comer|refeição|refeicao|café\s+da\s+manhã|cafe\s+da\s+manha|pequeno[-\s]?almoço|pequeno[-\s]?almoco|almoço|almoco|jantar|lanche|receita|calorias|proteína|proteina|carboidratos|gorduras|macro|nutrientes|diário|diario|essen|mahlzeit|frühstück|fruehstueck|mittagessen|abendessen|snack|rezept|kalorien|protein|kohlenhydrate|fett|makros|nährstoff|naehrstoff|tagebuch)/i.test(raw)
  return asksForMealAdvice && (inFoodContext || hasFoodMeaning)
}

function buildQuickRecipeDraft(transcript: string, localDate: string, launchContext?: VoiceLaunchContext): VoiceDraft | null {
  const raw = cleanText(transcript, 1000)
  const lower = raw.toLowerCase()
  const recipeIntent =
    /\b(recipe|meal idea|meal plan|dinner idea|lunch idea|breakfast idea|snack idea)\b/.test(lower) ||
    /\b(what can i make|what should i make|what can i cook|what should i cook|give me something to cook|suggest a meal|suggest something to eat)\b/.test(lower)
  if (!recipeIntent) return null
  if (isFoodRecommendationRequest(raw, launchContext)) return null
  if (!/\b(create|make|give|suggest|build|cook|prepare|want|need|can|should)\b/.test(lower)) return null
  const hasDetailedConstraints =
    /\b(no|without|avoid|allergy|allergic|free|dairy|gluten|nuts?|egg-free|vegan|vegetarian|keto|low carb|low calorie|high protein|calorie|calories|protein|servings?|serve|for two|for three|for four|for \d+)\b/.test(lower)
  if (hasDetailedConstraints) return null
  const meal = lower.includes('breakfast') ? 'breakfast' : lower.includes('lunch') ? 'lunch' : lower.includes('snack') ? 'snack' : 'dinner'
  const highProtein = /\b(high protein|high-protein|protein)\b/.test(lower)
  const lowCalorie = /\b(low calorie|low-calorie|light)\b/.test(lower)
  const requestedIngredients = requestedRecipeIngredients(raw)
  const title = requestedIngredients.length
    ? `${meal.charAt(0).toUpperCase()}${meal.slice(1)} recipe`
    : `${highProtein ? 'High-protein ' : lowCalorie ? 'Low-calorie ' : ''}${meal} recipe`
  const ingredients = requestedIngredients.length
    ? requestedIngredients
    : meal === 'breakfast'
    ? highProtein
      ? ['2 large eggs', '170 g plain Greek yogurt', '1 slice sourdough toast', '75 g avocado']
      : ['1 cup rolled oats', '170 g plain Greek yogurt', '100 g blueberries', '1 tbsp chia seeds']
    : meal === 'lunch'
    ? highProtein
      ? ['150 g chicken breast', '120 g cooked brown rice', '75 g spinach', '1 tbsp olive oil']
      : ['120 g cooked brown rice', '100 g chickpeas', '75 g spinach', '1 tbsp olive oil']
    : meal === 'snack'
    ? highProtein
      ? ['1 protein shake', '1 banana']
      : ['170 g plain Greek yogurt', '100 g berries']
    : highProtein
    ? ['150 g chicken breast', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
    : ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
  const steps = [
    'Prepare the ingredients.',
    requestedIngredients.length
      ? 'Cook any ingredients that need cooking.'
      : meal === 'breakfast'
      ? 'Cook or assemble the breakfast ingredients.'
      : 'Cook the main protein and vegetables until done.',
    'Combine, season to taste, and serve.',
  ]
  const importDraft = {
    title,
    source: 'voice-assistant',
    servings: 1,
    prepMinutes: 10,
    cookMinutes: meal === 'snack' ? 0 : 15,
    ingredients,
    steps,
    sourceUrl: null,
    saveRecipe: false,
    createdAt: Date.now(),
  }
  const suggestionText = [
    `For ${meal === 'snack' ? 'a snack' : meal}, I recommend ${title}.`,
    `Ingredients: ${ingredients.join(', ')}.`,
    'I opened this as a starter Build a meal draft. Review and adjust it before saving. Nothing has been saved yet.',
  ].join(' ')
  const params = new URLSearchParams()
  params.set('date', localDate)
  const category = meal === 'snack' ? 'snacks' : meal
  params.set('category', category)
  params.set('recipeImport', '1')
  params.set('voiceRecipeDraft', encodeUrlJson(importDraft))
  params.set('t', String(Date.now()))
  return {
    action: 'recipe',
    transcript: raw,
    localDate,
    summary: 'Recipe ready in Build a meal',
    confirmationMessage: 'I can open Build a meal with this request. Nothing has been saved yet.',
    canConfirm: false,
    recipe: { text: '', importDraft },
    appTarget: {
      title: 'Build a meal',
      path: `/food/build-meal?${params.toString()}`,
      buttonLabel: 'Open Build a meal',
      nativeTarget: {
        type: 'foodAction',
        action: 'openBuildMeal',
        meal: category,
        recipeDraft: importDraft,
      },
    },
  }
}

function recipeCategoryFromMeal(meal: string) {
  const cleanMeal = cleanText(meal, 40).toLowerCase()
  return cleanMeal === 'snack' ? 'snacks' : ['breakfast', 'lunch', 'dinner', 'snacks'].includes(cleanMeal) ? cleanMeal : 'dinner'
}

function fallbackRecipeIngredientsForMeal(meal: string) {
  const category = recipeCategoryFromMeal(meal)
  if (category === 'breakfast') return ['2 large eggs', '170 g plain Greek yogurt', '1 slice wholegrain toast', '75 g avocado']
  if (category === 'lunch') return ['150 g chicken breast', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
  if (category === 'snacks') return ['170 g plain Greek yogurt', '1 banana']
  return ['150 g chicken breast', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
}

function stripRecipeListPrefix(line: string) {
  return cleanText(line, 220)
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[\).:-]\s*/, '')
    .trim()
}

function extractRecipeIngredients(recipeText?: string) {
  if (!recipeText) return []
  const inlineIngredients = String(recipeText).match(
    /ingredients?\s*:\s*([\s\S]+?)(?:\b(?:steps?|method|instructions?|directions?|this is meant|tell me|review|nothing has been saved)\b|$)/i,
  )?.[1]
  if (inlineIngredients) {
    const parts = splitIngredientList(inlineIngredients)
    if (parts.length > 1) return parts.slice(0, 16)
  }
  const lines = String(recipeText)
    .split(/\r?\n/)
    .map(stripRecipeListPrefix)
    .filter(Boolean)
  const ingredients: string[] = []
  let inIngredients = false
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (/^ingredients?\b/.test(lower)) {
      inIngredients = true
      const afterHeading = stripRecipeListPrefix(line.replace(/^ingredients?\s*[:\-]?\s*/i, ''))
      if (afterHeading) ingredients.push(afterHeading)
      continue
    }
    if (/^(steps?|method|instructions?|directions?|recipe|why|reason|macros?|nutrition|approx|servings?)\b/.test(lower)) {
      if (inIngredients) break
      continue
    }
    if (inIngredients && !/[a-zA-Z]/.test(line)) continue
    if (inIngredients && line.length >= 3) ingredients.push(line)
  }
  return ingredients
    .map((line) => line.replace(/\s+\([^)]*(?:kcal|calories|protein|carbs|fat)[^)]*\)\s*$/i, '').trim())
    .filter((line) => line.length >= 3 && !/^(optional|to taste)$/i.test(line))
    .slice(0, 16)
}

function extractRecipeSteps(recipeText?: string) {
  if (!recipeText) return []
  const lines = String(recipeText)
    .split(/\r?\n/)
    .map(stripRecipeListPrefix)
    .filter(Boolean)
  const steps: string[] = []
  let inSteps = false
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (/^(steps?|method|instructions?|directions?)\b/.test(lower)) {
      inSteps = true
      const afterHeading = stripRecipeListPrefix(line.replace(/^(steps?|method|instructions?|directions?)\s*[:\-]?\s*/i, ''))
      if (afterHeading) steps.push(afterHeading)
      continue
    }
    if (/^(why|reason|macros?|nutrition|approx)\b/.test(lower)) {
      if (inSteps) break
      continue
    }
    if (inSteps && line.length >= 3) steps.push(line)
  }
  return steps.slice(0, 12)
}

function extractRecipeTitle(recipeText: string | undefined, fallback: string) {
  if (!recipeText) return fallback
  const first = String(recipeText)
    .split(/\r?\n/)
    .map((line) => stripRecipeListPrefix(line).replace(/^#+\s*/, '').trim())
    .find((line) => line && !/^(ingredients?|steps?|method|instructions?|directions?|servings?|macros?|nutrition)\b/i.test(line))
  return cleanText(first || fallback, 100)
}

function buildRecipeHandoffDraft(transcript: string, localDate: string, recipeText?: string, targetMeal?: string): VoiceDraft {
  const quick = recipeText ? null : buildQuickRecipeDraft(`create recipe ${transcript}`, localDate)
  if (quick) return quick
  const meal = recipeCategoryFromMeal(targetMeal || inferRecommendationMeal(transcript))
  const mealLabel = meal === 'snacks' ? 'snack' : meal
  const ingredients = extractRecipeIngredients(recipeText)
  const steps = extractRecipeSteps(recipeText)
  const spokenRecipeText = cleanText(recipeText || '', 5000)
  const importDraft = {
    title: extractRecipeTitle(recipeText, cleanText(transcript, 100) || `${mealLabel.charAt(0).toUpperCase()}${mealLabel.slice(1)} recipe`),
    source: 'voice-assistant',
    servings: 1,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: ingredients.length ? ingredients : fallbackRecipeIngredientsForMeal(meal),
    steps: steps.length ? steps : ['Prepare the ingredients.', 'Cook until done.', 'Combine, season to taste, and serve.'],
    sourceUrl: null,
    saveRecipe: false,
    createdAt: Date.now(),
  }
  const params = new URLSearchParams()
  params.set('date', localDate)
  params.set('category', meal)
  params.set('recipeImport', '1')
  params.set('voiceRecipeDraft', encodeUrlJson(importDraft))
  params.set('t', String(Date.now()))
  return {
    action: 'recipe',
    transcript,
    localDate,
    summary: recipeText ? 'Meal idea ready in Build a meal' : 'Recipe ready in Build a meal',
    confirmationMessage: recipeText
      ? "I used today's diary context where available and created a Build a meal draft. Review it before saving."
      : 'I can open Build a meal with this request. Nothing has been saved yet.',
    canConfirm: false,
    recipe: { text: spokenRecipeText, importDraft },
    appTarget: {
      title: 'Build a meal',
      path: `/food/build-meal?${params.toString()}`,
      buttonLabel: 'Open Build a meal',
      nativeTarget: {
        type: 'foodAction',
        action: 'openBuildMeal',
        meal,
        recipeDraft: importDraft,
      },
    },
  }
}

function inferRecommendationMeal(transcript: string, launchContext?: VoiceLaunchContext) {
  const lower = cleanText(transcript, 1000).toLowerCase()
  if (lower.includes('breakfast')) return 'breakfast'
  if (lower.includes('lunch')) return 'lunch'
  if (lower.includes('snack')) return 'snack'
  if (lower.includes('dinner')) return 'dinner'
  const contextMeal = inferMealFromText(launchContext?.meal || '', '')
  if (contextMeal && contextMeal !== 'unknown' && contextMeal !== 'uncategorized') return contextMeal === 'snacks' ? 'snack' : contextMeal
  return 'dinner'
}

function buildFoodRecommendationHandoffDraft(transcript: string, localDate: string, launchContext?: VoiceLaunchContext, recipeText?: string): VoiceDraft {
  const meal = inferRecommendationMeal(recipeText ? `${transcript} ${recipeText}` : transcript, launchContext)
  if (recipeText) return buildRecipeHandoffDraft(transcript, localDate, recipeText, meal)

  const category = meal === 'snack' ? 'snacks' : meal
  const lower = cleanText(transcript, 1000).toLowerCase()
  const highProtein = /\b(protein|high protein|high-protein)\b/.test(lower)
  const lowerCalorie = /\b(calorie|calories|light|lean)\b/.test(lower)
  const titlePrefix = `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
  const title = `${highProtein ? 'High-protein ' : lowerCalorie ? 'Balanced ' : ''}${titlePrefix} recommendation`
  const ingredients =
    meal === 'breakfast'
      ? highProtein
        ? ['2 large eggs', '170 g plain Greek yogurt', '1 slice wholegrain toast', '75 g avocado']
        : ['1 cup rolled oats', '170 g plain Greek yogurt', '100 g berries', '1 tbsp chia seeds']
      : meal === 'lunch'
      ? highProtein
        ? ['150 g chicken breast', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
        : ['100 g chickpeas', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
      : meal === 'snack'
      ? highProtein
        ? ['170 g plain Greek yogurt', '1 banana']
        : ['1 apple', '30 g peanuts']
      : highProtein
      ? ['150 g chicken breast', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
      : ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
  const importDraft = {
    title,
    source: 'voice-assistant',
    servings: 1,
    prepMinutes: 10,
    cookMinutes: meal === 'snack' ? 0 : 15,
    ingredients,
    steps: [
      'Use this as a starter meal draft.',
      'Review the ingredients and adjust amounts to fit your remaining targets.',
      'Save only after you are happy with the meal.',
    ],
    sourceUrl: null,
    saveRecipe: false,
    createdAt: Date.now(),
  }
  const handoffText = `I opened ${title} in Build a meal. Review the ingredients and adjust amounts before saving. Nothing has been saved yet.`
  const params = new URLSearchParams()
  params.set('date', localDate)
  params.set('category', category)
  params.set('recipeImport', '1')
  params.set('voiceRecipeDraft', encodeUrlJson(importDraft))
  params.set('t', String(Date.now()))
  return {
    action: 'recipe',
    transcript,
    localDate,
    summary: `${titlePrefix} idea ready in Build a meal`,
    confirmationMessage: handoffText,
    canConfirm: false,
    recipe: { text: handoffText, importDraft },
    appTarget: {
      title: 'Build a meal',
      path: `/food/build-meal?${params.toString()}`,
      buttonLabel: 'Open Build a meal',
      nativeTarget: {
        type: 'foodAction',
        action: 'openBuildMeal',
        meal: category,
        recipeDraft: importDraft,
      },
    },
  }
}

function buildFoodRecommendationConversationDraft(
  transcript: string,
  localDate: string,
  launchContext?: VoiceLaunchContext,
  recipeText?: string,
  options?: { alternativeTo?: string; diarySnapshot?: Awaited<ReturnType<typeof buildFoodDiarySnapshot>>; adjustment?: boolean },
): VoiceDraft {
  const meal = inferRecommendationMeal(options?.alternativeTo ? `${transcript} ${options.alternativeTo}` : transcript, launchContext)
  const category = meal === 'snack' ? 'snacks' : meal
  const lower = cleanText(transcript, 1000).toLowerCase()
  const priorLower = cleanText(options?.alternativeTo || '', 2000).toLowerCase()
  const highProtein = /\b(protein|high protein|high-protein)\b/.test(lower)
  const lowerCalorie = /\b(calorie|calories|light|lean)\b/.test(lower)
  const vegan = /\b(vegan|plant[-\s]?based)\b/i.test(lower) || /(vegano|vegana|végane|vegane|veganisch|веган|植物性|ビーガン)/i.test(transcript)
  const vegetarian = vegan || /\b(vegetarian|no meat|without meat|meat[-\s]?free)\b/i.test(lower) ||
    /(vegetariano|vegetariana|vegano|vegana|sin\s+carne|sans\s+viande|végétarien|vegetarien|végétarienne|vegetarienne|senza\s+carne|sem\s+carne|vegetarisch|ohne\s+fleisch|без\s+месо|вегетаријан|вегетариjан|ベジタリアン|肉なし)/i.test(transcript)
  const lowerCarb = /\b(low carb|low-carb|lower carb|lower-carb|less carb|less carbs|fewer carbs|lighter carbs|no rice|without rice)\b/i.test(lower) ||
    /(menos\s+carbohidratos|bajo\s+en\s+carbohidratos|moins\s+de\s+glucides|faible\s+en\s+glucides|meno\s+carboidrati|menos\s+carboidratos|weniger\s+kohlenhydrate|kohlenhydratarm|помалку\s+јаглехидрати|помалку\s+jаглехидрати|低糖質|炭水化物\s*少なめ)/i.test(transcript)
  const noChicken = /\b(no chicken|without chicken|chicken[-\s]?free|do not eat chicken|don't eat chicken|dont eat chicken|avoid chicken|not chicken)\b/i.test(lower)
  const dairyFree = /\b(dairy[-\s]?free|no dairy|without dairy|do not eat dairy|don't eat dairy|dont eat dairy|lactose[-\s]?free|no milk|without milk|no yogurt|no yoghurt)\b/i.test(lower)
  const glutenFree = /\b(gluten[-\s]?free|no gluten|without gluten|coeliac|celiac|no bread|without bread)\b/i.test(lower)
  const nutFree = /\b(nut[-\s]?free|no nuts|without nuts|no peanuts|without peanuts|peanut[-\s]?free|allergic to nuts|nut allergy|peanut allergy)\b/i.test(lower)
  const alternative = Boolean(options?.alternativeTo)
  const titlePrefix = `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
  const title =
    vegan && meal === 'lunch'
      ? 'Vegan tofu chickpea lunch'
      : vegan && meal === 'dinner'
      ? 'Vegan tofu sweet potato dinner'
      : vegan && meal === 'breakfast'
      ? 'Vegan oat chia breakfast'
      : vegan && meal === 'snack'
      ? 'Vegan apple seed snack'
      : noChicken && meal === 'lunch'
      ? 'Chicken-free salmon lunch'
      : noChicken && meal === 'dinner'
      ? 'Chicken-free salmon dinner'
      : dairyFree && meal === 'breakfast'
      ? 'Dairy-free egg breakfast'
      : dairyFree && meal === 'snack'
      ? 'Dairy-free apple seed snack'
      : glutenFree && meal === 'breakfast'
      ? 'Gluten-free egg yogurt breakfast'
      : nutFree && meal === 'snack'
      ? 'Nut-free yogurt berry snack'
      : vegetarian && meal === 'lunch'
      ? 'Vegetarian chickpea lunch'
      : vegetarian && meal === 'dinner'
      ? 'Vegetarian tofu dinner'
      : vegetarian && meal === 'breakfast'
      ? 'Vegetarian protein breakfast'
      : vegetarian && meal === 'snack'
      ? 'Vegetarian yogurt snack'
      : lowerCarb && meal === 'lunch'
      ? 'Lower-carb chicken salad lunch'
      : lowerCarb && meal === 'dinner'
      ? 'Lower-carb salmon greens dinner'
      : lowerCarb && meal === 'breakfast'
      ? 'Lower-carb egg yogurt breakfast'
      : lowerCarb && meal === 'snack'
      ? 'Lower-carb yogurt berry snack'
      : alternative && meal === 'lunch'
      ? priorLower.includes('chickpea')
        ? 'Chicken quinoa lunch'
        : 'Chickpea rice lunch'
      : alternative && meal === 'dinner'
      ? priorLower.includes('salmon')
        ? 'Turkey sweet potato dinner'
        : 'Salmon potato dinner'
      : alternative && meal === 'breakfast'
      ? priorLower.includes('oat')
        ? 'Greek yogurt egg breakfast'
        : 'Berry oat yogurt breakfast'
      : alternative && meal === 'snack'
      ? priorLower.includes('yogurt')
        ? 'Apple peanut snack'
        : 'Greek yogurt banana snack'
      : `${highProtein ? 'High-protein ' : lowerCalorie ? 'Balanced ' : ''}${titlePrefix} recommendation`
  const fallbackIngredients =
    meal === 'breakfast'
      ? vegan
        ? ['1 cup rolled oats', '1 tbsp chia seeds', '100 g berries', '30 g pumpkin seeds']
        : dairyFree
        ? ['2 large eggs', '75 g avocado', '100 g berries', '75 g spinach']
        : glutenFree
        ? ['2 large eggs', '170 g plain Greek yogurt', '100 g berries', '1 tbsp chia seeds']
        : vegetarian
        ? ['2 large eggs', '170 g plain Greek yogurt', '100 g berries', '1 tbsp chia seeds']
        : lowerCarb
        ? ['2 large eggs', '170 g plain Greek yogurt', '75 g avocado', '75 g spinach']
        : alternative && priorLower.includes('oat')
        ? ['2 large eggs', '170 g plain Greek yogurt', '1 slice wholegrain toast', '75 g avocado']
        : alternative
        ? ['1 cup rolled oats', '170 g plain Greek yogurt', '100 g berries', '1 tbsp chia seeds']
        : highProtein
        ? ['2 large eggs', '170 g plain Greek yogurt', '1 slice wholegrain toast', '75 g avocado']
        : ['1 cup rolled oats', '170 g plain Greek yogurt', '100 g berries', '1 tbsp chia seeds']
      : meal === 'lunch'
      ? vegan
        ? ['120 g tofu', '100 g chickpeas', '100 g mixed vegetables', '1 tbsp olive oil']
        : noChicken
        ? ['150 g salmon', '120 g cooked quinoa', '100 g mixed vegetables', '1 tbsp olive oil']
        : dairyFree
        ? ['150 g chicken breast', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
        : glutenFree
        ? ['150 g chicken breast', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
        : vegetarian
        ? ['120 g chickpeas', '120 g tofu', '100 g mixed vegetables', '1 tbsp olive oil']
        : lowerCarb
        ? ['150 g chicken breast', '150 g salad greens', '80 g cucumber', '50 g avocado']
        : alternative && priorLower.includes('chickpea')
        ? ['140 g chicken breast', '120 g cooked quinoa', '80 g leafy greens', '50 g avocado']
        : alternative
        ? ['100 g chickpeas', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
        : highProtein
        ? ['150 g chicken breast', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
        : ['100 g chickpeas', '120 g cooked brown rice', '100 g mixed vegetables', '1 tbsp olive oil']
      : meal === 'snack'
      ? vegan
        ? ['1 apple', '30 g pumpkin seeds']
        : dairyFree
        ? ['1 apple', '30 g pumpkin seeds']
        : nutFree
        ? ['170 g plain Greek yogurt', '100 g berries']
        : vegetarian
        ? ['170 g plain Greek yogurt', '1 banana', '1 tbsp chia seeds']
        : lowerCarb
        ? ['170 g plain Greek yogurt', '100 g berries']
        : alternative && priorLower.includes('yogurt')
        ? ['1 apple', '30 g peanuts']
        : alternative
        ? ['170 g plain Greek yogurt', '1 banana']
        : highProtein
        ? ['170 g plain Greek yogurt', '1 banana']
        : ['1 apple', '30 g peanuts']
      : vegan
      ? ['150 g tofu', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
      : noChicken
      ? ['150 g salmon', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
      : dairyFree
      ? ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
      : glutenFree
      ? ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
      : vegetarian
      ? ['150 g tofu', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
      : lowerCarb
      ? ['150 g salmon', '150 g green beans', '100 g broccoli', '1 tsp olive oil']
      : alternative && priorLower.includes('salmon')
      ? ['150 g turkey mince', '150 g sweet potato', '100 g green beans', '1 tsp olive oil']
      : alternative
      ? ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
      : highProtein
      ? ['150 g chicken breast', '150 g sweet potato', '100 g broccoli', '1 tbsp olive oil']
      : ['150 g salmon', '150 g potato', '100 g broccoli', '1 tbsp olive oil']
  const ingredients = extractRecipeIngredients(recipeText)
  const steps = extractRecipeSteps(recipeText)
  const importDraft = {
    title: recipeText ? extractRecipeTitle(recipeText, title) : title,
    source: 'voice-assistant',
    servings: 1,
    prepMinutes: 10,
    cookMinutes: meal === 'snack' ? 0 : 15,
    ingredients: ingredients.length ? ingredients : fallbackIngredients,
    steps: steps.length
      ? steps
      : [
          'Use this as a starter meal draft.',
          'Review the ingredients and adjust amounts to fit your remaining targets.',
          'Save only after you are happy with the meal.',
        ],
    sourceUrl: null,
    saveRecipe: false,
    createdAt: Date.now(),
  }
  const fallbackText = [
    `${options?.adjustment ? 'Sure, here is an adjusted option:' : alternative ? 'Another option:' : `For ${meal === 'snack' ? 'a snack' : meal},`} I recommend ${importDraft.title}.`,
    formatFoodDiaryAimForMealRecommendation(options?.diarySnapshot ?? null),
    `Ingredients: ${importDraft.ingredients.join(', ')}.`,
    'This is meant to fit your remaining daily calories and nutrients. Tell me what you think, or ask for another option or changes.',
  ].filter(Boolean).join(' ')
  const text = recipeText
    ? `${cleanText(recipeText, 5000)}\n\nTell me what you think, or ask for another option or changes.`
    : fallbackText
  return {
    action: 'recipe',
    transcript,
    localDate,
    summary: `${titlePrefix} meal recommendation`,
    confirmationMessage: text,
    canConfirm: false,
    recipe: { text, importDraft: { ...importDraft, category } },
  }
}

function buildFoodRecommendationBuildOfferDraft(transcript: string, localDate: string): VoiceDraft {
  const text = 'Great. Would you like me to build that meal for you so you can review the ingredients before saving?'
  return {
    action: 'recipe',
    transcript: cleanText(transcript, 1000),
    localDate,
    summary: 'Build meal?',
    confirmationMessage: text,
    canConfirm: false,
    recipe: { text },
  }
}

function buildFoodRecommendationBuildDeclineDraft(transcript: string, localDate: string): VoiceDraft {
  const text = 'No problem. I will not build or save it. Tell me if you want another option or want to change the meal idea.'
  return {
    action: 'recipe',
    transcript: cleanText(transcript, 1000),
    localDate,
    summary: 'Meal not built',
    confirmationMessage: text,
    canConfirm: false,
    recipe: { text },
  }
}

function latestMealRecommendationText(history: VoiceConversationTurn[]) {
  const mealRecommendationPattern =
    /(recommend|ingredients?:|meal|breakfast|lunch|dinner|snack|recomiendo|ingredientes?|comida|desayuno|almuerzo|cena|recommande|ingrédients?|ingredients?|repas|déjeuner|dejeuner|dîner|diner|empfehle|zutaten|mahlzeit|frühstück|fruehstueck|mittagessen|abendessen|препорач|состојки|состоjки|оброк|појадок|ручек|вечера|おすすめ|材料|食事|朝食|昼食|夕食|وجبة|مكونات|أوصي|भोजन|सामग्री|सुझाव)/i
  const nonRecommendationPattern = /\b(would you like me to build|want me to build|build that meal for you|build this meal for you|will not build or save|will not build|not build or save|meal not built)\b/i
  return [...history]
    .reverse()
    .find((turn) => turn.role === 'assistant' && mealRecommendationPattern.test(turn.text) && !nonRecommendationPattern.test(turn.text))?.text
}

function latestMealBuildOfferText(history: VoiceConversationTurn[]) {
  const declinePattern = /\b(will not build or save|will not build|not build or save|meal not built)\b/i
  const offerPattern = /\b(would you like me to build|want me to build|build that meal for you|build this meal for you)\b/i
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]
    if (turn?.role !== 'assistant') continue
    if (declinePattern.test(turn.text)) return undefined
    if (offerPattern.test(turn.text)) return turn.text
  }
  return undefined
}

function wantsToBuildRecommendedMeal(transcript: string) {
  const lower = cleanText(transcript, 500).toLowerCase()
  return (
    /\b(yes|yeah|yep|ok|okay|sure|please)\b/.test(lower) &&
    /\b(build|create|make|prepare|add|open|use|that meal|this meal|it)\b/.test(lower)
  ) ||
    /\b(build|create|make|prepare|add|open|use)\s+(that|this|the)\s+(meal|recipe|lunch|dinner|breakfast|snack)\b/.test(lower) ||
    /(s[ií]|oui|ja|sim|да|はい|نعم|हाँ|haan)/i.test(lower) &&
      /(construy|crea|crear|haz|prepara|prépare|prepare|crée|cree|erstelle|baue|mach|usa|usar|utilise|ouvre|öffne|oeffne|cria|crie|adiciona|додај|направи|отвори|作|追加|開|बना|जोड़|افتح|أضف)/i.test(lower) &&
      /(comida|receta|almuerzo|cena|desayuno|repas|recette|déjeuner|dejeuner|dîner|diner|mahlzeit|rezept|mittagessen|abendessen|pasto|pranzo|refeiç|refeic|almoço|almoco|jantar|оброк|ручек|вечера|食事|レシピ|भोजन|وجبة|وصفة)/i.test(lower)
}

function wantsToChooseRecommendedMeal(transcript: string) {
  const text = cleanText(transcript, 500)
  return (
    /\b(that sounds good|sounds good|that looks good|looks good|i like that|i want that|that works|that one|let'?s do that|let'?s go with that|i'?ll have that|perfect|great)\b/i.test(text) ||
    /(me\s+gusta|suena\s+bien|ese\s+est[aá]\s+bien|quiero\s+ese|vamos\s+con\s+ese|ça\s+me\s+va|ca\s+me\s+va|ça\s+a\s+l['’]?air\s+bien|ca\s+a\s+l['’]?air\s+bien|je\s+veux\s+ça|je\s+veux\s+ca|das\s+klingt\s+gut|das\s+passt|ich\s+nehme\s+das|mi\s+piace|va\s+bene|quello\s+va\s+bene|gosto\s+disso|parece\s+bom|vou\s+com\s+esse)/i.test(text) ||
    /(добро\s+звучи|ми\s+се\s+допаѓа|тоа\s+е\s+добро|сакам\s+тоа|одиме\s+со\s+тоа|いいですね|それでいい|それがいい|좋아요|그걸로|ठीक\s+है|अच्छा\s+लगता|هذا\s+جيد|يعجبني)/i.test(text)
  )
}

function wantsAnotherMealRecommendation(transcript: string) {
  const text = cleanText(transcript, 500)
  return (
    /\b(another|different|other|alternative|swap|change|do not like|don't like|dont like|not keen|something else)\b/i.test(text) ||
    /(no\s+me\s+gusta|otra\s+(?:opci[oó]n|sugerencia)|algo\s+(?:diferente|distinto)|je\s+n['’]?aime\s+pas|autre\s+(?:option|suggestion)|quelque\s+chose\s+d['’]?autre|mag\s+ich\s+nicht|andere(?:r|s)?\s+(?:option|vorschlag)|etwas\s+anderes|non\s+mi\s+piace|altra\s+(?:opzione|suggerimento)|qualcosa\s+di\s+diverso|n[aã]o\s+gosto|outra\s+(?:op[cç][aã]o|sugest[aã]o)|algo\s+diferente)/i.test(text) ||
    /(не\s+ми\s+се\s+допаѓа|друга\s+(?:опција|препорака|сугестија)|нешто\s+друго|別の|他の|好きじゃない|لا\s+يعجبني|خيار\s+آخر|اقتراح\s+آخر|पसंद\s+नहीं|दूसरा|और\s+सुझाव)/i.test(text)
  )
}

function wantsMealRecommendationAdjustment(transcript: string) {
  const text = cleanText(transcript, 500)
  return (
    /\b(make it|can you make it|change it|adjust it|switch it|without|free|allergy|allergic|do not eat|don't eat|dont eat|avoid|no meat|no chicken|no nuts|no peanuts|vegetarian|vegan|plant[-\s]?based|dairy[-\s]?free|gluten[-\s]?free|nut[-\s]?free|peanut[-\s]?free|low carb|low-carb|less carbs|fewer carbs|more protein|higher protein|lighter|lower calorie|less fat|less sugar|no rice|without rice)\b/i.test(text) ||
    /(hazlo|cámbialo|cambialo|aj[uú]stalo|sin\s+carne|vegetariano|vegetariana|vegano|vegana|menos\s+carbohidratos|más\s+prote[ií]na|mas\s+prote[ií]na|plus\s+de\s+prot[ée]ines?|moins\s+de\s+glucides|sans\s+viande|végétarien|vegetarien|rendilo|cambialo|senza\s+carne|meno\s+carboidrati|pi[uù]\s+proteine|ajusta|muda|sem\s+carne|menos\s+carboidratos|mais\s+prote[ií]na|mach\s+es|ändere|aendere|ohne\s+fleisch|vegetarisch|weniger\s+kohlenhydrate|mehr\s+protein)/i.test(text) ||
    /(смени|прилагоди|направи\s+го|без\s+месо|вегетаријан|вегетариjан|помалку\s+јаглехидрати|помалку\s+jаглехидрати|повеќе\s+протеин|もっと\s*タンパク|低糖質|肉なし|ベジタリアン|少なめ)/i.test(text)
  )
}

function scoreFoodMatch(queryRaw: string, item: any) {
  const query = compactFoodMatchText(queryRaw)
  const name = compactFoodMatchText(item?.name || '')
  const brand = compactFoodMatchText(item?.brand || '')
  const text = `${name} ${brand}`.trim()
  if (!name) return -1000
  let score = 0
  const queryTokens = query.split(' ').filter(Boolean)
  const nameTokens = name.split(' ').filter(Boolean)
  const singularQuery = singularFoodText(query)
  const singularName = singularFoodText(name)
  if (name === query) score += 100
  if (singularName === singularQuery) score += 90
  if (nameTokens[0] && queryTokens[0] && nameTokens[0] === queryTokens[0]) score += 30
  if (singularName && singularQuery && singularName.split(' ')[0] === singularQuery.split(' ')[0]) score += 30
  if (queryTokens.every((token) => text.includes(token))) score += 20
  if (singularQuery.split(' ').filter(Boolean).every((token) => singularName.includes(token))) score += 20
  if (!brand) score += 8
  if (String(item?.source || '').toLowerCase() === 'custom') score -= 6
  if (/[A-Z]{4,}/.test(String(item?.name || ''))) score -= 4

  if (query.includes('egg')) {
    if (name.startsWith('egg whole')) score += 130
    else if (name.includes('whole egg') || name === 'egg') score += 80
    if (name.includes('liquid')) score -= 60
    if (name.includes('egg white') || name.includes('whites') || name.includes('substitute')) score -= 80
  }
  if (query.includes('yoghurt') || query.includes('yogurt')) {
    const asksForPlain = !/\b(blueberry|strawberry|vanilla|honey|lemon|berry|chocolate|flavou?r|sweetened)\b/.test(query)
    if ((name.includes('greek') || name.includes('strained')) && (name.includes('plain') || !brand)) score += 90
    if (asksForPlain && name.includes('plain')) score += 70
    if (asksForPlain && /\b(crunch|flip|cookie|cookies|chocolate|lemon|berry|blueberry|strawberry|vanilla|honey|dessert|bar|dip|spread|flavou?r|sweetened|coconut|almond|maple|cinnamon)\b/.test(name)) score -= 140
    if (name.includes('protein')) score -= 15
  }
  if (query.includes('avocado')) {
    if (name === 'avocado' || name.startsWith('avocado raw')) score += 60
  }
  if (query.includes('rice')) {
    if (name === 'rice' || name.includes('rice cooked') || name.includes('cooked rice') || name.includes('white rice') || name.includes('brown rice')) score += 130
    if (name.includes('honey') || name.includes('syrup') || name.includes('cereal') || name.includes('cracker')) score -= 160
  }
  if (query.includes('coffee')) {
    if (name === 'coffee' || name.includes('coffee brewed') || name.includes('brewed coffee') || name.includes('black coffee')) score += 140
    if (name.includes('creamer') || name.includes('creamers') || name.includes('almond milk') || name.includes('ice cream')) score -= 140
  }
  if (query.includes('olive oil') || query === 'oil') {
    if (name.includes('olive oil') || name.includes('extra virgin olive oil')) score += 130
    if (name.includes('spray')) score -= 20
  }
  if (query.includes('protein shake')) {
    if (name.includes('protein') && (name.includes('shake') || name.includes('drink'))) score += 120
    if (name.includes('powder')) score -= 160
    if (name.includes('bar')) score -= 90
  }
  if (/\b(toast|bread|sourdough)\b/.test(query) && !/\bfrench toast\b/.test(query)) {
    if (name.includes('sourdough')) score += 140
    if (/\bbread\b/.test(name)) score += 130
    if (/\btoast\b/.test(name) || /\btoasted\b/.test(name)) score += 60
    if (/\b(toaster|pastr(?:y|ies)|tart|pop tart|cake|cookie|cereal|cracker|waffle|dessert|muffin)\b/.test(name)) score -= 240
    if (/\b(apple|blueberry|cherry|strawberry|fruit|frosted|sweetened|syrup)\b/.test(name)) score -= 120
  }
  return score
}

function chooseBestFoodMatch(query: string, items: any[]) {
  const ranked = items
    .filter(hasCoreNutrition)
    .map((item) => ({ item, score: scoreFoodMatch(query, item) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  return best && best.score > 12 ? best.item : null
}

async function findExactCustomPlainFood(lookupQueries: string[]) {
  for (const lookupQuery of lookupQueries) {
    const queryName = singularFoodText(lookupQuery)
    if (!queryName) continue
    const customRows = await searchCustomFoodMacros(lookupQuery, 20, { allowTypo: false }).catch(() => [])
    const exact = customRows
      .map(normalizeFoodItem)
      .filter(Boolean)
      .find((item) => singularFoodText(item?.name || '') === queryName)
    if (exact) return exact
  }
  return null
}

function itemCore(item: any, grams: number) {
  const baseGrams = servingGramsFromText(item?.serving_size) || 100
  const scale = baseGrams > 0 ? grams / baseGrams : 1
  const calories = Math.round(Number(item?.calories ?? item?.calories_kcal ?? 0) * scale)
  const protein = round1(Number(item?.protein_g ?? item?.protein ?? 0) * scale)
  const carbs = round1(Number(item?.carbs_g ?? item?.carbs ?? 0) * scale)
  const fat = round1(Number(item?.fat_g ?? item?.fat ?? 0) * scale)
  const fiber = round1(Number(item?.fiber_g ?? item?.fiber ?? 0) * scale)
  const sugar = round1(Number(item?.sugar_g ?? item?.sugar ?? 0) * scale)
  return { calories, protein, carbs, fat, fiber, sugar, grams: Math.round(grams) }
}

function normalizeFoodItem(item: any): NormalizedFoodItem | null {
  if (!item?.name) return null
  return {
    source: 'custom',
    id: String(item.id || item.name),
    name: item.name,
    brand: item.brand ?? null,
    serving_size: item.serving_size || '100 g',
    servingOptions: Array.isArray(item.servingOptions) ? item.servingOptions : null,
    calories: item.calories ?? null,
    protein_g: item.protein_g ?? null,
    carbs_g: item.carbs_g ?? null,
    fat_g: item.fat_g ?? null,
    fiber_g: item.fiber_g ?? null,
    sugar_g: item.sugar_g ?? null,
  }
}

function normalizeLibraryFoodItem(row: any): NormalizedFoodItem | null {
  if (!row?.name) return null
  return {
    source: 'usda',
    id: String(row.fdcId ?? row.id),
    name: row.name,
    brand: row.brand ?? null,
    serving_size: row.servingSize || '100 g',
    calories: row.calories ?? null,
    protein_g: row.proteinG ?? null,
    carbs_g: row.carbsG ?? null,
    fat_g: row.fatG ?? null,
    fiber_g: row.fiberG ?? null,
    sugar_g: row.sugarG ?? null,
  }
}

async function findFoodIngredient(query: string) {
  const lookupQueries = buildIngredientLookupQueries(query)
  const exactCustomMatch = await findExactCustomPlainFood(lookupQueries)
  if (exactCustomMatch) return exactCustomMatch

  if (compactFoodMatchText(query).includes('egg')) {
    const wholeEggRows = await prisma.foodLibraryItem.findMany({
      where: {
        name: { contains: 'Egg, whole', mode: 'insensitive' },
        source: { in: ['usda_foundation', 'usda_sr_legacy'] },
      },
      take: 12,
      orderBy: { name: 'asc' },
    })
    const wholeEggMatch = chooseBestFoodMatch(query, wholeEggRows.map(normalizeLibraryFoodItem).filter(Boolean))
    if (wholeEggMatch) return wholeEggMatch
  }

  for (const lookupQuery of lookupQueries) {
    const local = await searchLocalFoods(lookupQuery, {
      pageSize: 18,
      mode: 'prefix-contains',
      sources: ['usda_foundation', 'usda_sr_legacy'],
    })
    const localMatch = chooseBestFoodMatch(lookupQuery, local)
    if (localMatch) return localMatch
  }

  for (const lookupQuery of lookupQueries) {
    const custom = await searchCustomFoodMacros(lookupQuery, 12, { allowTypo: true }).catch(() => [])
    const customMatch = chooseBestFoodMatch(lookupQuery, custom.map(normalizeFoodItem).filter(Boolean))
    if (customMatch) return customMatch
  }

  return null
}

async function buildVoiceMealDraft(parsedFood: any, transcript: string, localDate: string) {
  const parsedIngredients = Array.isArray(parsedFood?.ingredients)
    ? parsedFood.ingredients.map(normalizeIngredientRequest).filter(Boolean)
    : []
  if (parsedIngredients.length === 0) return null

  const meal = cleanText(parsedFood?.meal || inferMealFromText(transcript, 'uncategorized'), 40).toLowerCase() || 'uncategorized'
  const mealName =
    cleanText(parsedFood?.mealName || parsedFood?.title, 120) ||
    `${meal === 'uncategorized' ? 'Meal' : `${meal.charAt(0).toUpperCase()}${meal.slice(1)}`} from voice`
  const vagueIngredients = parsedIngredients.filter(ingredientNeedsAmountClarification)
  if (vagueIngredients.length) {
    const names = vagueIngredients
      .map((ingredient: any) => cleanVagueFoodName(ingredient.name || ingredient.display) || cleanText(ingredient.name || ingredient.display, 80))
      .filter(Boolean)
      .slice(0, 3)
    const nameList = names.join(', ') || 'that food'
    return {
      action: 'food_draft' as const,
      transcript,
      localDate,
      summary: 'Food amount needed',
      confirmationMessage: `How much ${nameList} should I use? For example, say "30 g ${names[0] || 'peanuts'}" or "one small apple."`,
      canConfirm: false,
      autoSave: false,
      food: {
        meal,
        mealName,
        draftText: parsedIngredients.map((entry: any) => entry.display || entry.name).join(', '),
      },
    }
  }

  const resolved = await Promise.all(
    parsedIngredients.slice(0, 12).map(async (ingredient: any) => {
      const found = await findFoodIngredient(ingredient.name)
      if (!found) return { ingredient, found: null }
      const grams = estimateIngredientGrams(ingredient.name, ingredient.quantity, ingredient.unit)
      const core = itemCore(found, grams)
      return {
        ingredient,
        found,
        core,
        item: {
          ...found,
          name: found.name,
          label: found.name,
          requestedName: ingredient.name,
          requestedAmount: ingredient.display,
          serving_size: `${core.grams} g estimated`,
          calories: core.calories,
          calories_kcal: core.calories,
          protein_g: core.protein,
          carbs_g: core.carbs,
          fat_g: core.fat,
          fiber_g: core.fiber,
          sugar_g: core.sugar,
        },
      }
    }),
  )

  const found = resolved.filter((entry) => entry.found && entry.item)
  if (found.length === 0) return null

  const missing = resolved.filter((entry) => !entry.found).map((entry) => entry.ingredient.name)
  const totals = found.reduce(
    (acc, entry: any) => {
      acc.calories += Number(entry.core.calories) || 0
      acc.protein += Number(entry.core.protein) || 0
      acc.carbs += Number(entry.core.carbs) || 0
      acc.fat += Number(entry.core.fat) || 0
      acc.fiber += Number(entry.core.fiber) || 0
      acc.sugar += Number(entry.core.sugar) || 0
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
  )
  const nutrition = {
    calories: Math.round(totals.calories),
    calories_kcal: Math.round(totals.calories),
    protein: round1(totals.protein),
    protein_g: round1(totals.protein),
    carbs: round1(totals.carbs),
    carbs_g: round1(totals.carbs),
    fat: round1(totals.fat),
    fat_g: round1(totals.fat),
    fiber: round1(totals.fiber),
    fiber_g: round1(totals.fiber),
    sugar: round1(totals.sugar),
    sugar_g: round1(totals.sugar),
    __voiceBuiltMeal: true,
  }
  const items = found.map((entry: any) => entry.item)
  const entries = found.map((entry: any) => ({
    name: entry.ingredient.display || entry.ingredient.name,
    description: `${entry.found.name} - ${entry.core.grams} g estimated`,
    meal,
  }))
  const ingredientList = entries.map((entry) => entry.name).join(', ')
  const missingLine = missing.length ? ` I could not find ${missing.join(', ')}, so please check before saving.` : ''
  const isSingleIngredient = items.length === 1
  const displayName = isSingleIngredient ? entries[0]?.name || items[0]?.name || mealName : mealName

  return {
    action: 'food_build_meal' as const,
    transcript,
    localDate,
    summary: `${displayName}, ${nutrition.calories} kcal`,
    confirmationMessage: missing.length
      ? `I found these ingredients for ${meal}: ${ingredientList}.${missingLine} Review the estimated amounts, then tap Confirm if it looks right.`
      : isSingleIngredient
      ? `I found ${displayName} for ${meal}. Review the estimate, then tap Confirm to save it.`
      : `I found these ingredients for ${meal}: ${ingredientList}. Review the estimates, then tap Confirm to save them.`,
    canConfirm: true,
    autoSave: false,
    food: {
      meal,
      mealName: displayName,
      draftText: ingredientList,
      entries,
      items,
      nutrition,
    },
  }
}

function parseAssistantJson(content: string) {
  const raw = String(content || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function runJsonCommandModel(
  openai: OpenAI,
  transcript: string,
  localDate: string,
  userId: string,
  launchContext: VoiceLaunchContext,
  conversationHistory: VoiceConversationTurn[] = [],
  reviewedDraft: any = null,
) {
  const messages = [
    {
      role: 'system' as const,
      content: [
        'You quickly understand natural spoken requests for the Helfi health app.',
        'Return compact JSON only. Do not explain.',
        'The user may speak from any screen. Your job is to understand what action they want done, not to act like a chat page.',
        'The request may be in any language, mixed languages, messy dictation, slang, or imperfect grammar. Infer the meaning instead of relying on exact English phrases.',
        'Do not limit language understanding to the examples below. Treat Macedonian, Spanish, French, German, Italian, Portuguese, Arabic, Hindi, Japanese, Chinese, Greek, Turkish, and any other language as valid spoken input.',
        'The language examples are only examples. If the user speaks another language, translate the intent internally and return the same structured JSON action fields.',
        'Output the JSON action fields in concise English where helpful. Keep journal and mood note content in the user\'s own words unless translation is needed for clarity.',
        'Use the current app section as helpful context, but never force the wrong action if the spoken request is clear.',
        'Use the recent in-panel Talk to Helfi conversation to resolve natural follow-ups, pronouns, and corrections, but do not save anything unless the newest spoken request clearly asks for it.',
        'If a draft is currently being reviewed and the newest request clearly means yes, save it, confirm it, looks good, or equivalent in any language, return action confirm_draft.',
        'If a draft is currently being reviewed and the newest request clearly means no, cancel, discard, do not save, or equivalent in any language, return action reject_draft.',
        'If the user is correcting the draft currently being reviewed, return a new corrected draft and preserve any details the user did not change. Do not confirm or save the old draft unless the newest request is a clear yes/save confirmation.',
        'Ignore wake phrases such as Hey Helfi, Hey Healthy, Healthy, Talk to Helfi, or Talk to Healthy.',
        'If current section is food, treat short food names or meal descriptions as food logging or food help.',
        'If current section is food and the user asks what they should eat, what fits their calories/macros, or asks for a meal recommendation, return action recipe and put the full request in recipeRequest.',
        'If current section is water, treat drink amounts as water/liquid logging.',
        'If current section is journal, treat note-like text as a journal note unless the user asks a question.',
        'If current section is health-coach, treat the supplied tip/question as context for a health_question unless the user clearly asks to save a note or log data.',
        'If current section is symptoms or health-image, use safe tracking/handoff behavior only; do not diagnose, treat, or ask the user to show food.',
        'For clear low-risk logging requests, prepare a saveable draft for the user to review before saving. If important details are missing, ask one short follow-up question instead of guessing.',
        'Allowed action values: exercise, mood, journal, water, food_copy_previous, food_favorite, food_build_meal, food_draft, health_intake_items, recipe, symptom_note, health_question, app_handoff, confirm_draft, reject_draft, unknown.',
        'For exercise, infer the exercise name, duration, distance, steps, caloriesKcal, and intensity from any natural wording. If duration is missing, estimate a practical duration and mark estimatedDuration true.',
        'For mood, use mood score 1 very low to 7 very good, plus short tags and a note.',
        'For journal, make a short title and journal content. If the user says health journal, include journalType "health"; if they say mood journal, include journalType "mood".',
        'For food_copy_previous, only use when the user asks for same breakfast/meal as yesterday or previous day.',
        'For saved/favourite meal requests, return food_favorite when the user asks to add a favorite/favourite/saved meal or food.',
        'For new meals, single foods, or ingredient adds with named foods, return food_build_meal with meal, mealName, draftText, and ingredients array. The app will find nutrition before saving.',
        'If the user says add ingredients, input a new meal, log salmon, add chicken and rice, or similar, treat that as a food_build_meal request when food names are present.',
        'Use food_draft only when the user gives a vague food request without any usable food names.',
        'For recipes, meal ideas, cooking requests, food recommendations, “what should I eat”, or “what can I make with...” requests, return action recipe and recipeRequest. Preserve all requested constraints such as high protein, low calorie, remaining calories/macros, ingredients, meal time, allergies, dislikes, and servings.',
        'For Health Intake requests where the user is recording current medications, vitamins, or supplements they already take, return health_intake_items with healthIntake.items. Each item must include type "medication" or "supplement", name, dosage only if stated, and timing only if stated.',
        'For health_intake_items, include only items the user says they currently take. If the user says no, not, none, without, or does not take a medication or supplement, do not include that excluded item in healthIntake.items.',
        'For health_intake_items, do not invent prescription strength, dose, timing, brand, or item type. If the item name or type is unclear, ask one short follow-up question instead of guessing.',
        'For medication or supplement advice questions such as should I take, start, stop, change, increase, safe to take, side effects, interactions, or treatment, return health_question, not health_intake_items.',
        'For health_question, use when the user asks health advice, interpretation, supplements, medication, labs, fitness, sleep, or wellbeing questions that are not a save action.',
        'For symptom tracking or symptom journaling without advice, diagnosis, treatment, red flags, or urgency, use symptom_note with symptom.symptoms, duration, and notes so the app can prepare a saveable Symptom Notes draft for review.',
        'If the user asks about symptoms, diagnosis, treatment, red flags, urgency, or health image review, use health_question. The app will show a safe general message and will not open a symptom notes or health image notes tool.',
        'For app_handoff, use only when the user clearly asks to open, show, find, or use a Helfi app area and does not ask to save/log/create data.',
        'Examples: "Додај две јаболка и 30 грама кикирики како ужина" => food_build_meal snacks with apple and peanuts; "Ajoute 500 ml d’eau" => water 500 ml; "Escribe en mi diario..." => journal; "Запиши дека денес имам главоболка" => symptom_note; "I have a question about this Helfi health coach tip..." => health_question.',
        'Shape: {"action":"...","summary":"...","confirmationMessage":"...","exercise":{"name":"walking","durationMinutes":60,"distanceKm":5,"steps":5449,"caloriesKcal":240,"estimatedDuration":true},"mood":{"mood":2,"tags":["sad"],"note":"..."},"journal":{"title":"...","content":"...","tags":["..."],"journalType":"mood"},"food":{"meal":"breakfast","mealName":"Breakfast","draftText":"...","ingredients":[{"name":"egg","quantity":2,"unit":"each","display":"two eggs"}]},"water":{"amount":500,"unit":"ml","label":"Water"},"healthIntake":{"items":[{"type":"supplement","name":"vitamin D","dosage":"","timing":["Morning"]},{"type":"medication","name":"metformin","dosage":"","timing":[]}]},"symptom":{"symptoms":["headache"],"duration":"two hours","notes":"..."},"recipeRequest":"..."}',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: `Today is ${localDate}. Current app context: ${launchContextLine(launchContext)}.\nRecent Talk to Helfi conversation:\n${conversationHistoryLine(conversationHistory)}\nDraft currently being reviewed:\n${reviewedDraftContextLine(reviewedDraft)}\nNewest spoken request: ${transcript}`,
    },
  ]

  let lastError: any = null
  const models = Array.from(new Set([COMMAND_FAST_MODEL, COMMAND_MODEL, FALLBACK_MODEL, 'gpt-4o']))
  for (const model of models) {
    try {
      const wrapped = await chatCompletionWithCost(
        openai,
        {
          model,
          messages,
          max_tokens: 420,
          temperature: 0.1,
          response_format: { type: 'json_object' } as any,
        } as any,
        { feature: 'voice-assistant:understand', userId },
      )
      const content = wrapped.completion.choices?.[0]?.message?.content || ''
      const parsed = parseAssistantJson(content)
      if (parsed && typeof parsed === 'object') {
        return { parsed, wrapped, usedModel: model }
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Could not understand voice command')
}

async function transcribeAudio(openai: OpenAI, file: File, userId: string, durationSeconds: number) {
  await assertAiUsageAllowed({
    feature: 'voice-assistant:transcribe',
    userId,
  })
  const response = await openai.audio.transcriptions.create({
    model: TRANSCRIBE_MODEL,
    file,
    response_format: 'text',
  } as any)
  const text = typeof response === 'string' ? response : String((response as any)?.text || '')
  const costCents = estimateTranscriptionCostCents(durationSeconds)
  await logAiUsageEvent({
    feature: 'voice-assistant:transcribe',
    userId,
    endpoint: '/api/native/voice-assistant',
    model: TRANSCRIBE_MODEL,
    promptTokens: 0,
    completionTokens: 0,
    costCents,
    success: true,
    detail: `estimated ${Math.round(durationSeconds)}s audio transcription`,
  })
  return { text: cleanText(text, 2000), costCents }
}

async function findExerciseType(rawName: string) {
  const name = cleanText(rawName || 'walking', 80).toLowerCase()
  const searchTerms = [
    name,
    name.includes('walk') ? 'walking' : '',
    name.includes('run') ? 'running' : '',
    name.includes('cycle') || name.includes('bike') ? 'cycling' : '',
    name.includes('gym') || name.includes('workout') ? 'strength' : '',
    name.includes('gym') || name.includes('workout') ? 'weight' : '',
  ].filter(Boolean)
  for (const term of searchTerms) {
    const found = await prisma.exerciseType.findFirst({
      where: { name: { contains: term, mode: 'insensitive' } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
    if (found) return found
  }
  return prisma.exerciseType.findFirst({
    where: { name: { contains: 'walking', mode: 'insensitive' } },
  })
}

function voiceRecipeMacroLine(label: string, key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g', snapshot: Awaited<ReturnType<typeof buildFoodDiarySnapshot>>) {
  if (!snapshot) return ''
  const unit = key === 'calories' ? 'kcal' : 'g'
  const consumed = snapshot.totals[key]
  const target = snapshot.targets[key]
  const remaining = snapshot.remaining[key]?.remainingClamped
  const parts = [`${label}:`]
  if (typeof consumed === 'number' && Number.isFinite(consumed)) parts.push(`${Math.round(consumed * 10) / 10}${unit} used`)
  if (typeof target === 'number' && Number.isFinite(target)) parts.push(`${Math.round(target * 10) / 10}${unit} target`)
  if (typeof remaining === 'number' && Number.isFinite(remaining)) parts.push(`${Math.round(remaining * 10) / 10}${unit} left`)
  return parts.length > 1 ? parts.join(' ') : ''
}

function formatFoodDiarySnapshotForVoiceRecipe(snapshot: Awaited<ReturnType<typeof buildFoodDiarySnapshot>>) {
  if (!snapshot) return 'Food diary context is unavailable.'
  const macroLines = [
    voiceRecipeMacroLine('Calories', 'calories', snapshot),
    voiceRecipeMacroLine('Protein', 'protein_g', snapshot),
    voiceRecipeMacroLine('Carbs', 'carbs_g', snapshot),
    voiceRecipeMacroLine('Fat', 'fat_g', snapshot),
    voiceRecipeMacroLine('Fibre', 'fiber_g', snapshot),
    voiceRecipeMacroLine('Sugar', 'sugar_g', snapshot),
  ].filter(Boolean)
  const priority = [
    snapshot.priority?.low?.length ? `Needs most: ${snapshot.priority.low.join(', ')}.` : '',
    snapshot.priority?.nearCap?.length ? `Near or over target: ${snapshot.priority.nearCap.join(', ')}.` : '',
  ].filter(Boolean)
  return [`Food diary for ${snapshot.localDate}: ${snapshot.logCount} logged item${snapshot.logCount === 1 ? '' : 's'}.`, ...macroLines, ...priority].join(' ')
}

function formatFoodDiaryAimForMealRecommendation(snapshot: Awaited<ReturnType<typeof buildFoodDiarySnapshot>>) {
  if (!snapshot) return ''
  const targets: string[] = []
  const caloriesLeft = snapshot.remaining.calories?.remainingClamped
  if (typeof caloriesLeft === 'number' && Number.isFinite(caloriesLeft)) {
    targets.push(`about ${Math.round(caloriesLeft)} kcal left`)
  }
  const low = (snapshot.priority?.low || []).slice(0, 2)
  if (low.length) targets.push(`more ${low.join(' and ')}`)
  const nearCap = (snapshot.priority?.nearCap || []).slice(0, 2)
  if (nearCap.length) targets.push(`keeping ${nearCap.join(' and ')} lighter`)
  return targets.length ? `I am aiming this at ${targets.join(', ')} today.` : ''
}

async function buildRecipe(
  openai: OpenAI,
  requestText: string,
  userId: string,
  localDate: string,
  tzOffsetMin: number,
  options?: { conversationFirst?: boolean },
) {
  const snapshot = await buildFoodDiarySnapshot({ userId, localDate, tzOffsetMin }).catch(() => null)
  const diaryLine = formatFoodDiarySnapshotForVoiceRecipe(snapshot)
  const systemPrompt = options?.conversationFirst
    ? [
        'You are Helfi in a voice conversation.',
        'Recommend one practical meal that fits the food diary context, especially remaining calories, macros, fibre, sugar, and nutrients needing attention.',
        'Honor allergies, dislikes, and dietary restrictions from the newest request and recent conversation. Never include restricted foods or ingredients the user says they avoid.',
        'Keep it conversational and useful. Mention why it fits today in plain language.',
        'Include a meal title, ingredients with amounts, and approximate macros.',
        'Do not say you opened, prepared, created, saved, or built a draft.',
        'Do not jump to Build a meal. The user must decide first.',
        'End by inviting natural discussion, such as asking what they think or whether they want another option.',
      ].join(' ')
    : 'You are Helfi. Create one practical recipe. Use the diary context if helpful. Include servings, ingredients, steps, and approximate macros. Do not save food.'
  const wrapped = await chatCompletionWithCost(
    openai,
    {
      model: COMMAND_MODEL,
      max_tokens: 900,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `${diaryLine}\n\nRecipe request: ${requestText}`,
        },
      ],
    } as any,
    { feature: 'voice-assistant:recipe', userId },
  )
  const text = cleanText(wrapped.completion.choices?.[0]?.message?.content || '', 5000)
  return { text, costCents: wrapped.costCents, model: wrapped.completion.model || COMMAND_MODEL, snapshot }
}

async function buildFoodCopyDraft(userId: string, localDate: string, meal: string) {
  const sourceDate = shiftLocalDate(localDate, -1)
  const normalizedMeal = meal || 'breakfast'
  const rows = await prisma.foodLog.findMany({
    where: {
      userId,
      localDate: sourceDate,
      OR: [
        { meal: { equals: normalizedMeal, mode: 'insensitive' } },
        { category: { equals: normalizedMeal, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })
  const entries = rows.map((row) => ({
    name: row.name,
    description: row.description,
    meal: row.meal || row.category,
  }))
  return { sourceDate, rows, entries }
}

async function buildFavoriteFoodDraft(transcript: string, localDate: string, favorites: VoiceFoodFavorite[]) {
  let favorite = findRequestedFavorite(transcript, favorites)
  if (!favorite && /\b(favourites?|favorites?|saved)\b/i.test(transcript)) {
    const requestedMeal = inferMealFromText(transcript, '')
    favorite =
      favorites.find((item) => compactFoodMatchText(item.meal || '').includes(requestedMeal)) ||
      favorites.find((item) => compactFoodMatchText(item.label || '').includes(requestedMeal)) ||
      null
  }
  if (!favorite) return null
  const meal = inferTargetMealFromText(transcript, favorite.meal)
  const calories = Math.round(Number((favorite.nutrition as any)?.calories ?? (favorite.total as any)?.calories) || 0)
  const summary = `${favorite.label}${calories ? `, ${calories} kcal` : ''}`
  return {
    action: 'food_favorite' as const,
    transcript,
    localDate,
    summary,
    confirmationMessage: `I found ${favorite.label} in your favourites for ${meal}. Review it, then tap Confirm to save.`,
    canConfirm: true,
    autoSave: false,
    food: {
      meal,
      entries: [{ name: favorite.label, description: favorite.description || favorite.label, meal }],
      favorite: {
        id: favorite.id || null,
        label: favorite.label,
        description: favorite.description || favorite.label,
        meal,
        nutrition: favorite.nutrition || favorite.total || null,
        total: favorite.total || favorite.nutrition || null,
        items: Array.isArray(favorite.items) ? favorite.items : null,
      },
    },
  }
}

async function speak(openai: OpenAI, text: string, userId: string) {
  const speechText = cleanText(text, 1200)
  if (!speechText) return { audio: null, costCents: 0 }
  await assertAiUsageAllowed({
    feature: 'voice-assistant:tts',
    userId,
  })
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: process.env.HELFI_VOICE_TTS_VOICE || 'coral',
    input: speechText,
    instructions:
      'Speak like a warm, calm health coach. Sound natural and conversational, with gentle energy and smooth pacing. Avoid a robotic or announcer style.',
    response_format: 'mp3',
  } as any)
  const buffer = Buffer.from(await response.arrayBuffer())
  const costCents = estimateTextToSpeechCostCents(speechText)
  await logAiUsageEvent({
    feature: 'voice-assistant:tts',
    userId,
    endpoint: '/api/native/voice-assistant',
    model: TTS_MODEL,
    promptTokens: 0,
    completionTokens: 0,
    costCents,
    success: true,
    detail: 'estimated text-to-speech cost',
  })
  return { audio: `data:audio/mpeg;base64,${buffer.toString('base64')}`, costCents }
}

function hasPhotoActionText(value: string) {
  return (
    /\b(camera|photo|picture|image|scan|upload|take\s+(?:a\s+)?photo|use\s+(?:the\s+)?camera|add\s+(?:a\s+)?photo|show\s+food)\b/i.test(value) ||
    /(foto|photo|bild|imagen|image|cam[eé]ra|kamera|cámara|camera|scanne|scanner|sube|слика|фото|камера|写真|画像|カメラ|アップロード|照片|图片|圖片|相片|拍照|相机|相機|上传|上傳|صورة|صور|كاميرا|ارفع|تحميل|حمّل|حمل|फोटो|तस्वीर|चित्र|कैमरा|अपलोड)/i.test(value)
  )
}

function hasFoodPhotoTarget(value: string) {
  return (
    /\b(food|meal|breakfast|lunch|dinner|snack|plate|what i'?m eating|what i am eating)\b/i.test(value) ||
    /(comida|almuerzo|desayuno|cena|merienda|repas|déjeuner|dejeuner|dîner|diner|collation|essen|mahlzeit|mittagessen|abendessen|snack|храна|оброк|појадок|ручек|вечера|ужина|食べ物|食事|朝食|昼食|夕食|ランチ|おやつ|食物|食品|餐|早餐|午餐|晚餐|点心|點心|零食|طعام|اكل|أكل|وجبة|فطور|افطار|إفطار|غداء|غدائي|عشاء|سناك|खाना|भोजन|नाश्ता|दोपहर का खाना|लंच|रात का खाना|डिनर|स्नैक)/i.test(value)
  )
}

function hasJournalPhotoTarget(value: string) {
  return (
    /\b(journal|health journal|note|diary)\b/i.test(value) ||
    /(diario|diário|journal|carnet|tagebuch|gesundheitstagebuch|дневник|белешка|журнал|健康日記|日記|記録|ノート|健康日志|健康日誌|日志|日誌|记录|記錄|يوميات|مفكرة|سجل|مذكرات|डायरी|जर्नल|नोट|स्वास्थ्य डायरी)/i.test(value)
  )
}

function hasHealthImageNoteTarget(value: string) {
  return (
    /\b(health image note|health image notes|medical image note|medical image notes|health images|medical images)\b/i.test(value) ||
    /(imagen(?:es)?\s+(?:m[eé]dica|de\s+salud)|image(?:s)?\s+(?:m[eé]dicale|de\s+sant[eé])|gesundheitsbild|medizinisches\s+bild|медицинск[аи]\s+слик|здравствен[аи]\s+слик|健康画像|医療画像|健康写真|医療写真|健康图片|健康圖片|医疗图片|醫療圖片|健康照片|医疗照片|醫療照片|صورة\s+(?:طبية|صحية)|صور\s+(?:طبية|صحية)|الصور\s+(?:الطبية|الصحية)|स्वास्थ्य\s+(?:छवि|फोटो|तस्वीर)|मेडिकल\s+(?:छवि|फोटो|तस्वीर)|चिकित्सा\s+(?:छवि|फोटो|तस्वीर))/i.test(value)
  )
}

function detectHealthIntakeBottleTarget(value: string, launchContext?: VoiceLaunchContext): { itemType?: HealthIntakeItemType } | null {
  const raw = cleanText(value, 1200)
  const lower = raw.toLowerCase()
  const hasLabelObject =
    /\b(bottle|label|package|packet|box|container)\b/i.test(raw) ||
    /(frasco|botella|etiqueta|paquete|flacon|étiquette|etiquette|packung|flasche|etikett|шише|етикета|пакување|ボトル|ラベル|瓶|标签|標籤|زجاجة|عبوة|ملصق|लेबल|बोतल|पैकेज)/i.test(raw)
  const wantsReadOrScan =
    hasPhotoActionText(raw) ||
    /\b(show|read|scan|add|record|log|capture|use|open)\b/i.test(raw) ||
    /(mostrar|leer|escanear|agregar|añadir|anadir|lire|scanner|ajouter|lesen|scannen|hinzufügen|додај|додаj|прочитај|прочитаj|скенирај|スキャン|読み取|追加|扫描|掃描|读取|讀取|添加|امسح|اقرأ|أضف|स्कैन|पढ़|जोड़)/i.test(raw)
  if (!hasLabelObject || !wantsReadOrScan) return null

  const supplementTarget =
    /\b(supplements?|vitamins?|minerals?|probiotics?|fish oil|omega|magnesium|zinc|collagen|creatine|melatonin|multivitamin)\b/i.test(raw) ||
    /(suplemento|vitamina|complément|complement|vitamin|витамин|суплемент|サプリ|ビタミン|维生素|維生素|مكمل|فيتامين|सप्लीमेंट|विटामिन)/i.test(raw)
  const medicationTarget =
    /\b(medications?|medicines?|prescriptions?|drugs?|rx)\b/i.test(raw) ||
    /(medicamento|medicina|ordonnance|médicament|medikament|medizin|лекови?|лек|薬|薬剤|药|藥|دواء|أدوية|दवा|दवाई)/i.test(raw)

  if (medicationTarget && !supplementTarget) return { itemType: 'medication' }
  if (supplementTarget && !medicationTarget) return { itemType: 'supplement' }
  if (launchContext?.section === 'health-intake' && (lower.includes('bottle') || lower.includes('label') || lower.includes('package'))) return {}
  return null
}

function buildHealthIntakeBottleHandoffDraft(
  transcript: string,
  localDate: string,
  target: { itemType?: HealthIntakeItemType },
): VoiceDraft {
  const itemLabel = target.itemType === 'medication' ? 'medication' : target.itemType === 'supplement' ? 'supplement' : 'bottle'
  return {
    action: 'app_handoff',
    transcript,
    localDate,
    summary: target.itemType ? `Health Intake ${itemLabel} label` : 'Health Intake bottle label',
    confirmationMessage:
      target.itemType
        ? `I can help read that ${itemLabel} bottle or package label for Health Intake. You will review it before anything is saved. I am only recording what you already take, not recommending changes.`
        : 'I can help read a bottle or package label for Health Intake. Choose whether it is a supplement or medication first, then you will review it before anything is saved.',
    canConfirm: false,
    autoSave: false,
    appTarget: {
      title: 'Health Intake',
      path: '/onboarding',
      buttonLabel: target.itemType ? `Open ${itemLabel} camera` : 'Choose camera mode',
      nativeTarget: {
        type: 'voiceAction',
        action: target.itemType ? 'openHealthIntakeLiveCamera' : 'openHealthIntakeBottleChoices',
        ...(target.itemType ? { itemType: target.itemType } : {}),
      },
    },
  }
}

function normalizeMood(value: any) {
  return {
    mood: clampNumber(value?.mood, 1, 7, 4),
    tags: Array.isArray(value?.tags) ? value.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : [],
    note: cleanText(value?.note, 600),
  }
}

function inferNativeWebTarget(parsed: any, transcript: string) {
  const raw = `${cleanText(parsed?.target || parsed?.area || parsed?.appArea || parsed?.summary, 200)} ${transcript}`.toLowerCase()
  const openOnly = /\b(open|show|go to|take me to|use)\b/.test(raw) || /(отвори|покажи|оди\s+до|најди|наjди|прикажи|öffne|offne|zeige|geh\s+zu|gehe\s+zu|finde|benutze)/i.test(raw)
  const photoAction = hasPhotoActionText(raw)
  const nativeTarget = (title: string, path: string, buttonLabel: string, native: any) => ({
    title,
    path,
    buttonLabel,
    nativeTarget: native,
  })
  const foodMeal = localizedMealFromText(raw) || inferMealFromText(raw, 'breakfast')
  const bottleTarget = detectHealthIntakeBottleTarget(raw)

  if (bottleTarget?.itemType) {
    const itemLabel = bottleTarget.itemType === 'medication' ? 'medication' : 'supplement'
    return nativeTarget('Health Intake', '/onboarding', `Open ${itemLabel} camera`, {
      type: 'voiceAction',
      action: 'openHealthIntakeLiveCamera',
      itemType: bottleTarget.itemType,
    })
  }

  if (photoAction && hasFoodPhotoTarget(raw)) {
    return nativeTarget('Food photo', '/food', 'Open Food Photo', {
      type: 'foodAction',
      action: 'openPhoto',
      meal: foodMeal,
    })
  }
  if ((photoAction && hasHealthImageNoteTarget(raw)) || (openOnly && hasHealthImageNoteTarget(raw))) {
    return nativeTarget('Health Image Notes', '/medical-images', 'Open Health Image Note', {
      type: 'stack',
      route: 'HealthImageNotes',
      action: 'pickImage',
    })
  }
  if (photoAction && hasJournalPhotoTarget(raw)) {
    return nativeTarget('Health Journal', '/health-journal', 'Open Journal Photo', {
      type: 'stack',
      route: 'HealthJournal',
      action: 'pickPhoto',
    })
  }

  if (/\b(dashboard|home)\b/.test(raw) || /(почетна|контролна\s+табла|startseite|übersicht|uebersicht)/i.test(raw)) {
    return nativeTarget('Dashboard', '/dashboard', 'Open Dashboard', { type: 'tab', tab: 'Dashboard' })
  }
  if (/\b(food diary|calorie tracker|track calories|food log)\b/.test(raw) || /(дневник\s+за\s+храна|храна|калории|essenstagebuch|ernährungstagebuch|ernaehrungstagebuch|kalorien)/i.test(raw)) {
    return nativeTarget('Food Diary', '/food', 'Open Food Diary', { type: 'tab', tab: 'Food' })
  }
  if (/\b(add food entry|add food|food entry)\b/.test(raw) && openOnly) {
    return nativeTarget('Add Food Entry', '/food', 'Open Add Food Entry', {
      type: 'foodAction',
      action: 'openAddFoodEntry',
      meal: foodMeal,
    })
  }
  if (/\b(add ingredient|single ingredient|search food)\b/.test(raw) && openOnly) {
    return nativeTarget('Add Ingredient', '/food', 'Open Add Ingredient', {
      type: 'stack',
      route: 'AddIngredient',
      params: { meal: foodMeal },
    })
  }
  if (/\b(build a meal|build meal|combine ingredients|meal builder)\b/.test(raw) && openOnly) {
    return nativeTarget('Build a Meal', '/food', 'Open Build a Meal', {
      type: 'foodAction',
      action: 'openBuildMeal',
      meal: foodMeal,
    })
  }
  if (/\b(favorites|favourites|saved foods|saved meals)\b/.test(raw) && openOnly) {
    return nativeTarget('Favorites', '/food', 'Open Favorites', {
      type: 'foodAction',
      action: 'openFavorites',
      meal: foodMeal,
    })
  }
  if (/\b(import recipe|recipe import)\b/.test(raw) && openOnly) {
    return nativeTarget('Import Recipe', '/food', 'Open Import Recipe', {
      type: 'foodAction',
      action: 'openImportRecipe',
      meal: foodMeal,
    })
  }
  if ((/\b(water|hydration|liquids|drink tracker|water intake)\b/.test(raw) || /(вода|хидратац|пијал|пиjал|wasser|hydration|trinken|getränk|getrank)/i.test(raw)) && openOnly) {
    return nativeTarget('Water Intake', '/food/water', 'Open Water Intake', { type: 'stack', route: 'WaterIntake' })
  }
  if ((/\b(exercise|workout|activity)\b/.test(raw) || /(вежб|активност|тренинг|пешачење|трчање|bewegung|training|sport|aktivität|aktivitaet)/i.test(raw)) && openOnly) {
    return nativeTarget('Exercise', '/food', 'Open Exercise', {
      type: 'foodAction',
      action: 'openExercise',
      meal: foodMeal,
    })
  }
  if (/\bmood journal\b/.test(raw) || /(дневник\s+за\s+расположение|stimmungstagebuch)/i.test(raw)) {
    return nativeTarget('Mood Journal', '/mood/journal', 'Open Mood Journal', { type: 'stack', route: 'MoodTracker', params: { tab: 'journal' } })
  }
  if ((/\b(mood tracker|mood)\b/.test(raw) || /(расположение|муд|stimmung)/i.test(raw)) && openOnly) {
    return nativeTarget('Mood Tracker', '/mood', 'Open Mood Tracker', { type: 'stack', route: 'MoodTracker', params: { tab: 'checkin' } })
  }
  if ((/\b(health journal|journal)\b/.test(raw) || /(здравствен(?:иот)?\s+дневник|дневник|gesundheitstagebuch|tagebuch)/i.test(raw)) && openOnly) {
    return { title: 'Health Journal', path: '/health-journal', buttonLabel: 'Open Health Journal' }
  }
  if ((/\b(symptom notes|symptoms notes|symptom tracker|symptoms tracker)\b/.test(raw) || /(симптоми|белешки\s+за\s+симптоми|symptome|symptomnotizen)/i.test(raw)) && openOnly) {
    return nativeTarget('Symptom Notes', '/symptoms', 'Open Symptom Notes', { type: 'stack', route: 'SymptomNotes' })
  }
  if (/\b(lab report|lab reports|blood test upload|blood tests)\b/.test(raw)) {
    return { title: 'Lab Reports', path: '/lab-reports', buttonLabel: 'Open Lab Reports' }
  }
  if ((/\b(subscription|billing|payment|credits)\b/.test(raw) || /(наплата|плаќање|плакање|кредити|претплата|abrechnung|zahlung|guthaben|credits|abo)/i.test(raw)) && openOnly) {
    return nativeTarget('Billing', '/billing', 'Open Billing', { type: 'stack', route: 'Billing' })
  }
  if ((/\b(settings|account settings)\b/.test(raw) || /(поставки|сетинг|сметка|einstellungen|konto)/i.test(raw)) && openOnly) {
    return nativeTarget('Settings', '/settings', 'Open Settings', { type: 'tab', tab: 'Settings' })
  }
  if (/\b(chat|talk|ask|question|advice|health|supplement|medication|medicine|sleep|stress|energy|labs?|blood test)\b/.test(raw)) {
    return { title: 'Talk to Helfi', path: `/chat?voicePrompt=${encodeQueryValue(transcript, 1200)}`, buttonLabel: 'Open Talk to Helfi' }
  }
  if (/\b(notification|reminder|reminders)\b/.test(raw) || /(потсетник|потсетници|известувања|erinnerung|erinnerungen|benachrichtigung)/i.test(raw)) {
    return nativeTarget('Reminders', '/notifications/reminders', 'Open Reminders', { type: 'stack', route: 'Reminders' })
  }
  if (/\b(practitioner|practitioners|doctor|clinic|specialist)\b/.test(raw)) {
    return nativeTarget('Practitioners', '/practitioners', 'Open Practitioners', { type: 'stack', route: 'Practitioners' })
  }
  if (/\b(insight|insights|coach)\b/.test(raw) || /(увид|увиди|коуч|тренер|einblick|einblicke|coach)/i.test(raw)) {
    return nativeTarget('Insights', '/insights', 'Open Insights', { type: 'tab', tab: 'Insights' })
  }
  return null
}

function extractSymptomText(transcript: string) {
  return cleanText(transcript, 600)
    .replace(/\b(?:for|since|over)\s+((?:about\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hour|hours|day|days|week|weeks|month|months)|today|yesterday|this morning|tonight|last night)\b/gi, ' ')
    .replace(/\b(can you|please|could you|i want you to|i need you to)\b/gi, ' ')
    .replace(/\b(analyze|analyse|check|look at|review|my|these|symptoms?|for me|what could it be|what is it|what might it be)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSymptomDuration(transcript: string) {
  const match = cleanText(transcript, 600).match(
    /\b(?:for|since|over)\s+((?:about\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hour|hours|day|days|week|weeks|month|months)|today|yesterday|this morning|tonight|last night)\b/i,
  )
  if (match?.[1]) return cleanText(match[1], 80)
  const macedonianAmountMatch = cleanText(transcript, 600).match(
    /((?:\d+|еден|една|два|две|три|четири|пет|шест|седум|осум|девет|десет)\s+(?:часа|час|дена|ден|недели|недела|месеци|месец))/i,
  )
  if (macedonianAmountMatch?.[1]) return cleanText(macedonianAmountMatch[1], 80)
  const macedonianDateMatch = cleanText(transcript, 600).match(/(денес|вчера|утрово|вечерва|синоќа)/i)
  return cleanText(macedonianDateMatch?.[1] || '', 80)
}

function knownSymptomsFromText(transcript: string) {
  const lower = transcript.toLowerCase()
  const englishSymptoms = [
    'headache',
    'migraine',
    'nausea',
    'vomiting',
    'diarrhea',
    'fever',
    'cough',
    'sore throat',
    'fatigue',
    'dizzy',
    'dizziness',
    'chest pain',
    'shortness of breath',
    'palpitations',
    'bloating',
    'heartburn',
    'anxiety',
    'insomnia',
    'rash',
    'hives',
    'pain',
  ]
  const symptoms = englishSymptoms.filter((symptom) => lower.includes(symptom))
  const macedonianSymptoms: Array<[RegExp, string]> = [
    [/главоболка/i, 'headache'],
    [/мигрена/i, 'migraine'],
    [/мачнина/i, 'nausea'],
    [/повраќање|повракање/i, 'vomiting'],
    [/пролив|дијареја/i, 'diarrhea'],
    [/температура|треска/i, 'fever'],
    [/кашлица/i, 'cough'],
    [/грло/i, 'sore throat'],
    [/замор/i, 'fatigue'],
    [/вртоглавица/i, 'dizziness'],
    [/градна болка/i, 'chest pain'],
    [/краток здив/i, 'shortness of breath'],
    [/палпитации/i, 'palpitations'],
    [/надуеност/i, 'bloating'],
    [/жиговина/i, 'heartburn'],
    [/осип/i, 'rash'],
    [/болка/i, 'pain'],
  ]
  for (const [pattern, symptom] of macedonianSymptoms) {
    if (pattern.test(transcript) && !symptoms.includes(symptom)) symptoms.push(symptom)
  }
  const romanceSymptoms: Array<[RegExp, string]> = [
    [/dolor\s+de\s+cabeza|mal\s+de\s+tête|mal\s+de\s+tete/i, 'headache'],
    [/mal\s+di\s+testa/i, 'headache'],
    [/dor\s+de\s+cabeça|dor\s+de\s+cabeca/i, 'headache'],
    [/migraña|migraine/i, 'migraine'],
    [/emicrania/i, 'migraine'],
    [/enxaqueca/i, 'migraine'],
    [/náusea|nausea|nausée|nausee/i, 'nausea'],
    [/nausea/i, 'nausea'],
    [/vómito|vomito|vomissement/i, 'vomiting'],
    [/vomito/i, 'vomiting'],
    [/vômito|vomito/i, 'vomiting'],
    [/diarrea|diarrhée|diarrhee/i, 'diarrhea'],
    [/diarreia/i, 'diarrhea'],
    [/fiebre|fièvre|fievre/i, 'fever'],
    [/febbre/i, 'fever'],
    [/febre/i, 'fever'],
    [/tos|toux/i, 'cough'],
    [/tosse/i, 'cough'],
    [/tosse/i, 'cough'],
    [/dolor\s+de\s+garganta|mal\s+de\s+gorge/i, 'sore throat'],
    [/mal\s+di\s+gola/i, 'sore throat'],
    [/dor\s+de\s+garganta/i, 'sore throat'],
    [/fatiga|fatigue/i, 'fatigue'],
    [/stanchezza/i, 'fatigue'],
    [/fadiga|cansaço|cansaco/i, 'fatigue'],
    [/mareo|vertige|étourdi|etourdi/i, 'dizziness'],
    [/vertigini/i, 'dizziness'],
    [/tontura/i, 'dizziness'],
    [/dolor\s+de\s+pecho|douleur\s+thoracique/i, 'chest pain'],
    [/dolore\s+al\s+petto/i, 'chest pain'],
    [/dor\s+no\s+peito/i, 'chest pain'],
    [/falta\s+de\s+aire|essoufflement/i, 'shortness of breath'],
    [/fiato\s+corto|respiro\s+corto/i, 'shortness of breath'],
    [/falta\s+de\s+ar/i, 'shortness of breath'],
    [/palpitaciones|palpitations/i, 'palpitations'],
    [/palpitazioni/i, 'palpitations'],
    [/palpitações|palpitacoes/i, 'palpitations'],
    [/hinchazón|hinchazon|ballonnement/i, 'bloating'],
    [/gonfiore/i, 'bloating'],
    [/inchaço|inchaco/i, 'bloating'],
    [/acidez|brûlure|brulure/i, 'heartburn'],
    [/bruciore/i, 'heartburn'],
    [/azia/i, 'heartburn'],
    [/erupción|erupcion|éruption|eruption/i, 'rash'],
    [/eruzione/i, 'rash'],
    [/erupção|erupcao/i, 'rash'],
    [/picazón|picazon|démangeaison|demangeaison|urticaria|urticaire/i, 'hives'],
    [/prurito|orticaria/i, 'hives'],
    [/coceira|urticária|urticaria/i, 'hives'],
  ]
  for (const [pattern, symptom] of romanceSymptoms) {
    if (pattern.test(transcript) && !symptoms.includes(symptom)) symptoms.push(symptom)
  }
  const germanSymptoms: Array<[RegExp, string]> = [
    [/kopfschmerzen/i, 'headache'],
    [/migräne|migraene/i, 'migraine'],
    [/übelkeit|uebelkeit/i, 'nausea'],
    [/erbrechen/i, 'vomiting'],
    [/durchfall/i, 'diarrhea'],
    [/fieber/i, 'fever'],
    [/husten/i, 'cough'],
    [/halsschmerzen/i, 'sore throat'],
    [/müdigkeit|muedigkeit/i, 'fatigue'],
    [/schwindel/i, 'dizziness'],
    [/brustschmerz/i, 'chest pain'],
    [/atemnot/i, 'shortness of breath'],
    [/herzrasen/i, 'palpitations'],
    [/blähung|blaehung/i, 'bloating'],
    [/sodbrennen/i, 'heartburn'],
    [/ausschlag/i, 'rash'],
    [/juckreiz|nesselsucht/i, 'hives'],
  ]
  for (const [pattern, symptom] of germanSymptoms) {
    if (pattern.test(transcript) && !symptoms.includes(symptom)) symptoms.push(symptom)
  }
  return symptoms.slice(0, 12)
}

function buildSymptomNotesHandoffDraft(transcript: string, localDate: string, parsed?: any): VoiceDraft {
  const raw = cleanText(transcript, 1200)
  const parsedSymptom = parsed?.symptom && typeof parsed.symptom === 'object' ? parsed.symptom : {}
  const parsedSymptoms = Array.isArray(parsedSymptom.symptoms)
    ? parsedSymptom.symptoms.map((item: any) => cleanText(item, 80)).filter(Boolean)
    : []
  const symptoms = parsedSymptoms.length ? parsedSymptoms : knownSymptomsFromText(raw)
  const fallbackSymptom = cleanText(extractSymptomText(raw), 80)
  const voiceSymptoms = symptoms.length ? symptoms : fallbackSymptom ? [fallbackSymptom] : []
  const voiceDuration = cleanText(parsedSymptom.duration, 80) || extractSymptomDuration(raw)
  const voiceNotes = cleanText(parsedSymptom.notes || raw, 1200)
  return {
    action: 'symptom_note',
    transcript: raw,
    localDate,
    summary: 'Symptom Notes',
    confirmationMessage:
      'I can save this as a symptom note for your history after you review it. This will not diagnose or suggest treatment. If symptoms feel urgent, call emergency services or speak with a qualified health professional.',
    canConfirm: true,
    autoSave: false,
    symptom: {
      symptoms: voiceSymptoms,
      duration: voiceDuration || null,
      notes: voiceNotes,
    },
    appTarget: {
      title: 'Symptom Notes',
      path: '/symptoms',
      buttonLabel: 'Open Symptom Notes',
      nativeTarget: {
        type: 'stack',
        route: 'SymptomNotes',
        params: {
          voiceAction: 'prefill',
          voiceActionNonce: Date.now(),
          voiceSymptoms,
          voiceDuration,
          voiceNotes,
        },
      },
    },
  }
}

function isAdviceStyleHealthQuestion(value: unknown) {
  const text = cleanText(value, 1200)
  const lower = text.toLowerCase()
  return (
    lower.includes('?') ||
    /\b(what should|should i|diagnose|diagnosis|treat|treatment|cure|medical advice|doctor|urgent|emergency|red flag|red flags)\b/.test(lower) ||
    MACEDONIAN_MEDICAL_ADVICE_PATTERN.test(text) ||
    ROMANCE_MEDICAL_ADVICE_PATTERN.test(text) ||
    GERMAN_MEDICAL_ADVICE_PATTERN.test(text)
  )
}

function buildQuickToolDraft(transcript: string, localDate: string, launchContext?: VoiceLaunchContext): VoiceDraft | null {
  const raw = cleanText(transcript, 1200)
  const lower = raw.toLowerCase()
  if (hasSelfHarmRisk(raw)) return buildSelfHarmSupportDraft(raw, localDate)
  if (isFoodRecommendationRequest(raw, launchContext)) return null
  const explicitPhotoAction = hasPhotoActionText(raw)
  const explicitJournalDraft = tryParseJournalRequest(raw, launchContext)
  const explicitSymptomTracking = isSymptomTrackingRequest(raw)
  const bottleTarget = detectHealthIntakeBottleTarget(raw, launchContext)
  const hasJournalTarget =
    launchContext?.section === 'journal' ||
    /\b(journal|diary)\b/.test(lower) ||
    /(дневник|diario|diário|journal|carnet|tagebuch)/i.test(raw)
  if (bottleTarget) return buildHealthIntakeBottleHandoffDraft(raw, localDate, bottleTarget)
  if (explicitJournalDraft && hasJournalTarget && !explicitPhotoAction && !isAdviceStyleHealthQuestion(raw)) return buildQuickJournalDraft(explicitJournalDraft, raw, localDate)
  if (explicitSymptomTracking) return buildSymptomNotesHandoffDraft(raw, localDate)
  if (explicitJournalDraft && !explicitPhotoAction && !isAdviceStyleHealthQuestion(raw)) return buildQuickJournalDraft(explicitJournalDraft, raw, localDate)
  if (isMedicalSafetyRequest(raw) && !isPlainHealthToolOpenRequest(raw)) return buildMedicalSafetyDraft(raw, localDate)
  const directTarget = inferNativeWebTarget({}, raw)
  const explicitOpen = /\b(open|show|go to|take me to|use|find)\b/.test(lower) || /(отвори|покажи|оди\s+до|најди|наjди|прикажи|öffne|offne|zeige|geh\s+zu|gehe\s+zu|finde|benutze)/i.test(raw)
  const asksForInsights = directTarget?.title === 'Insights' && (/\b(insight|insights|coach)\b/.test(lower) || /(увид|увиди|коуч|тренер)/i.test(raw))
  if (directTarget && (explicitOpen || explicitPhotoAction || asksForInsights)) {
    const healthImageHandoff = directTarget.title === 'Health Image Notes'
    return {
      action: 'app_handoff',
      transcript: raw,
      localDate,
      summary: directTarget.title,
      confirmationMessage: healthImageHandoff
        ? 'I can open Health Image Notes so you can record the image. This is for your history only; Helfi will not diagnose or suggest treatment from the photo.'
        : `I can open ${directTarget.title} with your request ready.`,
      canConfirm: false,
      appTarget: directTarget,
    }
  }
  if (/\b(journal|note|diary)\b/.test(lower)) return null

  const looksLikeQuestion = /\b(what|why|how|can|could|should|would|is|are|do|does|which)\b/.test(lower) || lower.includes('?')
  const healthTopic =
    /\b(health|symptom|supplement|vitamin|magnesium|medication|medicine|tablet|dose|sleep|energy|tired|fatigue|stress|anxiety|mood|blood test|lab|cholesterol|glucose|protein|calories|diet|nutrition|workout|exercise|pain|injury|period|hormone|digestion|gut)\b/
  const questionShouldGoToChat =
    looksLikeQuestion &&
    /\b(medication|medicine|supplement|vitamin|magnesium|cholesterol|blood test|lab|sleep|energy|dose)\b/.test(lower)
  if (questionShouldGoToChat && healthTopic.test(lower)) {
    return {
      action: 'health_question',
      transcript: raw,
      localDate,
      summary: 'Talk to Helfi',
      confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
      canConfirm: false,
      appTarget: {
        title: 'Talk to Helfi',
        path: `/chat?voicePrompt=${encodeQueryValue(raw, 1200)}`,
        buttonLabel: 'Open Talk to Helfi',
      },
    }
  }

  if (looksLikeQuestion && healthTopic.test(lower)) {
    return {
      action: 'health_question',
      transcript: raw,
      localDate,
      summary: 'Talk to Helfi',
      confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
      canConfirm: false,
      appTarget: {
        title: 'Talk to Helfi',
        path: `/chat?voicePrompt=${encodeQueryValue(raw, 1200)}`,
        buttonLabel: 'Open Talk to Helfi',
      },
    }
  }

  return null
}

function buildQuickClarificationDraft(transcript: string, localDate: string): VoiceDraft | null {
  const raw = cleanText(transcript, 1200)
  const lower = raw.toLowerCase()
  const isLogRequest = /\b(log|add|record|track|put|input|save)\b/.test(lower)
  if (!isLogRequest) return null

  if (/\b(food|meal|breakfast|lunch|dinner|snacks?)\b/.test(lower)) {
    return {
      action: 'food_draft',
      transcript: raw,
      localDate,
      summary: 'Food details needed',
      confirmationMessage: 'What food should I log, and which meal should it go in?',
      canConfirm: false,
    }
  }

  if (/\b(exercise|workout|walk|run|ride|cycle|gym)\b/.test(lower)) {
    return {
      action: 'exercise',
      transcript: raw,
      localDate,
      summary: 'Exercise details needed',
      confirmationMessage: 'What exercise should I log, and for how long?',
      canConfirm: false,
    }
  }

  if (/\b(water|hydration|drink|liquid)\b/.test(lower)) {
    return {
      action: 'water',
      transcript: raw,
      localDate,
      summary: 'Liquid details needed',
      confirmationMessage: 'What drink and amount should I log?',
      canConfirm: false,
    }
  }

  if (/\b(mood|feel|feeling)\b/.test(lower)) {
    return {
      action: 'mood',
      transcript: raw,
      localDate,
      summary: 'Mood details needed',
      confirmationMessage: 'How are you feeling, and would you like me to add any note?',
      canConfirm: false,
    }
  }

  if (/\b(journal|note|diary)\b/.test(lower)) {
    return {
      action: 'journal',
      transcript: raw,
      localDate,
      summary: 'Journal note needed',
      confirmationMessage: 'What would you like me to write in the journal?',
      canConfirm: false,
    }
  }

  return null
}

function buildGenericClarificationDraft(transcript: string, localDate: string): VoiceDraft {
  return {
    action: 'unknown',
    transcript: cleanText(transcript, 1200),
    localDate,
    summary: 'Please clarify',
    confirmationMessage: 'I am not sure what to do yet. Please try a clearer request.',
    canConfirm: false,
  }
}

async function normalizeDraft(
  parsed: any,
  transcript: string,
  localDate: string,
  userId: string,
  openai: OpenAI,
  tzOffsetMin: number,
  favorites: VoiceFoodFavorite[],
  launchContext?: VoiceLaunchContext,
): Promise<{ draft: VoiceDraft; aiCostCents: number; usedModel?: string }> {
  if (hasSelfHarmRisk(transcript)) {
    return { aiCostCents: 0, draft: buildSelfHarmSupportDraft(transcript, localDate) }
  }
  if (isSymptomTrackingRequest(transcript)) {
    const parsedAction = cleanText(parsed?.action, 40).toLowerCase()
    return { aiCostCents: 0, draft: buildSymptomNotesHandoffDraft(transcript, localDate, parsedAction === 'symptom_note' ? parsed : undefined) }
  }
  if (isMedicalSafetyRequest(transcript)) {
    return { aiCostCents: 0, draft: buildMedicalSafetyDraft(transcript, localDate) }
  }

  const actionRaw = cleanText(parsed?.action, 40).toLowerCase() as VoiceAction
  const action: VoiceAction = ['exercise', 'mood', 'journal', 'water', 'food_copy_previous', 'food_favorite', 'food_build_meal', 'food_draft', 'health_intake_items', 'recipe', 'symptom_analysis', 'symptom_note', 'health_question', 'app_handoff'].includes(actionRaw)
    ? actionRaw
    : 'unknown'
  let aiCostCents = 0
  let usedModel: string | undefined

  const favoriteDraft = shouldUseFavoriteFood(transcript, favorites) ? await buildFavoriteFoodDraft(transcript, localDate, favorites) : null
  if (favoriteDraft && (action === 'food_favorite' || action === 'food_build_meal' || action === 'food_draft' || action === 'unknown')) {
    return { aiCostCents, draft: favoriteDraft }
  }

  if (action === 'health_intake_items') {
    if (HEALTH_INTAKE_ADVICE_PATTERN.test(transcript)) {
      return { aiCostCents, draft: buildMedicalSafetyDraft(transcript, localDate) }
    }
    const rawItems = [
      ...(Array.isArray(parsed?.healthIntake?.items) ? parsed.healthIntake.items : []),
      ...(Array.isArray(parsed?.items) ? parsed.items : []),
      ...(Array.isArray(parsed?.supplements) ? parsed.supplements.map((item: any) => ({ ...item, type: 'supplement' })) : []),
      ...(Array.isArray(parsed?.medications) ? parsed.medications.map((item: any) => ({ ...item, type: 'medication' })) : []),
    ]
    const intakeDraft = buildHealthIntakeItemsDraft(rawItems, transcript, localDate)
    if (intakeDraft) return { aiCostCents, draft: intakeDraft }
    return {
      aiCostCents,
      draft: {
        action: 'health_intake_items',
        transcript,
        localDate,
        summary: 'Health Intake details needed',
        confirmationMessage:
          'I can help record current medications, vitamins, and supplements. Please tell me the item names and whether each one is a medication or supplement. I will show you a review before saving.',
        canConfirm: false,
        autoSave: false,
      },
    }
  }

  if (action === 'recipe') {
    const requestText = cleanText(parsed?.recipeRequest || transcript, 1000)
    const isDiaryRecommendation = isFoodRecommendationRequest(requestText || transcript, launchContext)
    const recipe = await buildRecipe(openai, requestText, userId, localDate, tzOffsetMin, isDiaryRecommendation ? { conversationFirst: true } : undefined)
    aiCostCents += recipe.costCents
    usedModel = recipe.model
    if (isDiaryRecommendation) {
      return {
        aiCostCents,
        usedModel,
        draft: buildFoodRecommendationConversationDraft(requestText, localDate, launchContext, recipe.text, { diarySnapshot: recipe.snapshot || null }),
      }
    }
    return {
      aiCostCents,
      usedModel,
      draft: buildRecipeHandoffDraft(requestText, localDate, recipe.text),
    }
  }

  if (action === 'symptom_analysis') {
    return { aiCostCents, draft: buildMedicalSafetyDraft(transcript, localDate) }
  }

  if (action === 'symptom_note') {
    return { aiCostCents, draft: buildSymptomNotesHandoffDraft(transcript, localDate, parsed) }
  }

  if (action === 'health_question') {
    if (isFoodRecommendationRequest(transcript, launchContext)) {
      const diarySnapshot = await buildFoodDiarySnapshot({ userId, localDate, tzOffsetMin }).catch(() => null)
      return {
        aiCostCents,
        draft: buildFoodRecommendationConversationDraft(transcript, localDate, launchContext, undefined, { diarySnapshot }),
      }
    }
    return {
      aiCostCents,
      draft: {
        action: 'health_question',
        transcript,
        localDate,
        summary: 'Talk to Helfi',
        confirmationMessage: 'This is a health question. I can open Talk to Helfi with your question ready.',
        canConfirm: false,
        appTarget: {
          title: 'Talk to Helfi',
          path: `/chat?voicePrompt=${encodeQueryValue(transcript, 1200)}`,
          buttonLabel: 'Open Talk to Helfi',
        },
      },
    }
  }

  if (action === 'app_handoff') {
    const target = inferNativeWebTarget(parsed, transcript)
    if (target) {
      return {
        aiCostCents,
        draft: {
          action: 'app_handoff',
          transcript,
          localDate,
          summary: target.title,
          confirmationMessage: `I can open ${target.title} with your request ready.`,
          canConfirm: false,
          appTarget: target,
        },
      }
    }
  }

  if (action === 'exercise') {
    const exercise = parsed?.exercise || {}
    const type = await findExerciseType(exercise?.name || parsed?.summary || transcript)
    if (!type) {
      return {
        aiCostCents,
        draft: {
          action: 'unknown',
          transcript,
          localDate,
          summary: 'Exercise type not found',
          confirmationMessage: 'I could not find a matching exercise type. Please try a simpler exercise name.',
          canConfirm: false,
        },
      }
    }
    const distanceKm = Number(exercise?.distanceKm)
    const safeDistance = Number.isFinite(distanceKm) && distanceKm > 0 ? Math.round(distanceKm * 10) / 10 : null
    const fallbackDuration = safeDistance && /walk/i.test(type.name) ? Math.max(10, Math.round(safeDistance * 12)) : 30
    const durationMinutes = clampNumber(exercise?.durationMinutes, 1, 24 * 60, fallbackDuration)
    const estimatedDuration = Boolean(exercise?.estimatedDuration || !Number.isFinite(Number(exercise?.durationMinutes)))
    const steps = clampNumber(exercise?.steps, 0, 500000, 0)
    const caloriesKcal = clampNumber(exercise?.caloriesKcal ?? exercise?.calories, 0, 10000, 0)
    const detailParts = [
      `${type.name}, ${durationMinutes} minutes`,
      safeDistance ? `${safeDistance} km` : '',
      steps ? `${Math.round(steps).toLocaleString()} steps` : '',
      caloriesKcal ? `${Math.round(caloriesKcal)} kcal` : '',
    ].filter(Boolean)
    const summary = detailParts.join(', ')
    return {
      aiCostCents,
      draft: {
        action: 'exercise',
        transcript,
        localDate,
        summary,
        confirmationMessage: `I can log ${summary}.${estimatedDuration ? ' I estimated the time.' : ''} Review it, then tap Confirm to save.`,
        canConfirm: true,
        autoSave: false,
        exercise: {
          exerciseTypeId: type.id,
          exerciseName: type.name,
          durationMinutes,
          distanceKm: safeDistance,
          steps: steps ? Math.round(steps) : null,
          caloriesKcal: caloriesKcal ? Math.round(caloriesKcal) : null,
          intensity: cleanText(exercise?.intensity, 40) || null,
          estimatedDuration,
        },
      },
    }
  }

  if (action === 'mood') {
    const mood = normalizeMood(parsed?.mood || {})
    const summary = `Mood ${mood.mood}/7${mood.tags.length ? `, ${mood.tags.join(', ')}` : ''}`
    return {
      aiCostCents,
      draft: {
        action: 'mood',
        transcript,
        localDate,
        summary,
        confirmationMessage: `I can add this mood entry: ${summary}. Review it, then tap Confirm to save.`,
        canConfirm: true,
        autoSave: false,
        mood,
      },
    }
  }

  if (action === 'journal') {
    const journal = parsed?.journal || {}
    const content = cleanText(journal?.content || transcript, 2000)
    const title = cleanText(journal?.title || 'Voice journal note', 120)
    const tags = Array.isArray(journal?.tags) ? journal.tags.map((tag: any) => cleanText(tag, 24)).filter(Boolean).slice(0, 8) : []
    const journalTypeRaw = String(journal?.journalType || journal?.type || '').toLowerCase()
    const journalType = journalTypeRaw === 'health' || /\bhealth journal\b/i.test(transcript) ? 'health' : 'mood'
    const journalLabel = journalType === 'health' ? 'health journal' : 'journal'
    return {
      aiCostCents,
      draft: {
        action: 'journal',
        transcript,
        localDate,
        summary: title,
        confirmationMessage: `I can add this ${journalLabel} note: "${content.slice(0, 160)}${content.length > 160 ? '...' : ''}" Review it, then tap Confirm to save.`,
        canConfirm: true,
        autoSave: false,
        journal: { title, content, tags, journalType },
      },
    }
  }

  if (action === 'water') {
    const water = parsed?.water || {}
    const amount = Number(water?.amount)
    const unit = normalizeWaterUnit(String(water?.unit || ''))
    const drinkType = cleanText(water?.label || water?.drinkType || 'Water', 48) || 'Water'
    if (!Number.isFinite(amount) || amount <= 0 || !unit) {
      return {
        aiCostCents,
        draft: {
          action: 'water',
          transcript,
          localDate,
          summary: 'Water amount needed',
          confirmationMessage: 'How much liquid should I log? For example, say "Log 500 ml water."',
          canConfirm: false,
        },
      }
    }
    const amountMl = waterAmountToMl(amount, unit)
    return {
      aiCostCents,
      draft: {
        action: 'water',
        transcript,
        localDate,
        summary: `${amount} ${unit} ${drinkType}`,
        confirmationMessage: `I can log ${amount} ${unit} ${drinkType}. Review it, then tap Confirm to save.`,
        canConfirm: true,
        autoSave: false,
        water: {
          amount,
          unit,
          amountMl,
          label: drinkType,
          category: inferMealFromText(transcript, 'other'),
          drinkType,
          sweetener: drinkType === 'Water' ? null : { type: 'free' },
        },
      },
    }
  }

  if (action === 'food_copy_previous') {
    const meal = cleanText(parsed?.food?.meal || 'breakfast', 40).toLowerCase() || 'breakfast'
    const copy = await buildFoodCopyDraft(userId, localDate, meal)
    if (copy.rows.length === 0) {
      return {
        aiCostCents,
        draft: {
          action: 'food_copy_previous',
          transcript,
          localDate,
          summary: `No ${meal} found yesterday`,
          confirmationMessage: `I could not find a ${meal} entry from yesterday to copy.`,
          canConfirm: false,
          food: { meal, sourceDate: copy.sourceDate, sourceLogIds: [], entries: [] },
        },
      }
    }
    return {
      aiCostCents,
      draft: {
        action: 'food_copy_previous',
        transcript,
        localDate,
        summary: `Copy ${copy.rows.length} ${meal} item${copy.rows.length === 1 ? '' : 's'} from yesterday`,
        confirmationMessage: `I found ${copy.rows.length} ${meal} item${copy.rows.length === 1 ? '' : 's'} from ${copy.sourceDate}. Review them, then tap Confirm to copy them to today.`,
        canConfirm: true,
        autoSave: false,
        food: {
          meal,
          sourceDate: copy.sourceDate,
          sourceLogIds: copy.rows.map((row) => row.id),
          entries: copy.entries,
        },
      },
    }
  }

  if (action === 'food_build_meal' || action === 'food_draft') {
    const builtMeal = await buildVoiceMealDraft(parsed?.food || {}, transcript, localDate)
    if (builtMeal) {
      return { aiCostCents, draft: builtMeal }
    }
  }

  if (action === 'food_draft' || action === 'food_build_meal') {
    const draftText = cleanText(parsed?.food?.draftText || transcript, 1200)
    const meal = cleanText(parsed?.food?.meal || inferMealFromText(transcript, 'uncategorized'), 40)
    return {
      aiCostCents,
      draft: {
        action: 'food_draft',
        transcript,
        localDate,
        summary: 'Food draft ready',
        confirmationMessage: `I can see the food request, but I could not match enough ingredients yet: ${draftText}. Please try naming the foods one by one.`,
        canConfirm: false,
        food: { meal: meal || 'uncategorized', draftText },
      },
    }
  }

  return {
    aiCostCents,
    draft: {
      action: 'unknown',
      transcript,
      localDate,
      summary: 'Please review',
      confirmationMessage: cleanText(parsed?.confirmationMessage, 300) || 'I am not sure what to do yet. Please try a clearer request.',
      canConfirm: false,
    },
  }
}

function aiDraftDecision(parsed: any): 'confirm' | 'reject' | null {
  const action = cleanText(parsed?.action, 40).toLowerCase()
  if (['confirm_draft', 'confirm', 'save_draft', 'save'].includes(action)) return 'confirm'
  if (['reject_draft', 'reject', 'cancel_draft', 'discard_draft', 'do_not_save'].includes(action)) return 'reject'
  return null
}

async function buildAiDraftDecisionResponse(
  userId: string,
  transcript: string,
  confirmationDraft: any,
  decision: 'confirm' | 'reject',
  command: any,
  transcriptionCostCents: number,
) {
  const aiCostCents = transcriptionCostCents + Number(command?.wrapped?.costCents || 0)
  const chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
  const freshWallet = await new CreditManager(userId).getWalletStatus()
  if (freshWallet.totalAvailableCents < chargeCents) {
    return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
  }

  const charged = await new CreditManager(userId).chargeCents(chargeCents)
  if (!charged) {
    return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
  }

  await logAiUsageEvent({
    feature: decision === 'confirm' ? 'voice-assistant:ai-confirm-command' : 'voice-assistant:ai-reject-command',
    userId,
    endpoint: '/api/native/voice-assistant',
    model: command?.usedModel || 'ai-draft-decision',
    promptTokens: command?.wrapped?.promptTokens || 0,
    completionTokens: command?.wrapped?.completionTokens || 0,
    costCents: chargeCents,
    success: true,
    detail: `charged ${chargeCents} credits; AI classified reviewed draft ${decision}`,
  })

  return NextResponse.json({
    success: true,
    transcript,
    draft: decision === 'confirm' ? confirmationDraft : null,
    confirmNow: decision === 'confirm',
    rejectNow: decision === 'reject',
    audio: null,
    chargedCredits: chargeCents,
    voiceReply: false,
  })
}

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = request.headers.get('content-type') || ''
    let transcript = ''
    let localDate = ''
    let tzOffsetMin = new Date().getTimezoneOffset()
    let wantsVoiceReply = false
    let durationSeconds = 30
    let transcriptionCostCents = 0
    let clientFavorites: VoiceFoodFavorite[] = []
    let launchContext = normalizeLaunchContext(null)
    let conversationHistory: VoiceConversationTurn[] = []
    let followUpDraft: any = null
    let confirmationDraft: any = null
    let aiConsentGranted = false

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('audio') || form.get('file')
      transcript = cleanText(form.get('transcript'), 2000)
      tzOffsetMin = Number(form.get('tzOffsetMin'))
      if (!Number.isFinite(tzOffsetMin)) tzOffsetMin = new Date().getTimezoneOffset()
      localDate = localDateFromRequest(form.get('localDate'), tzOffsetMin)
      wantsVoiceReply = String(form.get('voiceReply') || '').toLowerCase() === 'true'
      clientFavorites = parseFavoritesJson(form.get('favorites'))
      launchContext = normalizeLaunchContext(form.get('launchContext'))
      conversationHistory = parseConversationHistory(form.get('conversationHistory'))
      confirmationDraft = parseConfirmationDraft(form.get('confirmationDraft'))
      followUpDraft = parseFollowUpDraft(form.get('followUpDraft'))
      aiConsentGranted = hasAiConsentFlag(form.get('aiConsentGranted') || form.get('aiConsent'))
      const durationMillis = Number(form.get('durationMillis'))
      durationSeconds = Number.isFinite(durationMillis) && durationMillis > 0 ? durationMillis / 1000 : 30
      if (!transcript && file instanceof File) {
        if (!file.type.startsWith('audio/')) return NextResponse.json({ error: 'File must be audio' }, { status: 400 })
        if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio must be less than 12MB' }, { status: 400 })
        if (!aiConsentGranted) return NextResponse.json({ error: 'AI sharing consent is required before voice audio can be sent to AI.' }, { status: 403 })
        const estimatedVoiceCost = Math.max(
          SIMPLE_MIN_CREDITS,
          estimateTranscriptionCostCents(durationSeconds) + (wantsVoiceReply ? VOICE_REPLY_MIN_CREDITS : 0),
        )
        const preflightWallet = await new CreditManager(user.id).getWalletStatus()
        if (!hasPaidVoiceWalletAccess(preflightWallet)) {
          return voicePaidAccessResponse()
        }
        if (preflightWallet.totalAvailableCents < estimatedVoiceCost) {
          return NextResponse.json(
            { error: 'Insufficient credits', estimatedCost: estimatedVoiceCost, availableCredits: preflightWallet.totalAvailableCents },
            { status: 402 },
          )
        }
        const openai = getOpenAIClient()
        if (!openai) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
        const transcribed = await transcribeAudio(openai, file, user.id, durationSeconds)
        transcript = transcribed.text
        transcriptionCostCents = transcribed.costCents
      }
    } else {
      const body = await request.json().catch(() => ({} as any))
      transcript = cleanText(body?.transcript || body?.message, 2000)
      tzOffsetMin = Number(body?.tzOffsetMin)
      if (!Number.isFinite(tzOffsetMin)) tzOffsetMin = new Date().getTimezoneOffset()
      localDate = localDateFromRequest(body?.localDate, tzOffsetMin)
      wantsVoiceReply = Boolean(body?.voiceReply)
      clientFavorites = parseFavoritesJson(body?.favorites)
      launchContext = normalizeLaunchContext(body?.launchContext || body?.context)
      conversationHistory = parseConversationHistory(body?.conversationHistory || body?.conversation)
      confirmationDraft = parseConfirmationDraft(body?.confirmationDraft)
      followUpDraft = parseFollowUpDraft(body?.followUpDraft)
      aiConsentGranted = hasAiConsentFlag(body?.aiConsentGranted ?? body?.aiConsent)
    }

    transcript = cleanWakePhrase(transcript)
    const explicitNewCommand = isExplicitNewVoiceCommand(transcript)
    if (explicitNewCommand) {
      confirmationDraft = null
      followUpDraft = null
    }
    transcript = explicitNewCommand ? transcript : followUpTranscript(followUpDraft, transcript) || transcript
    if (!transcript) return NextResponse.json({ error: 'No speech found' }, { status: 400 })
    if (wantsVoiceReply && !aiConsentGranted) {
      return NextResponse.json({ error: 'AI sharing consent is required before spoken replies can be created.' }, { status: 403 })
    }

    if (hasSelfHarmRisk(transcript)) {
      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, buildSelfHarmSupportDraft(transcript, localDate)),
        audio: null,
        chargedCredits: 0,
        voiceReply: false,
      })
    }

    const wallet = await new CreditManager(user.id).getWalletStatus()
    if (!hasPaidVoiceWalletAccess(wallet)) {
      return voicePaidAccessResponse()
    }
    const minimumRequestCredits = SIMPLE_MIN_CREDITS + (wantsVoiceReply ? VOICE_REPLY_MIN_CREDITS : 0)
    if (wallet.totalAvailableCents < minimumRequestCredits) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: minimumRequestCredits, availableCredits: wallet.totalAvailableCents }, { status: 402 })
    }

    if (confirmationDraft && isConfirmingDraftText(transcript)) {
      const chargeCents = Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents)
      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:confirm-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: transcriptionCostCents > 0 ? TRANSCRIBE_MODEL : 'local-confirm-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; confirmed reviewed voice draft`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: confirmationDraft,
        confirmNow: true,
        audio: null,
        chargedCredits: chargeCents,
        voiceReply: false,
      })
    }

    if (confirmationDraft && isRejectingDraftText(transcript)) {
      const chargeCents = transcriptionCostCents > 0 ? Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents) : 0
      if (chargeCents > 0) {
        const freshWallet = await new CreditManager(user.id).getWalletStatus()
        if (freshWallet.totalAvailableCents < chargeCents) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        const charged = await new CreditManager(user.id).chargeCents(chargeCents)
        if (!charged) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        await logAiUsageEvent({
          feature: 'voice-assistant:reject-command',
          userId: user.id,
          endpoint: '/api/native/voice-assistant',
          model: TRANSCRIBE_MODEL,
          promptTokens: 0,
          completionTokens: 0,
          costCents: chargeCents,
          success: true,
          detail: `charged ${chargeCents} credits; rejected reviewed voice draft`,
        })
      }

      return NextResponse.json({
        success: true,
        transcript,
        draft: null,
        rejectNow: true,
        audio: null,
        chargedCredits: chargeCents,
        voiceReply: false,
      })
    }

    const correctedDraft = confirmationDraft ? await buildReviewedDraftCorrection(confirmationDraft, transcript, localDate) : null
    if (correctedDraft) {
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, correctedDraft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:correction-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'local-correction-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; revised reviewed voice draft without saving`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, correctedDraft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const storedFavorites = await loadStoredFavorites(user.id).catch(() => [])
    const recentFoodFavorites = await loadRecentFoodLibraryFavorites(user.id).catch(() => [])
    const favorites = mergeFavorites(mergeFavorites(clientFavorites, storedFavorites), recentFoodFavorites)
    const quickHealthIntakeDraft = tryParseHealthIntakeItemsRequest(transcript, localDate, launchContext)
    if (quickHealthIntakeDraft) {
      const draft = quickHealthIntakeDraft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:health-intake-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'health-intake-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared Health Intake medication/supplement review before favorite matching`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    const earlyFavoriteDraft = shouldUseFavoriteFood(transcript, favorites) ? await buildFavoriteFoodDraft(transcript, localDate, favorites) : null
    if (earlyFavoriteDraft && shouldAutoSaveFavoriteFood(transcript, launchContext)) {
      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, earlyFavoriteDraft),
        confirmNow: true,
        audio: null,
        chargedCredits: transcriptionCostCents > 0 ? Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents) : 0,
        voiceReply: false,
      })
    }
    if (earlyFavoriteDraft) {
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null
      const sealedDraft = await sealReviewDraft(user.id, {
        ...earlyFavoriteDraft,
        confirmationMessage: `${earlyFavoriteDraft.confirmationMessage} I have not saved it yet. Say "confirm" to add it to your diary.`,
      })

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, sealedDraft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:favorite-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'favorite-match',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; matched saved favorite before AI intent`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: sealedDraft,
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    let aiFirstAttemptFailed = false
    const aiIntentClient = getOpenAIClient()
    const followUpMealText =
      followUpDraft?.action === 'recipe' && !followUpDraft?.canConfirm
        ? cleanText(followUpDraft?.recipe?.text || followUpDraft?.confirmationMessage, 1200)
        : ''
    if (followUpMealText && !conversationHistory.some((turn) => turn.role === 'assistant' && turn.text === followUpMealText)) {
      const followUpMealTurn: VoiceConversationTurn = { role: 'assistant', text: followUpMealText }
      conversationHistory = [...conversationHistory, followUpMealTurn].slice(-6)
    }
    const priorMealRecommendation = latestMealRecommendationText(conversationHistory)
    const priorMealBuildOffer = latestMealBuildOfferText(conversationHistory)
    if (priorMealBuildOffer && isRejectingDraftText(transcript)) {
      const draft = buildFoodRecommendationBuildDeclineDraft(transcript, localDate)
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply && aiIntentClient) {
        const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
        audio = tts.audio
        const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
        chargeCents += voiceCharge
        aiCostCents += tts.costCents
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:food-recommendation-build-decline',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'food-recommendation-follow-up',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; user declined building the recommended meal`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    if (priorMealRecommendation && (wantsToBuildRecommendedMeal(transcript) || (priorMealBuildOffer && isConfirmingDraftText(transcript)))) {
      const draft = buildFoodRecommendationHandoffDraft(transcript, localDate, launchContext, priorMealRecommendation)
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply && aiIntentClient) {
        const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
        audio = tts.audio
        const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
        chargeCents += voiceCharge
        aiCostCents += tts.costCents
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:food-recommendation-build',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'food-recommendation-follow-up',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; opened Build a meal from prior recommendation`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    if (priorMealRecommendation && wantsToChooseRecommendedMeal(transcript)) {
      const draft = buildFoodRecommendationBuildOfferDraft(transcript, localDate)
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply && aiIntentClient) {
        const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
        audio = tts.audio
        const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
        chargeCents += voiceCharge
        aiCostCents += tts.costCents
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:food-recommendation-build-offer',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'food-recommendation-follow-up',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; asked whether to build the agreed meal`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    if (priorMealRecommendation && wantsMealRecommendationAdjustment(transcript)) {
      const followUpRequest = `${conversationHistoryLine(conversationHistory)}\n\nUser wants to adjust the previous meal recommendation: ${transcript}`
      const recipe = aiIntentClient && aiConsentGranted ? await buildRecipe(aiIntentClient, followUpRequest, user.id, localDate, tzOffsetMin, { conversationFirst: true }) : null
      const fallbackSnapshot = recipe?.snapshot || (await buildFoodDiarySnapshot({ userId: user.id, localDate, tzOffsetMin }).catch(() => null))
      const draft = buildFoodRecommendationConversationDraft(transcript, localDate, launchContext, recipe?.text, {
        alternativeTo: priorMealRecommendation,
        diarySnapshot: fallbackSnapshot,
        adjustment: true,
      })
      let aiCostCents = transcriptionCostCents + (recipe?.costCents || 0)
      let chargeCents = Math.max(recipe ? RECIPE_MIN_CREDITS : SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply && aiIntentClient) {
        const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
        audio = tts.audio
        const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
        chargeCents += voiceCharge
        aiCostCents += tts.costCents
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:food-recommendation-adjustment',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: recipe?.model || 'food-recommendation-follow-up',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; adjusted meal recommendation conversation`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    if (!(priorMealRecommendation && wantsAnotherMealRecommendation(transcript)) && isFoodRecommendationRequest(transcript, launchContext)) {
      const recipe = aiIntentClient && aiConsentGranted ? await buildRecipe(aiIntentClient, transcript, user.id, localDate, tzOffsetMin, { conversationFirst: true }) : null
      const fallbackSnapshot = recipe?.snapshot || (await buildFoodDiarySnapshot({ userId: user.id, localDate, tzOffsetMin }).catch(() => null))
      const draft = buildFoodRecommendationConversationDraft(transcript, localDate, launchContext, recipe?.text, { diarySnapshot: fallbackSnapshot })
      let aiCostCents = transcriptionCostCents + (recipe?.costCents || 0)
      let chargeCents = Math.max(recipe ? RECIPE_MIN_CREDITS : SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply && aiIntentClient) {
        const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
        audio = tts.audio
        const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
        chargeCents += voiceCharge
        aiCostCents += tts.costCents
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:food-recommendation-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: recipe?.model || 'food-recommendation-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared diary-aware food recommendation`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    if (priorMealRecommendation && wantsAnotherMealRecommendation(transcript)) {
      const followUpRequest = `${conversationHistoryLine(conversationHistory)}\n\nUser wants another meal option: ${transcript}`
      const recipe = aiIntentClient && aiConsentGranted ? await buildRecipe(aiIntentClient, followUpRequest, user.id, localDate, tzOffsetMin, { conversationFirst: true }) : null
      const fallbackSnapshot = recipe?.snapshot || (await buildFoodDiarySnapshot({ userId: user.id, localDate, tzOffsetMin }).catch(() => null))
      const draft = buildFoodRecommendationConversationDraft(transcript, localDate, launchContext, recipe?.text, {
        alternativeTo: priorMealRecommendation,
        diarySnapshot: fallbackSnapshot,
      })
      let aiCostCents = transcriptionCostCents + (recipe?.costCents || 0)
      let chargeCents = Math.max(recipe ? RECIPE_MIN_CREDITS : SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply && aiIntentClient) {
        const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
        audio = tts.audio
        const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
        chargeCents += voiceCharge
        aiCostCents += tts.costCents
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:food-recommendation-follow-up',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: recipe?.model || 'food-recommendation-follow-up',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; continued meal recommendation conversation`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }
    if (aiIntentClient && aiConsentGranted) {
      try {
        const command = await runJsonCommandModel(aiIntentClient, transcript, localDate, user.id, launchContext, conversationHistory, confirmationDraft)
        const draftDecision = confirmationDraft ? aiDraftDecision(command.parsed) : null
        if (draftDecision) return buildAiDraftDecisionResponse(user.id, transcript, confirmationDraft, draftDecision, command, transcriptionCostCents)
        const normalized = await normalizeDraft(command.parsed, transcript, localDate, user.id, aiIntentClient, tzOffsetMin, favorites, launchContext)
        let draft = normalized.draft
        if (draft.action === 'health_question' && isFoodRecommendationRequest(transcript, launchContext)) {
          const fallbackSnapshot = await buildFoodDiarySnapshot({ userId: user.id, localDate, tzOffsetMin }).catch(() => null)
          draft = buildFoodRecommendationConversationDraft(transcript, localDate, launchContext, undefined, { diarySnapshot: fallbackSnapshot })
        }
        if (draft.action === 'unknown') throw new Error('AI intent router returned unknown')
        let aiCostCents = transcriptionCostCents + command.wrapped.costCents + normalized.aiCostCents
        const isRecipe = draft.action === 'recipe'
        let chargeCents = Math.max(isRecipe ? RECIPE_MIN_CREDITS : SIMPLE_MIN_CREDITS, aiCostCents)
        let audio: string | null = null

        if (wantsVoiceReply) {
          const tts = await speak(aiIntentClient, draft.recipe?.text || draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }

        const freshWallet = await new CreditManager(user.id).getWalletStatus()
        if (freshWallet.totalAvailableCents < chargeCents) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        const charged = await new CreditManager(user.id).chargeCents(chargeCents)
        if (!charged) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        await logAiUsageEvent({
          feature: isRecipe ? 'voice-assistant:recipe-command' : 'voice-assistant:command',
          userId: user.id,
          endpoint: '/api/native/voice-assistant',
          model: normalized.usedModel || command.usedModel,
          promptTokens: command.wrapped.promptTokens,
          completionTokens: command.wrapped.completionTokens,
          costCents: chargeCents,
          success: true,
          detail: `charged ${chargeCents} credits; AI-first intent router; vendor estimate ${aiCostCents}`,
        })

        return NextResponse.json({
          success: true,
          transcript,
          draft: await sealReviewDraft(user.id, draft),
          audio,
          chargedCredits: chargeCents,
          voiceReply: Boolean(audio),
        })
      } catch (error) {
        aiFirstAttemptFailed = true
        console.warn('[native voice assistant] AI-first understanding failed; using local fallback', error)
      }
    }

    const favoriteDraft = shouldUseFavoriteFood(transcript, favorites) ? await buildFavoriteFoodDraft(transcript, localDate, favorites) : null
    if (favoriteDraft) {
      const draft = favoriteDraft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:favorite-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'favorite-match',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; matched saved favorite`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const quickWaterDraft = tryParseWaterRequest(transcript, localDate, launchContext)
    if (quickWaterDraft) {
      const draft = quickWaterDraft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:water-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'water-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared water/liquid log`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const quickMealFood = tryParseIngredientMealRequest(transcript) || tryParseDirectFoodRequest(transcript, launchContext)
    const quickMealDraft = quickMealFood ? await buildVoiceMealDraft(quickMealFood, transcript, localDate) : null
    if (quickMealDraft) {
      const draft = quickMealDraft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:quick-meal-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'food-ingredient-match',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; built meal from ingredient search`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const quickRecipeDraft = buildQuickRecipeDraft(transcript, localDate, launchContext)
    if (quickRecipeDraft) {
      const draft = quickRecipeDraft
      const chargeCents = Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents)

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:quick-recipe-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: 'quick-recipe-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared quick recipe text`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio: null,
        chargedCredits: chargeCents,
        voiceReply: false,
      })
    }

    const quickToolDraft = buildQuickToolDraft(transcript, localDate, launchContext)
    if (quickToolDraft) {
      const draft = quickToolDraft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:tool-route',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'tool-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; opened matching Helfi tool`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const quickParsed =
      tryParseCopyPreviousRequest(transcript) ||
      tryParseJournalRequest(transcript, launchContext) ||
      tryParseExerciseRequest(transcript, launchContext) ||
      tryParseMoodRequest(transcript, launchContext)
    if (quickParsed) {
      const normalized = await normalizeDraft(quickParsed, transcript, localDate, user.id, null as any, tzOffsetMin, favorites)
      const draft = normalized.draft
      let aiCostCents = transcriptionCostCents
      let chargeCents = Math.max(SIMPLE_MIN_CREDITS, aiCostCents)
      let audio: string | null = null

      if (wantsVoiceReply) {
        const openai = getOpenAIClient()
        if (openai) {
          const tts = await speak(openai, draft.confirmationMessage, user.id)
          audio = tts.audio
          const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
          chargeCents += voiceCharge
          aiCostCents += tts.costCents
        }
      }

      const freshWallet = await new CreditManager(user.id).getWalletStatus()
      if (freshWallet.totalAvailableCents < chargeCents) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      const charged = await new CreditManager(user.id).chargeCents(chargeCents)
      if (!charged) {
        return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
      }

      await logAiUsageEvent({
        feature: 'voice-assistant:quick-log-command',
        userId: user.id,
        endpoint: '/api/native/voice-assistant',
        model: audio ? TTS_MODEL : 'quick-log-router',
        promptTokens: 0,
        completionTokens: 0,
        costCents: chargeCents,
        success: true,
        detail: `charged ${chargeCents} credits; prepared quick log draft`,
      })

      return NextResponse.json({
        success: true,
        transcript,
        draft: await sealReviewDraft(user.id, draft),
        audio,
        chargedCredits: chargeCents,
        voiceReply: Boolean(audio),
      })
    }

    const quickClarificationDraft = buildQuickClarificationDraft(transcript, localDate)
    if (quickClarificationDraft) {
      const chargeCents = transcriptionCostCents > 0 ? Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents) : 0
      if (chargeCents > 0) {
        const freshWallet = await new CreditManager(user.id).getWalletStatus()
        if (freshWallet.totalAvailableCents < chargeCents) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        const charged = await new CreditManager(user.id).chargeCents(chargeCents)
        if (!charged) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        await logAiUsageEvent({
          feature: 'voice-assistant:clarification-command',
          userId: user.id,
          endpoint: '/api/native/voice-assistant',
          model: TRANSCRIBE_MODEL,
          promptTokens: 0,
          completionTokens: 0,
          costCents: chargeCents,
          success: true,
          detail: `charged ${chargeCents} credits; transcribed unclear voice command`,
        })
      }

      return NextResponse.json({
        success: true,
        transcript,
        draft: quickClarificationDraft,
        audio: null,
        chargedCredits: chargeCents,
        voiceReply: false,
      })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({
        success: true,
        transcript,
        draft: buildGenericClarificationDraft(transcript, localDate),
        audio: null,
        voiceReply: false,
      })
    }
    if (aiFirstAttemptFailed) {
      const chargeCents = transcriptionCostCents > 0 ? Math.max(SIMPLE_MIN_CREDITS, transcriptionCostCents) : 0
      if (chargeCents > 0) {
        const freshWallet = await new CreditManager(user.id).getWalletStatus()
        if (freshWallet.totalAvailableCents < chargeCents) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        const charged = await new CreditManager(user.id).chargeCents(chargeCents)
        if (!charged) {
          return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
        }

        await logAiUsageEvent({
          feature: 'voice-assistant:ai-first-fallback',
          userId: user.id,
          endpoint: '/api/native/voice-assistant',
          model: TRANSCRIBE_MODEL,
          promptTokens: 0,
          completionTokens: 0,
          costCents: chargeCents,
          success: true,
          detail: `charged ${chargeCents} credits; AI-first understanding failed and no local action matched`,
        })
      }

      return NextResponse.json({
        success: true,
        transcript,
        draft: buildGenericClarificationDraft(transcript, localDate),
        audio: null,
        chargedCredits: chargeCents,
        voiceReply: false,
      })
    }
    if (!aiConsentGranted) {
      return NextResponse.json({ error: 'AI sharing consent is required before this request can be sent to AI.' }, { status: 403 })
    }

    const command = await runJsonCommandModel(openai, transcript, localDate, user.id, launchContext, conversationHistory, confirmationDraft)
    const draftDecision = confirmationDraft ? aiDraftDecision(command.parsed) : null
    if (draftDecision) return buildAiDraftDecisionResponse(user.id, transcript, confirmationDraft, draftDecision, command, transcriptionCostCents)
    const normalized = await normalizeDraft(command.parsed, transcript, localDate, user.id, openai, tzOffsetMin, favorites, launchContext)
    let draft = normalized.draft
    let aiCostCents = transcriptionCostCents + command.wrapped.costCents + normalized.aiCostCents
    const isRecipe = draft.action === 'recipe'
    let chargeCents = Math.max(isRecipe ? RECIPE_MIN_CREDITS : SIMPLE_MIN_CREDITS, aiCostCents)
    let audio: string | null = null

    if (wantsVoiceReply) {
      const tts = await speak(openai, draft.recipe?.text || draft.confirmationMessage, user.id)
      audio = tts.audio
      const voiceCharge = Math.max(VOICE_REPLY_MIN_CREDITS, tts.costCents)
      chargeCents += voiceCharge
      aiCostCents += tts.costCents
    }

    const freshWallet = await new CreditManager(user.id).getWalletStatus()
    if (freshWallet.totalAvailableCents < chargeCents) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
    }

    const charged = await new CreditManager(user.id).chargeCents(chargeCents)
    if (!charged) {
      return NextResponse.json({ error: 'Insufficient credits', estimatedCost: chargeCents, availableCredits: freshWallet.totalAvailableCents }, { status: 402 })
    }

    await logAiUsageEvent({
      feature: isRecipe ? 'voice-assistant:recipe-command' : 'voice-assistant:command',
      userId: user.id,
      endpoint: '/api/native/voice-assistant',
      model: normalized.usedModel || command.usedModel,
      promptTokens: command.wrapped.promptTokens,
      completionTokens: command.wrapped.completionTokens,
      costCents: chargeCents,
      success: true,
      detail: `charged ${chargeCents} credits; vendor estimate ${aiCostCents}`,
    })

    return NextResponse.json({
      success: true,
      transcript,
      draft: await sealReviewDraft(user.id, draft),
      audio,
      chargedCredits: chargeCents,
      voiceReply: Boolean(audio),
    })
  } catch (error: any) {
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: 'AI voice is temporarily paused because usage climbed too fast. Please try again shortly.' },
        { status: 429 },
      )
    }
    console.error('[native voice assistant] draft failed', error)
    return NextResponse.json({ error: error?.message || 'Voice assistant failed' }, { status: 500 })
  }
}
