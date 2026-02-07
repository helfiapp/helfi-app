'use client';
// Fixed: Added use client directive for useState compatibility

import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import CreditPurchaseModal from '@/components/CreditPurchaseModal';
import { useUserData } from '@/components/providers/UserDataProvider';
import MobileMoreMenu from '@/components/MobileMoreMenu';
import UsageMeter from '@/components/UsageMeter';
import InsightsProgressBar from '@/components/InsightsProgressBar';
import LabReportUpload from '@/components/reports/LabReportUpload';
import { UserIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import MaterialSymbol from '@/components/MaterialSymbol';
import { DIET_CATEGORIES, DIET_OPTIONS, getDietOption, normalizeDietTypes } from '@/lib/diets';
import { applyDietMacroRules, calculateDailyTargets } from '@/lib/daily-targets';
import { normalizeHealthCheckSettings } from '@/lib/food-health-check-settings';

const HEALTH_SETUP_STAMP_KEYS = new Set([
  'gender',
  'termsAccepted',
  'weight',
  'height',
  'birthdate',
  'bodyType',
  'exerciseFrequency',
  'exerciseTypes',
  'exerciseDurations',
  'goals',
  'goalChoice',
  'goalIntensity',
  'goalTargetWeightKg',
  'goalTargetWeightUnit',
  'goalPaceKgPerWeek',
  'goalCalorieTarget',
  'goalMacroSplit',
  'goalMacroMode',
  'goalFiberTarget',
  'goalSugarMax',
  'dietTypes',
  'dietType',
  'allergies',
  'diabetesType',
  'healthCheckSettings',
  'healthSituations',
  'bloodResults',
  'supplements',
  'medications',
])

let healthSetupUpdateStamp = 0
const nextHealthSetupUpdateStamp = () => {
  const now = Date.now()
  healthSetupUpdateStamp = Math.max(healthSetupUpdateStamp + 1, now)
  return healthSetupUpdateStamp
}

const shouldStampHealthSetup = (payload: any) => {
  if (!payload || typeof payload !== 'object') return false
  return Object.keys(payload).some((key) => HEALTH_SETUP_STAMP_KEYS.has(key))
}

const normalizeTimingList = (timing: any) => {
  if (Array.isArray(timing)) {
    return timing.map((value) => String(value || '').trim()).filter(Boolean).sort().join('|')
  }
  if (timing === null || timing === undefined) return ''
  return String(timing).trim()
}

const buildItemKey = (item: any) => {
  const name = String(item?.name || '').trim().toLowerCase()
  const dosage = String(item?.dosage || '').trim().toLowerCase()
  const timing = normalizeTimingList(item?.timing)
  const scheduleInfo = String(item?.scheduleInfo || '').trim().toLowerCase()
  const imageUrl = String(item?.imageUrl || '').trim().toLowerCase()
  return `${name}|${dosage}|${timing}|${scheduleInfo}|${imageUrl}`
}

const dedupeItems = (items: any[]) => {
  const seen = new Set<string>()
  const result: any[] = []
  items.forEach((item) => {
    if (!item || !item.name) return
    const key = buildItemKey(item)
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

const areItemsEquivalent = (left: any[], right: any[]) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  const leftKeys = left.map(buildItemKey).sort()
  const rightKeys = right.map(buildItemKey).sort()
  for (let i = 0; i < leftKeys.length; i += 1) {
    if (leftKeys[i] !== rightKeys[i]) return false
  }
  return true
}

const parseImageValue = (raw: any) => {
  if (!raw) return { frontUrl: null as string | null, backUrl: null as string | null }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && (parsed.front || parsed.back)) {
          return {
            frontUrl: parsed.front || null,
            backUrl: parsed.back || null,
          }
        }
      } catch {
        // fall through to treat as a direct URL
      }
    }
    return { frontUrl: trimmed || null, backUrl: null }
  }
  if (typeof raw === 'object') {
    return { frontUrl: raw.front || null, backUrl: raw.back || null }
  }
  return { frontUrl: null, backUrl: null }
}

const buildImageValue = (frontUrl: string | null, backUrl: string | null) => {
  if (!frontUrl && !backUrl) return null
  if (backUrl) {
    const payload: { front?: string; back?: string } = {}
    if (frontUrl) payload.front = frontUrl
    payload.back = backUrl
    return JSON.stringify(payload)
  }
  return frontUrl
}

const getDisplayName = (name: any, fallback: string) => {
  const safe = String(name || '').trim()
  if (!safe) return fallback
  const normalized = safe.toLowerCase()
  const placeholders = new Set([
    'analyzing...',
    'supplement added',
    'medication added',
    'unknown supplement',
    'unknown medication',
    'analysis error'
  ])
  if (placeholders.has(normalized)) return fallback
  return safe
}

const formatManualName = (raw: string) => {
  if (!raw) return ''
  let text = raw.replace(/\s+/g, ' ').trim()
  text = text.replace(/\s*-\s*/g, ' - ')
  if (!text) return ''
  return text
    .split(' ')
    .map((token) => {
      if (!token) return ''
      if (/[0-9]/.test(token)) return token.toUpperCase()
      const upper = token.toUpperCase()
      if (upper.length <= 3) return upper
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
    })
    .join(' ')
    .trim()
}

const buildSupplementNameFromDsld = (source: any) => {
  const brand =
    source?.brandName ||
    source?.brand_name ||
    source?.brand ||
    source?.manufacturer ||
    null
  const product =
    source?.fullName ||
    source?.productName ||
    source?.product_name ||
    source?.labelName ||
    source?.label_name ||
    source?.supplementName ||
    source?.supplement_name ||
    null
  if (brand && product) return `${brand} - ${product}`
  return product || brand || null
}

const extractDsldBrand = (source: any) => {
  return (
    source?.brandName ||
    source?.brand_name ||
    source?.brand ||
    source?.manufacturer ||
    ''
  )
}

const COMMON_SUPPLEMENT_BRANDS = [
  'NOW Foods',
  'Thorne',
  'Life Extension',
  'Nature Made',
  'Nature\'s Bounty',
  'Garden of Life',
  'Nordic Naturals',
  'Solgar',
  'Kirkland Signature',
  'Pure Encapsulations',
  'Jarrow Formulas',
  'Doctor\'s Best',
  'Nature\'s Way',
  'Gaia Herbs',
  'Metagenics',
  'Designs for Health',
  'Solaray',
  'Source Naturals',
  'MegaFood',
  'Swanson',
  'Country Life',
  'Vitacost',
  'GNC',
  'Optimum Nutrition',
  'MuscleTech',
  'MyProtein',
  'Ritual',
  'SmartyPants',
  'Olly',
  'HUM Nutrition',
  'MaryRuth\'s',
  'Bluebonnet',
  'Kal',
  'New Chapter',
  'Rainbow Light',
  'Vital Proteins',
  'Sports Research',
  'Youtheory',
  'Integrative Therapeutics',
  'Carlson',
  'Carlson Labs',
  'Trace Minerals Research',
  'Klaire Labs',
]

const BRAND_ALIASES: Record<string, string> = {
  'now foods': 'now',
  'now': 'now',
}

const normalizeSearchText = (value: string) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type BrandMatch = { display: string; normalized: string }

const getBrandMatch = (rawQuery: string): BrandMatch | null => {
  const query = normalizeSearchText(rawQuery)
  if (!query) return null
  let best: BrandMatch | null = null
  COMMON_SUPPLEMENT_BRANDS.forEach((brand) => {
    const normalized = normalizeSearchText(brand)
    if (!normalized) return
    const queryStartsWithBrand = query.startsWith(normalized)
    const brandStartsWithQuery = normalized.startsWith(query)
    if (!queryStartsWithBrand && !brandStartsWithQuery) return
    if (!best || normalized.length > best.normalized.length) {
      best = { display: brand, normalized }
    }
  })
  return best
}

const getBrandKey = (normalizedBrand: string) => {
  return BRAND_ALIASES[normalizedBrand] || normalizedBrand
}

const buildBrandSuggestionsFromList = (rawQuery: string) => {
  const query = normalizeSearchText(rawQuery)
  if (!query) return [] as { name: string; source: string }[]
  const firstToken = query.split(' ')[0] || query
  const results: { name: string; source: string }[] = []
  const seen = new Set<string>()
  COMMON_SUPPLEMENT_BRANDS.forEach((brand) => {
    const normalized = normalizeSearchText(brand)
    if (!normalized) return
    const matches =
      normalized.startsWith(query) ||
      normalized.startsWith(firstToken) ||
      normalized.split(' ').some((word) => word.startsWith(query)) ||
      query.split(' ').every((word) => normalized.includes(word))
    if (!matches) return
    const key = normalized
    if (seen.has(key)) return
    seen.add(key)
    results.push({ name: `${brand} -`, source: 'brand' })
  })
  return results
}

const buildBrandSuggestionsFromDsld = (data: any, rawQuery: string) => {
  const query = normalizeSearchText(rawQuery)
  if (!query) return [] as { name: string; source: string }[]
  const hits = Array.isArray(data?.hits) ? data.hits : data?.hits?.hits
  const seen = new Set<string>()
  const results: { name: string; source: string }[] = []
  const items = Array.isArray(hits) ? hits : []
  items.forEach((hit: any) => {
    const source = hit?._source || hit?.source || hit || {}
    const brand =
      source?.brandName ||
      source?.brand_name ||
      source?.brand ||
      source?.manufacturer ||
      ''
    const cleaned = String(brand || '').trim()
    if (!cleaned) return
    const normalized = normalizeSearchText(cleaned)
    if (!normalized) return
    const matches =
      normalized.startsWith(query) ||
      normalized.split(' ').some((word) => word.startsWith(query)) ||
      query.split(' ').every((word) => normalized.includes(word))
    if (!matches) return
    const key = normalized
    if (seen.has(key)) return
    seen.add(key)
    results.push({ name: `${cleaned} -`, source: 'brand' })
  })
  return results
}

const dedupeSuggestions = (items: { name: string; source: string }[]) => {
  const seen = new Set<string>()
  const results: { name: string; source: string }[] = []
  items.forEach((item) => {
    const key = String(item.name || '').toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    results.push(item)
  })
  return results
}

const parseDsldSuggestions = (data: any) => {
  const hits = Array.isArray(data?.hits) ? data.hits : data?.hits?.hits
  const items = (Array.isArray(hits) ? hits : [])
    .map((hit: any) => {
      const source = hit?._source || hit?.source || hit || {}
      const name = buildSupplementNameFromDsld(source)
      if (!name) return null
      const brand = extractDsldBrand(source)
      return { name, source: 'dsld', brand }
    })
    .filter(Boolean) as { name: string; source: string; brand?: string }[]
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const parseDsldBrandProducts = (data: any) => {
  const hits = Array.isArray(data?.hits) ? data.hits : data?.hits?.hits
  const items = (Array.isArray(hits) ? hits : [])
    .map((hit: any) => {
      const source = hit?._source || hit?.source || hit || {}
      const name = buildSupplementNameFromDsld(source)
      if (!name) return null
      const brand = extractDsldBrand(source)
      return { name, source: 'dsld', brand }
    })
    .filter(Boolean) as { name: string; source: string; brand?: string }[]
  return items
}

const fetchDsldBrandProducts = async (query: string, size = 25) => {
  const brandUrl = `https://api.ods.od.nih.gov/dsld/v9/brand-products?q=${encodeURIComponent(query)}&from=0&size=${size}`
  const brandResponse = await fetch(brandUrl)
  if (!brandResponse.ok) return [] as { name: string; source: string; brand?: string }[]
  const brandData = await brandResponse.json().catch(() => ({}))
  return parseDsldBrandProducts(brandData)
}

const filterSuggestionsByBrand = (
  items: { name: string; source: string; brand?: string }[],
  brandKey: string,
) => {
  const key = normalizeSearchText(brandKey)
  if (!key) return []
  return items.filter((item) => {
    const normalizedBrand = normalizeSearchText(item.brand || '')
    if (!normalizedBrand) return false
    if (key.length <= 3) return normalizedBrand === key
    if (normalizedBrand === key) return true
    if (normalizedBrand.startsWith(`${key} `)) return true
    if (key.startsWith(`${normalizedBrand} `)) return true
    return false
  })
}

const filterSuggestionsByRemainder = (
  items: { name: string; source: string; brand?: string }[],
  remainder: string,
) => {
  const normalized = normalizeSearchText(remainder)
  if (!normalized) return items
  const tokens = normalized.split(' ').filter(Boolean)
  return items.filter((item) => {
    const label = normalizeSearchText(item.name || '')
    if (!label) return false
    return tokens.every(
      (token) =>
        label.includes(token) || label.split(' ').some((word) => word.startsWith(token)),
    )
  })
}

const getRemainderAfterBrand = (rawQuery: string, brandNormalized: string) => {
  const query = normalizeSearchText(rawQuery)
  if (!query || !brandNormalized) return ''
  if (!query.startsWith(brandNormalized)) return ''
  const remainder = query.slice(brandNormalized.length).trim()
  return remainder
}

const isPlaceholderName = (name: any) => {
  const safe = String(name || '').trim()
  if (!safe) return true
  const normalized = safe.toLowerCase()
  return new Set([
    'analyzing...',
    'supplement added',
    'medication added',
    'unknown supplement',
    'unknown medication',
    'analysis error'
  ]).has(normalized)
}

const compressImageFile = async (file: File, maxDim = 1800, quality = 0.82): Promise<File> => {
  if (!file || !file.type.startsWith('image/')) return file
  if (file.size <= 900_000) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const targetW = Math.max(1, Math.round(bitmap.width * scale))
    const targetH = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    const blob: Blob | null = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

const analyzeLabelName = async (
  file: File,
  options?: { scanType?: 'supplement' | 'medication'; scanId?: string }
) => {
  const formData = new FormData()
  formData.append('image', file)
  if (options?.scanType) formData.append('scanType', options.scanType)
  if (options?.scanId) formData.append('scanId', options.scanId)
  const response = await fetch('/api/analyze-supplement-image', {
    method: 'POST',
    body: formData
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = errorData?.message || errorData?.error || 'Name scan failed'
    throw new Error(message)
  }
  const result = await response.json().catch(() => ({}))
  return result?.supplementName as string | undefined
}

const sanitizeUserDataPayload = (payload: any, options?: { forceStamp?: boolean }) => {
  if (!payload || typeof payload !== 'object') return payload;
  // Strip food diary and favorites fields so health-setup autosaves cannot overwrite them
  const { todaysFoods, favorites, ...rest } = payload as any;
  const sanitizedSupplements = Array.isArray(rest.supplements) ? dedupeItems(rest.supplements) : rest.supplements
  const sanitizedMedications = Array.isArray(rest.medications) ? dedupeItems(rest.medications) : rest.medications
  const sanitized = { ...rest, supplements: sanitizedSupplements, medications: sanitizedMedications }
  if (options?.forceStamp && shouldStampHealthSetup(rest)) {
    return { ...sanitized, healthSetupUpdatedAt: nextHealthSetupUpdateStamp() }
  }
  if (sanitized.healthSetupUpdatedAt) {
    return sanitized;
  }
  if (shouldStampHealthSetup(sanitized)) {
    return { ...sanitized, healthSetupUpdatedAt: nextHealthSetupUpdateStamp() }
  }
  return sanitized;
};

const AUTO_UPDATE_INSIGHTS_ON_EXIT = true;
const SAVE_HEALTH_SETUP_ON_LEAVE_ONLY = false;
const HEALTH_SETUP_SYNC_POLL_MS = 12 * 1000;
const HEALTH_SETUP_SYNC_EDIT_GRACE_MS = 20 * 1000;

// Auth-enabled onboarding flow

// Update Insights Popup Component
function UpdateInsightsPopup({ 
  isOpen, 
  onClose, 
  onUpdateInsights, 
  isGenerating,
  onAddMore,
}: { 
  isOpen: boolean
  onClose: () => void
  onUpdateInsights: () => void
  isGenerating: boolean
  onAddMore?: () => void
}) {
  if (AUTO_UPDATE_INSIGHTS_ON_EXIT) return null;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-helfi-green" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="ml-3 text-lg font-medium text-gray-900">
            Update Insights?
          </h3>
        </div>
        
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-4">
            You've changed your health information. Would you like to update your insights now? This will regenerate AI insights, update Talk to Helfi, and refresh all AI-powered sections with your latest data.
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Credits will be charged after generation based on actual AI usage.
          </p>
          {isGenerating && (
            <div className="mb-4">
              <InsightsProgressBar isGenerating={true} message="Generating insights..." />
            </div>
          )}
        </div>
        
        <div className="flex flex-col space-y-3">
          <button
            onClick={onUpdateInsights}
            disabled={isGenerating}
            className="w-full px-4 py-3 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed font-medium"
            type="button"
          >
            {isGenerating ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                Updating Insights...
              </>
            ) : (
              'Update Insights'
            )}
          </button>
          <button
            onClick={() => {
              if (onAddMore) {
                onAddMore();
              } else {
                onClose();
              }
            }}
            disabled={isGenerating}
            className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            type="button"
          >
            Add More
          </button>
        </div>
      </div>
    </div>
  );
}

const steps = [
  'gender',
  'physical',
  'exercise',
  'healthGoals',
  'healthSituations',
  'supplements',
  'medications',
  'bloodResults',
  'aiInsights',
  'review',
];

type InsightChangeType =
  | 'supplements'
  | 'medications'
  | 'food'
  | 'exercise'
  | 'health_goals'
  | 'health_situations'
  | 'profile'
  | 'blood_results';

function normalizeForComparison(value: any): any {
  if (Array.isArray(value)) {
    return [...value]
      .map((item) => normalizeForComparison(item))
      .sort((a, b) => {
        const aStr = JSON.stringify(a) || '';
        const bStr = JSON.stringify(b) || '';
        return aStr.localeCompare(bStr);
      });
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = normalizeForComparison((value as any)[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function getInsightsRelevantOnboardingFormSnapshot(source: any): any {
  const sanitized = sanitizeUserDataPayload(source) || {};
  const normalizeRoundedNumberString = (raw: any) => {
    if (raw === null || raw === undefined || raw === '') return ''
    const n = typeof raw === 'number' ? raw : Number(String(raw))
    if (!Number.isFinite(n)) return (raw || '').toString()
    return String(Math.round(n))
  }
  const normalizeDecimalString = (raw: any, precision = 2) => {
    if (raw === null || raw === undefined || raw === '') return ''
    const n = typeof raw === 'number' ? raw : Number(String(raw))
    if (!Number.isFinite(n)) return (raw || '').toString()
    return n.toFixed(precision)
  }
  const healthSituationsDefault = {
    healthIssues: '',
    healthProblems: '',
    additionalInfo: '',
    skipped: false,
  };

  return {
    gender: typeof sanitized.gender === 'string' ? sanitized.gender : '',
    // Important: backend may load these as numbers (DB Floats) while the form saves strings.
    // Normalizing prevents false "Update Insights" prompts when the value is the same.
    weight: normalizeRoundedNumberString((sanitized as any).weight),
    height: normalizeRoundedNumberString((sanitized as any).height),
    bodyType: typeof sanitized.bodyType === 'string' ? sanitized.bodyType : '',
    birthdate: typeof sanitized.birthdate === 'string' ? sanitized.birthdate : '',
    dietTypes: normalizeDietTypes((sanitized as any)?.dietTypes ?? (sanitized as any)?.dietType).sort(),
    goalChoice: typeof sanitized.goalChoice === 'string' ? sanitized.goalChoice : '',
    goalIntensity: (sanitized.goalIntensity || 'standard').toString().toLowerCase(),
    goalTargetWeightKg: normalizeDecimalString((sanitized as any).goalTargetWeightKg, 1),
    goalTargetWeightUnit:
      typeof (sanitized as any).goalTargetWeightUnit === 'string'
        ? (sanitized as any).goalTargetWeightUnit.toLowerCase()
        : '',
    goalPaceKgPerWeek: normalizeDecimalString((sanitized as any).goalPaceKgPerWeek, 2),
    goalCalorieTarget: normalizeRoundedNumberString((sanitized as any).goalCalorieTarget),
    goalMacroSplit: (() => {
      const split = (sanitized as any).goalMacroSplit
      if (!split || typeof split !== 'object') return null
      const proteinPct = normalizeDecimalString(split.proteinPct, 3)
      const carbPct = normalizeDecimalString(split.carbPct, 3)
      const fatPct = normalizeDecimalString(split.fatPct, 3)
      if (!proteinPct && !carbPct && !fatPct) return null
      return { proteinPct, carbPct, fatPct }
    })(),
    goalMacroMode: (() => {
      const raw =
        typeof (sanitized as any).goalMacroMode === 'string'
          ? (sanitized as any).goalMacroMode.toLowerCase()
          : '';
      return raw === 'manual' ? 'manual' : 'auto';
    })(),
    goalFiberTarget: normalizeRoundedNumberString((sanitized as any).goalFiberTarget),
    goalSugarMax: normalizeRoundedNumberString((sanitized as any).goalSugarMax),
    profileInfo: sanitized.profileInfo && typeof sanitized.profileInfo === 'object' ? sanitized.profileInfo : {},
    allergies: Array.isArray(sanitized.allergies) ? sanitized.allergies : [],
    diabetesType: typeof sanitized.diabetesType === 'string' ? sanitized.diabetesType : '',

    goals: Array.isArray(sanitized.goals) ? sanitized.goals : [],
    healthSituations:
      sanitized.healthSituations && typeof sanitized.healthSituations === 'object'
        ? { ...healthSituationsDefault, ...sanitized.healthSituations }
        : healthSituationsDefault,
    supplements: Array.isArray(sanitized.supplements) ? sanitized.supplements : [],
    medications: Array.isArray(sanitized.medications) ? sanitized.medications : [],
    bloodResults:
      sanitized.bloodResults && typeof sanitized.bloodResults === 'object' ? sanitized.bloodResults : {},
  };
}

function pickFields(source: any, fields: string[]) {
  const result: Record<string, any> = {};
  for (const field of fields) {
    if (source && Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
}

function detectChangedInsightTypes(baselineJson: string, currentForm: any): InsightChangeType[] {
  let baselineRaw: any = {};
  try {
    baselineRaw = baselineJson ? JSON.parse(baselineJson) : {};
  } catch {
    baselineRaw = {};
  }
  const baseline = getInsightsRelevantOnboardingFormSnapshot(baselineRaw);
  const current = getInsightsRelevantOnboardingFormSnapshot(currentForm || {});
  const hasChanged = (a: any, b: any) =>
    JSON.stringify(normalizeForComparison(a)) !== JSON.stringify(normalizeForComparison(b));

  const changeTypes: InsightChangeType[] = [];

  if (
    hasChanged(
      pickFields(baseline, [
        'gender',
        'weight',
        'height',
        'bodyType',
        'birthdate',
        'dietTypes',
        'goalChoice',
        'goalIntensity',
        'goalTargetWeightKg',
        'goalTargetWeightUnit',
        'goalPaceKgPerWeek',
        'goalCalorieTarget',
        'goalMacroSplit',
        'goalMacroMode',
        'goalFiberTarget',
        'goalSugarMax',
        'profileInfo',
        'allergies',
        'diabetesType',
      ]),
      pickFields(current, [
        'gender',
        'weight',
        'height',
        'bodyType',
        'birthdate',
        'dietTypes',
        'goalChoice',
        'goalIntensity',
        'goalTargetWeightKg',
        'goalTargetWeightUnit',
        'goalPaceKgPerWeek',
        'goalCalorieTarget',
        'goalMacroSplit',
        'goalMacroMode',
        'goalFiberTarget',
        'goalSugarMax',
        'profileInfo',
        'allergies',
        'diabetesType',
      ]),
    )
  ) {
    changeTypes.push('profile');
  }

  if (hasChanged(baseline?.goals, current?.goals)) {
    changeTypes.push('health_goals');
  }

  if (hasChanged(baseline?.healthSituations, current?.healthSituations)) {
    changeTypes.push('health_situations');
  }

  if (hasChanged(baseline?.supplements, current?.supplements)) {
    changeTypes.push('supplements');
  }

  if (hasChanged(baseline?.medications, current?.medications)) {
    changeTypes.push('medications');
  }

  if (hasChanged(baseline?.bloodResults, current?.bloodResults)) {
    changeTypes.push('blood_results');
  }

  return Array.from(new Set(changeTypes));
}

// Global state for background regen status (shown in UI)
let globalRegenStatusCallback: ((status: { isRegenerating: boolean; message?: string }) => void) | null = null;

function setGlobalRegenStatusCallback(cb: ((status: { isRegenerating: boolean; message?: string }) => void) | null) {
  globalRegenStatusCallback = cb;
}

function showGlobalRegenStatus(isRegenerating: boolean, message?: string) {
  if (globalRegenStatusCallback) {
    globalRegenStatusCallback({ isRegenerating, message });
  }
}

// Fire-and-forget version: starts regen in background, returns immediately
function slugifyGoal(name: string) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
}

type FireAndForgetRegenOptions = {
  onSuccess?: (data: any) => void;
  onError?: (data: any) => void;
  onComplete?: () => void;
};

function fireAndForgetInsightsRegen(
  changeTypes: InsightChangeType[],
  goalNames?: string[],
  options?: FireAndForgetRegenOptions,
) {
  const unique = Array.from(new Set(changeTypes || [])).filter(Boolean) as InsightChangeType[];
  if (!unique.length) return;
  
  const runId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `run_${Math.random().toString(36).slice(2)}`;
  const goalSlugs = Array.isArray(goalNames) ? Array.from(new Set(goalNames.map(slugifyGoal).filter(Boolean))) : undefined;
  
  // Show background status
  showGlobalRegenStatus(true, 'Updating insights… You can keep using the app.');
  
  // Fire the request but don't await it
  fetch('/api/insights/regenerate-targeted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeTypes: unique, runId, goalSlugs }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        // Refresh credits when done
        try {
          window.dispatchEvent(new Event('credits:refresh'));
        } catch {}
        
        if (data.background) {
          // Still processing in background on server
          showGlobalRegenStatus(true, 'Still finishing your insights...');
          // Clear status after a delay
          setTimeout(() => showGlobalRegenStatus(false), 5000);
        } else {
          // Completed successfully
          showGlobalRegenStatus(false);
        }
        options?.onSuccess?.(data);
      } else {
        console.warn('Background insights regen failed:', data?.message);
        showGlobalRegenStatus(false);
        options?.onError?.(data);
      }
    })
    .catch((error) => {
      console.warn('Background insights regen error:', error);
      showGlobalRegenStatus(false);
      options?.onError?.(error);
    })
    .finally(() => {
      options?.onComplete?.();
    });
}

async function triggerTargetedInsightsRefresh(
  changeTypes: InsightChangeType[],
  options: { silent?: boolean; fireAndForget?: boolean; goalNames?: string[] } = {}
) {
  const unique = Array.from(new Set(changeTypes || [])).filter(Boolean) as InsightChangeType[];
  if (!unique.length) return null;
  const goalSlugs =
    Array.isArray(options.goalNames) && options.goalNames.length
      ? Array.from(new Set(options.goalNames.map(slugifyGoal).filter(Boolean)))
      : undefined;
  
  // Fire-and-forget mode: start regen and return immediately
  if (options.fireAndForget) {
    fireAndForgetInsightsRegen(unique, options.goalNames);
    return { success: true, background: true, message: 'Insights updating in background' };
  }
  
  const runId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `run_${Math.random().toString(36).slice(2)}`;
  try {
    const res = await fetch('/api/insights/regenerate-targeted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeTypes: unique, runId, goalSlugs }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      if (!options.silent) {
        alert(data?.message || 'Failed to update insights. Please try again.');
      }
      return null;
    }
    const charged = typeof data.chargedCredits === 'number' ? data.chargedCredits : 0;
    const costDollars = typeof data.costCents === 'number' ? (data.costCents / 100).toFixed(2) : null;
    const subscriptionCredits = typeof data.subscriptionCreditsCharged === 'number' ? data.subscriptionCreditsCharged : 0;
    const topUpCredits = typeof data.topUpCreditsCharged === 'number' ? data.topUpCreditsCharged : 0;
    const usageEvents = typeof data.usageEvents === 'number' ? data.usageEvents : null;
    if (!options.silent) {
      let msg = '';
      if (data.background) {
        msg = 'Still finishing up. Insights will refresh shortly and credits will update once done.';
      } else {
        msg = charged > 0
          ? `Charged ${charged} credits${costDollars ? ` (AI cost ~$${costDollars})` : ''} for this insights update.${subscriptionCredits || topUpCredits ? ` [Sub: ${subscriptionCredits}, Top-up: ${topUpCredits}]` : ''}${usageEvents != null ? ` • LLM calls: ${usageEvents}` : ''}`
          : 'Insights updated without any AI charges.';
      }
      alert(msg);
    }
    try {
      window.dispatchEvent(new Event('credits:refresh'));
    } catch {
      // non-blocking
    }
    return data;
  } catch (error) {
    console.warn('Failed to trigger targeted insights regeneration', error);
    if (!options.silent) {
      alert('Failed to update insights. Please try again.');
    }
    return null;
  }
}

// Deterministic stringify for form snapshots.
// The onboarding guard compares baseline vs current form; plain JSON.stringify is sensitive
// to object key insertion order, which can cause "always dirty" false positives.
function stableStringify(value: any): string {
  const seen = new WeakSet<object>();
  const normalize = (val: any): any => {
    if (val === null || val === undefined) return val;
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return val;
    if (t !== 'object') return val;
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val.map(normalize);
    if (seen.has(val)) return '[Circular]';
    seen.add(val);
    const out: Record<string, any> = {};
    for (const key of Object.keys(val).sort()) {
      out[key] = normalize(val[key]);
    }
    return out;
  };
  try {
    return JSON.stringify(normalize(value));
  } catch {
    // Last resort: fall back to regular stringify so we don't crash the guard.
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
}

function onboardingGuardSnapshotJson(form: any): string {
  const relevant = getInsightsRelevantOnboardingFormSnapshot(form);
  return stableStringify(normalizeForComparison(relevant));
}

// Track when the user chooses to continue without running Update Insights so navigation isn't blocked
function useUnsavedNavigationAllowance(hasUnsavedChanges: boolean) {
  const blockNavigation = !AUTO_UPDATE_INSIGHTS_ON_EXIT;
  const [allowUnsavedNavigation, setAllowUnsavedNavigation] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const allowUnsavedNavigationRef = useRef(allowUnsavedNavigation);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const prevHasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const lastSavedRef = useRef<number>(Date.now());

  useEffect(() => {
    allowUnsavedNavigationRef.current = allowUnsavedNavigation;
  }, [allowUnsavedNavigation]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // If new changes appear after we previously allowed navigation, re-lock navigation
  useEffect(() => {
    if (!blockNavigation) return;
    const prev = prevHasUnsavedChangesRef.current;
    if (hasUnsavedChanges && !prev && allowUnsavedNavigationRef.current) {
      setAllowUnsavedNavigation(false);
      allowUnsavedNavigationRef.current = false;
      pendingActionRef.current = null;
      console.log('[onboarding.guard] Re-armed due to new edits; navigation will be blocked until Update Insights runs.');
    }
    if (!hasUnsavedChanges && prev) {
      lastSavedRef.current = Date.now();
    }
    prevHasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges, blockNavigation]);

  useEffect(() => {
    if (!blockNavigation) return;
    if (!hasUnsavedChanges && allowUnsavedNavigation) {
      setAllowUnsavedNavigation(false);
      allowUnsavedNavigationRef.current = false;
      pendingActionRef.current = null;
    }
  }, [hasUnsavedChanges, allowUnsavedNavigation, blockNavigation]);

  const acknowledgeUnsavedChanges = useCallback(() => {
    if (!blockNavigation) return;
    allowUnsavedNavigationRef.current = true;
    setAllowUnsavedNavigation(true);
    lastSavedRef.current = Date.now();
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (pending) {
      pending();
    }
  }, []);

  const requestNavigation = useCallback(
    (action: () => void, triggerPopup: () => void) => {
      if (!blockNavigation) {
        action();
        return;
      }
      if (hasUnsavedChanges && !allowUnsavedNavigation) {
        pendingActionRef.current = action;
        triggerPopup();
        console.log('[onboarding.guard] Blocking navigation and showing Update Insights prompt because unsaved changes are present.');
        return;
      }
      action();
    },
    [hasUnsavedChanges, allowUnsavedNavigation, blockNavigation],
  );

  const beforeUnloadHandler = useCallback((e: BeforeUnloadEvent) => {
    if (!blockNavigation) return undefined;
    if (hasUnsavedChangesRef.current && !allowUnsavedNavigationRef.current) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Please update your insights before leaving.';
      return e.returnValue;
    }
    return undefined;
  }, [blockNavigation]);

  return {
    shouldBlockNavigation: blockNavigation && hasUnsavedChanges && !allowUnsavedNavigation,
    allowUnsavedNavigation,
    acknowledgeUnsavedChanges,
    requestNavigation,
    beforeUnloadHandler,
  };
}

// Navigation Button Components
function RefreshButton() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <button
      onClick={handleRefresh}
      className="bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all"
      title="Refresh page"
    >
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}

function LogoutButton() {
  const { data: session } = useSession();
  
  const handleLogout = () => {
    signOut({ callbackUrl: '/auth/signin' });
  };

  if (!session) return null;

  return (
    <button
      onClick={handleLogout}
      className="bg-white border border-gray-300 rounded-full p-2 shadow-lg hover:shadow-xl transition-all"
      title={`Logout (${session.user?.email})`}
    >
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}

function OnboardingNav() {
  return (
    <div className="fixed top-4 right-4 z-50 flex space-x-2">
      <LogoutButton />
      <RefreshButton />
    </div>
  );
}

function GenderStep({ onNext, initial, initialAgreed, onPartialSave }: { onNext: (data: any) => void, initial?: string, initialAgreed?: boolean, onPartialSave?: (data: any) => void }) {
  const [gender, setGender] = useState('');
  const [agreed, setAgreed] = useState(false);
  
  // Properly initialize gender when initial prop changes
  useEffect(() => {
    if (initial) {
      setGender(initial);
    }
  }, [initial]);
  
  // Initialize Terms & Conditions from DB (with localStorage fallback for legacy users)
  useEffect(() => {
    if (initialAgreed === true) {
      setAgreed(true);
      try { localStorage.setItem('helfi-terms-agreed', 'true'); } catch {}
      return;
    }
    try {
      const savedAgreement = localStorage.getItem('helfi-terms-agreed');
      if (savedAgreement === 'true') {
        setAgreed(true);
      }
    } catch {}
  }, [initialAgreed]);
  
  // Save Terms & Conditions agreement to localStorage when changed
  const handleAgreedChange = (checked: boolean) => {
    setAgreed(checked);
    localStorage.setItem('helfi-terms-agreed', checked.toString());
    // Only save when the user actually changes something.
    onPartialSave?.({ termsAccepted: checked });
  };
  
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Let's get started. What's your gender?</h2>
        <p className="mb-6 text-gray-600">This helps tailor your health guidance.</p>
        
        <div className="flex gap-4 mb-6">
          <button
            className={`flex-1 p-4 rounded border ${gender === 'male' ? 'bg-green-600 text-white' : 'border-green-600 text-green-600 hover:bg-green-50'}`}
            onClick={() => {
              setGender('male');
              // Only save when the user actually changes something.
              onPartialSave?.({ gender: 'male' });
            }}
          >
            Male
          </button>
          <button
            className={`flex-1 p-4 rounded border ${gender === 'female' ? 'bg-green-600 text-white' : 'border-green-600 text-green-600 hover:bg-green-50'}`}
            onClick={() => {
              setGender('female');
              // Only save when the user actually changes something.
              onPartialSave?.({ gender: 'female' });
            }}
          >
            Female
          </button>
        </div>
        <div className="flex items-center mb-6">
          <input
            type="checkbox"
            id="agree-terms"
            checked={agreed}
            onChange={e => handleAgreedChange(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="agree-terms" className="text-sm text-gray-700">
            I agree to the <a href="/terms" target="_blank" className="text-helfi-green underline">Terms and Conditions</a> and <a href="/privacy" target="_blank" className="text-helfi-green underline">Privacy Policy</a>
          </label>
        </div>
        <div className="flex justify-between pt-4">
          <button 
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => onNext({ gender: gender || 'not specified', termsAccepted: agreed })}
          >
            Skip
          </button>
          <button
            className={`px-6 py-3 rounded-lg transition-colors ${
              agreed 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!agreed}
            onClick={() => agreed && onNext({ gender: gender || 'not specified', termsAccepted: agreed })}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

const PhysicalStep = memo(function PhysicalStep({
  onNext,
  onBack,
  initial,
  onPartialSave,
  onUnsavedChange,
  onInsightsSaved,
  serverHydrationKey,
}: {
  onNext: (data: any) => void
  onBack: () => void
  initial?: any
  onPartialSave?: (data: any) => void
  onUnsavedChange?: () => void
  onInsightsSaved?: () => void
  serverHydrationKey?: number
}) {
  const initialSnapshotRef = useRef<any>(null);
  const [weight, setWeight] = useState(initial?.weight || '');
  const [birthdate, setBirthdate] = useState(initial?.birthdate || '');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthDayOpen, setBirthDayOpen] = useState(false);
  const [birthMonthOpen, setBirthMonthOpen] = useState(false);
  const [birthYearOpen, setBirthYearOpen] = useState(false);
  const birthDayRef = useRef<HTMLDivElement | null>(null);
  const birthMonthRef = useRef<HTMLDivElement | null>(null);
  const birthYearRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(initial?.height || '');
  const [feet, setFeet] = useState(initial?.feet || '');
  const [inches, setInches] = useState(initial?.inches || '');
  const [bodyType, setBodyType] = useState(initial?.bodyType || '');
  const [goalChoice, setGoalChoice] = useState(initial?.goalChoice || '');
  const [goalIntensity, setGoalIntensity] = useState<'mild' | 'standard' | 'aggressive'>(
    (initial?.goalIntensity as any) || 'standard',
  );
  const goalChoiceTouchedRef = useRef(false);
  const goalIntensityTouchedRef = useRef(false);
  const birthdateTouchedRef = useRef(false);
  const goalChoiceHydratedRef = useRef(false);
  const goalIntensityHydratedRef = useRef(false);
  const lastSyncVersionRef = useRef<number>(0);
  const serverHydratedRef = useRef<number>(0);
  const [showGoalDetails, setShowGoalDetails] = useState(false);
  const [goalTargetWeightUnit, setGoalTargetWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [goalTargetWeightInput, setGoalTargetWeightInput] = useState('');
  const [goalPaceKgPerWeek, setGoalPaceKgPerWeek] = useState<number | null>(null);
  const [goalCalorieTarget, setGoalCalorieTarget] = useState<number | null>(null);
  const [goalFiberTarget, setGoalFiberTarget] = useState<number | null>(null);
  const [goalSugarMax, setGoalSugarMax] = useState<number | null>(null);
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies || []);
  const [allergyInput, setAllergyInput] = useState('');
  const [diabetesType, setDiabetesType] = useState<'type1' | 'type2' | 'prediabetes' | ''>(
    (initial?.diabetesType as any) || '',
  );
  const [dietTypes, setDietTypes] = useState<string[]>(normalizeDietTypes((initial as any)?.dietTypes ?? (initial as any)?.dietType));
  const [showDietPicker, setShowDietPicker] = useState(false);
  const [dietPickerView, setDietPickerView] = useState<'categories' | 'detail'>('categories');
  const [dietSearch, setDietSearch] = useState('');
  const [activeDietCategoryId, setActiveDietCategoryId] = useState<string>(DIET_CATEGORIES[0]?.id || 'plant-based');
  const [showDietSavedNotice, setShowDietSavedNotice] = useState(false);
  const dietSavedNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAutoSaveSnapshotRef = useRef('');
  const dietHydratedRef = useRef(false);
  const dietTouchedRef = useRef(false);
  const [healthCheckSettings, setHealthCheckSettings] = useState(() =>
    normalizeHealthCheckSettings((initial as any)?.healthCheckSettings),
  );
  const healthCheckHydratedRef = useRef(false);
  const healthCheckTouchedRef = useRef(false);
  const goalDetailsHydratedRef = useRef(false);
  const goalDetailsTouchedRef = useRef(false);
  const allergiesHydratedRef = useRef(false);
  const diabetesHydratedRef = useRef(false);
  const bodyTypeHydratedRef = useRef(false);
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [showValidationError, setShowValidationError] = useState(false);
  const { shouldBlockNavigation, allowUnsavedNavigation, acknowledgeUnsavedChanges, requestNavigation, beforeUnloadHandler } = useUnsavedNavigationAllowance(hasUnsavedChanges);
  const { updateUserData } = useUserData();
  const pendingExternalNavigationRef = useRef<(() => void) | null>(null);
  const router = useRouter();

  const parseNumber = (value: string): number | null => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const poundsToKg = (lbs: number) => lbs / 2.20462;
  const kgToLb = (kg: number) => kg * 2.20462;
  const feetInchesToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;
  const roundToPrecision = (value: number, precision: number) => {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  };
  const roundToStep = (value: number, step: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.round(value / step) * step;
  };
  const floorToStep = (value: number, step: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.floor(value / step) * step;
  };
  const ceilToStep = (value: number, step: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.ceil(value / step) * step;
  };
  const normalizeMacroSplit = (proteinPct: number, carbPct: number, fatPct: number) => {
    const total = proteinPct + carbPct + fatPct;
    if (!Number.isFinite(total) || total <= 0) {
      return { proteinPct: 0.3, carbPct: 0.4, fatPct: 0.3 };
    }
    return {
      proteinPct: proteinPct / total,
      carbPct: carbPct / total,
      fatPct: fatPct / total,
    };
  };
  const macroGramsFromSplit = (calories: number, split: { proteinPct: number; carbPct: number; fatPct: number }) => {
    const safeCalories = Number.isFinite(calories) && calories > 0 ? calories : 0;
    return {
      protein: Math.max(0, Math.round((safeCalories * split.proteinPct) / 4)),
      carbs: Math.max(0, Math.round((safeCalories * split.carbPct) / 4)),
      fat: Math.max(0, Math.round((safeCalories * split.fatPct) / 9)),
    };
  };
  const macroSplitFromGrams = (protein: number, carbs: number, fat: number) => {
    const proteinCals = Math.max(0, protein) * 4;
    const carbCals = Math.max(0, carbs) * 4;
    const fatCals = Math.max(0, fat) * 9;
    const total = proteinCals + carbCals + fatCals;
    if (!Number.isFinite(total) || total <= 0) {
      return { proteinPct: 0.3, carbPct: 0.4, fatPct: 0.3 };
    }
    return normalizeMacroSplit(proteinCals / total, carbCals / total, fatCals / total);
  };

  const getCurrentWeightKgRounded = () => {
    const w = parseNumber(weight);
    if (w == null) return null;
    const kg = unit === 'metric' ? w : poundsToKg(w);
    return Number.isFinite(kg) ? Math.round(kg) : null;
  };

  const getCurrentHeightCmRounded = () => {
    if (unit === 'metric') {
      const h = parseNumber(height);
      return h != null && Number.isFinite(h) ? Math.round(h) : null;
    }
    const ft = parseNumber(feet) ?? 0;
    const inch = parseNumber(inches) ?? 0;
    const totalInches = ft * 12 + inch;
    if (!(totalInches > 0)) {
      const fallbackCm = parseNumber(height);
      return fallbackCm != null && Number.isFinite(fallbackCm) ? Math.round(fallbackCm) : null;
    }
    const cm = feetInchesToCm(ft, inch);
    return Number.isFinite(cm) ? Math.round(cm) : null;
  };

  const getTargetWeightKg = () => {
    const value = parseNumber(goalTargetWeightInput);
    if (value == null) return null;
    const kg = goalTargetWeightUnit === 'lb' ? poundsToKg(value) : value;
    return Number.isFinite(kg) ? roundToPrecision(kg, 1) : null;
  };

  const weightNumber = parseNumber(weight);
  const heightNumber = parseNumber(height);
  const feetNumber = parseNumber(feet);
  const inchesNumber = parseNumber(inches);
  const hasValidWeight = weightNumber != null && weightNumber > 0;
  const hasValidHeight =
    unit === 'metric'
      ? heightNumber != null && heightNumber > 0
      : ((feetNumber != null && feetNumber > 0) || (inchesNumber != null && inchesNumber > 0));
  const hasBirthdate = !!(birthYear && birthMonth && birthDay) || !!(birthdate || initial?.birthdate);
  const hasGoalChoice = !!goalChoice;
  const isLoseGoal = goalChoice === 'lose weight';
  const isGainGoal = goalChoice === 'gain weight';
  const isLoseGainGoal = isLoseGoal || isGainGoal;
  const requiresGoalIntensity = goalChoice === 'tone up' || goalChoice === 'get shredded';
  const hasGoalIntensity = !requiresGoalIntensity || !!goalIntensity;
  const hasBodyType = !!bodyType;
  const genderValue = (initial?.gender || '').toString().toLowerCase();
  const hasGender = genderValue === 'male' || genderValue === 'female';
  const isStepComplete =
    hasValidWeight &&
    hasValidHeight &&
    hasBirthdate &&
    hasGoalChoice &&
    hasGoalIntensity &&
    hasBodyType &&
    hasGender;

  // Keep local state in sync when initial data loads or changes,
  // but avoid overwriting any values the user has already edited on this step.
  useEffect(() => {
    if (!initial) return;
    const incomingVersion = Number((initial as any)?.healthSetupUpdatedAt || 0);
    if (Number.isFinite(incomingVersion) && incomingVersion > lastSyncVersionRef.current) {
      lastSyncVersionRef.current = incomingVersion;
    }
    let forceHydrate = false;
    if (typeof serverHydrationKey === 'number' && serverHydrationKey > serverHydratedRef.current) {
      serverHydratedRef.current = serverHydrationKey;
      forceHydrate = true;
    }
    if (!initialSnapshotRef.current && Object.keys(initial || {}).length > 0) {
      initialSnapshotRef.current = initial;
    }
    if (forceHydrate && !hasUnsavedChanges) {
      initialSnapshotRef.current = initial;
    }

    const initialBirthdate = typeof initial.birthdate === 'string' ? initial.birthdate.trim() : '';
    const localBirthdate =
      birthYear && birthMonth && birthDay
        ? `${birthYear}-${birthMonth}-${birthDay}`.trim()
        : (birthdate || '').trim();
    if (birthdateTouchedRef.current && initialBirthdate && localBirthdate && initialBirthdate === localBirthdate) {
      birthdateTouchedRef.current = false;
    }
    const allowBirthdateHydration = !birthdateTouchedRef.current;
    if (allowBirthdateHydration && (forceHydrate || !birthdate) && initialBirthdate.length >= 8) {
      setBirthdate(initial.birthdate);
    }

    if ((forceHydrate || !weight) && initial.weight) {
      setWeight(initial.weight);
    }
    if ((forceHydrate || !height) && initial.height) {
      setHeight(initial.height);
    }
    if ((forceHydrate || !feet) && initial.feet) {
      setFeet(initial.feet);
    }
    if ((forceHydrate || !inches) && initial.inches) {
      setInches(initial.inches);
    }
    // Body type is optional and user-toggleable; only hydrate it once from initial.
    if (forceHydrate || !bodyTypeHydratedRef.current) {
      if ((forceHydrate || !bodyType) && initial.bodyType) {
        setBodyType(initial.bodyType);
      }
      bodyTypeHydratedRef.current = true;
    }
    if (
      typeof initial.goalChoice === 'string' &&
      initial.goalChoice.trim().length > 0 &&
      (!goalChoiceTouchedRef.current || forceHydrate) &&
      (!goalChoiceHydratedRef.current || forceHydrate) &&
      initial.goalChoice !== goalChoice
    ) {
      setGoalChoice(initial.goalChoice);
    }
    if (
      (!goalChoiceHydratedRef.current || forceHydrate) &&
      typeof initial.goalChoice === 'string' &&
      initial.goalChoice.trim().length > 0
    ) {
      goalChoiceHydratedRef.current = true;
    }
    if ((forceHydrate || !allergiesHydratedRef.current) && Array.isArray(initial.allergies)) {
      setAllergies(initial.allergies);
      allergiesHydratedRef.current = true;
    }
    if (forceHydrate || !dietHydratedRef.current) {
      dietHydratedRef.current = true;
      if (!dietTouchedRef.current || forceHydrate) {
        const incomingDietTypes = normalizeDietTypes((initial as any)?.dietTypes ?? (initial as any)?.dietType)
        if (incomingDietTypes.length && dietTypes.length === 0) {
          setDietTypes(incomingDietTypes)
        }
      }
    }
    if (forceHydrate || !healthCheckHydratedRef.current) {
      healthCheckHydratedRef.current = true;
      if (!healthCheckTouchedRef.current || forceHydrate) {
        setHealthCheckSettings(normalizeHealthCheckSettings((initial as any)?.healthCheckSettings));
      }
    }
    if ((forceHydrate || !diabetesHydratedRef.current) && initial.diabetesType) {
      setDiabetesType(initial.diabetesType);
      diabetesHydratedRef.current = true;
    }
    if (
      initial.goalIntensity &&
      !goalIntensityTouchedRef.current &&
      (!goalIntensityHydratedRef.current || forceHydrate) &&
      initial.goalIntensity !== goalIntensity
    ) {
      setGoalIntensity(initial.goalIntensity);
    }
    if (
      (!goalIntensityHydratedRef.current || forceHydrate) &&
      typeof initial.goalIntensity === 'string' &&
      initial.goalIntensity.trim().length > 0
    ) {
      goalIntensityHydratedRef.current = true;
    }

    if (forceHydrate || !goalDetailsHydratedRef.current) {
      const rawGoalUnit =
        typeof (initial as any).goalTargetWeightUnit === 'string'
          ? (initial as any).goalTargetWeightUnit.toLowerCase()
          : '';
      const nextGoalUnit =
        rawGoalUnit === 'lb'
          ? 'lb'
          : rawGoalUnit === 'kg'
          ? 'kg'
          : unit === 'imperial'
          ? 'lb'
          : 'kg';
      setGoalTargetWeightUnit(nextGoalUnit);

      const targetWeightKgRaw = parseNumber(String((initial as any).goalTargetWeightKg ?? ''));
      if (targetWeightKgRaw != null) {
        const displayWeight = nextGoalUnit === 'lb' ? kgToLb(targetWeightKgRaw) : targetWeightKgRaw;
        setGoalTargetWeightInput(String(roundToPrecision(displayWeight, 1)));
      }

      const incomingPace = parseNumber(String((initial as any).goalPaceKgPerWeek ?? ''));
      if (incomingPace != null) {
        setGoalPaceKgPerWeek(incomingPace);
      }

      const incomingCalories = parseNumber(String((initial as any).goalCalorieTarget ?? ''));
      if (incomingCalories != null) {
        setGoalCalorieTarget(Math.round(incomingCalories));
      }

      const incomingSplit = (initial as any).goalMacroSplit;
      const hasIncomingSplit =
        incomingSplit &&
        typeof incomingSplit === 'object' &&
        ((parseNumber(String(incomingSplit.proteinPct ?? '')) ?? 0) ||
          (parseNumber(String(incomingSplit.carbPct ?? '')) ?? 0) ||
          (parseNumber(String(incomingSplit.fatPct ?? '')) ?? 0));

      const incomingFiber = parseNumber(String((initial as any).goalFiberTarget ?? ''));
      if (incomingFiber != null) {
        setGoalFiberTarget(Math.round(incomingFiber));
      }

      const incomingSugar = parseNumber(String((initial as any).goalSugarMax ?? ''));
      if (incomingSugar != null) {
        setGoalSugarMax(Math.round(incomingSugar));
      }

      const hasExistingGoalDetails =
        targetWeightKgRaw != null ||
        incomingPace != null ||
        incomingCalories != null ||
        hasIncomingSplit ||
        incomingFiber != null ||
        incomingSugar != null;
      if (hasExistingGoalDetails) {
        goalDetailsTouchedRef.current = true;
      }

      goalDetailsHydratedRef.current = true;
    }

    if (
      allowBirthdateHydration &&
      (forceHydrate || (!birthYear && !birthMonth && !birthDay)) &&
      typeof initial.birthdate === 'string'
    ) {
      const [y, m, d] = initial.birthdate.split('-');
      if (y && m && d) {
        setBirthYear(y);
        setBirthMonth(m);
        setBirthDay(d);
      }
    }
  }, [initial, weight, height, feet, inches, bodyType, birthYear, birthMonth, birthDay]);

  const today = new Date();
  const currentYear = today.getFullYear();
  const minYear = currentYear - 110; // sensible lower bound for age

  const daysInMonth = React.useMemo(() => {
    if (!birthYear || !birthMonth) {
      return 31;
    }
    const y = parseInt(birthYear, 10);
    const m = parseInt(birthMonth, 10);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return 31;
    return new Date(y, m, 0).getDate();
  }, [birthYear, birthMonth]);

  // Clamp day if month/year change to a month with fewer days
  useEffect(() => {
    if (!birthDay) return;
    const max = daysInMonth;
    const d = parseInt(birthDay, 10);
    if (Number.isFinite(d) && d > max) {
      setBirthDay(String(max).padStart(2, '0'));
    }
  }, [daysInMonth, birthDay]);

  // Keep canonical birthdate string in sync with dropdowns and block future dates
  useEffect(() => {
    if (birthYear && birthMonth && birthDay) {
      const y = parseInt(birthYear, 10);
      const m = parseInt(birthMonth, 10);
      const d = parseInt(birthDay, 10);

      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
        return;
      }

      const candidate = new Date(y, m - 1, d);
      const now = new Date();

      if (candidate > now) {
        // Don’t allow future birthdates – keep current value until user picks a valid date
        return;
      }

      const yyyy = String(y).padStart(4, '0');
      const mm = String(m).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      setBirthdate(`${yyyy}-${mm}-${dd}`);
    } else {
      setBirthdate('');
    }
  }, [birthYear, birthMonth, birthDay]);

  // Track when basic profile values differ from what we initially loaded
  useEffect(() => {
    const baseline = initialSnapshotRef.current || initial || {};
    const initialWeightKg =
      baseline?.weight === null || baseline?.weight === undefined || baseline?.weight === ''
        ? null
        : parseNumber(String(baseline.weight));
    const initialHeightCm =
      baseline?.height === null || baseline?.height === undefined || baseline?.height === ''
        ? null
        : parseNumber(String(baseline.height));
    const initialBodyType = (baseline?.bodyType || '').toString();
    const initialGoalChoice = (baseline?.goalChoice || '').toString();
    const initialGoalIntensity = ((baseline?.goalIntensity || 'standard') as any).toString().toLowerCase();
    const initialBirthdate = (baseline?.birthdate || '').toString();
    const initialAllergies: string[] = Array.isArray(baseline?.allergies) ? baseline.allergies : [];
    const initialDiabetesType = (baseline?.diabetesType || '').toString();
    const initialDietTypes = normalizeDietTypes((baseline as any)?.dietTypes ?? (baseline as any)?.dietType).sort();
    const initialHealthCheckSettings = normalizeHealthCheckSettings((baseline as any)?.healthCheckSettings);

    const normalizeArray = (list?: string[]) =>
      Array.isArray(list) ? list.map((v) => (v || '').toString().toLowerCase().trim()).filter(Boolean).sort() : [];

    const allergiesChanged =
      JSON.stringify(normalizeArray(allergies)) !== JSON.stringify(normalizeArray(initialAllergies));
    const dietChanged =
      (dietHydratedRef.current || dietTouchedRef.current) &&
      JSON.stringify(normalizeDietTypes(dietTypes).sort()) !== JSON.stringify(initialDietTypes);
    const healthCheckChanged =
      healthCheckSettings.enabled !== initialHealthCheckSettings.enabled;

    const currentWeightKg = getCurrentWeightKgRounded();
    const currentHeightCm = getCurrentHeightCmRounded();
    const baselineWeightKg = initialWeightKg != null && Number.isFinite(initialWeightKg) ? Math.round(initialWeightKg) : null;
    const baselineHeightCm = initialHeightCm != null && Number.isFinite(initialHeightCm) ? Math.round(initialHeightCm) : null;
    const weightChanged =
      (currentWeightKg == null && baselineWeightKg != null) ||
      (currentWeightKg != null && baselineWeightKg == null) ||
      (currentWeightKg != null && baselineWeightKg != null && currentWeightKg !== baselineWeightKg);
    const heightChanged =
      (currentHeightCm == null && baselineHeightCm != null) ||
      (currentHeightCm != null && baselineHeightCm == null) ||
      (currentHeightCm != null && baselineHeightCm != null && currentHeightCm !== baselineHeightCm);

    const changed =
      weightChanged ||
      heightChanged ||
      (bodyType || '').toString().toLowerCase().trim() !== (initialBodyType || '').toString().toLowerCase().trim() ||
      dietChanged ||
      (goalChoice || '').toString().toLowerCase().trim() !== (initialGoalChoice || '').toString().toLowerCase().trim() ||
      (goalIntensity || 'standard').toString().toLowerCase() !== (initialGoalIntensity || 'standard').toString().toLowerCase() ||
      (birthdate || '').toString().trim() !== (initialBirthdate || '').toString().trim() ||
      allergiesChanged ||
      (diabetesType || '').toString().toLowerCase().trim() !== (initialDiabetesType || '').toString().toLowerCase().trim() ||
      healthCheckChanged;

    const hasAny =
      !!(weight || height || feet || inches || bodyType || dietTypes.length || goalChoice || birthdate || allergies.length || diabetesType);

    setHasUnsavedChanges(changed && hasAny);
    if ((changed && hasAny) && onUnsavedChange) {
      onUnsavedChange();
    }
  }, [weight, height, feet, inches, bodyType, dietTypes, goalChoice, goalIntensity, birthdate, allergies, diabetesType, healthCheckSettings, initial, unit, serverHydrationKey]);

  const triggerDietSavedNotice = useCallback(() => {
    setShowDietSavedNotice(true);
    if (dietSavedNoticeTimeoutRef.current) {
      clearTimeout(dietSavedNoticeTimeoutRef.current);
    }
    dietSavedNoticeTimeoutRef.current = setTimeout(() => {
      setShowDietSavedNotice(false);
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (dietSavedNoticeTimeoutRef.current) {
        clearTimeout(dietSavedNoticeTimeoutRef.current);
        dietSavedNoticeTimeoutRef.current = null;
      }
    };
  }, []);

  // Warn if the user tries to close the tab or browser with unsaved changes
  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [beforeUnloadHandler]);

  useEffect(() => {
    if (showValidationError && isStepComplete) {
      setShowValidationError(false);
    }
  }, [showValidationError, isStepComplete]);

  // Expose unsaved state globally so the header "Go To Dashboard" link can respect it
  useEffect(() => {
    try {
      (window as any).__helfiOnboardingPhysicalHasUnsavedChanges = hasUnsavedChanges;
    } catch {
      // ignore
    }
    return () => {
      try {
        (window as any).__helfiOnboardingPhysicalHasUnsavedChanges = false;
      } catch {
        // ignore
      }
    };
  }, [hasUnsavedChanges]);

  // Listen for global requests to open the Update Insights popup (e.g. from the header)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event?.data?.type === 'OPEN_PHYSICAL_UPDATE_POPUP') {
        if (event?.data?.navigateTo === 'dashboard') {
          pendingExternalNavigationRef.current = () => {
            try {
              router.push('/dashboard');
            } catch {
              // Fallback to hard navigation if router isn't available for any reason
              window.location.assign('/dashboard');
            }
          };
        }
        setShowUpdatePopup(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [router]);

  const birthdateFromParts = React.useMemo(
    () =>
      birthYear && birthMonth && birthDay ? `${birthYear}-${birthMonth}-${birthDay}` : birthdate,
    [birthYear, birthMonth, birthDay, birthdate],
  );

  const KCAL_PER_KG_WEEK = 7700 / 7;
  const MIN_GOAL_PACE = 0.1;
  const MAX_GOAL_PACE = 0.9;
  const DEFAULT_GOAL_PACE = 0.3;
  const CALORIE_MIN = 1200;
  const CALORIE_MAX = 4000;
  const GOAL_PACE_STEP = 0.1;
  const CALORIE_STEP = 25;
  const MACRO_STEP = 5;
  const SLIDER_HAPTIC_MS = 40;
  const MACRO_COLORS = {
    protein: '#ef4444',
    carbs: '#22c55e',
    fat: '#6366f1',
    fiber: '#12adc9',
    sugar: '#f97316',
  };

  const clampNumber = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const sliderHapticRef = useRef<Record<string, number | null>>({});
  const triggerSliderHaptic = (key: string, value: number | null) => {
    if (value == null || !Number.isFinite(value)) return;
    const normalized = Number(value.toFixed(3));
    if (sliderHapticRef.current[key] === normalized) return;
    sliderHapticRef.current[key] = normalized;
    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches;
      const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null;
      const enabled = pref === null ? true : pref === 'true';
      if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(SLIDER_HAPTIC_MS);
      }
    } catch {}
  };

  const goalDetailDefaults = useMemo(() => {
    const weightKg = getCurrentWeightKgRounded();
    const heightCm = getCurrentHeightCmRounded();
    const gender = genderValue;
    const birthdateValue = birthdateFromParts || initial?.birthdate || '';
    const goalsArray = Array.isArray((initial as any)?.goals) ? (initial as any).goals : [];
    const fallbackCalories = 2000;
    const fallbackSeedSplit = normalizeMacroSplit(0.3, 0.4, 0.3);
    const fallbackSeedMacros = macroGramsFromSplit(fallbackCalories, fallbackSeedSplit);
    const fallbackProtein = roundToStep(fallbackSeedMacros.protein, MACRO_STEP);
    const fallbackCarbs = roundToStep(fallbackSeedMacros.carbs, MACRO_STEP);
    const fallbackFat = roundToStep(fallbackSeedMacros.fat, MACRO_STEP);
    const fallbackSplit = macroSplitFromGrams(fallbackProtein, fallbackCarbs, fallbackFat);
    if (!weightKg || !heightCm || !birthdateValue || (gender !== 'male' && gender !== 'female')) {
      return {
        calories: fallbackCalories,
        protein: fallbackProtein,
        carbs: fallbackCarbs,
        fat: fallbackFat,
        split: fallbackSplit,
        fiber: 28,
        sugarMax: 35,
      };
    }

    const targets = calculateDailyTargets({
      gender,
      birthdate: birthdateValue,
      weightKg,
      heightCm,
      exerciseFrequency: (initial as any)?.exerciseFrequency,
      exerciseDurations: (initial as any)?.exerciseDurations,
      dietTypes: Array.isArray(dietTypes) ? dietTypes : [],
      goals: goalsArray,
      goalChoice,
      goalIntensity,
      bodyType,
      healthSituations: (initial as any)?.healthSituations,
      diabetesType: diabetesType || null,
    });

    const calories = typeof targets.calories === 'number' ? targets.calories : fallbackCalories;
    const fallbackProteinFromTargets = roundToStep(
      typeof targets.protein === 'number' ? targets.protein : Math.round((calories * 0.3) / 4),
      MACRO_STEP,
    );
    const fallbackCarbsFromTargets = roundToStep(
      typeof targets.carbs === 'number' ? targets.carbs : Math.round((calories * 0.4) / 4),
      MACRO_STEP,
    );
    const fallbackFatFromTargets = roundToStep(
      typeof targets.fat === 'number' ? targets.fat : Math.round((calories * 0.3) / 9),
      MACRO_STEP,
    );
    const proteinPerKg = isGainGoal ? 1.8 : 1.6;
    const fatPerKg = isGainGoal ? 0.8 : 0.7;
    const weightBasedProtein = Number.isFinite(weightKg)
      ? roundToStep(Math.round(weightKg * proteinPerKg), MACRO_STEP)
      : null;
    const weightBasedFat = Number.isFinite(weightKg)
      ? roundToStep(Math.round(weightKg * fatPerKg), MACRO_STEP)
      : null;
    let protein = weightBasedProtein ?? fallbackProteinFromTargets;
    let fat = weightBasedFat ?? fallbackFatFromTargets;
    let carbs = roundToStep(Math.round((calories - protein * 4 - fat * 9) / 4), MACRO_STEP);
    if (!Number.isFinite(carbs) || carbs < 0) {
      protein = fallbackProteinFromTargets;
      fat = fallbackFatFromTargets;
      carbs = fallbackCarbsFromTargets;
    }
    const split = macroSplitFromGrams(protein, carbs, fat);
    const fiber = typeof targets.fiber === 'number' ? targets.fiber : 28;
    const sugarMax = typeof targets.sugarMax === 'number' ? targets.sugarMax : 35;

    return { calories, protein, carbs, fat, split, fiber, sugarMax };
  }, [
    birthdateFromParts,
    bodyType,
    dietTypes,
    isGainGoal,
    goalChoice,
    goalIntensity,
    genderValue,
    initial,
    diabetesType,
    weight,
    height,
    feet,
    inches,
    unit,
  ]);

  const computeAutoMacros = useCallback(
    (calories: number) => {
      const safeCalories = Number.isFinite(calories) && calories > 0 ? calories : 0;
      const fallbackSplit = goalDetailDefaults.split ?? normalizeMacroSplit(0.3, 0.4, 0.3);
      const fallbackCalories = safeCalories || goalDetailDefaults.calories || 0;
      const fallbackTotals = macroGramsFromSplit(fallbackCalories, fallbackSplit);
      const fallback = {
        protein: Math.max(0, roundToStep(fallbackTotals.protein, MACRO_STEP)),
        carbs: Math.max(0, roundToStep(fallbackTotals.carbs, MACRO_STEP)),
        fat: Math.max(0, roundToStep(fallbackTotals.fat, MACRO_STEP)),
      };

      const weightKg = getCurrentWeightKgRounded();
      if (!safeCalories || !weightKg) return fallback;

      const baseCalories = goalDetailDefaults.calories || safeCalories;
      const calorieRatio = clampNumber(baseCalories > 0 ? safeCalories / baseCalories : 1, 0.7, 1.3);
      const proteinRange = isGainGoal
        ? { min: 1.4, base: 1.8, max: 2.2 }
        : { min: 1.2, base: 1.6, max: 2.0 };
      const fatRange = isGainGoal
        ? { min: 0.6, base: 0.8, max: 1.1 }
        : { min: 0.5, base: 0.7, max: 1.0 };
      const proteinPerKg = clampNumber(proteinRange.base * calorieRatio, proteinRange.min, proteinRange.max);
      const fatPerKg = clampNumber(fatRange.base * calorieRatio, fatRange.min, fatRange.max);
      let protein = roundToStep(Math.round(weightKg * proteinPerKg), MACRO_STEP);
      let fat = roundToStep(Math.round(weightKg * fatPerKg), MACRO_STEP);

      const proteinCap = roundToStep((safeCalories * 0.4) / 4, MACRO_STEP);
      const fatCap = roundToStep((safeCalories * 0.35) / 9, MACRO_STEP);
      if (Number.isFinite(proteinCap)) {
        protein = Math.min(protein, Math.max(0, proteinCap));
      }
      if (Number.isFinite(fatCap)) {
        fat = Math.min(fat, Math.max(0, fatCap));
      }

      let remaining = safeCalories - protein * 4 - fat * 9;
      if (!Number.isFinite(remaining)) remaining = 0;
      if (remaining < 0) {
        if (fat > 0) {
          const reduction = Math.min(fat, roundToStep(Math.ceil(Math.abs(remaining) / 9), MACRO_STEP));
          fat = Math.max(0, fat - reduction);
        }
        remaining = safeCalories - protein * 4 - fat * 9;
        if (remaining < 0 && protein > 0) {
          const reduction = Math.min(protein, roundToStep(Math.ceil(Math.abs(remaining) / 4), MACRO_STEP));
          protein = Math.max(0, protein - reduction);
        }
        remaining = safeCalories - protein * 4 - fat * 9;
      }

      let carbs = Math.max(0, roundToStep(remaining / 4, MACRO_STEP));
      const dietAdjusted = applyDietMacroRules(
        { calories: safeCalories, protein, carbs, fat, sugarMax: null },
        dietTypes,
        weightKg,
      );
      protein = Math.max(0, roundToStep(dietAdjusted.protein ?? protein, MACRO_STEP));
      fat = Math.max(0, roundToStep(dietAdjusted.fat ?? fat, MACRO_STEP));
      carbs = Math.max(0, roundToStep(dietAdjusted.carbs ?? carbs, MACRO_STEP));
      return { protein, carbs, fat };
    },
    [dietTypes, goalDetailDefaults.calories, goalDetailDefaults.split, isGainGoal, weight, unit],
  );

  const maintenanceCalories = useMemo(() => {
    const weightKg = getCurrentWeightKgRounded();
    const heightCm = getCurrentHeightCmRounded();
    const gender = genderValue;
    const birthdateValue = birthdateFromParts || initial?.birthdate || '';
    if (!weightKg || !heightCm || !birthdateValue || (gender !== 'male' && gender !== 'female')) {
      return null;
    }
    const targets = calculateDailyTargets({
      gender,
      birthdate: birthdateValue,
      weightKg,
      heightCm,
      exerciseFrequency: (initial as any)?.exerciseFrequency,
      exerciseDurations: (initial as any)?.exerciseDurations,
      goalChoice: 'maintain weight',
      goalIntensity: 'standard',
      bodyType,
    });
    return typeof targets.calories === 'number' ? targets.calories : null;
  }, [birthdateFromParts, bodyType, genderValue, initial, weight, height, feet, inches, unit]);

  const activeGoalCalories = Math.round(goalCalorieTarget ?? goalDetailDefaults.calories);

  const calorieBounds = useMemo(() => {
    const base = maintenanceCalories ?? activeGoalCalories ?? 2000;
    if (isLoseGoal) {
      const minRaw = base - MAX_GOAL_PACE * KCAL_PER_KG_WEEK;
      const maxRaw = base - MIN_GOAL_PACE * KCAL_PER_KG_WEEK;
      const min = clampNumber(ceilToStep(minRaw, CALORIE_STEP), CALORIE_MIN, CALORIE_MAX);
      const max = clampNumber(floorToStep(maxRaw, CALORIE_STEP), CALORIE_MIN, CALORIE_MAX);
      return {
        min,
        max: Math.max(min, max),
        base,
      };
    }
    if (isGainGoal) {
      const minRaw = base + MIN_GOAL_PACE * KCAL_PER_KG_WEEK;
      const maxRaw = base + MAX_GOAL_PACE * KCAL_PER_KG_WEEK;
      const min = clampNumber(ceilToStep(minRaw, CALORIE_STEP), CALORIE_MIN, CALORIE_MAX);
      const max = clampNumber(floorToStep(maxRaw, CALORIE_STEP), CALORIE_MIN, CALORIE_MAX);
      return {
        min,
        max: Math.max(min, max),
        base,
      };
    }
    return { min: CALORIE_MIN, max: CALORIE_MAX, base };
  }, [activeGoalCalories, isGainGoal, isLoseGoal, maintenanceCalories]);

  const derivedGoalPace = useMemo(() => {
    if (!calorieBounds.base) return null;
    const delta = Math.abs(activeGoalCalories - calorieBounds.base);
    return roundToStep(roundToPrecision(delta / KCAL_PER_KG_WEEK, 2), GOAL_PACE_STEP);
  }, [activeGoalCalories, calorieBounds.base]);

  const activeGoalPace = clampNumber(
    roundToStep(goalPaceKgPerWeek ?? derivedGoalPace ?? DEFAULT_GOAL_PACE, GOAL_PACE_STEP),
    MIN_GOAL_PACE,
    MAX_GOAL_PACE,
  );

  const clampedGoalCalories = clampNumber(
    roundToStep(activeGoalCalories, CALORIE_STEP),
    calorieBounds.min,
    calorieBounds.max,
  );
  const macroTotals = useMemo(() => computeAutoMacros(clampedGoalCalories), [clampedGoalCalories, computeAutoMacros]);
  const autoFiberTarget = useMemo(() => {
    const baseCalories = goalDetailDefaults.calories;
    const baseFiber = goalDetailDefaults.fiber ?? 0;
    const ratio = baseCalories > 0 && Number.isFinite(baseFiber) ? baseFiber / baseCalories : 14 / 1000;
    const next = Math.max(0, Math.round(clampedGoalCalories * ratio));
    return Math.min(next, macroTotals.carbs);
  }, [clampedGoalCalories, goalDetailDefaults.calories, goalDetailDefaults.fiber, macroTotals.carbs]);
  const autoSugarMax = useMemo(() => {
    const baseCalories = goalDetailDefaults.calories;
    const baseSugar = goalDetailDefaults.sugarMax ?? 0;
    const ratioFallback = 0.1 / 4;
    const ratio = baseCalories > 0 && Number.isFinite(baseSugar) ? baseSugar / baseCalories : ratioFallback;
    const ratioBased = Math.max(0, Math.round(clampedGoalCalories * ratio));
    const tenPctCap = Math.max(0, Math.round((clampedGoalCalories * 0.1) / 4));
    const next = Math.min(ratioBased, tenPctCap);
    const weightKg = getCurrentWeightKgRounded();
    const adjusted = applyDietMacroRules(
      {
        calories: clampedGoalCalories,
        protein: macroTotals.protein,
        carbs: macroTotals.carbs,
        fat: macroTotals.fat,
        sugarMax: next,
      },
      dietTypes,
      weightKg,
    );
    const dietCapped = typeof adjusted.sugarMax === 'number' ? adjusted.sugarMax : next;
    return Math.min(dietCapped, macroTotals.carbs);
  }, [
    clampedGoalCalories,
    dietTypes,
    goalDetailDefaults.calories,
    goalDetailDefaults.sugarMax,
    macroTotals.carbs,
    macroTotals.fat,
    macroTotals.protein,
    unit,
    weight,
  ]);
  const activeFiberTarget = autoFiberTarget;
  const activeSugarMax = autoSugarMax;
  const clampedFiberTarget = Math.min(activeFiberTarget, macroTotals.carbs);
  const clampedSugarMax = Math.min(activeSugarMax, macroTotals.carbs);

  const displayGoalPace = roundToPrecision(
    goalTargetWeightUnit === 'lb'
      ? roundToStep(activeGoalPace, GOAL_PACE_STEP) * 2.20462
      : roundToStep(activeGoalPace, GOAL_PACE_STEP),
    2,
  );
  const currentWeightKg = getCurrentWeightKgRounded();
  const targetWeightKg = getTargetWeightKg();
  const weightDeltaKg =
    currentWeightKg != null && targetWeightKg != null
      ? Math.abs(targetWeightKg - currentWeightKg)
      : null;
  const estimatedWeeks =
    weightDeltaKg != null && activeGoalPace > 0
      ? roundToPrecision(weightDeltaKg / activeGoalPace, 1)
      : null;

  const dietWarnings = useMemo(() => {
    const warnings: string[] = [];
    const normalizedDiets = normalizeDietTypes(dietTypes);
    if (!normalizedDiets.length) return warnings;

    const carbs = macroTotals.carbs;
    const sugar = Math.min(activeSugarMax, macroTotals.carbs);
    const protein = macroTotals.protein;
    const weightKg = getCurrentWeightKgRounded();

    const rules: Record<
      string,
      { carbsMaxG?: number; sugarMaxG?: number; proteinMinGPerKg?: number }
    > = {
      keto: { carbsMaxG: 30, sugarMaxG: 25 },
      'keto-carnivore': { carbsMaxG: 20, sugarMaxG: 15 },
      'low-carb': { carbsMaxG: 130 },
      atkins: { carbsMaxG: 40, sugarMaxG: 30 },
      'zero-carb': { carbsMaxG: 10, sugarMaxG: 5 },
      carnivore: { carbsMaxG: 10, sugarMaxG: 5 },
      lion: { carbsMaxG: 10, sugarMaxG: 5 },
      diabetic: { carbsMaxG: 160, sugarMaxG: 25 },
      'high-protein': { proteinMinGPerKg: 1.6 },
      bodybuilding: { proteinMinGPerKg: 1.8 },
    };

    normalizedDiets.forEach((dietId) => {
      const rule = rules[dietId];
      if (!rule) return;
      const label = getDietOption(dietId)?.label || dietId;
      if (rule.carbsMaxG != null && carbs > rule.carbsMaxG) {
        warnings.push(`${label} usually keeps carbs under ${rule.carbsMaxG} g.`);
      }
      if (rule.sugarMaxG != null && sugar > rule.sugarMaxG) {
        warnings.push(`${label} usually keeps sugar under ${rule.sugarMaxG} g.`);
      }
      if (rule.proteinMinGPerKg != null && weightKg) {
        const minProtein = Math.round(weightKg * rule.proteinMinGPerKg);
        if (protein < minProtein) {
          warnings.push(`${label} usually targets at least ${minProtein} g of protein per day.`);
        }
      }
    });

    const diabetes = (diabetesType || '').toLowerCase();
    const diabetesRules: Record<string, { carbsMaxG: number; sugarMaxG: number }> = {
      type1: { carbsMaxG: 180, sugarMaxG: 22 },
      type2: { carbsMaxG: 160, sugarMaxG: 20 },
      prediabetes: { carbsMaxG: 170, sugarMaxG: 28 },
    };
    if (diabetesRules[diabetes]) {
      const { carbsMaxG, sugarMaxG } = diabetesRules[diabetes];
      if (carbs > carbsMaxG) {
        warnings.push(`This is higher in carbs than typical for ${diabetes.replace('type', 'Type ')}.`);
      }
      if (sugar > sugarMaxG) {
        warnings.push(`This is higher in sugar than typical for ${diabetes.replace('type', 'Type ')}.`);
      }
    }

    return Array.from(new Set(warnings));
  }, [activeSugarMax, dietTypes, diabetesType, macroTotals, weight, height, feet, inches, unit]);

  const buildPayload = () => {
    const weightKgRounded = getCurrentWeightKgRounded();
    const heightCmRounded = getCurrentHeightCmRounded();
    const includeDietTypes = dietHydratedRef.current || dietTouchedRef.current;
    const includeGoalDetails = goalDetailsTouchedRef.current && isLoseGainGoal;
    const targetWeightKg = getTargetWeightKg();
    const goalSplitPayload = macroSplitFromGrams(macroTotals.protein, macroTotals.carbs, macroTotals.fat);
    const goalCaloriePayload = clampedGoalCalories;
    const goalPacePayload = Number.isFinite(goalPaceKgPerWeek as number)
      ? (goalPaceKgPerWeek as number)
      : activeGoalPace;
    const clampedFiberTarget = Math.min(activeFiberTarget, macroTotals.carbs);
    const clampedSugarMax = Math.min(activeSugarMax, macroTotals.carbs);
    return {
      // Persist canonical measurements so targets/insights stay consistent everywhere
      weight: weightKgRounded != null ? String(weightKgRounded) : '',
      birthdate: birthdateFromParts || birthdate || initial?.birthdate || '',
      height: heightCmRounded != null ? String(heightCmRounded) : '',
      bodyType,
      ...(includeDietTypes ? { dietTypes: Array.from(new Set(dietTypes)).sort() } : {}),
      goalChoice: goalChoice?.trim(),
      goalIntensity: goalIntensity,
      ...(includeGoalDetails
        ? {
            ...(targetWeightKg != null && targetWeightKg > 0
              ? { goalTargetWeightKg: targetWeightKg, goalTargetWeightUnit: goalTargetWeightUnit }
              : {}),
            ...(Number.isFinite(goalPacePayload) ? { goalPaceKgPerWeek: roundToPrecision(goalPacePayload, 2) } : {}),
            ...(Number.isFinite(goalCaloriePayload) ? { goalCalorieTarget: goalCaloriePayload } : {}),
            ...(goalSplitPayload ? { goalMacroSplit: goalSplitPayload } : {}),
            goalMacroMode: 'auto',
            ...(Number.isFinite(clampedFiberTarget) ? { goalFiberTarget: Math.round(clampedFiberTarget) } : {}),
            ...(Number.isFinite(clampedSugarMax) ? { goalSugarMax: Math.round(clampedSugarMax) } : {}),
          }
        : {}),
      allergies,
      diabetesType,
      healthCheckSettings,
    }
  };

  const handleNext = () => {
    onNext(buildPayload());
  };

  const handleUpdateInsights = async () => {
    if (!isStepComplete) {
      setShowValidationError(true);
      return;
    }
    setIsGeneratingInsights(true);
    try {
      const payload = buildPayload();
      // Step 1: Save data immediately - this is the priority
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload(payload)),
      });

      if (response.ok) {
        // Reset the baseline so the dirty-check reflects the newly saved values
        initialSnapshotRef.current = {
          ...(initialSnapshotRef.current || initial || {}),
          ...payload,
        };

        // Data saved successfully - update local state immediately
        setHasUnsavedChanges(false);
        try {
          (window as any).__helfiOnboardingPhysicalHasUnsavedChanges = false;
        } catch {}
        if (onInsightsSaved) onInsightsSaved();
        updateUserData(payload);
        acknowledgeUnsavedChanges(); // flush any pending guarded navigation (Next/Back)
        try {
          window.dispatchEvent(new Event('userData:refresh'));
        } catch {}
        
        // Step 2: Fire regen in background WITHOUT waiting
        // This prevents timeouts from blocking the UI
        fireAndForgetInsightsRegen(['profile']);
        
        // Step 3: Close popup immediately - user sees instant success
        setShowUpdatePopup(false);

        // If the popup was opened by an external navigation (e.g., "Go To Dashboard"), proceed now.
        const external = pendingExternalNavigationRef.current;
        pendingExternalNavigationRef.current = null;
        if (external) {
          external();
        }
      } else {
        alert('Failed to save your changes. Please try again.');
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save your changes. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const triggerPopup = () => {
    if (!showUpdatePopup) {
      setShowUpdatePopup(true);
    }
  };

  const handleNextWithGuard = () => {
    if (!isStepComplete) {
      setShowValidationError(true);
      return;
    }
    // Route through the navigation guard so the Update Insights popup is shown when needed.
    requestNavigation(handleNext, triggerPopup);
  };

  const handleBackWithGuard = () => {
    requestNavigation(onBack, triggerPopup);
  };

  const handleUnitChange = useCallback(
    (newUnit: 'metric' | 'imperial') => {
      if (newUnit === unit) return;

      if (newUnit === 'imperial') {
        // Metric → imperial (kg → lbs, cm → ft/in)
        const kg = parseNumber(weight);
        if (kg != null) {
          const lbs = kg * 2.20462;
          setWeight(String(Math.round(lbs)));
        }

        const cmVal = parseNumber(height);
        if (cmVal != null && cmVal > 0) {
          const totalInches = cmVal / 2.54;
          const wholeFeet = Math.floor(totalInches / 12);
          const remainingInches = Math.round(totalInches - wholeFeet * 12);
          setFeet(wholeFeet > 0 ? String(wholeFeet) : '');
          setInches(remainingInches > 0 ? String(remainingInches) : '');
        }
      } else {
        // Imperial → metric (lbs → kg, ft/in → cm)
        const lbs = parseNumber(weight);
        if (lbs != null) {
          const kg = lbs / 2.20462;
          setWeight(String(Math.round(kg)));
        }

        const ftVal = parseNumber(feet);
        const inchVal = parseNumber(inches);
        const totalInches =
          (ftVal != null ? ftVal * 12 : 0) + (inchVal != null ? inchVal : 0);
        if (totalInches > 0) {
          const cmVal = totalInches * 2.54;
          setHeight(String(Math.round(cmVal)));
        }
      }

      setUnit(newUnit);
    },
    [unit, weight, height, feet, inches],
  );

  const markGoalDetailsTouched = useCallback(() => {
    goalDetailsTouchedRef.current = true;
  }, []);

  const handleGoalChoiceSelect = useCallback(
    (choice: string) => {
      goalChoiceTouchedRef.current = true;
      setGoalChoice(choice);
      const isSimpleGoal =
        choice === 'lose weight' || choice === 'gain weight' || choice === 'maintain weight';
      const nextIntensity = isSimpleGoal ? 'standard' : goalIntensity;
      if (isSimpleGoal) {
        setGoalIntensity('standard');
      }
      if (choice === 'lose weight' || choice === 'gain weight') {
        setShowGoalDetails(true);
      }
      if (onPartialSave) {
        onPartialSave({ goalChoice: choice, goalIntensity: nextIntensity });
      }
      try {
        updateUserData(sanitizeUserDataPayload({ goalChoice: choice, goalIntensity: nextIntensity }));
      } catch {}
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload({ goalChoice: choice, goalIntensity: nextIntensity })),
        keepalive: true,
      }).catch(() => {});
    },
    [goalIntensity, onPartialSave],
  );

  const scrollToTop = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const closeGoalDetails = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#goal-details') {
      window.history.back();
      return;
    }
    setShowGoalDetails(false);
  }, []);

  useEffect(() => {
    if (!showGoalDetails || typeof window === 'undefined') return;
    scrollToTop();
    const current = new URL(window.location.href);
    if (current.hash !== '#goal-details') {
      current.hash = 'goal-details';
      window.history.pushState({ goalDetails: true }, '', current.toString());
    }
    const handlePopState = () => {
      setShowGoalDetails(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showGoalDetails, scrollToTop]);

  useEffect(() => {
    if (!showDietPicker) return;
    scrollToTop();
  }, [scrollToTop, showDietPicker]);

  const handleGoalTargetWeightUnitChange = useCallback(
    (nextUnit: 'kg' | 'lb') => {
      if (nextUnit === goalTargetWeightUnit) return;
      const currentValue = parseNumber(goalTargetWeightInput);
      if (currentValue != null) {
        const converted = nextUnit === 'lb' ? kgToLb(currentValue) : poundsToKg(currentValue);
        setGoalTargetWeightInput(String(roundToPrecision(converted, 1)));
      }
      setGoalTargetWeightUnit(nextUnit);
      markGoalDetailsTouched();
    },
    [goalTargetWeightInput, goalTargetWeightUnit, markGoalDetailsTouched],
  );

  const handleGoalTargetWeightChange = useCallback(
    (value: string) => {
      setGoalTargetWeightInput(value);
      markGoalDetailsTouched();
    },
    [markGoalDetailsTouched],
  );

  const handleGoalPaceChange = useCallback(
    (value: number) => {
      const pace = clampNumber(roundToStep(value, GOAL_PACE_STEP), MIN_GOAL_PACE, MAX_GOAL_PACE);
      const base = calorieBounds.base || activeGoalCalories;
      const delta = pace * KCAL_PER_KG_WEEK;
      const nextCalories = isLoseGoal ? base - delta : base + delta;
      const clampedCalories = clampNumber(
        roundToStep(nextCalories, CALORIE_STEP),
        calorieBounds.min,
        calorieBounds.max,
      );
      const nextPace = clampNumber(
        roundToStep(Math.abs(clampedCalories - base) / KCAL_PER_KG_WEEK, GOAL_PACE_STEP),
        MIN_GOAL_PACE,
        MAX_GOAL_PACE,
      );
      setGoalPaceKgPerWeek(nextPace);
      setGoalCalorieTarget(clampedCalories);
      markGoalDetailsTouched();
      return pace;
    },
    [
      KCAL_PER_KG_WEEK,
      MIN_GOAL_PACE,
      MAX_GOAL_PACE,
      activeGoalCalories,
      calorieBounds,
      isLoseGoal,
      markGoalDetailsTouched,
    ],
  );


  useEffect(() => {
    if (!isLoseGainGoal || goalCalorieTarget == null) return;
    const clamped = clampNumber(
      roundToStep(goalCalorieTarget, CALORIE_STEP),
      calorieBounds.min,
      calorieBounds.max,
    );
    if (clamped !== goalCalorieTarget) {
      setGoalCalorieTarget(clamped);
    }
  }, [
    calorieBounds.max,
    calorieBounds.min,
    goalCalorieTarget,
    isLoseGainGoal,
  ]);

  // Body type is optional: tapping the same option again should deselect (match diabetes toggle UX).
  const handleBodyTypeChange = useCallback((type: string) => {
    setBodyType((current: string) => (current === type ? '' : type));
  }, []);

  const allergyOptions = React.useMemo(
    () => [
      'Peanut',
      'Gluten',
      'Tree nuts',
      'Dairy',
      'Egg',
      'Shellfish',
      'Fish',
      'Wheat',
      'Soy',
      'Sesame',
      'Lactose',
      'Corn',
      'Sulfites',
      'Mustard',
      'Celery',
      'Pollen',
      'Chocolate',
      'Strawberry',
      'Tomato',
    ],
    [],
  );

  const normalizedAllergyValue = (value: string) => value.trim().replace(/\s+/g, ' ');

  const schedulePartialSave = useCallback(
    (payload: any) => {
      if (!onPartialSave) return;
      onPartialSave(payload);
    },
    [onPartialSave],
  );
  const lastBirthdateSavedRef = useRef<string>('');
  const saveBirthdateNow = useCallback(
    (value: string) => {
      if (!value) return;
      if (value === lastBirthdateSavedRef.current) return;
      lastBirthdateSavedRef.current = value;
      schedulePartialSave({ birthdate: value });
      try {
        updateUserData(sanitizeUserDataPayload({ birthdate: value }));
      } catch {}
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload({ birthdate: value })),
        keepalive: true,
      })
        .catch(() => {});
    },
    [schedulePartialSave, updateUserData],
  );

  useEffect(() => {
    if (typeof initial?.birthdate === 'string' && initial.birthdate) {
      lastBirthdateSavedRef.current = initial.birthdate;
    }
  }, [initial?.birthdate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inDay = birthDayRef.current?.contains(target);
      const inMonth = birthMonthRef.current?.contains(target);
      const inYear = birthYearRef.current?.contains(target);
      if (inDay || inMonth || inYear) return;
      setBirthDayOpen(false);
      setBirthMonthOpen(false);
      setBirthYearOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  const closeBirthMenus = useCallback(() => {
    setBirthDayOpen(false);
    setBirthMonthOpen(false);
    setBirthYearOpen(false);
  }, []);

  const monthOptions = React.useMemo(
    () => [
      { value: '01', label: 'Jan' },
      { value: '02', label: 'Feb' },
      { value: '03', label: 'Mar' },
      { value: '04', label: 'Apr' },
      { value: '05', label: 'May' },
      { value: '06', label: 'Jun' },
      { value: '07', label: 'Jul' },
      { value: '08', label: 'Aug' },
      { value: '09', label: 'Sep' },
      { value: '10', label: 'Oct' },
      { value: '11', label: 'Nov' },
      { value: '12', label: 'Dec' },
    ],
    [],
  );

  const buildValidBirthdate = useCallback((year: string, month: string, day: string) => {
    if (!year || !month || !day) return '';
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
    const candidate = new Date(y, m - 1, d);
    const now = new Date();
    if (candidate > now) return '';
    if (candidate.getFullYear() !== y || candidate.getMonth() !== m - 1 || candidate.getDate() !== d) return '';
    const yyyy = String(y).padStart(4, '0');
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  // Keep canonical birthdate string in sync with dropdowns and block future dates
  useEffect(() => {
    const nextBirthdate = buildValidBirthdate(birthYear, birthMonth, birthDay);
    setBirthdate(nextBirthdate);
    if (nextBirthdate) {
      saveBirthdateNow(nextBirthdate);
    }
  }, [birthYear, birthMonth, birthDay, buildValidBirthdate, saveBirthdateNow]);

  const handleAddAllergy = useCallback(
    (value?: string) => {
      const raw = typeof value === 'string' && value.trim().length > 0 ? value : allergyInput;
      const normalized = normalizedAllergyValue(raw || '');
      if (!normalized) return;
      const already = allergies.some((a) => a.toLowerCase() === normalized.toLowerCase());
      if (already) {
        setAllergyInput('');
        return;
      }
      setAllergies((prev) => [...prev, normalized]);
      setAllergyInput('');
    },
    [allergies, allergyInput],
  );

  const handleRemoveAllergy = useCallback((value: string) => {
    const normalized = normalizedAllergyValue(value || '');
    if (!normalized) return;
    setAllergies((prev) => prev.filter((a) => a.toLowerCase().trim() !== normalized.toLowerCase()));
  }, []);

  const filteredAllergySuggestions = React.useMemo(() => {
    const term = allergyInput.toLowerCase().trim();
    const selected = new Set(allergies.map((a) => a.toLowerCase()));
    return allergyOptions
      .filter((opt) => !selected.has(opt.toLowerCase()))
      .filter((opt) => !term || opt.toLowerCase().includes(term))
      .slice(0, 6);
  }, [allergyInput, allergies, allergyOptions]);
  // Persist physical info as the user fills it out so moving between steps keeps data
  useEffect(() => {
    if (!onPartialSave) return;
    if (!hasUnsavedChanges) return;
    const weightKgRounded = getCurrentWeightKgRounded();
    const heightCmRounded = getCurrentHeightCmRounded();
    const includeDietTypes = dietHydratedRef.current || dietTouchedRef.current;
    const includeGoalDetails = goalDetailsTouchedRef.current && isLoseGainGoal;
    const targetWeightKg = getTargetWeightKg();
    const goalSplitPayload = macroSplitFromGrams(macroTotals.protein, macroTotals.carbs, macroTotals.fat);
    const goalCaloriePayload = clampedGoalCalories;
    const goalPacePayload = Number.isFinite(goalPaceKgPerWeek as number)
      ? (goalPaceKgPerWeek as number)
      : activeGoalPace;
    const clampedFiberTarget = Math.min(activeFiberTarget, macroTotals.carbs);
    const clampedSugarMax = Math.min(activeSugarMax, macroTotals.carbs);
    const payload = {
      weight: weightKgRounded != null ? String(weightKgRounded) : '',
      birthdate: birthdateFromParts || '',
      height: heightCmRounded != null ? String(heightCmRounded) : '',
      bodyType,
      goalChoice,
      goalIntensity,
      ...(includeGoalDetails
        ? {
            ...(targetWeightKg != null && targetWeightKg > 0
              ? { goalTargetWeightKg: targetWeightKg, goalTargetWeightUnit: goalTargetWeightUnit }
              : {}),
            ...(Number.isFinite(goalPacePayload) ? { goalPaceKgPerWeek: roundToPrecision(goalPacePayload, 2) } : {}),
            ...(Number.isFinite(goalCaloriePayload) ? { goalCalorieTarget: goalCaloriePayload } : {}),
            ...(goalSplitPayload ? { goalMacroSplit: goalSplitPayload } : {}),
            goalMacroMode: 'auto',
            ...(Number.isFinite(clampedFiberTarget) ? { goalFiberTarget: Math.round(clampedFiberTarget) } : {}),
            ...(Number.isFinite(clampedSugarMax) ? { goalSugarMax: Math.round(clampedSugarMax) } : {}),
          }
        : {}),
      allergies,
      diabetesType,
      healthCheckSettings,
      ...(includeDietTypes ? { dietTypes: Array.from(new Set(dietTypes)).sort() } : {}),
    };
    const snapshot = onboardingGuardSnapshotJson(payload);
    if (snapshot === lastAutoSaveSnapshotRef.current) return;
    lastAutoSaveSnapshotRef.current = snapshot;
    schedulePartialSave(payload);
  }, [
    weight,
    birthdateFromParts,
    height,
    bodyType,
    dietTypes,
    goalChoice,
    goalIntensity,
    isLoseGainGoal,
    goalTargetWeightInput,
    goalTargetWeightUnit,
    goalPaceKgPerWeek,
    goalCalorieTarget,
    goalFiberTarget,
    goalSugarMax,
    clampedGoalCalories,
    activeGoalCalories,
    activeGoalPace,
    macroTotals,
    activeFiberTarget,
    activeSugarMax,
    allergies,
    diabetesType,
    healthCheckSettings,
    hasUnsavedChanges,
    onPartialSave,
    schedulePartialSave,
  ]);

  const bodyTypeDescriptions = {
    ectomorph: "Naturally lean and thin, with difficulty gaining weight and muscle. Fast metabolism.",
    mesomorph: "Naturally muscular and athletic build. Gains muscle easily and maintains weight well.",
    endomorph: "Naturally broader and rounder physique. Gains weight easily, slower metabolism."
  };

  if (showDietPicker) {
    const selectedDietIds = normalizeDietTypes(dietTypes).sort()
    const selectedCount = selectedDietIds.length

    const toggleDiet = (dietId: string) => {
      const id = (dietId || '').toString().trim()
      if (!id) return
      dietTouchedRef.current = true
      setDietTypes((prev) => {
        const next = Array.isArray(prev) ? [...prev] : []
        const idx = next.indexOf(id)
        if (idx >= 0) {
          next.splice(idx, 1)
        } else {
          next.push(id)
        }
        return normalizeDietTypes(next).sort()
      })
    }

    const clearAllDiets = () => {
      dietTouchedRef.current = true
      setDietTypes([])
    }

    const optionIcon = (dietId: string) => {
      const id = (dietId || '').toLowerCase()
      if (id.includes('vegan') || id.includes('vegetarian') || id.includes('wfpb')) return 'eco'
      if (id.includes('carnivore')) return 'restaurant'
      if (id.includes('lion')) return 'pets'
      if (id.includes('keto')) return 'egg'
      if (id.includes('paleo')) return 'forest'
      if (id.includes('primal')) return 'spa'
      if (id.includes('gluten') || id.includes('grain') || id.includes('wheat')) return 'grain'
      if (id.includes('fast') || id.includes('omad') || id.includes('time')) return 'timer'
      if (id.includes('renal') || id.includes('diabetic') || id.includes('gerd') || id.includes('histamine') || id.includes('oxalate') || id.includes('purine'))
        return 'monitor_heart'
      if (id.includes('halal') || id.includes('kosher') || id.includes('jain') || id.includes('buddhist')) return 'public'
      if (id.includes('athlete') || id.includes('bodybuilding') || id.includes('protein') || id.includes('cutting') || id.includes('bulking'))
        return 'fitness_center'
      return 'restaurant'
    }

    const activeCategory =
      DIET_CATEGORIES.find((c) => c.id === activeDietCategoryId) || DIET_CATEGORIES[0]
    const activeGroup = activeCategory?.group || 'Plant-Based'
    const groupOptions = DIET_OPTIONS.filter((d) => d.group === activeGroup)

    const switchToCategory = (categoryId: string) => {
      setActiveDietCategoryId(categoryId)
      setDietPickerView('detail')
    }

    const filteredCategories = (() => {
      const q = (dietSearch || '').toLowerCase().trim()
      if (!q) return DIET_CATEGORIES
      return DIET_CATEGORIES.filter((cat) => {
        const base = `${cat.label} ${cat.subtitle}`.toLowerCase()
        if (base.includes(q)) return true
        const opts = DIET_OPTIONS.filter((o) => o.group === cat.group)
        return opts.some((o) => o.label.toLowerCase().includes(q))
      })
    })()

    if (dietPickerView === 'categories') {
      return (
        <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto overflow-x-hidden pb-6 bg-gray-50">
          <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm px-4 pt-6 pb-2 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setShowDietPicker(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 transition-colors text-gray-900"
                aria-label="Back"
              >
                <MaterialSymbol name="arrow_back" className="text-2xl" />
              </button>
              <div className="text-sm text-gray-500">{selectedCount ? `${selectedCount} selected` : ''}</div>
              <div className="flex size-10 shrink-0 items-center justify-center" />
            </div>
            <h1 className="text-gray-900 text-3xl font-extrabold leading-tight tracking-tight px-1">Explore Diets</h1>
          </div>

          <div className="px-5 py-2 mb-2">
            <label className="relative flex flex-col w-full">
              <div className="flex w-full items-center rounded-xl h-12 bg-white border border-gray-200 focus-within:border-helfi-green focus-within:ring-1 focus-within:ring-helfi-green transition-all shadow-sm">
                <div className="text-helfi-green ml-4 mr-2 flex items-center justify-center">
                  <MaterialSymbol name="search" className="text-xl" />
                </div>
                <input
                  className="flex w-full flex-1 bg-transparent border-none text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 h-full text-base font-medium"
                  placeholder="Search categories (e.g. Keto, Vegan)"
                  type="text"
                  value={dietSearch}
                  onChange={(e) => setDietSearch(e.target.value)}
                />
              </div>
            </label>
          </div>

          <div className="flex flex-col gap-3 px-5 py-2">
            {filteredCategories.map((cat) => {
              const countInGroup = selectedDietIds.filter((id) => getDietOption(id)?.group === cat.group).length
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => switchToCategory(cat.id)}
                  className="group flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm active:scale-[0.98] transition-all hover:border-helfi-green/30"
                >
                  <div className="flex items-center justify-center rounded-lg bg-helfi-green/10 shrink-0 size-12 text-helfi-green group-hover:bg-helfi-green group-hover:text-white transition-colors">
                    <MaterialSymbol name={cat.icon} className="text-[28px]" />
                  </div>
                  <div className="flex flex-col justify-center text-left flex-1 min-w-0">
                    <p className="text-gray-900 text-base font-bold leading-normal truncate">{cat.label}</p>
                    <p className="text-gray-500 text-sm font-medium leading-normal truncate">
                      {cat.subtitle}
                      {countInGroup ? ` • ${countInGroup} selected` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-gray-300 group-hover:text-helfi-green transition-colors">
                    <MaterialSymbol name="chevron_right" className="text-2xl" />
                  </div>
                </button>
              )
            })}
          </div>

          <div className="h-10" />
        </div>
      )
    }

    return (
      <div className="bg-gray-50 min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 bg-gray-50/95 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-md mx-auto w-full flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => setDietPickerView('categories')}
              className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 transition-colors"
              aria-label="Back"
            >
              <MaterialSymbol name="arrow_back" className="text-2xl" />
            </button>
            <h1 className="text-lg font-bold tracking-tight">Select diets</h1>
            <button
              type="button"
              onClick={clearAllDiets}
              className="text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              Clear
            </button>
          </div>
        </header>

        <div className="max-w-md mx-auto w-full px-5 pt-3 pb-4">
          <h2 className="text-2xl font-bold leading-tight tracking-tight mb-1">Choose diets that fit you.</h2>
          <p className="text-gray-600 text-base font-medium">
            You can pick more than one. We’ll warn you when a meal doesn’t match.
          </p>
        </div>

        <div className="max-w-md mx-auto w-full px-5 pb-3">
          <div className="flex gap-2 overflow-x-auto">
            {DIET_CATEGORIES.map((cat) => {
              const active = cat.id === activeDietCategoryId
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveDietCategoryId(cat.id)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    active
                      ? 'bg-helfi-green text-white border-helfi-green'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-helfi-green/40'
                  }`}
                >
                  {cat.group}
                </button>
              )
            })}
          </div>
        </div>

        <main className="flex-1 flex flex-col w-full max-w-md mx-auto pb-[calc(12rem+env(safe-area-inset-bottom))] md:pb-32">
          <div className="flex flex-col gap-3 px-5">
            {groupOptions.map((d) => {
              const checked = selectedDietIds.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDiet(d.id)}
                  className={`group relative flex items-center gap-4 p-4 rounded-xl border-2 bg-white shadow-sm transition-all duration-200 ease-in-out active:scale-[0.98] ${
                    checked ? 'border-helfi-green' : 'border-transparent hover:border-helfi-green/30'
                  }`}
                >
                  <div
                    className={`flex shrink-0 items-center justify-center size-12 rounded-full transition-colors ${
                      checked ? 'bg-helfi-green text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-helfi-green/10 group-hover:text-helfi-green'
                    }`}
                  >
                    <MaterialSymbol name={optionIcon(d.id)} className="text-2xl" />
                  </div>
                  <div className="flex flex-col grow text-left">
                    <span className="text-base font-bold text-gray-900 mb-0.5">{d.label}</span>
                    <span className="text-sm font-medium text-gray-500 leading-snug">{d.summary}</span>
                  </div>
                  <div className="shrink-0">
                    <div
                      className={`size-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        checked ? 'border-helfi-green bg-helfi-green' : 'border-gray-300'
                      }`}
                    >
                      <MaterialSymbol name="check" className={`text-sm ${checked ? 'text-white' : 'opacity-0'}`} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </main>

        <div className="fixed bottom-0 left-0 right-0 pt-4 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4 bg-gray-50/95 backdrop-blur-xl border-t border-gray-200 z-50">
          <div className="max-w-md mx-auto w-full space-y-2">
            <button
              type="button"
              onClick={() => {
                setShowDietPicker(false)
                triggerDietSavedNotice()
              }}
              className="w-full flex items-center justify-center rounded-lg h-14 px-8 bg-helfi-green hover:bg-helfi-green/90 active:scale-[0.98] transition-all duration-200 text-white text-lg font-bold tracking-wide shadow-lg shadow-helfi-green/10"
            >
              Confirm selection
            </button>
            <div className="text-center text-xs text-gray-600">No extra credits are used for diet warnings.</div>
          </div>
        </div>
      </div>
    )
  }

  if (showGoalDetails) {
    const macroCaloriesTotal = macroTotals.protein * 4 + macroTotals.carbs * 4 + macroTotals.fat * 9;
    const proteinPct = macroCaloriesTotal > 0 ? Math.round((macroTotals.protein * 4 / macroCaloriesTotal) * 100) : 0;
    const carbPct = macroCaloriesTotal > 0 ? Math.round((macroTotals.carbs * 4 / macroCaloriesTotal) * 100) : 0;
    const fatPct = macroCaloriesTotal > 0 ? Math.round((macroTotals.fat * 9 / macroCaloriesTotal) * 100) : 0;
    const paceUnit = goalTargetWeightUnit === 'lb' ? 'lb' : 'kg';
    const goalTitle = isLoseGoal ? 'Lose weight goal' : 'Gain weight goal';
    const paceValue = roundToStep(activeGoalPace, GOAL_PACE_STEP);
    const paceProgress =
      ((paceValue - MIN_GOAL_PACE) / Math.max(1e-6, MAX_GOAL_PACE - MIN_GOAL_PACE)) * 100;
    const fiberMax = Math.max(0, Math.min(80, macroTotals.carbs));
    const sugarMaxLimit = Math.max(0, Math.min(100, macroTotals.carbs));
    const fiberPct = fiberMax > 0 ? Math.round((clampedFiberTarget / fiberMax) * 100) : 0;
    const sugarPct = sugarMaxLimit > 0 ? Math.round((clampedSugarMax / sugarMaxLimit) * 100) : 0;
    const tickStyle = (min: number, max: number, step: number) => {
      const count = Math.max(1, Math.round((max - min) / step));
      return {
        backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.55) 1px, transparent 1px)',
        backgroundSize: `${100 / count}% 100%`,
        backgroundRepeat: 'repeat',
      };
    };

    return (
      <div className="bg-white min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-md mx-auto w-full flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={closeGoalDetails}
              className="flex items-center justify-center size-10 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Back to step 2"
            >
              <MaterialSymbol name="arrow_back" className="text-2xl" />
            </button>
            <h1 className="text-lg font-bold tracking-tight">{goalTitle}</h1>
            <div className="size-10" aria-hidden="true" />
          </div>
        </header>

        <main className="flex-1 flex flex-col w-full max-w-md mx-auto pb-[calc(12rem+env(safe-area-inset-bottom))] md:pb-32">
          <div className="px-4 pt-3 pb-3 space-y-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Target weight</h2>
                <div className="flex items-center">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-l text-sm font-semibold ${goalTargetWeightUnit === 'kg' ? 'bg-helfi-green text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => handleGoalTargetWeightUnitChange('kg')}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-r text-sm font-semibold ${goalTargetWeightUnit === 'lb' ? 'bg-helfi-green text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => handleGoalTargetWeightUnitChange('lb')}
                  >
                    lb
                  </button>
                </div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder={`Target weight (${goalTargetWeightUnit})`}
                value={goalTargetWeightInput}
                onChange={(e) => handleGoalTargetWeightChange(e.target.value)}
              />
              {estimatedWeeks != null ? (
                <p className="text-xs text-gray-500">
                  Estimated time: {estimatedWeeks} weeks at this pace.
                </p>
              ) : (
                <p className="text-xs text-gray-500">Set a target to see the timeline.</p>
              )}
            </section>

            <div className="h-px bg-gray-100" />

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Weekly pace</h2>
                  <p className="text-xs text-gray-500">Weekly pace sets your calories and macros.</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {displayGoalPace} {paceUnit}/week
                </span>
              </div>
              <input
                type="range"
                min={MIN_GOAL_PACE}
                max={MAX_GOAL_PACE}
                step={GOAL_PACE_STEP}
                value={paceValue}
                onInput={(e) => {
                  const next = handleGoalPaceChange(Number(e.currentTarget.value));
                  if (next != null) triggerSliderHaptic('pace', next);
                }}
                className="w-full cursor-pointer goal-pace-slider"
                style={{ '--progress': `${Math.min(100, Math.max(0, paceProgress))}%` } as React.CSSProperties}
              />
              <div className="h-2 w-full rounded-full" style={tickStyle(MIN_GOAL_PACE, MAX_GOAL_PACE, GOAL_PACE_STEP)} />
              <p className="text-xs text-gray-500">Weekly pace uses the 7,700 kcal per kg rule.</p>
              {activeGoalPace >= MAX_GOAL_PACE && (
                <p className="text-xs font-semibold text-red-600">
                  Warning: This is an aggressive pace. Check with your doctor or dietitian to make sure it’s safe for you.
                </p>
              )}
            </section>

            <div className="h-px bg-gray-100" />

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Daily calories</h2>
                  <p className="text-xs text-gray-500">Calculated from your weekly pace.</p>
                  <p className="text-xs text-gray-500">
                    Maintenance calories use your age, height, weight, sex, and activity level.
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{clampedGoalCalories} kcal</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-helfi-green"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((clampedGoalCalories - calorieBounds.min) / (calorieBounds.max - calorieBounds.min || 1)) * 100))}%`,
                  }}
                />
              </div>
            </section>

            <div className="h-px bg-gray-100" />

            <section className="space-y-2">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Macros</h2>
                <p className="text-xs text-gray-500">
                  Protein and fat scale with your body weight and pace. Carbs fill the remaining calories.
                </p>
                <p className="text-xs text-gray-500">Adjust weekly pace to recalculate.</p>
                <p className="text-xs text-gray-500">
                  Diet choices like keto or carnivore can cap carbs and rebalance macros.
                </p>
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: MACRO_COLORS.protein }} />
                        Protein
                      </p>
                      <p className="text-xs text-gray-500">{proteinPct}% of calories</p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: MACRO_COLORS.protein }}>
                      {macroTotals.protein} g
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, proteinPct))}%`, backgroundColor: MACRO_COLORS.protein }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: MACRO_COLORS.carbs }} />
                        Carbs
                      </p>
                      <p className="text-xs text-gray-500">{carbPct}% of calories</p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: MACRO_COLORS.carbs }}>
                      {macroTotals.carbs} g
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, carbPct))}%`, backgroundColor: MACRO_COLORS.carbs }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: MACRO_COLORS.fat }} />
                        Fat
                      </p>
                      <p className="text-xs text-gray-500">{fatPct}% of calories</p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: MACRO_COLORS.fat }}>
                      {macroTotals.fat} g
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, fatPct))}%`, backgroundColor: MACRO_COLORS.fat }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-2">
                <p className="text-xs text-gray-500">Fibre and sugar are counted inside your carb total.</p>
                <p className="text-xs text-gray-500">Calculated from calories and your health profile.</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: MACRO_COLORS.fiber }} />
                      Fibre
                    </p>
                    <span className="text-sm font-semibold" style={{ color: MACRO_COLORS.fiber }}>
                      {clampedFiberTarget} g
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, fiberPct))}%`, backgroundColor: MACRO_COLORS.fiber }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: MACRO_COLORS.sugar }} />
                      Sugar (max)
                    </p>
                    <span className="text-sm font-semibold" style={{ color: MACRO_COLORS.sugar }}>
                      {clampedSugarMax} g
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, sugarPct))}%`, backgroundColor: MACRO_COLORS.sugar }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {dietWarnings.length > 0 && (
              <div className="border-l-4 border-amber-400 pl-3">
                <p className="text-sm font-semibold text-amber-900 mb-1">Diet warnings</p>
                <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                  {dietWarnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </main>

        <div className="fixed bottom-0 left-0 right-0 pt-4 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4 bg-white/95 backdrop-blur-xl border-t border-gray-200 z-50">
          <div className="max-w-md mx-auto w-full">
            <button
              type="button"
              onClick={closeGoalDetails}
              className="w-full flex items-center justify-center rounded-lg h-14 px-8 bg-helfi-green hover:bg-helfi-green/90 active:scale-[0.98] transition-all duration-200 text-white text-lg font-bold tracking-wide shadow-lg shadow-helfi-green/10"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Enter your current weight</h2>
      <p className="mb-4 text-gray-600">Used to personalize health and supplement recommendations.</p>
      <div className="flex justify-end mb-2">
        <button 
          className={`px-3 py-1 rounded-l ${unit === 'metric' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`} 
          onClick={() => handleUnitChange('metric')}
        >
          kg
        </button>
        <button 
          className={`px-3 py-1 rounded-r ${unit === 'imperial' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`} 
          onClick={() => handleUnitChange('imperial')}
        >
          lbs
        </button>
      </div>
      <input
        className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-4 focus:border-green-500 focus:ring-1 focus:ring-green-500"
        type="number"
        inputMode="numeric"
        placeholder={`Weight (${unit === 'metric' ? 'kg' : 'lbs'})`}
        value={weight}
        onChange={e => setWeight(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
      />
      <h2 className="text-2xl font-bold mb-2">What is your date of birth?</h2>
      <p className="mb-4 text-gray-600">
        We’ll calculate your age from your birthdate to set safe calorie and nutrition targets.
      </p>
      <div className="grid grid-cols-3 gap-3 mb-2">
        <div ref={birthDayRef} className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">Day</label>
          <button
            type="button"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm"
            aria-haspopup="listbox"
            aria-expanded={birthDayOpen}
            onClick={() => {
              setBirthDayOpen((open) => !open);
              setBirthMonthOpen(false);
              setBirthYearOpen(false);
            }}
          >
            {birthDay ? String(parseInt(birthDay, 10)) : 'Day'}
          </button>
          {birthDayOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {Array.from({ length: daysInMonth }, (_, idx) => {
                const dayNumber = idx + 1;
                const value = String(dayNumber).padStart(2, '0');
                const isFutureDay =
                  birthYear === String(currentYear) &&
                  birthMonth === String(today.getMonth() + 1).padStart(2, '0') &&
                  dayNumber > today.getDate();
                const isSelected = birthDay === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm ${
                      isSelected ? 'bg-helfi-green text-white' : 'hover:bg-gray-100'
                    } ${isFutureDay ? 'text-gray-300 cursor-not-allowed hover:bg-white' : ''}`}
                    disabled={isFutureDay}
                    onClick={() => {
                      if (isFutureDay) return;
                      birthdateTouchedRef.current = true;
                      setBirthDay(value);
                      const nextBirthdate = buildValidBirthdate(birthYear, birthMonth, value);
                      setBirthdate(nextBirthdate);
                      if (nextBirthdate) {
                        saveBirthdateNow(nextBirthdate);
                      }
                      closeBirthMenus();
                    }}
                  >
                    {dayNumber}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div ref={birthMonthRef} className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
          <button
            type="button"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm"
            aria-haspopup="listbox"
            aria-expanded={birthMonthOpen}
            onClick={() => {
              setBirthMonthOpen((open) => !open);
              setBirthDayOpen(false);
              setBirthYearOpen(false);
            }}
          >
            {monthOptions.find((month) => month.value === birthMonth)?.label || 'Month'}
          </button>
          {birthMonthOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {monthOptions.map((month) => {
                const monthNumber = parseInt(month.value, 10);
                const isFutureMonth =
                  birthYear === String(currentYear) && monthNumber > today.getMonth() + 1;
                const isSelected = birthMonth === month.value;
                return (
                  <button
                    key={month.value}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm ${
                      isSelected ? 'bg-helfi-green text-white' : 'hover:bg-gray-100'
                    } ${isFutureMonth ? 'text-gray-300 cursor-not-allowed hover:bg-white' : ''}`}
                    disabled={isFutureMonth}
                    onClick={() => {
                      if (isFutureMonth) return;
                      birthdateTouchedRef.current = true;
                      setBirthMonth(month.value);
                      const nextBirthdate = buildValidBirthdate(birthYear, month.value, birthDay);
                      setBirthdate(nextBirthdate);
                      if (nextBirthdate) {
                        saveBirthdateNow(nextBirthdate);
                      }
                      closeBirthMenus();
                    }}
                  >
                    {month.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div ref={birthYearRef} className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
          <button
            type="button"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm"
            aria-haspopup="listbox"
            aria-expanded={birthYearOpen}
            onClick={() => {
              setBirthYearOpen((open) => !open);
              setBirthDayOpen(false);
              setBirthMonthOpen(false);
            }}
          >
            {birthYear || 'Year'}
          </button>
          {birthYearOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {Array.from({ length: currentYear - minYear + 1 }, (_, idx) => {
                const year = currentYear - idx;
                const yearValue = String(year);
                const isSelected = birthYear === yearValue;
                return (
                  <button
                    key={yearValue}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm ${
                      isSelected ? 'bg-helfi-green text-white' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      birthdateTouchedRef.current = true;
                      setBirthYear(yearValue);
                      const nextBirthdate = buildValidBirthdate(yearValue, birthMonth, birthDay);
                      setBirthdate(nextBirthdate);
                      if (nextBirthdate) {
                        saveBirthdateNow(nextBirthdate);
                      }
                      closeBirthMenus();
                    }}
                  >
                    {yearValue}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <h2 className="text-2xl font-bold mb-4">How tall are you?</h2>
      <p className="mb-4 text-gray-600">Height helps us calculate key health metrics.</p>
      <div className="flex justify-end mb-2">
        <button
          className={`px-3 py-1 rounded-l ${unit === 'metric' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`}
          onClick={() => handleUnitChange('metric')}
        >
          cm
        </button>
        <button
          className={`px-3 py-1 rounded-r ${unit === 'imperial' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`}
          onClick={() => handleUnitChange('imperial')}
        >
          ft/in
        </button>
      </div>
      <div className="mb-4">
        {unit === 'metric' ? (
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
            type="number"
            inputMode="numeric"
            placeholder="Height (cm)"
            value={height}
            onChange={e => setHeight(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                type="number"
                inputMode="numeric"
                placeholder="Feet"
                value={feet}
                onChange={e => setFeet(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div className="flex-1">
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                type="number"
                inputMode="numeric"
                placeholder="Inches"
                value={inches}
                onChange={e => setInches(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          </div>
        )}
      </div>
      <h2 className="text-2xl font-bold mb-2">What is your primary goal?</h2>
      <p className="mb-4 text-gray-600">We’ll tailor your calories and macros to this goal.</p>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Health check prompts</h3>
          <p className="text-xs text-gray-500">
            Warn you when a meal may conflict with your goals or diet. Fine-tune in{' '}
            <Link href="/settings/food-diary" className="text-helfi-green font-semibold underline underline-offset-2">
              Settings &gt; Food Diary
            </Link>
            .
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={healthCheckSettings.enabled}
            onChange={(e) => {
              healthCheckTouchedRef.current = true;
              setHealthCheckSettings((prev) => ({ ...prev, enabled: e.target.checked }));
            }}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {[
          { key: 'lose weight', label: 'Lose weight' },
          { key: 'gain weight', label: 'Gain weight' },
          { key: 'maintain weight', label: 'Maintain weight' },
          { key: 'tone up', label: 'Tone up' },
          { key: 'get shredded', label: 'Get shredded' },
        ].map((option) => (
          <button
            key={option.key}
            className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold ${
              goalChoice === option.key
                ? 'bg-green-600 text-white border-green-600'
                : 'border-green-600 text-green-700 hover:bg-green-50'
            } transition-colors`}
            onClick={() => handleGoalChoiceSelect(option.key)}
            type="button"
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {isLoseGainGoal && (
        <button
          type="button"
          onClick={() => setShowGoalDetails(true)}
          className="mb-6 text-sm font-semibold text-helfi-green underline underline-offset-2"
        >
          Set your weight goal
        </button>
      )}
      {requiresGoalIntensity && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">How intense?</h3>
            <span className="text-sm text-gray-500">Adjusts deficit/surplus</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'mild', label: 'Mild' },
              { key: 'standard', label: 'Standard' },
              { key: 'aggressive', label: 'Aggressive' },
            ].map((option) => (
              <button
                key={option.key}
                className={`w-full py-2 rounded-xl border ${
                  goalIntensity === option.key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                } transition-colors text-sm font-semibold`}
                onClick={() => {
                  goalIntensityTouchedRef.current = true;
                  const nextIntensity = option.key as any;
                  setGoalIntensity(nextIntensity);
                  if (onPartialSave) {
                    onPartialSave({ goalChoice, goalIntensity: nextIntensity });
                  }
                  try {
                    updateUserData(sanitizeUserDataPayload({ goalChoice, goalIntensity: nextIntensity }));
                  } catch {}
                  fetch('/api/user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                      sanitizeUserDataPayload({ goalChoice, goalIntensity: nextIntensity }),
                    ),
                    keepalive: true,
                  }).catch(() => {});
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Mild = smaller change, Standard = balanced, Aggressive = faster change (use only if safe for you).
          </p>
        </div>
      )}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Do you have diabetes?</h2>
        <p className="mb-3 text-gray-600">Helps set safer sugar and carb targets.</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
            {[
              { key: 'type1', label: 'Type 1' },
              { key: 'type2', label: 'Type 2' },
              { key: 'prediabetes', label: 'Pre-diabetic' },
            ].map((option) => (
              <button
                key={option.key}
                className={`w-full py-2.5 rounded-xl border ${
                  diabetesType === option.key
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                } transition-colors text-sm font-semibold`}
              onClick={() => {
                setDiabetesType((current) => (current === option.key ? '' : (option.key as any)))
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Add your food allergies</h2>
        <p className="mb-3 text-gray-600">We&apos;ll warn you during new food analyses. This will never block foods.</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="flex-1 flex gap-2">
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
              type="search"
              list="allergy-suggestions"
              placeholder="Search or type an allergy (e.g., peanut, gluten)"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAllergy();
                }
              }}
            />
            <datalist id="allergy-suggestions">
              {allergyOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => handleAddAllergy()}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </div>
        {filteredAllergySuggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {filteredAllergySuggestions.map((opt) => (
              <button
                key={opt}
                type="button"
                className="px-3 py-1 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => handleAddAllergy(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        {allergies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allergies.map((allergy) => (
              <span
                key={allergy}
                className="inline-flex items-center bg-orange-50 text-orange-800 border border-orange-200 px-3 py-1 rounded-full text-sm"
              >
                {allergy}
                <button
                  type="button"
                  className="ml-2 text-orange-700 hover:text-orange-900"
                  onClick={() => handleRemoveAllergy(allergy)}
                  aria-label={`Remove ${allergy}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Do you follow a specific diet? (optional)</h2>
        <p className="mb-3 text-gray-600">We can warn you when a meal doesn&apos;t match your diet and suggest simple swaps.</p>
        <button
          type="button"
          onClick={() => {
            setDietPickerView('categories')
            setDietSearch('')
            setShowDietPicker(true)
          }}
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center rounded-lg bg-helfi-green/10 shrink-0 size-10 text-helfi-green">
              <MaterialSymbol name="restaurant" className="text-2xl" />
            </div>
            <div className="text-left min-w-0">
              <div className="font-semibold text-gray-900">
                {normalizeDietTypes(dietTypes).length ? `Selected diets: ${normalizeDietTypes(dietTypes).length}` : 'Choose your diets'}
              </div>
              <div className="text-xs text-gray-600 truncate">
                {normalizeDietTypes(dietTypes).length
                  ? normalizeDietTypes(dietTypes)
                      .slice(0, 3)
                      .map((id) => getDietOption(id)?.label || id)
                      .join(', ')
                  : 'Tap to pick diet types.'}
              </div>
            </div>
          </div>
          <span className="text-gray-500 font-semibold">›</span>
        </button>
        {showDietSavedNotice && (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Saved. Insights will update when you leave Health Setup.
          </div>
        )}
        {normalizeDietTypes(dietTypes).length > 0 && (
          <button
            type="button"
            onClick={() => {
              dietTouchedRef.current = true
              setDietTypes([])
            }}
            className="mt-3 text-sm text-gray-600 underline hover:text-gray-900"
          >
            Clear diet selection
          </button>
        )}
      </div>

      <h2 className="text-2xl font-bold mb-4">Choose your body type (optional)</h2>
      <p className="mb-4 text-gray-600">Helps tailor insights to your body composition.</p>
      <div className="space-y-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {['ectomorph', 'mesomorph', 'endomorph'].map(type => (
            <button
              key={type}
              className={`w-full px-3 py-2.5 rounded-xl border ${
                bodyType === type
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-green-600 text-green-700 hover:bg-green-50'
              } relative group transition-colors`}
              onClick={() => handleBodyTypeChange(type)}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold">
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
                <span className="inline-flex items-center justify-center">
                  <InformationCircleIcon
                    className={`w-5 h-5 ${
                      bodyType === type ? 'text-white' : 'text-helfi-green'
                    }`}
                    aria-hidden="true"
                  />
                </span>
              </div>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 z-10">
                {bodyTypeDescriptions[type as keyof typeof bodyTypeDescriptions]}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-start">
          <button 
            className="px-6 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold" 
            onClick={() => handleBodyTypeChange('')}
          >
            Skip
          </button>
        </div>
      </div>
      {/* Unsaved changes banner - informational only; insights update when you leave Health Setup */}
      {hasUnsavedChanges && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <div className="mt-1 h-2 w-2 rounded-full bg-yellow-500" />
            <div>
              <div className="font-medium text-yellow-900 mb-1">Changes not in insights yet</div>
              <div className="text-sm text-yellow-700">
                We&apos;ve noticed you updated your basic health details. Insights will update in the background when you leave Health Setup.
              </div>
            </div>
          </div>
        </div>
      )}
      {showValidationError && !isStepComplete && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          Please fill weight, birthdate, height, gender, body type, goal, and intensity before continuing.
          {!hasGender && (
            <div className="mt-1 text-red-600">
              Use the Back button to select your gender on the previous step.
            </div>
          )}
        </div>
      )}
        <div className="flex justify-between">
        <button type="button" className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" onClick={handleBackWithGuard}>Back</button>
        <div className="flex space-x-3">
        <button 
          type="button"
          className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={!isStepComplete}
          onClick={() => {
            if (!isStepComplete) {
              setShowValidationError(true);
              return;
            }
            handleNextWithGuard();
          }}
        >
          Skip
        </button>
          <button 
            type="button"
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" 
            disabled={!isStepComplete}
            onClick={handleNextWithGuard}
          >
            Next
          </button>
        </div>
      </div>
      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          pendingExternalNavigationRef.current = null;
          setShowUpdatePopup(false);
        }}
        onAddMore={() => {
          // User explicitly chose to continue without updating insights.
          // Allow the pending guarded navigation (Next/Back/Dashboard) to proceed.
          acknowledgeUnsavedChanges();
          setShowUpdatePopup(false);
          const external = pendingExternalNavigationRef.current;
          pendingExternalNavigationRef.current = null;
          if (external) {
            external();
          }
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
      {/* No Update Insights prompt on review; do not block exit here */}
    </div>
  );
});

function ExerciseStep({ onNext, onBack, initial, onPartialSave, onUnsavedChange, onInsightsSaved }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onPartialSave?: (data: any) => void, onUnsavedChange?: () => void, onInsightsSaved?: () => void }) {
  const initialSnapshotRef = useRef<any>(null);
  const [exerciseFrequency, setExerciseFrequency] = useState(initial?.exerciseFrequency || '');
  const [exerciseTypes, setExerciseTypes] = useState<string[]>(initial?.exerciseTypes || []);
  const [exerciseDurations, setExerciseDurations] = useState<Record<string, string>>(
    initial?.exerciseDurations || {},
  );
  const [customExercise, setCustomExercise] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const { shouldBlockNavigation, allowUnsavedNavigation, acknowledgeUnsavedChanges, requestNavigation, beforeUnloadHandler } = useUnsavedNavigationAllowance(hasUnsavedChanges);

  const handleDurationChange = (type: string, value: string) => {
    setExerciseDurations((prev) => {
      const next = { ...prev }
      next[type] = value
      return next
    })
  }

  const toggleExercise = (type: string, enabled: boolean) => {
    setExerciseTypes((prev) => {
      if (enabled) {
        if (prev.includes(type)) return prev
        return [...prev, type]
      }
      setExerciseDurations((prevDurations) => {
        const next = { ...prevDurations }
        delete next[type]
        return next
      })
      return prev.filter((t) => t !== type)
    })
  }

  // Track changes from initial values
  useEffect(() => {
    if (!initialSnapshotRef.current && initial && Object.keys(initial || {}).length > 0) {
      initialSnapshotRef.current = initial;
    }
    const baseline = initialSnapshotRef.current || initial || {};
    const initialFrequency = baseline?.exerciseFrequency || '';
    const initialTypes = baseline?.exerciseTypes || [];
    const initialDurations = baseline?.exerciseDurations || {};
    const hasChanged =
      exerciseFrequency !== initialFrequency ||
      JSON.stringify(exerciseTypes.sort()) !== JSON.stringify(initialTypes.sort()) ||
      JSON.stringify(exerciseDurations) !== JSON.stringify(initialDurations);
    setHasUnsavedChanges(hasChanged && (exerciseFrequency || exerciseTypes.length > 0));
    if (hasChanged && onUnsavedChange) {
      onUnsavedChange();
    }
  }, [exerciseFrequency, exerciseTypes, exerciseDurations, initial]);

  // Prevent browser navigation when there are unsaved changes
  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [beforeUnloadHandler]);

  // Handle Update Insights button click
  const handleUpdateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      // Step 1: Save data immediately
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload({ 
          exerciseFrequency: exerciseFrequency || 'not specified',
          exerciseTypes: exerciseTypes || [],
          exerciseDurations,
        }))
      });
      
      if (response.ok) {
        // Data saved successfully
        initialSnapshotRef.current = {
          ...(initialSnapshotRef.current || initial || {}),
          exerciseFrequency: exerciseFrequency || '',
          exerciseTypes: exerciseTypes || [],
          exerciseDurations,
        };
        setHasUnsavedChanges(false);
        if (onInsightsSaved) onInsightsSaved();
        acknowledgeUnsavedChanges();
        try {
          window.dispatchEvent(new Event('userData:refresh'));
        } catch {}
        
        // Step 2: Close popup immediately (exercise insights are disabled)
        setShowUpdatePopup(false);
      } else {
        alert('Failed to save your changes. Please try again.');
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save your changes. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Handle navigation with unsaved changes check
  const triggerPopup = () => {
    if (!showUpdatePopup) {
      setShowUpdatePopup(true);
    }
  };

  // Persist exercise selections as they change so leaving/returning keeps the state
  useEffect(() => {
    if (!onPartialSave) return;
    const payload = {
      exerciseFrequency: exerciseFrequency || '',
      exerciseTypes: exerciseTypes || [],
      exerciseDurations,
    };
    onPartialSave(payload);
  }, [exerciseFrequency, exerciseTypes, exerciseDurations, onPartialSave]);

  const handleNext = () => {
    requestNavigation(() => {
      onNext({
        exerciseFrequency: exerciseFrequency || 'not specified',
        exerciseTypes: exerciseTypes || [],
        exerciseDurations,
      });
    }, triggerPopup);
  };

  const handleBack = () => {
    requestNavigation(onBack, triggerPopup);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">How often do you exercise?</h2>
        <p className="mb-2 text-gray-600">This helps us understand your activity level for better recommendations.</p>
        <p className="mb-6 text-gray-600">
          Note: Exercise insights are only relevant when a health device is connected; we don’t generate an Exercise insight section otherwise.
        </p>
        
        <div className="mb-6">
          <select 
            className="w-full rounded-lg border border-gray-300 px-3 py-3 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-gray-700"
            value={exerciseFrequency}
            onChange={(e) => setExerciseFrequency(e.target.value)}
          >
            <option value="">Select frequency...</option>
            <option value="Every Day">Every Day</option>
            <option value="1 day a week">1 day a week</option>
            <option value="2 days a week">2 days a week</option>
            <option value="3 days a week">3 days a week</option>
            <option value="4 days a week">4 days a week</option>
            <option value="5 days a week">5 days a week</option>
            <option value="6 days a week">6 days a week</option>
          </select>
        </div>

        <h3 className="text-xl font-bold mb-4">What type of exercise do you do?</h3>
        <p className="mb-4 text-gray-600">Select all that apply to your routine.</p>
        
        <div className="mb-4 space-y-2">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="walking"
              checked={exerciseTypes.includes('Walking')}
              onChange={(e) => toggleExercise('Walking', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="walking" className="text-gray-700 cursor-pointer">Walking</label>
            {exerciseTypes.includes('Walking') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Walking'] || ''}
                onChange={(e) => handleDurationChange('Walking', e.target.value)}
                onFocus={() => handleDurationChange('Walking', '')}
              />
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="running"
              checked={exerciseTypes.includes('Running')}
              onChange={(e) => toggleExercise('Running', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="running" className="text-gray-700 cursor-pointer">Running</label>
            {exerciseTypes.includes('Running') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Running'] || ''}
                onChange={(e) => handleDurationChange('Running', e.target.value)}
                onFocus={() => handleDurationChange('Running', '')}
              />
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="swimming"
              checked={exerciseTypes.includes('Swimming')}
              onChange={(e) => toggleExercise('Swimming', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="swimming" className="text-gray-700 cursor-pointer">Swimming</label>
            {exerciseTypes.includes('Swimming') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Swimming'] || ''}
                onChange={(e) => handleDurationChange('Swimming', e.target.value)}
                onFocus={() => handleDurationChange('Swimming', '')}
              />
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="biking"
              checked={exerciseTypes.includes('Bike riding')}
              onChange={(e) => toggleExercise('Bike riding', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="biking" className="text-gray-700 cursor-pointer">Bike riding</label>
            {exerciseTypes.includes('Bike riding') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Bike riding'] || ''}
                onChange={(e) => handleDurationChange('Bike riding', e.target.value)}
                onFocus={() => handleDurationChange('Bike riding', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="mma"
              checked={exerciseTypes.includes('MMA')}
              onChange={(e) => toggleExercise('MMA', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="mma" className="text-gray-700 cursor-pointer">MMA</label>
            {exerciseTypes.includes('MMA') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['MMA'] || ''}
                onChange={(e) => handleDurationChange('MMA', e.target.value)}
                onFocus={() => handleDurationChange('MMA', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="boxing"
              checked={exerciseTypes.includes('Boxing')}
              onChange={(e) => toggleExercise('Boxing', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="boxing" className="text-gray-700 cursor-pointer">Boxing</label>
            {exerciseTypes.includes('Boxing') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Boxing'] || ''}
                onChange={(e) => handleDurationChange('Boxing', e.target.value)}
                onFocus={() => handleDurationChange('Boxing', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="jujitsu"
              checked={exerciseTypes.includes('Jujitsu')}
              onChange={(e) => toggleExercise('Jujitsu', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="jujitsu" className="text-gray-700 cursor-pointer">Jujitsu</label>
            {exerciseTypes.includes('Jujitsu') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Jujitsu'] || ''}
                onChange={(e) => handleDurationChange('Jujitsu', e.target.value)}
                onFocus={() => handleDurationChange('Jujitsu', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="karate"
              checked={exerciseTypes.includes('Karate')}
              onChange={(e) => toggleExercise('Karate', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="karate" className="text-gray-700 cursor-pointer">Karate</label>
            {exerciseTypes.includes('Karate') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Karate'] || ''}
                onChange={(e) => handleDurationChange('Karate', e.target.value)}
                onFocus={() => handleDurationChange('Karate', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="bodybuilding"
              checked={exerciseTypes.includes('Body Building')}
              onChange={(e) => toggleExercise('Body Building', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="bodybuilding" className="text-gray-700 cursor-pointer">Body Building</label>
            {exerciseTypes.includes('Body Building') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Body Building'] || ''}
                onChange={(e) => handleDurationChange('Body Building', e.target.value)}
                onFocus={() => handleDurationChange('Body Building', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="yoga"
              checked={exerciseTypes.includes('Yoga')}
              onChange={(e) => toggleExercise('Yoga', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="yoga" className="text-gray-700 cursor-pointer">Yoga</label>
            {exerciseTypes.includes('Yoga') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Yoga'] || ''}
                onChange={(e) => handleDurationChange('Yoga', e.target.value)}
                onFocus={() => handleDurationChange('Yoga', '')}
              />
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="pilates"
              checked={exerciseTypes.includes('Pilates')}
              onChange={(e) => toggleExercise('Pilates', e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
            />
            <label htmlFor="pilates" className="text-gray-700 cursor-pointer">Pilates</label>
            {exerciseTypes.includes('Pilates') && (
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="ml-auto w-24 rounded border border-gray-200 px-2 py-1 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="mins"
                value={exerciseDurations['Pilates'] || ''}
                onChange={(e) => handleDurationChange('Pilates', e.target.value)}
                onFocus={() => handleDurationChange('Pilates', '')}
              />
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Other (specify):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customExercise}
              onChange={(e) => setCustomExercise(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && customExercise.trim()) {
                  e.preventDefault();
                  if (!exerciseTypes.includes(customExercise.trim())) {
                    setExerciseTypes([...exerciseTypes, customExercise.trim()]);
                    setCustomExercise('');
                  }
                }
              }}
              placeholder="Enter custom exercise type"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
            <button
              onClick={() => {
                if (customExercise.trim() && !exerciseTypes.includes(customExercise.trim())) {
                  setExerciseTypes([...exerciseTypes, customExercise.trim()]);
                  setCustomExercise('');
                }
              }}
              disabled={!customExercise.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300"
            >
              Add
            </button>
          </div>
        </div>

        {exerciseTypes.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Selected exercises:</h4>
            <div className="flex flex-wrap gap-2">
              {exerciseTypes.map((type, index) => (
                <span 
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                >
                  {type}
                  <button
                    onClick={() => setExerciseTypes(exerciseTypes.filter(t => t !== type))}
                    className="text-green-600 hover:text-green-800 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <button 
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={handleBack}
          >
            Back
          </button>
          <div className="flex space-x-3">
            <button 
              className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => {
                requestNavigation(() => {
                  onNext({
                    exerciseFrequency: exerciseFrequency || 'not specified',
                    exerciseTypes: exerciseTypes || [],
                    exerciseDurations,
                  });
                }, triggerPopup);
              }}
            >
              Skip
            </button>
            <button 
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
              onClick={handleNext}
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* Update Insights Popup */}
      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          setShowUpdatePopup(false);
        }}
        onAddMore={() => {
          acknowledgeUnsavedChanges();
          setShowUpdatePopup(false);
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
    </div>
  );
}

function HealthGoalsStep({ onNext, onBack, initial, onPartialSave, onUnsavedChange, onInsightsSaved }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onPartialSave?: (data: any) => void, onUnsavedChange?: () => void, onInsightsSaved?: () => void }) {
  const initialSnapshotRef = useRef<any>(null);
  const defaultGoals = [
    'Acne', 'Allergies', 'Anxiety', 'Asthma', 'Bloating', 'Bowel Movements', 'Brain Fog', 'Cold Sores', 'Constipation', 'Depression', 'Diarrhea', 'Digestion', 'Dry Skin', 'Eczema', 'Energy', 'Erection Quality', 'Eye Irritation', 'Fatigue', 'Gas', 'Hair Loss', 'Headaches', 'Heartburn', 'IBS Flare', 'Insomnia', 'Irritability', 'Itchy Skin', 'Joint Pain', 'Libido', 'Mood', 'Muscle Cramps', 'Nausea', 'PMS Symptoms', 'Rashes', 'Sleep Quality', 'Stress', 'Urinary Frequency', 'Weight Fluctuation'
  ];

  // Group goals by category for better organization
  const goalCategories = {
    'Mental Health': ['Anxiety', 'Depression', 'Stress', 'Mood', 'Irritability', 'Brain Fog', 'Insomnia', 'Sleep Quality'],
    'Digestive': ['Bloating', 'Constipation', 'Diarrhea', 'Digestion', 'Gas', 'Heartburn', 'IBS Flare', 'Nausea', 'Bowel Movements'],
    'Skin & Hair': ['Acne', 'Dry Skin', 'Eczema', 'Itchy Skin', 'Rashes', 'Hair Loss', 'Cold Sores'],
    'Energy & Physical': ['Energy', 'Fatigue', 'Joint Pain', 'Muscle Cramps', 'Headaches', 'Weight Fluctuation'],
    'Other': ['Allergies', 'Asthma', 'Eye Irritation', 'Erection Quality', 'Libido', 'PMS Symptoms', 'Urinary Frequency']
  };
  
  // Initialize state with incoming data
  const [goals, setGoals] = useState(initial?.goals || []);
  const [customGoals, setCustomGoals] = useState(initial?.customGoals || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const { shouldBlockNavigation, allowUnsavedNavigation, acknowledgeUnsavedChanges, requestNavigation, beforeUnloadHandler } = useUnsavedNavigationAllowance(hasUnsavedChanges);

  // Track changes from initial values
  useEffect(() => {
    if (!initialSnapshotRef.current && initial && Object.keys(initial || {}).length > 0) {
      initialSnapshotRef.current = initial;
    }
    const baseline = initialSnapshotRef.current || initial || {};
    const initialGoals = baseline?.goals || [];
    const initialCustomGoals = baseline?.customGoals || [];
    const goalsChanged = JSON.stringify(goals.sort()) !== JSON.stringify(initialGoals.sort());
    const customGoalsChanged = JSON.stringify(customGoals.sort()) !== JSON.stringify(initialCustomGoals.sort());
    setHasUnsavedChanges((goalsChanged || customGoalsChanged) && (goals.length > 0 || customGoals.length > 0));
    if ((goalsChanged || customGoalsChanged) && onUnsavedChange) {
      onUnsavedChange();
    }
  }, [goals, customGoals, initial]);

  // Persist goals as they change so selections stick across navigation
  useEffect(() => {
    if (!onPartialSave) return;
    onPartialSave({
      goals,
      customGoals,
    });
  }, [goals, customGoals, onPartialSave]);

  // Prevent browser navigation when there are unsaved changes
  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [beforeUnloadHandler]);

  // Handle Update Insights button click
  const handleUpdateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const allIssues = [...goals, ...customGoals].map((name: string) => ({ name }));
    const currentNames = allIssues.map(i => i.name.trim()).filter(Boolean);
    const addedOrRemoved = (() => {
      try {
        const baseline = initialSnapshotRef.current || initial || {};
        const prevGoals: string[] = Array.isArray(baseline.goals) ? baseline.goals : [];
        const prevSet = new Set(prevGoals.map((g) => g.trim()).filter(Boolean));
        const currSet = new Set(currentNames);
        const changed: string[] = [];
        for (const g of Array.from(currSet)) if (!prevSet.has(g)) changed.push(g);
        for (const g of Array.from(prevSet)) if (!currSet.has(g)) changed.push(g);
        return Array.from(new Set(changed));
      } catch {
        return currentNames; // fallback: assume all changed
      }
    })();
    
    // Save goals to both endpoints
    await Promise.all([
      fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sanitizeUserDataPayload({ goals: currentNames }))
        }),
        fetch('/api/checkins/issues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issues: allIssues })
        })
      ]);
      
      // Data saved successfully
      initialSnapshotRef.current = {
        ...(initialSnapshotRef.current || initial || {}),
        goals: goals || [],
        customGoals: customGoals || [],
      };
      setHasUnsavedChanges(false);
      if (onInsightsSaved) onInsightsSaved();
      acknowledgeUnsavedChanges();
      try {
        window.dispatchEvent(new Event('userData:refresh'));
      } catch {}
      
      // Fire regen in background WITHOUT waiting
      fireAndForgetInsightsRegen(['health_goals'], addedOrRemoved);
      
      // Close popup immediately
      setShowUpdatePopup(false);
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save your changes. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Get all available goals (custom + default)
  const allAvailableGoals = [...customGoals, ...defaultGoals];

  // Filter suggestions based on search term
  const getSuggestions = () => {
    if (!searchTerm.trim()) return [];
    
    const filtered = allAvailableGoals.filter(goal => 
      goal.toLowerCase().includes(searchTerm.toLowerCase()) && 
      !goals.includes(goal)
    );
    
    // Sort by relevance: starts with search term first, then contains
    return filtered.sort((a, b) => {
      const aStartsWith = a.toLowerCase().startsWith(searchTerm.toLowerCase());
      const bStartsWith = b.toLowerCase().startsWith(searchTerm.toLowerCase());
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.localeCompare(b);
    }).slice(0, 5); // Limit to 5 suggestions
  };

  const suggestions = getSuggestions();

  // Popular goals to show when no search
  const popularGoals = ['Anxiety', 'Energy', 'Sleep Quality', 'Digestion', 'Stress', 'Mood'].filter(goal => !goals.includes(goal));

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setShowSuggestions(true);
    setSelectedSuggestionIndex(-1);
  };

  const handleSearchFocus = () => {
    setShowSuggestions(true);
  };

  const handleSearchBlur = () => {
    // Delay hiding to allow clicks on suggestions
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const selectGoal = (goal: string) => {
    if (!goals.includes(goal)) {
      setGoals((prev: string[]) => [...prev, goal]);
    }
    setSearchTerm('');
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const removeGoal = (goalToRemove: string) => {
    setGoals((prev: string[]) => prev.filter((goal: string) => goal !== goalToRemove));
    // Also remove from custom goals if it's a custom one
    if (customGoals.includes(goalToRemove)) {
      setCustomGoals((prev: string[]) => prev.filter((goal: string) => goal !== goalToRemove));
    }
  };

  const addCustomGoal = () => {
    const trimmed = searchTerm.trim();
    if (trimmed && !allAvailableGoals.includes(trimmed)) {
      setCustomGoals((prev: string[]) => [...prev, trimmed]);
      setGoals((prev: string[]) => [...prev, trimmed]);
      setSearchTerm('');
      setShowSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        selectGoal(suggestions[selectedSuggestionIndex]);
      } else if (searchTerm.trim()) {
        addCustomGoal();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleNext = async () => {
    const triggerPopup = () => {
      if (!showUpdatePopup) {
        setShowUpdatePopup(true);
      }
    };

    const navigateToNextStep = () => {
      onNext({ goals, customGoals });
    };

    const proceed = async () => {
      try {
        const currentNames = [...goals, ...customGoals].map((n: string) => n.trim()).filter(Boolean)
        if (currentNames.length) {
          // Save goals for insights and check-ins without leaving onboarding
          fetch('/api/user-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sanitizeUserDataPayload({ goals: currentNames }))
          }).catch(() => {})
          if (process.env.NEXT_PUBLIC_CHECKINS_ENABLED === 'true') {
            fetch('/api/checkins/issues', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ issues: currentNames.map((name) => ({ name })) })
            }).catch(() => {})
          }
        }
      } catch (e) {
        // Silently ignore; onboarding should not break
        console.warn('check-ins save error', e);
      }
      navigateToNextStep();
    };

    if (hasUnsavedChanges) {
      requestNavigation(navigateToNextStep, triggerPopup);
      return;
    }

    requestNavigation(() => {
      proceed();
    }, triggerPopup);
  };

  const handleBack = () => {
    if (shouldBlockNavigation) {
      if (!showUpdatePopup) {
        setShowUpdatePopup(true);
      }
      return;
    }
    onBack();
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Sticky Top Next Button */}
        {goals.length > 0 && (
          <div className="sticky top-0 bg-white border-b border-gray-200 -mx-6 px-6 py-3 mb-4 z-10">
            <button 
              className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              onClick={handleNext}
            >
              Continue with {goals.length} goal{goals.length > 1 ? 's' : ''} →
            </button>
          </div>
        )}

        <h2 className="text-2xl font-bold mb-4">Which health concerns are you most interested in improving?</h2>
        <p className="mb-6 text-gray-600">
          Search and select the areas you'd like to focus on. You can add custom concerns too! 🎯
        </p>
        <div className="mb-4" />
        
        {/* Selected Goals as Chips */}
        {goals.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Selected ({goals.length}):</div>
            <div className="flex flex-wrap gap-2">
              {goals.map((goal: string) => (
                <div
                  key={goal}
                  className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm"
                >
                  <span>{goal}</span>
                  <button
                    onClick={() => removeGoal(goal)}
                    className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                    aria-label={`Remove ${goal}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Input with Suggestions */}
        <div className="relative mb-6">
          <div className="relative">
            <input
              className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-10 focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
              type="text"
              placeholder="Search health concerns or add your own..."
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onKeyDown={handleKeyPress}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Floating Suggestions */}
          {showSuggestions && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
              {suggestions.length > 0 ? (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                    Suggestions
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${
                        index === selectedSuggestionIndex ? 'bg-green-50 text-green-700' : ''
                      }`}
                      onClick={() => selectGoal(suggestion)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{suggestion}</span>
                        {index === selectedSuggestionIndex && (
                          <span className="text-green-500 text-sm">↵</span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              ) : searchTerm.trim() ? (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                    Add Custom
                  </div>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors text-green-600"
                    onClick={addCustomGoal}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span>Add "{searchTerm.trim()}"</span>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                    Popular
                  </div>
                  {popularGoals.slice(0, 6).map((goal) => (
                    <button
                      key={goal}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                      onClick={() => selectGoal(goal)}
                    >
                      {goal}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Category Browser (always visible when not searching) */}
        {!showSuggestions && !searchTerm && (
          <div className="mb-6">
            <div className="text-sm font-medium text-gray-700 mb-3">Browse by category:</div>
            <div className="space-y-3">
              {Object.entries(goalCategories).map(([category, categoryGoals]) => (
                <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                    {category}
                  </div>
                  <div className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {(expandedCategories.has(category) ? categoryGoals : categoryGoals.slice(0, 6))
                        .filter(goal => !goals.includes(goal)) // Hide already selected goals
                        .map((goal) => (
                        <button
                          key={goal}
                          onClick={() => selectGoal(goal)}
                          className="px-3 py-1 text-sm border border-green-200 text-green-700 rounded-full hover:bg-green-50 transition-colors"
                        >
                          {goal}
                        </button>
                      ))}
                      {categoryGoals.filter(goal => !goals.includes(goal)).length > 6 && !expandedCategories.has(category) && (
                        <button
                          onClick={() => {
                            setExpandedCategories(prev => new Set(Array.from(prev).concat(category)));
                          }}
                          className="px-3 py-1 text-sm text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50"
                        >
                          +{categoryGoals.filter(goal => !goals.includes(goal)).length - 6} more
                        </button>
                      )}
                      {expandedCategories.has(category) && categoryGoals.filter(goal => !goals.includes(goal)).length > 6 && (
                        <button
                          onClick={() => {
                            setExpandedCategories(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(category);
                              return newSet;
                            });
                          }}
                          className="px-3 py-1 text-sm text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <button 
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={handleBack}
          >
            Back
          </button>
          <div className="flex space-x-3">
            <button 
              className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => {
                if (shouldBlockNavigation) {
                  setShowUpdatePopup(true);
                  return;
                }
                onNext({ goals: [], customGoals: [] });
              }}
            >
              Skip
            </button>
            <button 
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
              onClick={handleNext}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Update Insights Popup */}
      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          setShowUpdatePopup(false);
        }}
        onAddMore={() => {
          acknowledgeUnsavedChanges();
          setShowUpdatePopup(false);
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
    </div>
  );
}

function HealthSituationsStep({ onNext, onBack, initial, onPartialSave, onUnsavedChange, onInsightsSaved }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onPartialSave?: (data: any) => void, onUnsavedChange?: () => void, onInsightsSaved?: () => void }) {
  const initialSnapshotRef = useRef<any>(null);
  const [healthIssues, setHealthIssues] = useState(initial?.healthSituations?.healthIssues || initial?.healthIssues || '');
  const [healthProblems, setHealthProblems] = useState(initial?.healthSituations?.healthProblems || initial?.healthProblems || '');
  const [additionalInfo, setAdditionalInfo] = useState(initial?.healthSituations?.additionalInfo || initial?.additionalInfo || '');
  const [skipped, setSkipped] = useState(initial?.healthSituations?.skipped || initial?.skipped || false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const { shouldBlockNavigation, allowUnsavedNavigation, acknowledgeUnsavedChanges, requestNavigation, beforeUnloadHandler } = useUnsavedNavigationAllowance(hasUnsavedChanges);

  // Track changes from initial values
  useEffect(() => {
    if (!initialSnapshotRef.current && initial && Object.keys(initial || {}).length > 0) {
      initialSnapshotRef.current = initial;
    }
    const baseline = initialSnapshotRef.current || initial || {};
    const initialIssues = baseline?.healthSituations?.healthIssues || baseline?.healthIssues || '';
    const initialProblems = baseline?.healthSituations?.healthProblems || baseline?.healthProblems || '';
    const initialInfo = baseline?.healthSituations?.additionalInfo || baseline?.additionalInfo || '';
    const hasChanged = healthIssues.trim() !== initialIssues.trim() || 
                       healthProblems.trim() !== initialProblems.trim() || 
                       additionalInfo.trim() !== initialInfo.trim();
    setHasUnsavedChanges(hasChanged && !skipped && (healthIssues.trim() || healthProblems.trim() || additionalInfo.trim()));
    if (hasChanged && !skipped && (healthIssues.trim() || healthProblems.trim() || additionalInfo.trim()) && onUnsavedChange) {
      onUnsavedChange();
    }
  }, [healthIssues, healthProblems, additionalInfo, skipped, initial]);

  useEffect(() => {
    if (!onPartialSave) return;
    onPartialSave({
      healthSituations: {
        healthIssues: healthIssues.trim(),
        healthProblems: healthProblems.trim(),
        additionalInfo: additionalInfo.trim(),
        skipped,
      },
    });
  }, [healthIssues, healthProblems, additionalInfo, skipped, onPartialSave]);

  // Prevent browser navigation when there are unsaved changes
  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [beforeUnloadHandler]);

  // Handle Update Insights button click
  const handleUpdateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload({ 
          healthSituations: {
            healthIssues: healthIssues.trim(),
            healthProblems: healthProblems.trim(),
            additionalInfo: additionalInfo.trim(),
            skipped: false
          }
        }))
      });
      
      if (response.ok) {
        // Data saved successfully
        initialSnapshotRef.current = {
          ...(initialSnapshotRef.current || initial || {}),
          healthSituations: {
            healthIssues: healthIssues.trim(),
            healthProblems: healthProblems.trim(),
            additionalInfo: additionalInfo.trim(),
            skipped: false,
          },
        };
        setHasUnsavedChanges(false);
        if (onInsightsSaved) onInsightsSaved();
        acknowledgeUnsavedChanges();
        try {
          window.dispatchEvent(new Event('userData:refresh'));
        } catch {}
        
        // Fire regen in background WITHOUT waiting
        fireAndForgetInsightsRegen(['health_situations']);
        
        // Close popup immediately
        setShowUpdatePopup(false);
      } else {
        alert('Failed to save your changes. Please try again.');
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save your changes. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const triggerPopup = () => {
    if (!showUpdatePopup) {
      setShowUpdatePopup(true);
    }
  };

  const handleNext = () => {
    requestNavigation(() => {
      const healthSituationsData = { 
        healthIssues: healthIssues.trim(), 
        healthProblems: healthProblems.trim(),
        additionalInfo: additionalInfo.trim(),
        skipped 
      };
      onNext({ healthSituations: healthSituationsData });
    }, triggerPopup);
  };

  const handleBack = () => {
    requestNavigation(onBack, triggerPopup);
  };

  const handleSkip = () => {
    requestNavigation(() => {
      setSkipped(true);
      onNext({ healthSituations: { skipped: true, healthIssues: '', healthProblems: '', additionalInfo: '' } });
    }, triggerPopup);
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Tell us about your current health situation</h2>
          <button 
            onClick={handleBack}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Why we ask:</strong> The more detailed information you provide about your current health situation, 
                the better our AI can analyze your data and provide personalized recommendations. This section is optional, 
                but we highly recommend completing it for the most accurate insights.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What health issues are you currently monitoring or concerned about?
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="e.g., High blood pressure, elevated cholesterol, digestive issues, sleep problems, joint pain, fatigue, etc."
              value={healthIssues}
              onChange={(e) => {
                if (skipped) setSkipped(false);
                setHealthIssues(e.target.value);
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Do you have any ongoing health problems or chronic conditions?
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="e.g., Diabetes, hypertension, arthritis, thyroid issues, heart conditions, autoimmune disorders, etc."
              value={healthProblems}
              onChange={(e) => {
                if (skipped) setSkipped(false);
                setHealthProblems(e.target.value);
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Any additional health information you'd like to share?
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="e.g., Family history, recent symptoms, lifestyle factors, stress levels, dietary restrictions, allergies, etc."
              value={additionalInfo}
              onChange={(e) => {
                if (skipped) setSkipped(false);
                setAdditionalInfo(e.target.value);
              }}
            />
          </div>
        </div>

        <div className="flex justify-between mt-8">
          <button
            onClick={handleSkip}
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>

      {/* Update Insights Popup */}
      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          setShowUpdatePopup(false);
        }}
        onAddMore={() => {
          acknowledgeUnsavedChanges();
          setShowUpdatePopup(false);
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
    </div>
  );
}

function SupplementsStep({ onNext, onBack, initial, onNavigateToAnalysis, onPartialSave }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onNavigateToAnalysis?: (data?: any) => void, onPartialSave?: (data: any) => void }) {
  const [supplements, setSupplements] = useState(initial?.supplements || []);
  
  // Fix data loading race condition - update supplements when initial data loads
  useEffect(() => {
    if (!initial?.supplements) return;
    setSupplements((prev: any[]) => {
      const next = dedupeItems(initial.supplements);
      if (!Array.isArray(prev) || prev.length === 0) return next;
      if (next.length < prev.length) return prev;
      if (!areItemsEquivalent(prev, next)) return next;
      return prev;
    });
  }, [initial?.supplements]);
  useEffect(() => {
    if (onPartialSave) {
      onPartialSave({ supplements });
    }
  }, [supplements, onPartialSave]);

  const [name, setName] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<{ name: string; source: string }[]>([]);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameSearchTimerRef = useRef<any>(null);
  const [dosage, setDosage] = useState('');
  const [dosageUnit, setDosageUnit] = useState('mg');
  const [timing, setTiming] = useState<string[]>([]);
  const [timingDosages, setTimingDosages] = useState<{[key: string]: string}>({});
  const [timingDosageUnits, setTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');

  useEffect(() => {
    if (!frontImage) {
      setFrontPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(frontImage);
    setFrontPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [frontImage]);

  useEffect(() => {
    if (!backImage) {
      setBackPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(backImage);
    setBackPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [backImage]);

  useEffect(() => {
    if (uploadMethod !== 'manual') {
      setNameSuggestions([]);
      setNameLoading(false);
      setNameError(null);
      return;
    }
    if (nameSearchTimerRef.current) {
      clearTimeout(nameSearchTimerRef.current);
    }
    const query = name.trim();
    if (query.length < 2) {
      setNameSuggestions([]);
      setNameLoading(false);
      setNameError(null);
      return;
    }
    nameSearchTimerRef.current = setTimeout(async () => {
      try {
        setNameLoading(true);
        setNameError(null);
        const brandMatch = getBrandMatch(query);
        const brandKey = brandMatch ? getBrandKey(brandMatch.normalized) : '';
        const remainder = brandMatch ? getRemainderAfterBrand(query, brandMatch.normalized) : '';
        let suggestions: { name: string; source: string }[] = [];
        const listSuggestions = buildBrandSuggestionsFromList(query);
        let catalogSuggestions: { name: string; source: string }[] = [];
        try {
          const catalogResponse = await fetch(`/api/supplement-catalog-search?q=${encodeURIComponent(query)}`);
          if (catalogResponse.ok) {
            const catalogData = await catalogResponse.json().catch(() => ({}));
            if (Array.isArray(catalogData?.results)) {
              catalogSuggestions = catalogData.results;
            }
          }
        } catch (catalogError) {
          console.warn('Catalog search failed:', catalogError);
        }
        try {
          if (brandMatch) {
            const brandQueries = Array.from(
              new Set([brandMatch.display, brandKey].filter(Boolean)),
            );
            const baseResults = await Promise.all(
              brandQueries.map((q) => fetchDsldBrandProducts(q, 25)),
            );
            const baseProducts = dedupeSuggestions(baseResults.flat());
            let filteredProducts = filterSuggestionsByRemainder(
              baseProducts as { name: string; source: string; brand?: string }[],
              remainder,
            );

            if (remainder && filteredProducts.length < 3) {
              const expandedResults = await Promise.all(
                brandQueries.map((q) => fetchDsldBrandProducts(q, 200)),
              );
              const expandedProducts = dedupeSuggestions(expandedResults.flat());
              const expandedFiltered = filterSuggestionsByRemainder(
                expandedProducts as { name: string; source: string; brand?: string }[],
                remainder,
              );
              if (expandedFiltered.length > 0) {
                filteredProducts = expandedFiltered;
              }
            }
            const brandOnly = listSuggestions.filter((item) =>
              normalizeSearchText(item.name).startsWith(brandMatch.normalized),
            );
            suggestions = dedupeSuggestions([
              ...brandOnly,
              ...catalogSuggestions,
              ...filteredProducts,
            ]);
            if (suggestions.length === 0 && listSuggestions.length > 0) {
              suggestions = listSuggestions;
            }
          } else {
            const dsldUrl = `https://api.ods.od.nih.gov/dsld/v9/search-filter?q=${encodeURIComponent(query)}&from=0&size=10&sort_by=_score&sort_order=desc`;
            const dsldResponse = await fetch(dsldUrl);
            if (dsldResponse.ok) {
              const dsldData = await dsldResponse.json().catch(() => ({}));
              const brandSuggestions = buildBrandSuggestionsFromDsld(dsldData, query);
              const productSuggestions = parseDsldSuggestions(dsldData);
              suggestions = dedupeSuggestions([
                ...catalogSuggestions,
                ...listSuggestions,
                ...brandSuggestions,
                ...productSuggestions,
              ]);
            } else if (listSuggestions.length > 0) {
              suggestions = listSuggestions;
            }
          }
        } catch (dsldError) {
          console.warn('DSLD direct search failed:', dsldError);
          if (listSuggestions.length > 0 || catalogSuggestions.length > 0) {
            suggestions = dedupeSuggestions([
              ...catalogSuggestions,
              ...listSuggestions,
            ]);
          }
        }

        if (suggestions.length === 0) {
          const response = await fetch(`/api/supplement-search?q=${encodeURIComponent(query)}`);
          if (!response.ok) throw new Error('Search failed');
          const data = await response.json().catch(() => ({}));
          suggestions = Array.isArray(data?.results) ? data.results : [];
        }

        setNameSuggestions(suggestions);
      } catch (error) {
        console.error('Supplement search failed:', error);
        setNameError('Search failed. Please try again.');
      } finally {
        setNameLoading(false);
      }
    }, 300);
    return () => {
      if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);
    };
  }, [name, uploadMethod]);
  
  // New dosing schedule states
  const [dosageSchedule, setDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  
  // Edit functionality states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  
  // Update insights popup state
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [hasExistingAnalysis, setHasExistingAnalysis] = useState(false);
  const [supplementsToSave, setSupplementsToSave] = useState<any[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageQualityWarning, setImageQualityWarning] = useState<{front?: string, back?: string}>({});
  const { shouldBlockNavigation, allowUnsavedNavigation, acknowledgeUnsavedChanges, requestNavigation, beforeUnloadHandler } = useUnsavedNavigationAllowance(hasUnsavedChanges);
  const prevEditingIndexRef = useRef<number | null>(null);
  
  // Populate form fields when editing starts
  useEffect(() => {
    const prevEditingIndex = prevEditingIndexRef.current;
    const editingChanged = prevEditingIndex !== editingIndex;
    prevEditingIndexRef.current = editingIndex;
    if (editingIndex !== null && editingIndex >= 0 && editingIndex < supplements.length) {
      const supplement = supplements[editingIndex];
      if (!supplement) {
        console.warn('Supplement not found at index:', editingIndex);
        return;
      }
      
      console.log('Populating form for edit:', supplement);
      
      // Clear any existing form state first
      setFrontImage(null);
      setBackImage(null);
      const isManualItem = supplement.method === 'manual' || !supplement.imageUrl;
      setUploadMethod(isManualItem ? 'manual' : 'photo');
      if (isManualItem) {
        setName(supplement.name || '');
        setNameSuggestions([]);
        setNameError(null);
      } else {
        setName('');
        setNameSuggestions([]);
        setNameError(null);
      }
      
      const dosageStr = supplement.dosage || '';
      const dosageParts = dosageStr.split(' ');
      const baseDosage = dosageParts[0] || '';
      const baseUnit = dosageParts.length > 1 ? dosageParts[1] : 'mg';
      
      setPhotoDosage(baseDosage);
      setPhotoDosageUnit(baseUnit);
      
      const timingArray: string[] = [];
      const timingDosagesObj: {[key: string]: string} = {};
      const timingDosageUnitsObj: {[key: string]: string} = {};
      
      if (Array.isArray(supplement.timing) && supplement.timing.length > 0) {
        supplement.timing.forEach((timingStr: string) => {
          if (typeof timingStr !== 'string') {
            timingStr = String(timingStr);
          }
          
          if (timingStr.includes(':')) {
            const parts = timingStr.split(':');
            if (parts.length >= 2) {
              const timeName = parts[0].trim();
              const dosagePart = parts[1].trim();
              timingArray.push(timeName);
              
              const dp = dosagePart.split(' ');
              if (dp.length >= 2) {
                timingDosagesObj[timeName] = dp[0];
                timingDosageUnitsObj[timeName] = dp[1];
              } else if (dp.length === 1 && dp[0]) {
                timingDosagesObj[timeName] = dp[0];
                timingDosageUnitsObj[timeName] = baseUnit;
              }
            }
          } else {
            const timeName = timingStr.trim();
            if (timeName) {
              timingArray.push(timeName);
              timingDosagesObj[timeName] = baseDosage;
              timingDosageUnitsObj[timeName] = baseUnit;
            }
          }
        });
      }
      
      setPhotoTiming(timingArray);
      setPhotoTimingDosages(timingDosagesObj);
      setPhotoTimingDosageUnits(timingDosageUnitsObj);
      
      const scheduleInfo = supplement.scheduleInfo || 'Daily';
      setPhotoDosageSchedule(scheduleInfo === 'Daily' ? 'daily' : 'specific');
      if (scheduleInfo !== 'Daily' && scheduleInfo) {
        setPhotoSelectedDays(scheduleInfo.split(', ').filter(Boolean));
      } else {
        setPhotoSelectedDays([]);
      }
    } else if (editingChanged && editingIndex === null && prevEditingIndex !== null) {
      // Only clear form when transitioning from editing to not editing (not when supplements change)
      clearPhotoForm();
      clearForm();
    }
  }, [editingIndex]); // Removed supplements from dependencies to prevent form clearing when adding new supplements

  // Validate image quality
  const validateImageQuality = async (file: File, type: 'front' | 'back') => {
    return new Promise<void>((resolve) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // Check image dimensions (minimum 800x600 for clarity)
        const minWidth = 800;
        const minHeight = 600;
        
        // Check file size (too small might indicate poor quality)
        const minSize = 50 * 1024; // 50KB minimum
        
        let warning = '';
        
        if (img.width < minWidth || img.height < minHeight) {
          warning = `Image resolution is low (${img.width}x${img.height}). Please take a clearer photo with better lighting.`;
        } else if (file.size < minSize) {
          warning = 'Image file size is very small. Please ensure the photo is clear and well-lit.';
        }
        
        if (warning) {
          setImageQualityWarning(prev => ({ ...prev, [type]: warning }));
        } else {
          setImageQualityWarning(prev => {
            const updated = { ...prev };
            delete updated[type];
            return updated;
          });
        }
        
        resolve();
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setImageQualityWarning(prev => ({ ...prev, [type]: 'Unable to load image. Please try again.' }));
        resolve();
      };
      
      img.src = url;
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Only close if click is outside dropdown container
      if (!target.closest('.dropdown-container')) {
        setShowDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Prevent browser navigation when there are unsaved changes
  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [beforeUnloadHandler]);

  // Check for existing interaction analysis
  useEffect(() => {
    const checkExistingAnalysis = async () => {
      try {
        const response = await fetch('/api/interaction-history');
        if (response.ok) {
          const data = await response.json();
          const analyses = data.analyses || [];
          setHasExistingAnalysis(analyses.length > 0);
        }
      } catch (error) {
        console.error('Error checking existing analysis:', error);
      }
    };
    checkExistingAnalysis();
  }, []);

  const handleUploadMethodChange = (method: 'manual' | 'photo') => {
    setUploadMethod(method);
    setUploadError(null);
    if (method === 'manual') {
      setName('');
      setNameSuggestions([]);
      setNameError(null);
      setFrontImage(null);
      setBackImage(null);
      setPhotoDosage('');
      setPhotoDosageUnit('mg');
      setPhotoTiming([]);
      setPhotoTimingDosages({});
      setPhotoTimingDosageUnits({});
      setPhotoDosageSchedule('daily');
      setPhotoSelectedDays([]);
    } else {
      setName('');
      setNameSuggestions([]);
      setNameError(null);
      setDosage('');
      setDosageUnit('mg');
      setTiming([]);
      setTimingDosages({});
      setTimingDosageUnits({});
      setDosageSchedule('daily');
      setSelectedDays([]);
    }
  };

  
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoDosageUnit, setPhotoDosageUnit] = useState('mg');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);
  const [photoTimingDosages, setPhotoTimingDosages] = useState<{[key: string]: string}>({});
  const [photoTimingDosageUnits, setPhotoTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [photoDosageSchedule, setPhotoDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [photoSelectedDays, setPhotoSelectedDays] = useState<string[]>([]);

  const timingOptions = ['Morning', 'Afternoon', 'Evening', 'Before Bed'];
  const dosageUnits = ['mg', 'mcg', 'g', 'IU', 'FUs', 'capsules', 'tablets', 'drops', 'ml', 'tsp', 'tbsp'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const timingId = (time: string) => `photo-timing-${time.toLowerCase().replace(/\s+/g, '-')}`;

  const uploadSupplementImage = async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/api/upload-supplement-image', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error || 'Upload failed');
    }
    const data = await response.json().catch(() => ({}));
    if (!data?.imageUrl) {
      throw new Error('Upload failed');
    }
    return data.imageUrl as string;
  };

  const toggleTiming = (time: string, isPhoto: boolean = false) => {
    const currentTiming = isPhoto ? photoTiming : timing;
    const setCurrentTiming = isPhoto ? setPhotoTiming : setTiming;
    
    setCurrentTiming(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const toggleDay = (day: string, isPhoto: boolean = false) => {
    const currentDays = isPhoto ? photoSelectedDays : selectedDays;
    const setCurrentDays = isPhoto ? setPhotoSelectedDays : setSelectedDays;
    
    setCurrentDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleScheduleChange = (schedule: 'daily' | 'specific', isPhoto: boolean = false) => {
    if (isPhoto) {
      setPhotoDosageSchedule(schedule);
      if (schedule === 'daily') {
        setPhotoSelectedDays([]);
      }
    } else {
      setDosageSchedule(schedule);
      if (schedule === 'daily') {
        setSelectedDays([]);
      }
    }
  };

  const addSupplement = async () => {
    const currentDate = new Date().toISOString();
    const isEditing = editingIndex !== null;
    const existingImages = isEditing ? parseImageValue(supplements[editingIndex]?.imageUrl) : { frontUrl: null, backUrl: null };
    const isManual = uploadMethod === 'manual';
    const formattedManualName = formatManualName(name);
    setUploadError(null);
    
    // For new supplements, require both images. For editing, images are optional.
    const hasRequiredData = isEditing 
      ? (photoDosage && photoTiming.length > 0 && (photoDosageSchedule === 'specific' ? photoSelectedDays.length > 0 : true) && (isManual ? formattedManualName.length > 0 : true))
      : isManual
        ? (formattedManualName && photoDosage && photoTiming.length > 0 && (photoDosageSchedule === 'specific' ? photoSelectedDays.length > 0 : true))
        : (frontImage && backImage && photoDosage && photoTiming.length > 0 && (photoDosageSchedule === 'specific' ? photoSelectedDays.length > 0 : true));
    
    if (hasRequiredData) {
      setIsUploadingImages(true);
      // Combine timing and individual dosages with units for photos
      const timingWithDosages = photoTiming.map(time => {
        const timeSpecificDosage = photoTimingDosages[time];
        const timeSpecificUnit = photoTimingDosageUnits[time] || photoDosageUnit;
        return timeSpecificDosage 
          ? `${time}: ${timeSpecificDosage} ${timeSpecificUnit}` 
          : `${time}: ${photoDosage} ${photoDosageUnit}`;
      });
      
      const scheduleInfo = photoDosageSchedule === 'daily' ? 'Daily' : photoSelectedDays.join(', ');
      
      if (isManual) {
        const finalName = formattedManualName;
        if (!finalName) {
          setUploadError('Please enter the brand + product name.');
          setIsUploadingImages(false);
          return;
        }
        const supplementData = { 
          id: isEditing ? supplements[editingIndex].id : Date.now().toString(),
          imageUrl: null,
          method: 'manual',
          name: finalName,
          dosage: `${photoDosage} ${photoDosageUnit}`,
          timing: timingWithDosages,
          scheduleInfo: scheduleInfo,
          dateAdded: isEditing ? supplements[editingIndex].dateAdded : currentDate
        };

        if (editingIndex !== null) {
          const updatedSupplements = dedupeItems(supplements.map((item: any, index: number) => 
            index === editingIndex ? supplementData : item
          ));
          setSupplements(updatedSupplements);
          setSupplementsToSave(updatedSupplements);
          setEditingIndex(null);
          
          try {
            const response = await fetch('/api/user-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sanitizeUserDataPayload({ supplements: updatedSupplements }))
            });
            if (response.ok) {
              setHasUnsavedChanges(true);
            } else {
              console.error('Failed to save supplement edit');
            }
          } catch (error) {
            console.error('Error saving supplement edit:', error);
          }
        } else {
          setSupplements((prev: any[]) => {
            const updatedSupplements = dedupeItems([...prev, supplementData]);
            setSupplementsToSave(updatedSupplements);
            setHasUnsavedChanges(true);
            return updatedSupplements;
          });
        }

        clearForm();
        setUploadError(null);
        setIsUploadingImages(false);
        return;
      }

      // Only analyze image if it's a new supplement or if new images are provided
      let supplementName = isEditing ? supplements[editingIndex].name : 'Unknown Supplement';
      let frontUrl = existingImages.frontUrl;
      let backUrl = existingImages.backUrl;
      
      const frontForUpload = frontImage ? await compressImageFile(frontImage) : null;
      const backForUpload = backImage ? await compressImageFile(backImage) : null;
      const scanId = `supp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (!isEditing || (frontForUpload && backForUpload)) {
        if (frontForUpload) {
          try {
            const result = await analyzeLabelName(frontForUpload, { scanType: 'supplement', scanId })
            if (result) supplementName = result
          } catch (error) {
            console.error('Error analyzing supplement image:', error)
            setUploadError(error instanceof Error ? error.message : 'Name scan failed. Please try again.')
            setIsUploadingImages(false)
            return
          }
        }
        if (isPlaceholderName(supplementName) && backForUpload) {
          try {
            const result = await analyzeLabelName(backForUpload, { scanType: 'supplement', scanId })
            if (result) supplementName = result
          } catch (error) {
            console.error('Error analyzing supplement image (back):', error)
          }
        }
      }

      if (isPlaceholderName(supplementName)) {
        setUploadError('We could not read the brand + supplement name. Please take a clearer front label photo.');
        setIsUploadingImages(false);
        return;
      }

      try {
        if (frontForUpload && backForUpload) {
          const [frontUploaded, backUploaded] = await Promise.all([
            uploadSupplementImage(frontForUpload),
            uploadSupplementImage(backForUpload),
          ]);
          frontUrl = frontUploaded;
          backUrl = backUploaded;
        } else {
          if (frontForUpload) {
            frontUrl = await uploadSupplementImage(frontForUpload);
          }
          if (backForUpload) {
            backUrl = await uploadSupplementImage(backForUpload);
          }
        }
      } catch (error) {
        console.error('Error uploading supplement images:', error);
        setUploadError(error instanceof Error ? error.message : 'Photo upload failed. Please try again.');
        setIsUploadingImages(false);
        return;
      }

      const imageUrl = buildImageValue(frontUrl, backUrl);
      const supplementData = { 
        id: isEditing ? supplements[editingIndex].id : Date.now().toString(),
        // Persist existing saved image URL if any (no re-upload required for edits)
        imageUrl: imageUrl,
        method: 'photo',
        name: supplementName,
        dosage: `${photoDosage} ${photoDosageUnit}`,
        timing: timingWithDosages,
        scheduleInfo: scheduleInfo,
        dateAdded: isEditing ? supplements[editingIndex].dateAdded : currentDate
      };
      
      if (editingIndex !== null) {
        // Update existing supplement - show popup after saving
        const updatedSupplements = dedupeItems(supplements.map((item: any, index: number) => 
          index === editingIndex ? supplementData : item
        ));
        setSupplements(updatedSupplements);
        setSupplementsToSave(updatedSupplements);
        setEditingIndex(null);
        
        // Save immediately and then show popup
        try {
          const response = await fetch('/api/user-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sanitizeUserDataPayload({ supplements: updatedSupplements }))
          });
          if (response.ok) {
            // Flag unsaved changes so we prompt on navigation
            setHasUnsavedChanges(true);
          } else {
            console.error('Failed to save supplement edit');
          }
        } catch (error) {
          console.error('Error saving supplement edit:', error);
        }
      } else {
        // Add new supplement - defer popup until user tries to navigate away
        setSupplements((prev: any[]) => {
          const updatedSupplements = dedupeItems([...prev, supplementData]);
          setSupplementsToSave(updatedSupplements);
          // Mark as having unsaved changes for future navigation prompts
          setHasUnsavedChanges(true);
          return updatedSupplements;
        });
        // Refresh credits counter if photos were used (credits consumed during image analysis)
        if (!isManual) {
          try {
            window.dispatchEvent(new Event('credits:refresh'));
          } catch {}
        }
      }
      
      clearPhotoForm();
      setUploadError(null);
      setIsUploadingImages(false);
    }
  };
  
  // Handle Update Insights button click
  const handleUpdateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      // Save supplements to database
      // Step 1: Save supplements immediately
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload({ supplements: supplementsToSave }))
      });
      
      if (response.ok) {
        // Data saved successfully - update local state
        setSupplements(supplementsToSave);
        setHasUnsavedChanges(false);
        
        // Step 2: Fire regen in background WITHOUT waiting
        fireAndForgetInsightsRegen(['supplements']);
        
        // Step 3: Close popup immediately
        setShowUpdatePopup(false);
      } else {
        alert('Failed to save your changes. Please try again.');
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save your changes. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };
  
  // Handle navigation with unsaved changes check
  const triggerPopup = () => {
    if (!showUpdatePopup) {
      setShowUpdatePopup(true);
    }
  };

  const handleNext = () => {
    requestNavigation(() => {
      onNext({ supplements: supplementsToSave && supplementsToSave.length ? supplementsToSave : supplements });
    }, triggerPopup);
  };
  
  const handleBack = () => {
    requestNavigation(onBack, triggerPopup);
  };

  const clearForm = () => {
    setName(''); 
    setNameSuggestions([]);
    setNameError(null);
    setDosage(''); 
    setDosageUnit('mg');
    setTiming([]); 
    setTimingDosages({});
    setTimingDosageUnits({});
    setDosageSchedule('daily');
    setSelectedDays([]);
  };

  const clearPhotoForm = () => {
    setFrontImage(null); 
    setBackImage(null); 
    setFrontPreviewUrl(null);
    setBackPreviewUrl(null);
    setPhotoDosage(''); 
    setPhotoDosageUnit('mg');
    setPhotoTiming([]); 
    setPhotoTimingDosages({});
    setPhotoTimingDosageUnits({});
    setPhotoDosageSchedule('daily');
    setPhotoSelectedDays([]);
    setUploadError(null);
  };

  const editSupplement = (index: number) => {
    const supplement = supplements[index];
    if (!supplement) {
      console.error('Supplement not found at index:', index);
      return;
    }
    
    console.log('Editing supplement:', supplement);
    
    setEditingIndex(index);
    setShowDropdown(null);
    
    // Form fields will be populated by useEffect when editingIndex changes
    // Scroll to form when editing
    setTimeout(() => {
      const formElement = document.querySelector('.max-w-md.mx-auto');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const removeSupplement = async (index: number) => {
    const updatedSupplements = dedupeItems(supplements.filter((_: any, i: number) => i !== index));
    setSupplements(updatedSupplements);
    
    // Store updated supplements for potential update action
    setSupplementsToSave(updatedSupplements);
    
    // Mark as having unsaved changes (prompt will show on navigation)
    setHasUnsavedChanges(true);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Upload your supplements</h2>
        {editingIndex !== null && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="text-blue-900 font-medium">Editing: {supplements[editingIndex]?.name || 'Supplement'}</span>
              <button
                onClick={() => {
                  setEditingIndex(null);
                  clearPhotoForm();
                  clearForm();
                  setUploadMethod('photo');
                }}
                className="ml-auto text-blue-600 hover:text-blue-800 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <p className="mb-6 text-gray-600">Add photos of both the front and back of your supplement bottles/packets, or type the brand + product name.</p>

        <div className="mb-4">
          <div className="flex w-full rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => handleUploadMethodChange('photo')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${uploadMethod === 'photo' ? 'bg-helfi-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Use photos
            </button>
            <button
              type="button"
              onClick={() => handleUploadMethodChange('manual')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${uploadMethod === 'manual' ? 'bg-helfi-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Type name
            </button>
          </div>
        </div>

        {uploadMethod === 'manual' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Brand + product name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setUploadError(null);
              }}
              onBlur={() => setName(formatManualName(name))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-helfi-green"
              placeholder="e.g., Thorne - Magnesium Bisglycinate"
            />
            <div className="mt-1 text-xs text-gray-500">We’ll auto‑capitalize and clean formatting.</div>
            {nameLoading && (
              <div className="mt-2 text-xs text-gray-500">Searching…</div>
            )}
            {nameError && (
              <div className="mt-2 text-xs text-red-600">{nameError}</div>
            )}
            {nameSuggestions.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-56 overflow-y-auto">
                {nameSuggestions.map((item, idx) => (
                  <button
                    key={`${item.name}-${idx}`}
                    type="button"
                    onClick={() => {
                      setName(formatManualName(item.name));
                      setNameSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-gray-400 uppercase">{item.source}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Photo Upload Method */}
        {uploadMethod === 'photo' ? (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Front of supplement bottle/packet {editingIndex === null ? '*' : '(optional when editing)'}
              </label>
              {editingIndex !== null && (() => {
                const editingImages = parseImageValue(supplements[editingIndex]?.imageUrl);
                if (!editingImages.frontUrl) return null;
                return (
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                    <img
                      src={editingImages.frontUrl}
                      alt="Front"
                      className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                    />
                    <div className="flex w-full items-center justify-between text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Current image</span>
                      <button
                        type="button"
                        onClick={() => {
                          // Remove front image only
                          const updatedSupplements = supplements.map((item: any, index: number) => 
                            index === editingIndex
                              ? { ...item, imageUrl: buildImageValue(null, parseImageValue(item.imageUrl).backUrl) }
                              : item
                          );
                          setSupplements(updatedSupplements);
                        }}
                        className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                );
              })()}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFrontImage(file);
                    setUploadError(null);
                    // Validate image quality
                    if (file) {
                      validateImageQuality(file, 'front');
                    }
                  }}
                  className="hidden"
                  id="front-image"
                  required
                />
                <label
                  htmlFor="front-image"
                  className={`flex w-full min-h-36 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    frontImage ? 'border-green-500 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  {frontImage ? (
                    <div className="flex w-full flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      {frontPreviewUrl && (
                        <img
                          src={frontPreviewUrl}
                          alt="Front preview"
                          className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                        />
                      )}
                      <div className="flex w-full items-center gap-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1 text-green-700">
                          <span className="text-xl leading-none">✓</span>
                          <span className="font-medium">Selected</span>
                        </div>
                        <div className="truncate">{frontImage.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="m-auto text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
              {imageQualityWarning.front && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {imageQualityWarning.front}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Back of supplement bottle/packet {editingIndex === null ? '*' : '(optional when editing)'}
              </label>
              {editingIndex !== null && (() => {
                const editingImages = parseImageValue(supplements[editingIndex]?.imageUrl);
                if (!editingImages.backUrl) return null;
                return (
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                    <img
                      src={editingImages.backUrl}
                      alt="Back"
                      className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                    />
                    <div className="flex w-full items-center justify-between text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Current image</span>
                      <button
                        type="button"
                        onClick={() => {
                          // Remove back image only
                          const updatedSupplements = supplements.map((item: any, index: number) => 
                            index === editingIndex
                              ? { ...item, imageUrl: buildImageValue(parseImageValue(item.imageUrl).frontUrl, null) }
                              : item
                          );
                          setSupplements(updatedSupplements);
                        }}
                        className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                );
              })()}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setBackImage(file);
                    setUploadError(null);
                    // Validate image quality
                    if (file) {
                      validateImageQuality(file, 'back');
                    }
                  }}
                  className="hidden"
                  id="back-image"
                  required
                />
                <label
                  htmlFor="back-image"
                  className={`flex w-full min-h-36 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    backImage ? 'border-green-500 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  {backImage ? (
                    <div className="flex w-full flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      {backPreviewUrl && (
                        <img
                          src={backPreviewUrl}
                          alt="Back preview"
                          className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                        />
                      )}
                      <div className="flex w-full items-center gap-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1 text-green-700">
                          <span className="text-xl leading-none">✓</span>
                          <span className="font-medium">Selected</span>
                        </div>
                        <div className="truncate">{backImage.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="m-auto text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
              {imageQualityWarning.back && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {imageQualityWarning.back}
                </div>
              )}
            </div>

          </div>
        ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosage *
              </label>
              <div className="flex space-x-2">
                <input 
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                  type="text" 
                  inputMode="decimal"
                  step="any"
                  placeholder="e.g., 1000, 2.5" 
                  value={photoDosage} 
                  onChange={e => setPhotoDosage(e.target.value)} 
                />
                <select
                  value={photoDosageUnit}
                  onChange={e => setPhotoDosageUnit(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm"
                >
                  {dosageUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often do you take this supplement? *
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'daily'}
                    onChange={() => handleScheduleChange('daily', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-daily"
                  />
                  <label htmlFor="photo-daily" className="cursor-pointer">
                    <span className="text-gray-700">Every day</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'specific'}
                    onChange={() => handleScheduleChange('specific', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-specific"
                  />
                  <label htmlFor="photo-specific" className="cursor-pointer">
                    <span className="text-gray-700">Specific days only</span>
                  </label>
                </div>
                
                {photoDosageSchedule === 'specific' && (
                  <div className="ml-7 space-y-2">
                    <div className="text-sm text-gray-600 mb-2">Select the days you take this supplement:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {daysOfWeek.map(day => (
                        <div key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={photoSelectedDays.includes(day)}
                            onChange={() => toggleDay(day, true)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            id={`photo-day-${day}`}
                          />
                          <label htmlFor={`photo-day-${day}`} className="text-sm cursor-pointer">
                            {day.substring(0, 3)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this supplement? *
              </label>
              <div className="space-y-3">
                {timingOptions.map(time => (
                  <div key={time} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={photoTiming.includes(time)}
                      onChange={() => toggleTiming(time, true)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      id={timingId(time)}
                    />
                    <label htmlFor={timingId(time)} className="flex-1 cursor-pointer">
                      <span className="text-gray-700">{time}</span>
                    </label>
                    {photoTiming.includes(time) && (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          step="any"
                          placeholder="Amount"
                          value={photoTimingDosages[time] || ''}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                          onChange={(e) => {
                            setPhotoTimingDosages(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                        />
                        <select
                          value={photoTimingDosageUnits[time] || photoDosageUnit}
                          onChange={(e) => {
                            setPhotoTimingDosageUnits(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        >
                          {dosageUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tip for per-timing dosages */}
            <div className="flex items-start space-x-2 p-3 bg-amber-50 rounded-lg">
              <div className="text-amber-600 text-lg flex-shrink-0">💡</div>
              <div className="text-sm text-amber-800">
                <strong>Tip:</strong> If you split your supplement throughout the day, check multiple times and enter the specific dosage for each time.
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addSupplement}
              disabled={
                isUploadingImages ||
                (uploadMethod === 'manual'
                  ? (!formatManualName(name) || !photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0))
                  : (editingIndex !== null 
                    ? (!photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0))
                    : (!frontImage || !backImage || !photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0))
                  )
                )
              }
            >
              {isUploadingImages ? 'Uploading photos...' : (editingIndex !== null ? 'Update Supplement' : 'Add Supplement')}
            </button>
            {uploadError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="mb-2">{uploadError}</p>
                {(uploadError.includes('Free photo scans used up') || uploadError.includes('upgrade') || uploadError.includes('billing')) && (
                  <div className="flex gap-2 mt-3">
                    <a
                      href="/billing"
                      className="flex-1 text-center text-xs font-medium text-white bg-helfi-green rounded px-3 py-2 hover:bg-helfi-green/90 transition-colors"
                    >
                      Upgrade Plan
                    </a>
                    <a
                      href="/billing"
                      className="flex-1 text-center text-xs font-medium text-red-800 bg-white border border-red-300 rounded px-3 py-2 hover:bg-red-50 transition-colors"
                    >
                      Buy Credits
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Added Supplements List */}
        {supplements.length > 0 && (
          <div className="mb-6" id="supplements-list">
            <h3 className="text-lg font-semibold mb-3">Added Supplements ({supplements.length})</h3>
            <div className="space-y-2">
              {supplements
                .sort((a: any, b: any) => new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime())
                .map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    {s.method === 'photo' ? (
                      <div>
                        <div className="font-medium">📷 {getDisplayName(s.name, 'Name missing (edit to re-upload)')}</div>
                        <div className="text-sm text-gray-600">
                          {(() => {
                            const parsedImages = parseImageValue(s.imageUrl);
                            if (parsedImages.frontUrl && parsedImages.backUrl) return 'Photos: Front + Back';
                            if (parsedImages.frontUrl) return 'Photos: Front only';
                            return 'Photos: Not saved';
                          })()}
                        </div>
                        <div className="text-sm text-gray-600">{s.dosage} - {Array.isArray(s.timing) ? s.timing.join(', ') : s.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {s.scheduleInfo}</div>
                        {s.dateAdded && (
                          <div className="text-xs text-blue-600 font-medium">
                            Added: {new Date(s.dateAdded).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{getDisplayName(s.name, 'Name missing (edit to re-upload)')}</div>
                        <div className="text-sm text-gray-600">{s.dosage} - {Array.isArray(s.timing) ? s.timing.join(', ') : s.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {s.scheduleInfo}</div>
                        {s.dateAdded && (
                          <div className="text-xs text-blue-600 font-medium">
                            Added: {new Date(s.dateAdded).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative dropdown-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDropdown(showDropdown === i ? null : i);
                      }}
                      className="text-gray-500 hover:text-gray-700 p-1 transition-colors"
                      title="Options"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    {showDropdown === i && (
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            editSupplement(i);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSupplement(i);
                            setShowDropdown(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Guidance Preview */}
        {supplements.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="text-blue-600 text-xl">🤖</div>
              <div className="flex-1">
                <div className="font-medium text-blue-900">AI Analysis Ready</div>
                <div className="text-sm text-blue-700">
                  We'll analyze your supplements for interactions, optimal timing, and missing nutrients.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual Update Insights Button - Show if there are unsaved changes */}
        {!AUTO_UPDATE_INSIGHTS_ON_EXIT && hasUnsavedChanges && supplements.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-yellow-900 mb-1">Update Insights</div>
                <div className="text-sm text-yellow-700">
                  You've added supplements that haven't been analyzed yet. Click below to update your insights.
                </div>
              </div>
              <button
                onClick={() => setShowUpdatePopup(true)}
                disabled={isGeneratingInsights}
                className="ml-4 px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed font-medium text-sm whitespace-nowrap"
              >
                {isGeneratingInsights ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                    Updating...
                  </>
                ) : (
                  'Update Insights'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <button 
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={handleBack}
          >
            Back
          </button>
          <button 
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors" 
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      
      {/* Update Insights Popup */}
      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          // When "Add More" is clicked, just close the popup
          setShowUpdatePopup(false);
        }}
        onAddMore={() => {
          acknowledgeUnsavedChanges();
          setShowUpdatePopup(false);
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
    </div>
  );
}

function MedicationsStep({ onNext, onBack, initial, onNavigateToAnalysis, onRequestAnalysis, onPartialSave }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onNavigateToAnalysis?: (data?: any) => void, onRequestAnalysis?: () => void, onPartialSave?: (data: any) => void }) {
  const [medications, setMedications] = useState(initial?.medications || []);
  
  // Fix data loading race condition - update medications when initial data loads
  useEffect(() => {
    if (!initial?.medications) return;
    setMedications((prev: any[]) => {
      const next = dedupeItems(initial.medications);
      if (!Array.isArray(prev) || prev.length === 0) return next;
      if (next.length < prev.length) return prev;
      if (!areItemsEquivalent(prev, next)) return next;
      return prev;
    });
  }, [initial?.medications]);

  useEffect(() => {
    if (!onPartialSave) return;
    onPartialSave({ medications });
  }, [medications, onPartialSave]);
  
  const [name, setName] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<{ name: string; source: string }[]>([]);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameSearchTimerRef = useRef<any>(null);
  const [dosage, setDosage] = useState('');
  const [dosageUnit, setDosageUnit] = useState('mg');
  const [timing, setTiming] = useState<string[]>([]);
  const [timingDosages, setTimingDosages] = useState<{[key: string]: string}>({});
  const [timingDosageUnits, setTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'manual' | 'photo'>('photo');
  
  useEffect(() => {
    if (!frontImage) {
      setFrontPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(frontImage);
    setFrontPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [frontImage]);

  useEffect(() => {
    if (!backImage) {
      setBackPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(backImage);
    setBackPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [backImage]);

  // New dosing schedule states
  const [dosageSchedule, setDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  
  // For photo upload method
  const [photoDosage, setPhotoDosage] = useState('');
  const [photoDosageUnit, setPhotoDosageUnit] = useState('mg');
  const [photoTiming, setPhotoTiming] = useState<string[]>([]);
  const [photoTimingDosages, setPhotoTimingDosages] = useState<{[key: string]: string}>({});
  const [photoTimingDosageUnits, setPhotoTimingDosageUnits] = useState<{[key: string]: string}>({});
  const [photoDosageSchedule, setPhotoDosageSchedule] = useState<'daily' | 'specific'>('daily');
  const [photoSelectedDays, setPhotoSelectedDays] = useState<string[]>([]);
  
  // Edit functionality states
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState<number | null>(null);
  
  // Update insights popup state
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [hasExistingAnalysis, setHasExistingAnalysis] = useState(false);
  const [medicationsToSave, setMedicationsToSave] = useState<any[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageQualityWarning, setImageQualityWarning] = useState<{front?: string, back?: string}>({});
  const { shouldBlockNavigation, allowUnsavedNavigation, acknowledgeUnsavedChanges, requestNavigation, beforeUnloadHandler } = useUnsavedNavigationAllowance(hasUnsavedChanges);

  useEffect(() => {
    if (uploadMethod !== 'manual') {
      setNameSuggestions([]);
      setNameLoading(false);
      setNameError(null);
      return;
    }
    if (nameSearchTimerRef.current) {
      clearTimeout(nameSearchTimerRef.current);
    }
    const query = name.trim();
    if (query.length < 2) {
      setNameSuggestions([]);
      setNameLoading(false);
      setNameError(null);
      return;
    }
    nameSearchTimerRef.current = setTimeout(async () => {
      try {
        setNameLoading(true);
        setNameError(null);
        let suggestions: { name: string; source: string }[] = [];
        
        // First try catalog search (user-uploaded medications)
        let catalogSuggestions: { name: string; source: string }[] = [];
        try {
          const catalogResponse = await fetch(`/api/medication-catalog-search?q=${encodeURIComponent(query)}`);
          if (catalogResponse.ok) {
            const catalogData = await catalogResponse.json().catch(() => ({}));
            if (Array.isArray(catalogData?.results)) {
              catalogSuggestions = catalogData.results;
            }
          }
        } catch (catalogError) {
          console.warn('Catalog search failed:', catalogError);
        }
        
        // Then try external medication search API
        try {
          const response = await fetch(`/api/medication-search?q=${encodeURIComponent(query)}`);
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            const externalResults = Array.isArray(data?.results) ? data.results : [];
            suggestions = [...catalogSuggestions, ...externalResults];
          } else if (catalogSuggestions.length > 0) {
            suggestions = catalogSuggestions;
          }
        } catch (error) {
          console.warn('External medication search failed:', error);
          if (catalogSuggestions.length > 0) {
            suggestions = catalogSuggestions;
          }
        }
        
        // Dedupe suggestions
        const seen = new Set<string>();
        const deduped = suggestions.filter((item) => {
          const key = item.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        setNameSuggestions(deduped);
      } catch (error) {
        console.error('Medication search failed:', error);
        setNameError('Search failed. Please try again.');
      } finally {
        setNameLoading(false);
      }
    }, 300);
    return () => {
      if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);
    };
  }, [name, uploadMethod]);
  
  const prevMedEditingIndexRef = useRef<number | null>(null);
  // Populate form fields when editing starts
  useEffect(() => {
    const prevEditingIndex = prevMedEditingIndexRef.current;
    const editingChanged = prevEditingIndex !== editingIndex;
    prevMedEditingIndexRef.current = editingIndex;
    if (editingIndex !== null && editingIndex >= 0 && editingIndex < medications.length) {
      const medication = medications[editingIndex];
      if (!medication) {
        console.warn('Medication not found at index:', editingIndex);
        return;
      }
      
      console.log('Populating form for edit:', medication);
      
      // Clear any existing form state first
      setFrontImage(null);
      setBackImage(null);
      const isManualItem = medication.method === 'manual' || !medication.imageUrl;
      setUploadMethod(isManualItem ? 'manual' : 'photo');
      if (isManualItem) {
        setName(medication.name || '');
        setNameSuggestions([]);
        setNameError(null);
      } else {
        setName('');
        setNameSuggestions([]);
        setNameError(null);
      }
      
      const dosageStr = medication.dosage || '';
      const dosageParts = dosageStr.split(' ');
      const baseDosage = dosageParts[0] || '';
      const baseUnit = dosageParts.length > 1 ? dosageParts[1] : 'mg';
      
      setPhotoDosage(baseDosage);
      setPhotoDosageUnit(baseUnit);
      
      const timingArray: string[] = [];
      const timingDosagesObj: {[key: string]: string} = {};
      const timingDosageUnitsObj: {[key: string]: string} = {};
      
      if (Array.isArray(medication.timing) && medication.timing.length > 0) {
        medication.timing.forEach((timingStr: string) => {
          if (typeof timingStr !== 'string') {
            timingStr = String(timingStr);
          }
          
          if (timingStr.includes(':')) {
            const parts = timingStr.split(':');
            if (parts.length >= 2) {
              const timeName = parts[0].trim();
              const dosagePart = parts[1].trim();
              timingArray.push(timeName);
              
              const dp = dosagePart.split(' ');
              if (dp.length >= 2) {
                timingDosagesObj[timeName] = dp[0];
                timingDosageUnitsObj[timeName] = dp[1];
              } else if (dp.length === 1 && dp[0]) {
                timingDosagesObj[timeName] = dp[0];
                timingDosageUnitsObj[timeName] = baseUnit;
              }
            }
          } else {
            const timeName = timingStr.trim();
            if (timeName) {
              timingArray.push(timeName);
              timingDosagesObj[timeName] = baseDosage;
              timingDosageUnitsObj[timeName] = baseUnit;
            }
          }
        });
      }
      
      setPhotoTiming(timingArray);
      setPhotoTimingDosages(timingDosagesObj);
      setPhotoTimingDosageUnits(timingDosageUnitsObj);
      
      const scheduleInfo = medication.scheduleInfo || 'Daily';
      setPhotoDosageSchedule(scheduleInfo === 'Daily' ? 'daily' : 'specific');
      if (scheduleInfo !== 'Daily' && scheduleInfo) {
        setPhotoSelectedDays(scheduleInfo.split(', ').filter(Boolean));
      } else {
        setPhotoSelectedDays([]);
      }
    } else if (editingChanged && editingIndex === null && prevEditingIndex !== null) {
      // Only clear form when transitioning from editing to not editing (not when medications change)
      clearMedPhotoForm();
      clearMedForm();
    }
  }, [editingIndex]); // Removed medications from dependencies to prevent form clearing when adding new medications

  // Validate image quality
  const validateImageQuality = async (file: File, type: 'front' | 'back') => {
    return new Promise<void>((resolve) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // Check image dimensions (minimum 800x600 for clarity)
        const minWidth = 800;
        const minHeight = 600;
        
        // Check file size (too small might indicate poor quality)
        const minSize = 50 * 1024; // 50KB minimum
        
        let warning = '';
        
        if (img.width < minWidth || img.height < minHeight) {
          warning = `Image resolution is low (${img.width}x${img.height}). Please take a clearer photo with better lighting.`;
        } else if (file.size < minSize) {
          warning = 'Image file size is very small. Please ensure the photo is clear and well-lit.';
        }
        
        if (warning) {
          setImageQualityWarning(prev => ({ ...prev, [type]: warning }));
        } else {
          setImageQualityWarning(prev => {
            const updated = { ...prev };
            delete updated[type];
            return updated;
          });
        }
        
        resolve();
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setImageQualityWarning(prev => ({ ...prev, [type]: 'Unable to load image. Please try again.' }));
        resolve();
      };
      
      img.src = url;
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Only close if click is outside dropdown container
      if (!target.closest('.dropdown-container')) {
        setShowDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Prevent browser navigation when there are unsaved changes
  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [beforeUnloadHandler]);

  // Check for existing interaction analysis
  useEffect(() => {
    const checkExistingAnalysis = async () => {
      try {
        const response = await fetch('/api/interaction-history');
        if (response.ok) {
          const data = await response.json();
          const analyses = data.analyses || [];
          setHasExistingAnalysis(analyses.length > 0);
        }
      } catch (error) {
        console.error('Error checking existing analysis:', error);
      }
    };
    checkExistingAnalysis();
  }, []);

  const handleUploadMethodChange = (method: 'manual' | 'photo') => {
    setUploadMethod(method);
    setUploadError(null);
    if (method === 'manual') {
      setName('');
      setNameSuggestions([]);
      setNameError(null);
      setFrontImage(null);
      setBackImage(null);
      setPhotoDosage('');
      setPhotoDosageUnit('mg');
      setPhotoTiming([]);
      setPhotoTimingDosages({});
      setPhotoTimingDosageUnits({});
      setPhotoDosageSchedule('daily');
      setPhotoSelectedDays([]);
    } else {
      setName('');
      setNameSuggestions([]);
      setNameError(null);
      setDosage('');
      setDosageUnit('mg');
      setTiming([]);
      setTimingDosages({});
      setTimingDosageUnits({});
      setDosageSchedule('daily');
      setSelectedDays([]);
    }
  };

  const timingOptions = ['Morning', 'Afternoon', 'Evening', 'Before Bed'];
  const dosageUnits = ['mg', 'mcg', 'g', 'IU', 'capsules', 'tablets', 'drops', 'ml', 'tsp', 'tbsp'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const toggleTiming = (time: string, isPhoto: boolean = false) => {
    const currentTiming = isPhoto ? photoTiming : timing;
    const setCurrentTiming = isPhoto ? setPhotoTiming : setTiming;
    
    setCurrentTiming(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const toggleDay = (day: string, isPhoto: boolean = false) => {
    const currentDays = isPhoto ? photoSelectedDays : selectedDays;
    const setCurrentDays = isPhoto ? setPhotoSelectedDays : setSelectedDays;
    
    setCurrentDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleScheduleChange = (schedule: 'daily' | 'specific', isPhoto: boolean = false) => {
    if (isPhoto) {
      setPhotoDosageSchedule(schedule);
      if (schedule === 'daily') {
        setPhotoSelectedDays([]);
      }
    } else {
      setDosageSchedule(schedule);
      if (schedule === 'daily') {
        setSelectedDays([]);
      }
    }
  };

  const uploadMedicationImage = async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/api/upload-medication-image', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error || 'Upload failed');
    }
    const data = await response.json().catch(() => ({}));
    if (!data?.imageUrl) {
      throw new Error('Upload failed');
    }
    return data.imageUrl as string;
  };

  const addMedication = async () => {
    const currentDate = new Date().toISOString();
    const isEditing = editingIndex !== null;
    const existingImages = isEditing ? parseImageValue(medications[editingIndex]?.imageUrl) : { frontUrl: null, backUrl: null };
    const isManual = uploadMethod === 'manual';
    const formattedManualName = formatManualName(name);
    setUploadError(null);
    
    // For new medications, require both images. For editing, images are optional.
    const hasRequiredData = isEditing 
      ? (photoDosage && photoTiming.length > 0 && (photoDosageSchedule === 'specific' ? photoSelectedDays.length > 0 : true) && (isManual ? formattedManualName.length > 0 : true))
      : isManual
        ? (formattedManualName && photoDosage && photoTiming.length > 0 && (photoDosageSchedule === 'specific' ? photoSelectedDays.length > 0 : true))
        : (frontImage && backImage && photoDosage && photoTiming.length > 0 && (photoDosageSchedule === 'specific' ? photoSelectedDays.length > 0 : true));
    
    if (hasRequiredData) {
      setIsUploadingImages(true);
      // Combine timing and individual dosages with units for photos
      const timingWithDosages = photoTiming.map(time => {
        const timeSpecificDosage = photoTimingDosages[time];
        const timeSpecificUnit = photoTimingDosageUnits[time] || photoDosageUnit;
        return timeSpecificDosage 
          ? `${time}: ${timeSpecificDosage} ${timeSpecificUnit}` 
          : `${time}: ${photoDosage} ${photoDosageUnit}`;
      });
      
      const scheduleInfo = photoDosageSchedule === 'daily' ? 'Daily' : photoSelectedDays.join(', ');
      
      if (isManual) {
        const finalName = formattedManualName;
        if (!finalName) {
          setUploadError('Please enter the brand + product name.');
          setIsUploadingImages(false);
          return;
        }
        const medicationData = { 
          id: isEditing ? medications[editingIndex].id : Date.now().toString(),
          imageUrl: null,
          method: 'manual',
          name: finalName,
          dosage: `${photoDosage} ${photoDosageUnit}`,
          timing: timingWithDosages,
          scheduleInfo: scheduleInfo,
          dateAdded: isEditing ? medications[editingIndex].dateAdded : currentDate
        };

        if (editingIndex !== null) {
          const updatedMedications = dedupeItems(medications.map((item: any, index: number) => 
            index === editingIndex ? medicationData : item
          ));
          setMedications(updatedMedications);
          setMedicationsToSave(updatedMedications);
          setEditingIndex(null);
          
          try {
            const response = await fetch('/api/user-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sanitizeUserDataPayload({ medications: updatedMedications }))
            });
            if (response.ok) {
              setHasUnsavedChanges(true);
            } else {
              console.error('Failed to save medication edit');
            }
          } catch (error) {
            console.error('Error saving medication edit:', error);
          }
        } else {
          setMedications((prev: any[]) => {
            const updatedMedications = dedupeItems([...prev, medicationData]);
            setMedicationsToSave(updatedMedications);
            setHasUnsavedChanges(true);
            return updatedMedications;
          });
        }

        clearMedForm();
        setUploadError(null);
        setIsUploadingImages(false);
        return;
      }

      // Only analyze image if it's a new medication or if new images are provided
      let medicationName = isEditing ? medications[editingIndex].name : 'Unknown Medication';
      let frontUrl = existingImages.frontUrl;
      let backUrl = existingImages.backUrl;

      const frontForUpload = frontImage ? await compressImageFile(frontImage) : null;
      const backForUpload = backImage ? await compressImageFile(backImage) : null;
      const scanId = `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (!isEditing || (frontForUpload && backForUpload)) {
        if (frontForUpload) {
          try {
            const result = await analyzeLabelName(frontForUpload, { scanType: 'medication', scanId })
            if (result) medicationName = result
          } catch (error) {
            console.error('Error analyzing medication image:', error)
            setUploadError(error instanceof Error ? error.message : 'Name scan failed. Please try again.')
            setIsUploadingImages(false)
            return
          }
        }
        if (isPlaceholderName(medicationName) && backForUpload) {
          try {
            const result = await analyzeLabelName(backForUpload, { scanType: 'medication', scanId })
            if (result) medicationName = result
          } catch (error) {
            console.error('Error analyzing medication image (back):', error)
          }
        }
      }

      if (isPlaceholderName(medicationName)) {
        setUploadError('We could not read the brand + medication name. Please take a clearer front label photo.');
        setIsUploadingImages(false);
        return;
      }

      try {
        if (frontForUpload && backForUpload) {
          const [frontUploaded, backUploaded] = await Promise.all([
            uploadMedicationImage(frontForUpload),
            uploadMedicationImage(backForUpload),
          ]);
          frontUrl = frontUploaded;
          backUrl = backUploaded;
        } else {
          if (frontForUpload) {
            frontUrl = await uploadMedicationImage(frontForUpload);
          }
          if (backForUpload) {
            backUrl = await uploadMedicationImage(backForUpload);
          }
        }
      } catch (error) {
        console.error('Error uploading medication images:', error);
        setUploadError(error instanceof Error ? error.message : 'Photo upload failed. Please try again.');
        setIsUploadingImages(false);
        return;
      }

      const imageUrl = buildImageValue(frontUrl, backUrl);
      const medicationData = { 
        id: isEditing ? medications[editingIndex].id : Date.now().toString(),
        imageUrl: imageUrl,
        method: 'photo',
        name: medicationName,
        dosage: `${photoDosage} ${photoDosageUnit}`,
        timing: timingWithDosages,
        scheduleInfo: scheduleInfo,
        dateAdded: isEditing ? medications[editingIndex].dateAdded : currentDate
      };
      
      if (editingIndex !== null) {
        // Update existing medication - show popup after saving
        const updatedMedications = dedupeItems(medications.map((item: any, index: number) => 
          index === editingIndex ? medicationData : item
        ));
        setMedications(updatedMedications);
        setMedicationsToSave(updatedMedications);
        setEditingIndex(null);
        
        // Save immediately and then show popup
        try {
          const response = await fetch('/api/user-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sanitizeUserDataPayload({ medications: updatedMedications }))
          });
          if (response.ok) {
            // After successful save, flag unsaved changes for navigation prompts
            setHasUnsavedChanges(true);
          } else {
            console.error('Failed to save medication edit');
          }
        } catch (error) {
          console.error('Error saving medication edit:', error);
        }
      } else {
        // Add new medication - defer popup until navigation
        setMedications((prev: any[]) => {
          const updatedMedications = dedupeItems([...prev, medicationData]);
          setMedicationsToSave(updatedMedications);
          // Mark as having unsaved changes for future prompts
          setHasUnsavedChanges(true);
          return updatedMedications;
        });
      }
      
      clearMedPhotoForm();
      setUploadError(null);
      setIsUploadingImages(false);
    }
  };
  
  // Handle Update Insights button click
  const handleUpdateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      // Save medications to database
      // Step 1: Save medications immediately
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserDataPayload({ medications: medicationsToSave }))
      });
      
      if (response.ok) {
        // Data saved successfully - update local state
        setMedications(medicationsToSave);
        setHasUnsavedChanges(false);
        
        // Step 2: Fire regen in background WITHOUT waiting
        fireAndForgetInsightsRegen(['medications']);
        
        // Step 3: Close popup immediately
        setShowUpdatePopup(false);
      } else {
        alert('Failed to save your changes. Please try again.');
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save your changes. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };
  
  // Handle navigation with unsaved changes check
  const triggerPopup = () => {
    if (!showUpdatePopup) {
      setShowUpdatePopup(true);
    }
  };

  const handleNext = () => {
    requestNavigation(() => {
      if (onRequestAnalysis) {
        onRequestAnalysis();
      }
      onNext({ medications: medicationsToSave && medicationsToSave.length ? medicationsToSave : medications });
    }, triggerPopup);
  };
  
  const handleBack = () => {
    requestNavigation(onBack, triggerPopup);
  };

  const clearMedForm = () => {
    setName(''); 
    setNameSuggestions([]);
    setNameError(null);
    setDosage(''); 
    setDosageUnit('mg');
    setTiming([]); 
    setTimingDosages({});
    setTimingDosageUnits({});
    setDosageSchedule('daily');
    setSelectedDays([]);
  };

  const clearMedPhotoForm = () => {
    setFrontImage(null); 
    setBackImage(null); 
    setFrontPreviewUrl(null);
    setBackPreviewUrl(null);
    setPhotoDosage(''); 
    setPhotoDosageUnit('mg');
    setPhotoTiming([]); 
    setPhotoTimingDosages({});
    setPhotoTimingDosageUnits({});
    setPhotoDosageSchedule('daily');
    setPhotoSelectedDays([]);
    setUploadError(null);
    setIsUploadingImages(false);
  };

  const editMedication = (index: number) => {
    const medication = medications[index];
    if (!medication) {
      console.error('Medication not found at index:', index);
      return;
    }
    
    console.log('Editing medication:', medication);
    
    setEditingIndex(index);
    setShowDropdown(null);
    
    // Form fields will be populated by useEffect when editingIndex changes
    // Scroll to form when editing
    setTimeout(() => {
      const formElement = document.querySelector('.max-w-md.mx-auto');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const removeMedication = async (index: number) => {
    const updatedMedications = dedupeItems(medications.filter((_: any, i: number) => i !== index));
    setMedications(updatedMedications);
    
    // Store updated medications for potential update action
    setMedicationsToSave(updatedMedications);
    
    // Mark as having unsaved changes (prompt will show on navigation)
    setHasUnsavedChanges(true);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold mb-4">Add your medications</h2>
        {editingIndex !== null && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="text-blue-900 font-medium">Editing: {medications[editingIndex]?.name || 'Medication'}</span>
              <button
                onClick={() => {
                  setEditingIndex(null);
                  clearMedPhotoForm();
                  clearMedForm();
                  setUploadMethod('photo');
                }}
                className="ml-auto text-blue-600 hover:text-blue-800 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <p className="mb-6 text-gray-600">Upload photos of both the front and back of your medication bottles/packets, or type the brand + product name.</p>

        <div className="mb-4">
          <div className="flex w-full rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => handleUploadMethodChange('photo')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${uploadMethod === 'photo' ? 'bg-helfi-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Use photos
            </button>
            <button
              type="button"
              onClick={() => handleUploadMethodChange('manual')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${uploadMethod === 'manual' ? 'bg-helfi-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Type name
            </button>
          </div>
        </div>

        {uploadMethod === 'manual' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Brand + product name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setUploadError(null);
              }}
              onBlur={() => setName(formatManualName(name))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-helfi-green"
              placeholder="e.g., Zoloft (Sertraline)"
            />
            <div className="mt-1 text-xs text-gray-500">We’ll auto‑capitalize and clean formatting.</div>
            {nameLoading && (
              <div className="mt-2 text-xs text-gray-500">Searching…</div>
            )}
            {nameError && (
              <div className="mt-2 text-xs text-red-600">{nameError}</div>
            )}
            {nameSuggestions.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-56 overflow-y-auto">
                {nameSuggestions.map((item, idx) => (
                  <button
                    key={`${item.name}-${idx}`}
                    type="button"
                    onClick={() => {
                      setName(formatManualName(item.name));
                      setNameSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-gray-400 uppercase">{item.source}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Photo Upload Method */}
        {uploadMethod === 'photo' && (
        <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Front of medication bottle/packet {editingIndex === null ? '*' : '(optional when editing)'}
              </label>
              {editingIndex !== null && (() => {
                const editingImages = parseImageValue(medications[editingIndex]?.imageUrl);
                if (!editingImages.frontUrl) return null;
                return (
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                    <img
                      src={editingImages.frontUrl}
                      alt="Front"
                      className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                    />
                    <div className="flex w-full items-center justify-between text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Current image</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updatedMedications = medications.map((item: any, index: number) => 
                            index === editingIndex
                              ? { ...item, imageUrl: buildImageValue(null, parseImageValue(item.imageUrl).backUrl) }
                              : item
                          );
                          setMedications(updatedMedications);
                        }}
                        className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                );
              })()}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFrontImage(file);
                    setUploadError(null);
                    // Validate image quality
                    if (file) {
                      validateImageQuality(file, 'front');
                    }
                  }}
                  className="hidden"
                  id="med-front-image"
                  required
                />
                <label
                  htmlFor="med-front-image"
                  className={`flex w-full min-h-36 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    frontImage ? 'border-green-500 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  {frontImage ? (
                    <div className="flex w-full flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      {frontPreviewUrl && (
                        <img
                          src={frontPreviewUrl}
                          alt="Front preview"
                          className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                        />
                      )}
                      <div className="flex w-full items-center gap-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1 text-green-700">
                          <span className="text-xl leading-none">✓</span>
                          <span className="font-medium">Selected</span>
                        </div>
                        <div className="truncate">{frontImage.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="m-auto text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
              {imageQualityWarning.front && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {imageQualityWarning.front}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Back of medication bottle/packet {editingIndex === null ? '*' : '(optional when editing)'}
              </label>
              {editingIndex !== null && (() => {
                const editingImages = parseImageValue(medications[editingIndex]?.imageUrl);
                if (!editingImages.backUrl) return null;
                return (
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                    <img
                      src={editingImages.backUrl}
                      alt="Back"
                      className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                    />
                    <div className="flex w-full items-center justify-between text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Current image</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updatedMedications = medications.map((item: any, index: number) => 
                            index === editingIndex
                              ? { ...item, imageUrl: buildImageValue(parseImageValue(item.imageUrl).frontUrl, null) }
                              : item
                          );
                          setMedications(updatedMedications);
                        }}
                        className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                );
              })()}
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setBackImage(file);
                    setUploadError(null);
                    // Validate image quality
                    if (file) {
                      validateImageQuality(file, 'back');
                    }
                  }}
                  className="hidden"
                  id="med-back-image"
                  required
                />
                <label
                  htmlFor="med-back-image"
                  className={`flex w-full min-h-36 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    backImage ? 'border-green-500 bg-green-50' : 'border-gray-300'
                  }`}
                >
                  {backImage ? (
                    <div className="flex w-full flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      {backPreviewUrl && (
                        <img
                          src={backPreviewUrl}
                          alt="Back preview"
                          className="h-36 w-full rounded-lg border border-gray-200 object-contain sm:h-36 sm:w-56"
                        />
                      )}
                      <div className="flex w-full items-center gap-1 text-sm text-gray-600">
                        <div className="flex items-center gap-1 text-green-700">
                          <span className="text-xl leading-none">✓</span>
                          <span className="font-medium">Selected</span>
                        </div>
                        <div className="truncate">{backImage.name}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="m-auto text-center">
                      <div className="text-gray-400 text-2xl mb-1">📷</div>
                      <div className="text-sm text-gray-600">Tap to take photo</div>
                    </div>
                  )}
                </label>
              </div>
              {imageQualityWarning.back && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {imageQualityWarning.back}
                </div>
              )}
            </div>

        </div>
        )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dosage *
              </label>
              <div className="flex space-x-2">
                <input 
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500" 
                  type="text" 
                  inputMode="decimal"
                  step="any"
                  placeholder="e.g., 10, 1.5" 
                  value={photoDosage} 
                  onChange={e => setPhotoDosage(e.target.value)} 
                />
                <select
                  value={photoDosageUnit}
                  onChange={e => setPhotoDosageUnit(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm"
                >
                  {dosageUnits.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often do you take this medication? *
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'daily'}
                    onChange={() => handleScheduleChange('daily', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-med-daily"
                  />
                  <label htmlFor="photo-med-daily" className="cursor-pointer">
                    <span className="text-gray-700">Every day</span>
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    checked={photoDosageSchedule === 'specific'}
                    onChange={() => handleScheduleChange('specific', true)}
                    className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500 focus:ring-2"
                    id="photo-med-specific"
                  />
                  <label htmlFor="photo-med-specific" className="cursor-pointer">
                    <span className="text-gray-700">Specific days only</span>
                  </label>
                </div>
                
                {photoDosageSchedule === 'specific' && (
                  <div className="ml-7 space-y-2">
                    <div className="text-sm text-gray-600 mb-2">Select the days you take this medication:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {daysOfWeek.map(day => (
                        <div key={day} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={photoSelectedDays.includes(day)}
                            onChange={() => toggleDay(day, true)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                            id={`photo-med-day-${day}`}
                          />
                          <label htmlFor={`photo-med-day-${day}`} className="text-sm cursor-pointer">
                            {day.substring(0, 3)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When do you take this medication? *
              </label>
              <div className="space-y-3">
                {timingOptions.map(time => (
                  <div key={time} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={photoTiming.includes(time)}
                      onChange={() => toggleTiming(time, true)}
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
                      id={`med-photo-timing-${time.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <label htmlFor={`med-photo-timing-${time.toLowerCase().replace(/\s+/g, '-')}`} className="flex-1 cursor-pointer">
                      <span className="text-gray-700">{time}</span>
                    </label>
                    {photoTiming.includes(time) && (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          step="any"
                          placeholder="Amount"
                          value={photoTimingDosages[time] || ''}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                          onChange={(e) => {
                            setPhotoTimingDosages(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                        />
                        <select
                          value={photoTimingDosageUnits[time] || photoDosageUnit}
                          onChange={(e) => {
                            setPhotoTimingDosageUnits(prev => ({
                              ...prev,
                              [time]: e.target.value
                            }));
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-base focus:border-green-500 focus:ring-1 focus:ring-green-500"
                        >
                          {dosageUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                💡 Tip: If you split your medication throughout the day, 
                check multiple times and enter the specific dosage for each time.
              </div>
            </div>

            <button 
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
              onClick={addMedication}
              disabled={
                isUploadingImages ||
                (uploadMethod === 'manual'
                  ? (!formatManualName(name) || !photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0))
                  : (editingIndex !== null 
                    ? (!photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0))
                    : (!frontImage || !backImage || !photoDosage || photoTiming.length === 0 || (photoDosageSchedule === 'specific' && photoSelectedDays.length === 0))
                  )
                )
              }
            >
              {isUploadingImages ? 'Uploading photos...' : (editingIndex !== null ? 'Update Medication' : 'Add Medication')}
            </button>
            {uploadError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="mb-2">{uploadError}</p>
                {(uploadError.includes('Free photo scans used up') || uploadError.includes('upgrade') || uploadError.includes('billing')) && (
                  <div className="flex gap-2 mt-3">
                    <a
                      href="/billing"
                      className="flex-1 text-center text-xs font-medium text-white bg-helfi-green rounded px-3 py-2 hover:bg-helfi-green/90 transition-colors"
                    >
                      Upgrade Plan
                    </a>
                    <a
                      href="/billing"
                      className="flex-1 text-center text-xs font-medium text-red-800 bg-white border border-red-300 rounded px-3 py-2 hover:bg-red-50 transition-colors"
                    >
                      Buy Credits
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Added Medications List */}
        {medications.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Added Medications ({medications.length})</h3>
            <div className="space-y-2">
              {medications
                .sort((a: any, b: any) => new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime())
                .map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    {m.method === 'photo' ? (
                      <div>
                        <div className="font-medium">💊 {getDisplayName(m.name, 'Name missing (edit to re-upload)')}</div>
                        <div className="text-sm text-gray-600">
                          {(() => {
                            const parsedImages = parseImageValue(m.imageUrl);
                            if (parsedImages.frontUrl && parsedImages.backUrl) return 'Photos: Front + Back';
                            if (parsedImages.frontUrl) return 'Photos: Front only';
                            return 'Photos: Not saved';
                          })()}
                        </div>
                        <div className="text-sm text-gray-600">{m.dosage} - {Array.isArray(m.timing) ? m.timing.join(', ') : m.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {m.scheduleInfo}</div>
                        {m.dateAdded && (
                          <div className="text-xs text-blue-600 font-medium">
                            Added: {new Date(m.dateAdded).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{getDisplayName(m.name, 'Name missing (edit to re-upload)')}</div>
                        <div className="text-sm text-gray-600">{m.dosage} - {Array.isArray(m.timing) ? m.timing.join(', ') : m.timing}</div>
                        <div className="text-xs text-gray-500">Schedule: {m.scheduleInfo}</div>
                        {m.dateAdded && (
                          <div className="text-xs text-blue-600 font-medium">
                            Added: {new Date(m.dateAdded).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative dropdown-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDropdown(showDropdown === i ? null : i);
                      }}
                      className="text-gray-500 hover:text-gray-700 p-1 transition-colors"
                      title="Options"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    {showDropdown === i && (
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            editMedication(i);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMedication(i);
                            setShowDropdown(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Safety Notice */}
        {medications.length > 0 && (
          <div className="mb-6 p-4 bg-orange-50 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="text-orange-600 text-xl">⚠️</div>
              <div className="flex-1">
                <div className="font-medium text-orange-900">Important Safety Check</div>
                <div className="text-sm text-orange-700">
                  We'll analyze potential interactions between your medications and supplements.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual Update Insights Button - Show if there are unsaved changes */}
        {!AUTO_UPDATE_INSIGHTS_ON_EXIT && hasUnsavedChanges && medications.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-yellow-900 mb-1">Update Insights</div>
                <div className="text-sm text-yellow-700">
                  You've added medications that haven't been analyzed yet. Click below to update your insights.
                </div>
              </div>
              <button
                onClick={() => setShowUpdatePopup(true)}
                disabled={isGeneratingInsights}
                className="ml-4 px-4 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed font-medium text-sm whitespace-nowrap"
              >
                {isGeneratingInsights ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
                    Updating...
                  </>
                ) : (
                  'Update Insights'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="space-y-3">
          <button 
            className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300" 
            onClick={handleNext}
            disabled={medications.length === 0}
          >
            Analyze for Interactions & Contradictions
          </button>
          <p className="text-center text-sm text-gray-500">
            Uses AI credits (2× model cost). Typical total: 6–10 credits depending on your supplements/meds and recommendations.
          </p>
          <button 
            className="w-full border border-green-600 text-green-600 px-6 py-3 rounded-lg hover:bg-green-600 hover:text-white transition-colors" 
            onClick={handleBack}
          >
            Back
          </button>
        </div>
      
      {/* Update Insights Popup */}
      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          // When "Add More" is clicked, just close the popup
          setShowUpdatePopup(false);
        }}
        onAddMore={() => {
          acknowledgeUnsavedChanges();
          setShowUpdatePopup(false);
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
    </div>
  );
}

function BloodResultsStep({
  onNext,
  onBack,
  initial,
  onPartialSave,
}: {
  onNext: (data: any) => void
  onBack: () => void
  initial?: any
  onPartialSave?: (data: any) => void
}) {
  const [notes, setNotes] = useState(initial?.bloodResults?.notes || initial?.notes || '')
  const [skipped, setSkipped] = useState(initial?.bloodResults?.skipped || initial?.skipped || false)
  const [reports, setReports] = useState<Array<{ id: string; originalFileName: string; status: string; createdAt: string; processingError?: string | null }>>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUpdatePopup, setShowUpdatePopup] = useState(false)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const { requestNavigation, beforeUnloadHandler, acknowledgeUnsavedChanges } = useUnsavedNavigationAllowance(hasUnsavedChanges)

  const loadHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const res = await fetch('/api/reports/list')
      if (res.ok) {
        const data = await res.json()
        const nextReports = Array.isArray(data?.reports) ? data.reports : []
        setReports(nextReports)
        if (onPartialSave) {
          onPartialSave({
            bloodResults: {
              reportIds: nextReports.map((r: any) => r.id),
              notes: notes.trim(),
              skipped,
            },
          })
        }
      }
    } catch (error) {
      console.warn('Failed to load report history', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    const initialNotes = initial?.bloodResults?.notes || initial?.notes || ''
    const notesChanged = notes.trim() !== String(initialNotes || '').trim()
    setHasUnsavedChanges(notesChanged && !skipped)
    if (onPartialSave) {
      onPartialSave({
        bloodResults: {
          reportIds: reports.map((r) => r.id),
          notes: notes.trim(),
          skipped,
        },
      })
    }
  }, [notes, skipped, reports, onPartialSave, initial])

  useEffect(() => {
    window.addEventListener('beforeunload', beforeUnloadHandler)
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler)
  }, [beforeUnloadHandler])

  const handleUpdateInsights = async () => {
    setIsGeneratingInsights(true)
    try {
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sanitizeUserDataPayload({
            bloodResults: {
              reportIds: reports.map((r) => r.id),
              notes: notes.trim(),
              skipped: false,
            },
          })
        ),
      })

      if (response.ok) {
        setHasUnsavedChanges(false)
        fireAndForgetInsightsRegen(['blood_results'])
        setShowUpdatePopup(false)
      } else {
        alert('Failed to save your changes. Please try again.')
      }
    } catch (error) {
      console.error('Error saving data:', error)
      alert('Failed to save your changes. Please try again.')
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  const triggerPopup = () => {
    if (!showUpdatePopup) {
      setShowUpdatePopup(true)
    }
  }

  const handleNext = () => {
    requestNavigation(() => {
      onNext({
        bloodResults: {
          reportIds: reports.map((r) => r.id),
          notes: notes.trim(),
          skipped,
        },
      })
    }, triggerPopup)
  }

  const handleBack = () => {
    requestNavigation(onBack, triggerPopup)
  }

  const handleSkip = () => {
    requestNavigation(() => {
      setSkipped(true)
      onNext({ bloodResults: { skipped: true, reportIds: [], notes: '' } })
    }, triggerPopup)
  }

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Upload your recent blood results</h2>
          <button
            onClick={handleBack}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Optional but recommended:</strong> You can upload as many blood reports as you like. Each upload is saved below, so you can add new results any time.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <h3 className="font-semibold mb-2">How your blood results are kept safe</h3>
          <ul className="list-disc list-inside space-y-1 text-emerald-900">
            <li>Your report is stored in a locked format so only your account can read it.</li>
            <li>We never save your PDF password. It is used once to read the file and then discarded.</li>
            <li>By default, the original PDF is removed after we read it, unless you choose to keep it.</li>
          </ul>
          <div className="mt-3 text-emerald-900">
            <strong>Password‑protected PDFs:</strong> tick “My PDF is password‑protected”, enter the password, and then upload.
            If the password is wrong, the upload will stop and you can try again with the correct one.
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Add a new report (PDF)</h3>
          <p className="text-xs text-gray-600 mb-3">
            You can select multiple PDFs or photos (JPG/PNG) and we will combine them into one report. Every upload is saved to your history.
          </p>
          <LabReportUpload compact={true} onUploadComplete={() => loadHistory()} />
          {reports.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Want to add more? Use the upload box above and it will appear in the list below.
            </p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes about your blood results (optional)
          </label>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none"
            rows={3}
            placeholder="e.g., Date of test, doctor comments, or any concerns..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Previous reports{reports.length > 0 ? ` (${reports.length})` : ''}
          </h3>
          {isLoadingHistory ? (
            <div className="text-sm text-gray-500">Loading report history...</div>
          ) : reports.length === 0 ? (
            <div className="text-sm text-gray-500">No reports uploaded yet.</div>
          ) : (
            <div className="space-y-2">
              {reports.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{item.originalFileName || 'Lab report'}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(item.createdAt).toLocaleDateString()} • {item.status || 'PENDING'}
                    </div>
                    {item.processingError ? (
                      <div className="text-xs text-rose-600">Needs attention: {item.processingError}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button
            onClick={handleSkip}
            className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>

      <UpdateInsightsPopup
        isOpen={showUpdatePopup}
        onClose={() => {
          setShowUpdatePopup(false)
        }}
        onAddMore={() => {
          acknowledgeUnsavedChanges()
          setShowUpdatePopup(false)
        }}
        onUpdateInsights={handleUpdateInsights}
        isGenerating={isGeneratingInsights}
      />
    </div>
  )
}

function AIInsightsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const wantInsights = initial?.wantInsights || 'yes';
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Your 7-day health report</h2>
      <p className="mb-4 text-gray-600">
        Once you use Helfi for 7 days, we automatically generate a detailed health report in the background.
        You will get a notification when it is ready.
      </p>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 mb-6">
        To get the best report, try to use these features during the week: Food Diary, Mood Tracker, Daily Check-ins,
        Symptom Analyzer, and Health Setup updates.
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={() => onNext({ wantInsights })}>Continue</button>
      </div>
    </div>
  );
}

function ReviewStep({ onBack, data }: { onBack: () => void, data: any }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progressStage, setProgressStage] = useState<'idle' | 'saving' | 'redirecting'>('idle');

  const uniq = (items: any[] = []) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = JSON.stringify(item || {});
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleConfirmBegin = async () => {
    if (isProcessing) return; // Prevent double clicks
    
    setIsProcessing(true);
    setProgressStage('saving');
    setStatusText('Saving your latest answers...');
    
    try {
      // 🔍 PERFORMANCE MEASUREMENT START
      console.log('🚀 ONBOARDING COMPLETION PERFORMANCE TRACKING');
      console.time('⏱️ Total Onboarding Completion Time');
      console.time('⏱️ API Request Duration');
      const startTime = Date.now();
      
      console.log('📤 Starting onboarding data save to database...');
      console.log('📊 Data being saved:', {
        hasGender: !!data.gender,
        hasWeight: !!data.weight,
        hasHeight: !!data.height,
        hasGoals: !!data.goals?.length,
        hasSupplements: !!data.supplements?.length,
        hasMedications: !!data.medications?.length,
        hasHealthSituations: !!data.healthSituations,
        hasBloodResults: !!data.bloodResults,
        totalDataSize: JSON.stringify(data).length + ' characters'
      });
      const payload = sanitizeUserDataPayload(data)
      
      // Start the API request
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const apiDuration = Date.now() - startTime;
      console.timeEnd('⏱️ API Request Duration');
      console.log(`📈 API Response Details:`, {
        duration: apiDuration + 'ms',
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (response.ok) {
        console.log('✅ Onboarding data saved to database successfully');
        setProgressStage('redirecting');
        setStatusText('Finishing up and sending you to your dashboard...');
        await new Promise(resolve => setTimeout(resolve, 400));

        const redirectStart = Date.now();
        window.location.href = '/dashboard';
        
        // Note: This won't log because page will unload, but the timing will be captured in dashboard
        console.log('🏁 Redirect initiated in', Date.now() - redirectStart + 'ms');
      } else {
        console.timeEnd('⏱️ Total Onboarding Completion Time');
        console.error('❌ Failed to save onboarding data to database:', response.status, response.statusText);
        setIsProcessing(false);
        setProgressStage('idle');
        setStatusText('');
        alert('Failed to save your data. Please try again or contact support.');
      }
    } catch (error) {
      console.timeEnd('⏱️ Total Onboarding Completion Time');
      console.error('💥 Error saving onboarding data:', error);
      setIsProcessing(false);
      setProgressStage('idle');
      setStatusText('');
      alert('Failed to save your data. Please check your connection and try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Here's what we have so far</h2>
      <p className="mb-4 text-gray-600">Double-check your inputs before we take you to your dashboard.</p>
      
      <div className="mb-4 text-left">
        <div><b>Gender:</b> {data.gender}</div>
        <div><b>Weight:</b> {data.weight}</div>
        <div><b>Height:</b> {data.height}</div>
        <div><b>Body Type:</b> {data.bodyType}</div>
        <div><b>Exercise Frequency:</b> {data.exerciseFrequency}</div>
        <div><b>Exercise Types:</b> {(data.exerciseTypes || []).join(', ')}</div>
        <div><b>Health Goals:</b> {(data.goals || []).join(', ')}</div>
        {data.healthSituations && !data.healthSituations.skipped && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div><b>Health Situations:</b></div>
            {data.healthSituations.healthIssues && (
              <div className="ml-2 text-sm"><b>Current Issues:</b> {data.healthSituations.healthIssues}</div>
            )}
            {data.healthSituations.healthProblems && (
              <div className="ml-2 text-sm"><b>Ongoing Problems:</b> {data.healthSituations.healthProblems}</div>
            )}
            {data.healthSituations.additionalInfo && (
              <div className="ml-2 text-sm"><b>Additional Info:</b> {data.healthSituations.additionalInfo}</div>
            )}
          </div>
        )}
        <div className="mt-3">
          <div><b>Supplements:</b></div>
          <ul className="list-disc ml-5 text-sm space-y-1 break-words">
            {uniq(data.supplements || []).map((s: any, idx: number) => (
              <li key={`supp-${idx}`} className="leading-relaxed">
                {s.name}
                {s.dosage ? ` (${s.dosage}` : ''}
                {s.timing ? `${s.dosage ? ', ' : ' ('}${Array.isArray(s.timing) ? s.timing.join(', ') : s.timing}` : ''}
                {s.dosage || s.timing ? ')' : ''}
              </li>
            ))}
            {!(data.supplements || []).length && <li className="text-gray-500">None provided</li>}
          </ul>
        </div>
        <div className="mt-3">
          <div><b>Medications:</b></div>
          <ul className="list-disc ml-5 text-sm space-y-1 break-words">
            {uniq(data.medications || []).map((m: any, idx: number) => (
              <li key={`med-${idx}`} className="leading-relaxed">
                {m.name}
                {m.dosage ? ` (${m.dosage}` : ''}
                {m.timing ? `${m.dosage ? ', ' : ' ('}${Array.isArray(m.timing) ? m.timing.join(', ') : m.timing}` : ''}
                {m.dosage || m.timing ? ')' : ''}
              </li>
            ))}
            {!(data.medications || []).length && <li className="text-gray-500">None provided</li>}
          </ul>
        </div>
        {data.bloodResults && !data.bloodResults.skipped && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div><b>Blood Results:</b></div>
            {Array.isArray(data.bloodResults.reportIds) && data.bloodResults.reportIds.length > 0 && (
              <div className="ml-2 text-sm">
                <b>Reports uploaded:</b> {data.bloodResults.reportIds.length}
              </div>
            )}
            {data.bloodResults.notes && (
              <div className="ml-2 text-sm"><b>Notes:</b> {data.bloodResults.notes}</div>
            )}
          </div>
        )}
        <div><b>7-day health report:</b> Generated automatically after 7 days of activity.</div>
      </div>

      {/* Modern Loading Progress Bar */}
      {isProcessing && (
        <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-green-50 rounded-xl border border-blue-200 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-semibold text-gray-800">Processing your health data</span>
            <span className="text-sm text-gray-600">{statusText || 'Working...'}</span>
          </div>

          <InsightsProgressBar isGenerating message={statusText || 'Working...'} />

          <div className="mt-3 text-sm text-gray-600">
            {progressStage === 'saving' && 'Saving your latest answers...'}
            {progressStage === 'redirecting' && 'Wrapping up and sending you to your dashboard...'}
          </div>
        </div>
      )}
      
      <div className="flex justify-between">
        <button 
          className="btn-secondary" 
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </button>
        <button 
          className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
            isProcessing 
              ? 'bg-blue-600 text-white cursor-not-allowed scale-95' 
              : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105 active:scale-95'
          }`}
          onClick={handleConfirmBegin}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </div>
          ) : (
            'Confirm & Begin'
          )}
        </button>
      </div>
      <p className="mt-3 text-sm text-gray-500">
        AI setup uses credits (billed at 2× model cost). Typical total: 10–15 credits depending on your answers and data.
      </p>
    </div>
  );
}

function InteractionAnalysisStep({ onNext, onBack, initial, onAnalysisSettled, analysisRequestId }: { onNext: (data: any) => void, onBack: () => void, initial?: any, onAnalysisSettled?: () => void, analysisRequestId?: number }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [previousAnalyses, setPreviousAnalyses] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditInfo, setCreditInfo] = useState<any>(null);
  const [userSubscriptionStatus, setUserSubscriptionStatus] = useState<'FREE' | 'PREMIUM' | null>(null);
  const [expandedInteractions, setExpandedInteractions] = useState<Set<string>>(new Set());
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<string>>(new Set());
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false); // Default collapsed as requested
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [didFreshAnalysis, setDidFreshAnalysis] = useState(false);
  const [showAllSupplements, setShowAllSupplements] = useState(false);
  const [showAllMedications, setShowAllMedications] = useState(false);

  useEffect(() => {
    // Load previous analyses and show the last one (no auto-analysis)
    loadPreviousAnalyses();
  }, []);

  // Reset interaction accordion state after a fresh analysis completes
  useEffect(() => {
    if (!didFreshAnalysis) return;
    setExpandedInteractions(new Set<string>());
    setShowRecommendations(false);
  }, [analysisResult, didFreshAnalysis]);

  // Reset navigation state only when a FRESH analysis finishes (avoid loops when loading history)
  useEffect(() => {
    if (analysisResult && !isAnalyzing && didFreshAnalysis) {
      try { onAnalysisSettled && onAnalysisSettled(); } catch {}
      setDidFreshAnalysis(false);
      setTimeout(() => {
        if (window.parent) {
          window.parent.postMessage({ type: 'RESET_NAVIGATION_STATE' }, '*');
        }
      }, 100);
    }
  }, [analysisResult, isAnalyzing, didFreshAnalysis, onAnalysisSettled]);

  const loadPreviousAnalyses = async () => {
    try {
      const response = await fetch('/api/interaction-history');
      if (response.ok) {
        const data = await response.json();
        const analyses = data.analyses || [];
        setPreviousAnalyses(analyses);
        
        // Load the most recent analysis to display on page 8
        if (analyses.length > 0) {
          const mostRecentAnalysis = analyses[0]; // Assuming newest first
          setAnalysisResult(mostRecentAnalysis.analysisData);
          setDidFreshAnalysis(false); // came from history
          console.log('✅ Loaded most recent analysis for display');
        } else {
          console.log('ℹ️ No previous analyses found - showing empty state');
          // Set a default empty state so page doesn't get stuck
          setAnalysisResult({
            overallRisk: 'low',
            summary: 'No previous interaction analysis found. Go back and tap "Analyze for Interactions" to create one.',
            interactions: [],
            timingOptimization: {},
            generalRecommendations: ['Go back and tap "Analyze for Interactions" to create your first report.'],
            disclaimer: 'This analysis is for informational purposes only and should not replace professional medical advice.'
          });
        }
        
        setIsLoadingHistory(false);
      } else {
        setIsLoadingHistory(false);
      }
    } catch (error) {
      console.error('Error loading previous analyses:', error);
      setIsLoadingHistory(false);
    }
    
    // Load user subscription status
    try {
      const userResponse = await fetch('/api/user-data');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        // Check if user has premium subscription
        const isPremium = userData.subscription?.plan === 'PREMIUM';
        setUserSubscriptionStatus(isPremium ? 'PREMIUM' : 'FREE');
      }
    } catch (error) {
      console.error('Error loading user subscription status:', error);
      setUserSubscriptionStatus('FREE'); // Default to free if error
    }
  };

  const performAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setIsLoadingHistory(false); // Stop loading history when we start analysis

    try {
      // Get fresh data from the current form state instead of just initial
      const currentSupplements = initial?.supplements || [];
      const currentMedications = initial?.medications || [];
      
      console.log('🔍 INTERACTION ANALYSIS DEBUG:', {
        initialSupplements: initial?.supplements?.length || 0,
        initialMedications: initial?.medications?.length || 0,
        currentSupplements: currentSupplements.length,
        currentMedications: currentMedications.length
      });

      if (currentSupplements.length === 0 && currentMedications.length === 0) {
        setAnalysisResult({
          overallRisk: 'low',
          summary: 'No supplements or medications to analyze. Please add your supplements and medications in the previous steps.',
          interactions: [],
          timingOptimization: {},
          generalRecommendations: ['Go back to add your supplements and medications for a comprehensive interaction analysis.'],
          disclaimer: 'This analysis is for informational purposes only and should not replace professional medical advice.'
        });
        setIsAnalyzing(false);
        return;
      }

      const response = await fetch('/api/analyze-interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplements: currentSupplements,
          medications: currentMedications,
        }),
      });

      if (response.status === 402) {
        // Handle insufficient credits
        const errorData = await response.json();
        setCreditInfo(errorData);
        setShowCreditModal(true);
        setIsAnalyzing(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `Analysis failed: ${response.status}`);
      }

      const result = await response.json();
      // Handle the API response structure - it returns { success: true, analysis: {...} }
      if (result.success && result.analysis) {
        setAnalysisResult(result.analysis);
        setDidFreshAnalysis(true);
        // CRITICAL FIX: Reload previous analyses after new analysis to show history
        loadPreviousAnalyses();
        // Notify global listeners to refresh credits meter
        try { window.dispatchEvent(new Event('helfiCreditsUpdated')); } catch {}
      } else {
        throw new Error('Invalid API response structure');
      }
    } catch (err) {
      console.error('Error performing interaction analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze interactions. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const lastRequestIdRef = useRef(0);
  useEffect(() => {
    if (!analysisRequestId) return;
    if (analysisRequestId === lastRequestIdRef.current) return;
    lastRequestIdRef.current = analysisRequestId;
    performAnalysis();
  }, [analysisRequestId]);

  const handleRetry = () => {
    performAnalysis();
  };

  const handleNext = () => {
    // Prevent navigation when viewing history
    if (showAnalysisHistory) {
      setShowAnalysisHistory(false);
      return;
    }
    // Save analysis result and proceed
    onNext({ interactionAnalysis: analysisResult });
  };

  const toggleInteractionExpansion = (id: string) => {
    const newExpanded = new Set(expandedInteractions);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedInteractions(newExpanded);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-orange-100 text-orange-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return '🟢';
      case 'medium': return '🟠';
      case 'high': return '🔴';
      default: return '⚪';
    }
  };

  const SUMMARY_LIST_LIMIT = 6;
  const summarySupplementNames = Array.from(
    new Set(
      (initial?.supplements || [])
        .map((supp: any) => String(supp?.name || '').trim())
        .filter(Boolean)
    )
  ) as string[];
  const summaryMedicationNames = Array.from(
    new Set(
      (initial?.medications || [])
        .map((med: any) => String(med?.name || '').trim())
        .filter(Boolean)
    )
  ) as string[];
  const visibleSupplementNames = showAllSupplements
    ? summarySupplementNames
    : summarySupplementNames.slice(0, SUMMARY_LIST_LIMIT);
  const visibleMedicationNames = showAllMedications
    ? summaryMedicationNames
    : summaryMedicationNames.slice(0, SUMMARY_LIST_LIMIT);

  // Helper to create a safe, predictable slug from names for unique/stable IDs
  const toSlug = (value: string | undefined) => {
    if (!value) return 'unknown';
    return value
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const toggleHistoryExpansion = (id: string) => {
    const newExpanded = new Set(expandedHistoryItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedHistoryItems(newExpanded);
  };

  const deleteAnalysis = async (analysisId: string) => {
    try {
      const response = await fetch(`/api/interaction-history/${analysisId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Refresh the analyses list only; do not trigger re-analysis
        await loadPreviousAnalyses();
        console.log('✅ Analysis deleted successfully');
      } else {
        console.error('Failed to delete analysis');
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
    }
  };

  const formatAnalysisDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isAnalyzing) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          </div>
          <h2 className="text-2xl font-bold mb-4">Analyzing Interactions</h2>
          <p className="text-gray-600 mb-4">
            Our AI is analyzing potential interactions between your supplements and medications...
          </p>
          <div className="text-sm text-gray-500">
            This may take a few moments
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4">Analysis Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={onBack}
              className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // This check is moved below, after we handle the previous analyses case

  // Show loading state while fetching history
  if (isLoadingHistory) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          </div>
          <h2 className="text-2xl font-bold mb-4">Loading Analysis History</h2>
          <p className="text-gray-600">Checking for previous analyses...</p>
        </div>
      </div>
    );
  }

  // Show loading state while analysis is running
  if (!analysisResult && isAnalyzing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analyzing Interactions...</h3>
            <p className="text-gray-600">
              We're checking your supplements and medications for potential interactions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if analysis failed
  if (!analysisResult && !isAnalyzing && error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="text-red-500 text-4xl mb-4">❌</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Failed</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={handleRetry}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If no analysis result and not analyzing, show minimal loading state
  if (!analysisResult && !isAnalyzing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-4">🔬</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Preparing Analysis...</h3>
            <p className="text-gray-600">
              Please wait while we prepare your interaction analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Final fallback - if we don't have analysis results and we're not loading/analyzing
  if (!analysisResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">🤔</div>
          <h2 className="text-2xl font-bold mb-4">No Analysis Available</h2>
          <p className="text-gray-600 mb-6">Unable to load interaction analysis results.</p>
          <button
            onClick={onBack}
            className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 space-y-3 md:space-y-0">
          <h2 className="text-xl md:text-2xl font-bold">Latest Analysis Results</h2>
          <div className={`px-3 py-1 rounded-full text-sm font-medium self-start md:self-auto ${
            analysisResult.overallRisk === 'low' 
              ? 'bg-green-100 text-green-800'
              : analysisResult.overallRisk === 'medium'
              ? 'bg-orange-100 text-orange-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {analysisResult.overallRisk === 'low' && '🟢 Low Risk'}
            {analysisResult.overallRisk === 'medium' && '🟠 Medium Risk'}
            {analysisResult.overallRisk === 'high' && '🔴 High Risk'}
          </div>
        </div>



        {/* Summary */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
          <p className="text-blue-800 text-sm mb-3">
            We analyzed the items below.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-white/70 border border-blue-100 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-blue-900">Supplements</span>
                <span className="text-xs text-blue-700">{summarySupplementNames.length} total</span>
              </div>
              {visibleSupplementNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {visibleSupplementNames.map((name: string) => (
                    <span
                      key={`supp-summary-${name}`}
                      className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-blue-700">None added</div>
              )}
              {summarySupplementNames.length > SUMMARY_LIST_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllSupplements((prev) => !prev)}
                  className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-900"
                >
                  {showAllSupplements ? 'Show less' : `Show all (${summarySupplementNames.length})`}
                </button>
              )}
            </div>
            <div className="bg-white/70 border border-blue-100 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-blue-900">Medications</span>
                <span className="text-xs text-blue-700">{summaryMedicationNames.length} total</span>
              </div>
              {visibleMedicationNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {visibleMedicationNames.map((name: string) => (
                    <span
                      key={`med-summary-${name}`}
                      className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-blue-700">None added</div>
              )}
              {summaryMedicationNames.length > SUMMARY_LIST_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllMedications((prev) => !prev)}
                  className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-900"
                >
                  {showAllMedications ? 'Show less' : `Show all (${summaryMedicationNames.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Interactions - Show green checkmark for no dangerous interactions or accordion for interactions */}
        {(() => {
          const dangerousInteractions = analysisResult.interactions?.filter((interaction: any) => 
            interaction.severity === 'medium' || interaction.severity === 'high'
          ) || [];
          
          if (dangerousInteractions.length > 0) {
            return (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Potential Interactions</h3>
                <div className="space-y-2">
                  {dangerousInteractions.map((interaction: any, index: number) => {
                    const slug1 = toSlug(interaction.substance1);
                    const slug2 = toSlug(interaction.substance2);
                    const id = `ix-${index}-${slug1}-${slug2}`;
                    const isExpanded = expandedInteractions.has(id);
                    const severityIcon = interaction.severity === 'high' ? '🚨' : '⚠️';
                    
                    return (
                      <div key={id} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Accordion Header */}
                        <button
                          type="button"
                          onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            toggleInteractionExpansion(id); 
                          }}
                          className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <span className="text-lg">{severityIcon}</span>
                            <span className="font-medium text-gray-900">
                              {interaction.substance1} + {interaction.substance2}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              interaction.severity === 'high' 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {interaction.severity.toUpperCase()}
                            </span>
                            <svg 
                              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        
                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="px-4 py-4 bg-white border-t border-gray-200">
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-medium text-gray-900 mb-1">Effect:</h4>
                                <p className="text-gray-700 text-sm leading-relaxed">{interaction.description}</p>
                              </div>
                              
                              {interaction.recommendation && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <h4 className="font-medium text-blue-900 mb-1">💡 Recommendation:</h4>
                                  <p className="text-blue-800 text-sm leading-relaxed">{interaction.recommendation}</p>
                                </div>
                              )}
                              
                              {interaction.severity === 'high' && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <h4 className="font-medium text-red-900 mb-1">⚠️ Important:</h4>
                                  <p className="text-red-800 text-sm">This is a high-risk interaction. Please consult with your healthcare provider immediately.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          } else {
            return (
              <div className="mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-green-600 text-4xl mb-2">✅</div>
                  <h3 className="text-lg font-semibold text-green-900 mb-1">No Dangerous Interactions Found</h3>
                  <p className="text-green-800 text-sm">Your current supplements and medications appear to be safe to take together.</p>
                </div>
              </div>
            );
          }
        })()}



        {/* Recommendations - Collapsible Dropdown */}
        {analysisResult.generalRecommendations && analysisResult.generalRecommendations.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowRecommendations(!showRecommendations)}
              className="flex items-center justify-between w-full text-left mb-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
            >
              <h3 className="text-lg font-semibold text-green-900">Recommendations</h3>
              <svg 
                className={`w-5 h-5 text-green-600 transition-transform ${showRecommendations ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showRecommendations && (
              <div className="space-y-2">
                {analysisResult.generalRecommendations.map((rec: string, index: number) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="text-green-600 mt-1">✓</div>
                    <div className="text-gray-700">{rec}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}



        {/* Analysis History Section - Fixed Layout */}
        {previousAnalyses.length > 0 && (
          <div className="mb-6">
            {/* Previous Analysis History heading on separate line */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-3">Previous Analysis History</h3>
              {/* Show History dropdown on separate line */}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAnalysisHistory(!showAnalysisHistory); }}
                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                <span>{showAnalysisHistory ? 'Hide' : 'Show'} History</span>
                <svg 
                  className={`w-4 h-4 transition-transform ${showAnalysisHistory ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            
            {showAnalysisHistory && (
              <div className="space-y-3">
                {previousAnalyses.map((analysis) => {
                  const id = analysis.id;
                  const isExpanded = expandedHistoryItems.has(id);
                  const analysisData = analysis.analysisData || {};
                  
                  return (
                    <div key={id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* History Item Header */}
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <button
                          onClick={() => toggleHistoryExpansion(id)}
                          className="flex items-center space-x-3 flex-1 text-left hover:bg-gray-100 transition-colors rounded p-1 -m-1"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {formatAnalysisDate(analysis.createdAt)}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              analysisData.overallRisk === 'low' 
                                ? 'bg-green-100 text-green-800'
                                : analysisData.overallRisk === 'medium'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {getRiskIcon(analysisData.overallRisk)} {analysisData.overallRisk?.toUpperCase() || 'UNKNOWN'}
                            </span>
                          </div>
                          <svg 
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        <button
                          onClick={() => deleteAnalysis(analysis.id)}
                          className="ml-3 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="Delete this analysis"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* History Item Content */}
                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-gray-200">
                          <div className="space-y-4">
                            {/* Summary */}
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                              <p className="text-sm text-gray-700">{analysisData.summary || 'No summary available'}</p>
                            </div>
                            
                            {/* Interactions */}
                            {analysisData.interactions && analysisData.interactions.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">Key Interactions</h4>
                                <div className="space-y-2">
                                  {analysisData.interactions.slice(0, 3).map((interaction: any, idx: number) => (
                                    <div key={idx} className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                      <span className="font-medium">{interaction.substance1} + {interaction.substance2}:</span> {interaction.description}
                                    </div>
                                  ))}
                                  {analysisData.interactions.length > 3 && (
                                    <div className="text-sm text-gray-500">
                                      +{analysisData.interactions.length - 3} more interactions
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Timing Optimization */}
                            {analysisData.timingOptimization && Object.keys(analysisData.timingOptimization).length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">Timing Recommendations</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  {Object.entries(analysisData.timingOptimization).slice(0, 4).map(([timeSlot, substances]: [string, any]) => (
                                    <div key={timeSlot} className="text-sm bg-blue-50 p-2 rounded">
                                      <div className="font-medium text-blue-900 capitalize">
                                        {timeSlot.replace(/([A-Z])/g, ' $1').trim()}
                                      </div>
                                      <div className="text-blue-700 text-xs">
                                        {substances.length} item{substances.length !== 1 ? 's' : ''}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation - Fixed Layout: Separate lines for each button */}
        <div className="space-y-3">
          <button
            onClick={onBack}
            className="w-full px-8 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-base font-medium"
          >
            Back to Medications
          </button>
          <button
            onClick={handleNext}
            className="w-full px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-base font-medium"
          >
            Continue
          </button>
        </div>

        {/* Important Disclaimer - Moved to bottom as requested */}
        <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Important:</strong> {analysisResult.disclaimer}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Purchase Modal */}
      {showCreditModal && creditInfo && (
        <CreditPurchaseModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
          creditInfo={creditInfo}
        />
      )}


    </div>
  );
}

export default function Onboarding() {
  const { data: session, status } = useSession();
  const { profileImage: providerProfileImage, updateUserData } = useUserData();
  const router = useRouter();
  const appleLinkPromptCheckedRef = useRef(false);
  
  // ⚠️ HEALTH SETUP GUARD RAIL
  // This onboarding component is part of a carefully tuned flow:
  // - Onboarding is "complete" only when gender, weight, height, and at least one health goal exist.
  // - The first-time modal MUST continue to appear on this page until setup is complete.
  // - The "I'll do it later" button sets sessionStorage.onboardingDeferredThisSession = '1'
  //   and allows the user to use the app for the rest of the browser session without
  //   redirect loops from the dashboard.
  // Do NOT change this behaviour without reading HEALTH_SETUP_PROTECTION.md and obtaining
  // explicit approval from the user.
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});
  // Removed forced remount to avoid infinite loops
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [affiliateMenu, setAffiliateMenu] = useState<{ label: string; href: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [profileImage, setProfileImage] = useState<string>('');
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<any | null>(null);
  const formRef = useRef<any>({});
  const [allowAutosave, setAllowAutosave] = useState(false);
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [hasGlobalUnsavedChanges, setHasGlobalUnsavedChanges] = useState(false);
  const hasGlobalUnsavedChangesRef = useRef(false);
  const [showGlobalUpdatePopup, setShowGlobalUpdatePopup] = useState(false);
  const [isGlobalGenerating, setIsGlobalGenerating] = useState(false);
  const [serverHydrationKey, setServerHydrationKey] = useState(0);
  const [analysisRequestId, setAnalysisRequestId] = useState(0);
  // Track if the user has dismissed the first-time modal during this visit,
  // so they can actually complete the intake instead of being stuck.
  const [firstTimeModalDismissed, setFirstTimeModalDismissed] = useState(false);
  const [usageMeterRefresh, setUsageMeterRefresh] = useState(0);
  const formBaselineRef = useRef<string>(''); // canonical snapshot to detect real edits
  const formBaselineInitializedRef = useRef<boolean>(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const exitUpdateTriggeredRef = useRef(false);
  const triggerInsightsUpdateOnExitRef = useRef<(reason: string) => void>(() => {});
  const backgroundRegenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBackgroundRegenSnapshotRef = useRef<string>('');
  const sidebarHandlersRef = useRef<Array<{ el: HTMLAnchorElement; handler: (event: Event) => void }> | null>(null);
  const loadUserDataRef = useRef<
    (options?: { preserveUnsaved?: boolean; timeoutMs?: number }) => Promise<any>
  >(async () => null);
  const healthSetupMetaInFlightRef = useRef(false);
  const lastServerHealthSetupUpdatedAtRef = useRef(0);
  const lastLocalEditAtRef = useRef(0);
  // Guard rail: keep these refs; they stop server hydration from overriding the user's first goal click.
  // See GUARD_RAILS.md section "Goal intensity selection + daily allowance sync".
  const goalChoiceTouchedRef = useRef(false);
  const goalIntensityTouchedRef = useRef(false);
  const birthdateTouchedRef = useRef(false);

  // Apple login linking prompt:
  // If the user is about to start Health Setup (onboarding) and Apple login is available,
  // we encourage them to link Apple now to avoid accidental "second account" issues later.
  //
  // This is intentionally placed on the onboarding page (not only on the sign-in page),
  // because the post-login redirect may take users straight to /onboarding.
  useEffect(() => {
    if (status !== 'authenticated') return;
    if (appleLinkPromptCheckedRef.current) return;
    appleLinkPromptCheckedRef.current = true;

    const shouldSkipAppleLinkPrompt = () => {
      try {
        if (localStorage.getItem('helfi:skipAppleLinkPrompt') === '1') return true;
        const untilRaw = localStorage.getItem('helfi:skipAppleLinkPromptUntil');
        if (untilRaw) {
          const until = Number(untilRaw);
          if (Number.isFinite(until) && until > Date.now()) return true;
        }
      } catch {
        // Ignore storage errors
      }
      return false;
    };

    const run = async () => {
      if (shouldSkipAppleLinkPrompt()) return;

      // Only prompt before Health Setup is complete.
      try {
        const hsRes = await fetch('/api/health-setup-status', { method: 'GET' });
        if (hsRes.ok) {
          const hsData = await hsRes.json();
          if (hsData?.complete === true) return;
        }
      } catch {
        // If this fails, don't block the page.
      }

      // Check if Apple provider is enabled on this environment.
      let hasAppleProvider = false;
      try {
        const providersRes = await fetch('/api/auth/providers', { method: 'GET' });
        if (providersRes.ok) {
          const providers = await providersRes.json();
          hasAppleProvider = Boolean((providers as any)?.apple);
        }
      } catch {
        hasAppleProvider = false;
      }
      if (!hasAppleProvider) return;

      // If not linked yet, redirect to the link prompt page.
      try {
        const linkRes = await fetch('/api/auth/apple/link/status', { method: 'GET' });
        if (!linkRes.ok) return;
        const linkData = await linkRes.json();
        const linked = Boolean(linkData?.linked);
        if (!linked) {
          window.location.replace('/auth/link-apple?next=/onboarding');
        }
      } catch {
        // If this fails, don't block the page.
      }
    };

    void run();
  }, [status]);

  const markUnsavedChanges = useCallback(() => {
    setHasGlobalUnsavedChanges(true);
    hasGlobalUnsavedChangesRef.current = true;
    exitUpdateTriggeredRef.current = false;
    try {
      (window as any).__helfiOnboardingHasUnsavedChanges = true;
    } catch {
      // ignore
    }
  }, []);

  // Expose unsaved state globally so the desktop sidebar can respect it while on Health Setup.
  useEffect(() => {
    hasGlobalUnsavedChangesRef.current = hasGlobalUnsavedChanges;
    try {
      (window as any).__helfiOnboardingHasUnsavedChanges = hasGlobalUnsavedChanges;
    } catch {
      // ignore
    }
    return () => {
      try {
        (window as any).__helfiOnboardingHasUnsavedChanges = false;
      } catch {
        // ignore
      }
    };
  }, [hasGlobalUnsavedChanges]);

  useEffect(() => {
    try {
      (window as any).__helfiOnboardingAutoUpdateOnExit = AUTO_UPDATE_INSIGHTS_ON_EXIT;
    } catch {
      // ignore
    }
    return () => {
      try {
        (window as any).__helfiOnboardingAutoUpdateOnExit = false;
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__helfiOnboardingSidebarOverride = true;
    return () => {
      try {
        delete (window as any).__helfiOnboardingSidebarOverride;
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.startsWith('/onboarding')) return;

    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (sidebarHandlersRef.current) {
        sidebarHandlersRef.current.forEach(({ el, handler }) => {
          el.removeEventListener('pointerdown', handler, true);
          el.removeEventListener('click', handler, true);
        });
        sidebarHandlersRef.current = null;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };

    const attachHandlers = () => {
      if (cancelled) return;
      const sidebar = document.querySelector('[data-helfi-sidebar="true"]') as HTMLElement | null;
      if (!sidebar) {
        if (attempts < 12) {
          attempts += 1;
          retryTimer = setTimeout(attachHandlers, 150);
        }
        return;
      }
      const anchors = Array.from(sidebar.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const handlers = anchors.map((el) => {
        const handler = (event: Event) => {
          const href = el.getAttribute('href');
          if (!href) return;
          try {
            event.preventDefault();
          } catch {}
          try {
            event.stopPropagation();
          } catch {}
          try {
            triggerInsightsUpdateOnExitRef.current('sidebar');
          } catch {}
          try {
            window.location.assign(href);
          } catch {
            window.location.href = href;
          }
        };
        el.addEventListener('pointerdown', handler, true);
        el.addEventListener('click', handler, true);
        return { el, handler };
      });
      sidebarHandlersRef.current = handlers;
    };

    attachHandlers();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      try {
        triggerInsightsUpdateOnExitRef.current('visibility');
      } catch {}
    };
    const handlePageHide = () => {
      try {
        triggerInsightsUpdateOnExitRef.current('pagehide');
      } catch {}
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  const runPendingNavigation = useCallback(() => {
    const fn = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (fn) fn();
  }, []);
  const syncFormBaseline = useCallback((nextForm?: any) => {
    try {
      formBaselineRef.current = onboardingGuardSnapshotJson(nextForm ?? formRef.current ?? {});
      formBaselineInitializedRef.current = true;
    } catch {
      formBaselineRef.current = '';
      formBaselineInitializedRef.current = false;
    }
  }, []);

  const scheduleBackgroundInsightsRegen = useCallback(
    (sourceForm?: any) => {
      if (!AUTO_UPDATE_INSIGHTS_ON_EXIT) return;
      // Guard rail: only regenerate insights when the user actually changed something.
      // This prevents background updates (and AI usage) from running on login/refresh when nothing changed.
      if (!hasGlobalUnsavedChangesRef.current) return;
      if (backgroundRegenTimerRef.current) {
        clearTimeout(backgroundRegenTimerRef.current);
      }

      backgroundRegenTimerRef.current = setTimeout(() => {
        backgroundRegenTimerRef.current = null;
        if (!formBaselineInitializedRef.current) return;
        const baselineSnapshot = formBaselineRef.current;
        if (!baselineSnapshot) return;
        if (exitUpdateTriggeredRef.current) return;

        const candidateForm = formRef.current || sourceForm || {};
        let candidateSnapshot = '';
        try {
          candidateSnapshot = onboardingGuardSnapshotJson(candidateForm);
        } catch {
          return;
        }
        if (!candidateSnapshot || candidateSnapshot === lastBackgroundRegenSnapshotRef.current) return;

        const changeTypes = detectChangedInsightTypes(baselineSnapshot, candidateForm);
        if (!changeTypes.length) return;

        const regenSnapshot = candidateSnapshot;
        lastBackgroundRegenSnapshotRef.current = regenSnapshot;
        exitUpdateTriggeredRef.current = true;

        fireAndForgetInsightsRegen(changeTypes, undefined, {
          onSuccess: () => {
            try {
              const latestForm = formRef.current || candidateForm || {};
              const latestSnapshot = onboardingGuardSnapshotJson(latestForm);
              if (latestSnapshot === regenSnapshot) {
                setHasGlobalUnsavedChanges(false);
                hasGlobalUnsavedChangesRef.current = false;
                try {
                  (window as any).__helfiOnboardingHasUnsavedChanges = false;
                } catch {
                  // ignore
                }
                syncFormBaseline(latestForm);
              }
            } catch {
              // ignore
            }
          },
          onError: () => {
            exitUpdateTriggeredRef.current = false;
            lastBackgroundRegenSnapshotRef.current = '';
          },
        });
      }, 1200);
    },
    [syncFormBaseline],
  );

  useEffect(() => {
    return () => {
      if (backgroundRegenTimerRef.current) {
        clearTimeout(backgroundRegenTimerRef.current);
        backgroundRegenTimerRef.current = null;
      }
    };
  }, []);

  const triggerInsightsUpdateOnExit = useCallback((reason: string) => {
    if (!AUTO_UPDATE_INSIGHTS_ON_EXIT) return
    if (exitUpdateTriggeredRef.current) return
    if (!hasGlobalUnsavedChangesRef.current) return
    if (!formBaselineInitializedRef.current) return

    const currentForm = formRef.current || {}
    const changeTypes = detectChangedInsightTypes(formBaselineRef.current, currentForm)

    exitUpdateTriggeredRef.current = true
    const payload = sanitizeUserDataPayload(currentForm)

    // Save the latest health setup data before regenerating insights.
    fetch('/api/user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then(() => {
        updateUserData(payload)
        try {
          window.dispatchEvent(new Event('userData:refresh'))
        } catch {}
      })
      .catch(() => {})
      .finally(() => {
        if (changeTypes.length > 0) {
          fireAndForgetInsightsRegen(changeTypes)
        }
      })
  }, [updateUserData])

  useEffect(() => {
    if (!SAVE_HEALTH_SETUP_ON_LEAVE_ONLY) return
    const handleBeforeUnload = () => {
      triggerInsightsUpdateOnExit('unload')
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      triggerInsightsUpdateOnExit('unmount')
    }
  }, [triggerInsightsUpdateOnExit])
  
  // Background regen status indicator
  const [backgroundRegenStatus, setBackgroundRegenStatus] = useState<{ isRegenerating: boolean; message?: string }>({ isRegenerating: false });
  
  // Register the global callback for background regen status
  useEffect(() => {
    setGlobalRegenStatusCallback(setBackgroundRegenStatus);
    return () => setGlobalRegenStatusCallback(null);
  }, []);

  useEffect(() => {
    triggerInsightsUpdateOnExitRef.current = triggerInsightsUpdateOnExit;
  }, [triggerInsightsUpdateOnExit]);

  useEffect(() => {
    return () => {
      triggerInsightsUpdateOnExitRef.current('unmount');
    };
  }, []);

  const stepNames = [
    'Gender',
    'Physical',
    'Exercise',
    'Health Goals',
    'Health Situations', 
    'Supplements',
    'Medications',
    'Interaction Analysis',
    'Blood Results',
    'AI Insights',
    'Review'
  ];

  // Removed automatic redirect - users should always be able to access intake/onboarding to edit their information

  // Removed blocking render - users should always be able to access intake to edit information

  // Profile data - prefer real photos; fall back to professional icon for nav
  const hasProfileImage = !!(providerProfileImage || profileImage || session?.user?.image)
  const userImage = (providerProfileImage || profileImage || session?.user?.image || '') as string
  const userName = session?.user?.name || 'User';

  useEffect(() => {
    if (!session?.user?.email) {
      setAffiliateMenu(null);
      return;
    }
    let cancelled = false;
    setAffiliateMenu({ label: 'Become an Affiliate', href: '/affiliate/apply' });
    const loadAffiliateMenu = async () => {
      try {
        const res = await fetch('/api/affiliate/application', { cache: 'no-store' });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) return;
        const hasAffiliate = !!data?.affiliate;
        const hasApplication = !!data?.application;
        const menu = hasAffiliate
          ? { label: 'Affiliate Portal', href: '/affiliate' }
          : hasApplication
            ? { label: 'Affiliate Application', href: '/affiliate/apply' }
            : { label: 'Become an Affiliate', href: '/affiliate/apply' };
        if (!cancelled) setAffiliateMenu(menu);
      } catch {
        // ignore
      }
    };
    loadAffiliateMenu();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.email]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Element;
      if (dropdownOpen && !target.closest('#profile-dropdown')) {
        setDropdownOpen(false);
      }
    }

    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'RESET_NAVIGATION_STATE') {
        setIsNavigating(false);
        setIsLoading(false);
      }
    }

    document.addEventListener('click', handleClick);
    window.addEventListener('message', handleMessage);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('message', handleMessage);
    };
  }, [dropdownOpen]);

  // Allow the desktop sidebar to request an "Update insights?" prompt before leaving Health Setup.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e?.data?.type !== 'OPEN_ONBOARDING_UPDATE_POPUP') return
      const raw = e?.data?.navigateTo
      const navigateTo = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '/dashboard'
      triggerInsightsUpdateOnExit('external')
      try {
        router.push(navigateTo)
      } catch {
        window.location.assign(navigateTo)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [router, triggerInsightsUpdateOnExit]);

  // Basic session validation without aggressive checks
  useEffect(() => {
    if (status === 'loading') return;
    
    if (status === 'authenticated') {
      const currentStep = parseInt(new URLSearchParams(window.location.search).get('step') || '1') - 1;
      setStep(Math.max(0, Math.min(stepNames.length - 1, currentStep)));
    } else if (status === 'unauthenticated') {
      // Only redirect if truly unauthenticated
      console.log('🚫 User not authenticated - redirecting to homepage');
      window.location.href = '/';
    }
  }, [status, stepNames.length]);

  const [dataLoaded, setDataLoaded] = useState(false);
  useEffect(() => {
    if (status === 'authenticated') {
      loadUserData().finally(() => setDataLoaded(true));
    }
  }, [status]);

  // Optimized: Consolidated data loading - no separate profile image API call
  const loadUserData = async (options?: { preserveUnsaved?: boolean; timeoutMs?: number }) => {
    let mergedForBaseline: any = null;
    let serverData: any = null;
    const controller = options?.timeoutMs ? new AbortController() : null;
    const timeoutId = options?.timeoutMs
      ? window.setTimeout(() => controller?.abort(), options.timeoutMs)
      : null;
    try {
      const response = await fetch('/api/user-data?scope=health-setup', {
        cache: 'no-store' as any,
        signal: controller?.signal,
      });
      if (response.ok) {
        const userData = await response.json();
        console.log('Loaded user data from database:', userData);
        if (userData && userData.data && Object.keys(userData.data).length > 0) {
          serverData = userData.data;
          const incomingHealthSetupUpdatedAt = Number(userData.data?.healthSetupUpdatedAt || 0);
          if (Number.isFinite(incomingHealthSetupUpdatedAt) && incomingHealthSetupUpdatedAt > 0) {
            lastServerHealthSetupUpdatedAtRef.current = Math.max(
              lastServerHealthSetupUpdatedAtRef.current,
              incomingHealthSetupUpdatedAt,
            );
          }
          const nextForm = { ...(userData.data || {}) };
          const localDraft = formRef.current;
          if (localDraft && typeof localDraft === 'object') {
            const localBirthdate =
              typeof (localDraft as any).birthdate === 'string'
                ? (localDraft as any).birthdate.trim()
                : '';
            const serverBirthdate =
              typeof (userData.data as any)?.birthdate === 'string'
                ? String((userData.data as any).birthdate).trim()
                : '';
            if (
              birthdateTouchedRef.current &&
              localBirthdate &&
              serverBirthdate &&
              serverBirthdate === localBirthdate
            ) {
              birthdateTouchedRef.current = false;
            }
            if (birthdateTouchedRef.current && localBirthdate) {
              (nextForm as any).birthdate = localBirthdate;
            }
            const localGoalChoice =
              typeof (localDraft as any).goalChoice === 'string'
                ? (localDraft as any).goalChoice.trim()
                : '';
            if (goalChoiceTouchedRef.current && localGoalChoice) {
              (nextForm as any).goalChoice = localGoalChoice;
            }
            const localGoalIntensity =
              typeof (localDraft as any).goalIntensity === 'string'
                ? (localDraft as any).goalIntensity.trim().toLowerCase()
                : '';
            if (
              goalIntensityTouchedRef.current &&
              (localGoalIntensity === 'mild' || localGoalIntensity === 'standard' || localGoalIntensity === 'aggressive')
            ) {
              (nextForm as any).goalIntensity = localGoalIntensity;
            }
          }
          mergedForBaseline = nextForm;
          formRef.current = nextForm;
          setForm(nextForm);
          setServerHydrationKey(Date.now());
          // Load profile image from the same API response
          if (userData.data.profileImage) {
            setProfileImage(userData.data.profileImage);
          }
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      setAllowAutosave(true);
      if (!options?.preserveUnsaved) {
        // Establish a clean baseline after the initial load so navigation guard only triggers on new edits
        syncFormBaseline(mergedForBaseline ?? formRef.current ?? form);
        setHasGlobalUnsavedChanges(false);
      }
    }
    return serverData;
  };

  useEffect(() => {
    loadUserDataRef.current = loadUserData;
  }, [loadUserData]);

  const checkForHealthSetupUpdates = useCallback(async () => {
    if (status !== 'authenticated') return;
    if (Date.now() - lastLocalEditAtRef.current < HEALTH_SETUP_SYNC_EDIT_GRACE_MS) return;
    if (healthSetupMetaInFlightRef.current) return;
    healthSetupMetaInFlightRef.current = true;
    try {
      const freshData = await loadUserDataRef.current({ preserveUnsaved: true, timeoutMs: 8000 });
      const refreshedAt = Number(freshData?.healthSetupUpdatedAt || 0);
      if (Number.isFinite(refreshedAt) && refreshedAt > 0) {
        lastServerHealthSetupUpdatedAtRef.current = Math.max(
          lastServerHealthSetupUpdatedAtRef.current,
          refreshedAt,
        );
      }
    } catch (error) {
      console.warn('Health setup auto-sync check failed', error);
    } finally {
      healthSetupMetaInFlightRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      checkForHealthSetupUpdates();
    };
    const intervalId = window.setInterval(tick, HEALTH_SETUP_SYNC_POLL_MS);
    const handleFocus = () => tick();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkForHealthSetupUpdates, status]);

  // Keep a ref of the latest form for partial saves
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  // Initialize baseline once the form has loaded real data
  useEffect(() => {
    const hasMeaningfulData = form && Object.keys(form || {}).length > 0;
    if (formBaselineInitializedRef.current) return;
    if (hasMeaningfulData) syncFormBaseline(form);
  }, [form, syncFormBaseline]);

  const hasMeaningfulCacheData = useCallback((value: any) => {
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some((key) => {
      const v = (value as any)[key];
      if (Array.isArray(v)) return v.length > 0;
      if (v === null || v === undefined) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    });
  }, []);

  // Warm + durable cache keeps Health Setup fields visible on refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const warmRaw = sessionStorage.getItem('onboarding:warmForm');
      if (warmRaw) {
        const parsed = JSON.parse(warmRaw);
        if (parsed && typeof parsed === 'object') {
          setForm((prev: any) => ({ ...prev, ...parsed }));
        }
      }
      const durableRaw = localStorage.getItem('onboarding:durableForm');
      if (durableRaw) {
        const parsed = JSON.parse(durableRaw);
        if (parsed && typeof parsed === 'object') {
          setForm((prev: any) => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {
      console.warn('Warm form cache read failed', e);
    }
  }, []);

  const warmCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmCachePendingRef = useRef<any>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasMeaningfulCacheData(form)) return;
    warmCachePendingRef.current = form;
    if (warmCacheTimerRef.current) {
      clearTimeout(warmCacheTimerRef.current);
    }
    warmCacheTimerRef.current = setTimeout(() => {
      const nextForm = warmCachePendingRef.current;
      warmCachePendingRef.current = null;
      try {
        sessionStorage.setItem('onboarding:warmForm', JSON.stringify(nextForm));
        localStorage.setItem('onboarding:durableForm', JSON.stringify(nextForm));
      } catch (e) {
        console.warn('Warm form cache write failed', e);
      }
    }, 500);
    return () => {
      if (warmCacheTimerRef.current) {
        clearTimeout(warmCacheTimerRef.current);
        warmCacheTimerRef.current = null;
      }
    };
  }, [form, hasMeaningfulCacheData]);

  // If the user is incomplete, show the health-setup modal only on step 1.
  // This avoids interrupting someone who is already working through later steps.
  useEffect(() => {
    if (status !== 'authenticated' || !dataLoaded) return;
    try {
      const hasBasic = form && form.gender && form.weight && form.height;
      const hasGoals = Array.isArray(form?.goals) && form.goals.length > 0;
      const needsSetup = !(hasBasic && hasGoals);
      const stepParam = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('step')
        : null;
      const stepNumber = stepParam ? parseInt(stepParam, 10) : NaN;
      const isFirstStep = Number.isFinite(stepNumber) ? stepNumber <= 1 : step === 0;
      const shouldForceModal = needsSetup && !firstTimeModalDismissed && isFirstStep;

      if (shouldForceModal && !showFirstTimeModal) {
        setShowFirstTimeModal(true);
      } else if (!shouldForceModal && showFirstTimeModal) {
        // Auto-hide when user is complete or has dismissed it for this visit
        setShowFirstTimeModal(false);
      }
    } catch {}
  }, [status, form, showFirstTimeModal, dataLoaded, firstTimeModalDismissed, step]);

  const debouncedSave = useCallback(async (data: any) => {
    pendingSaveRef.current = data;
    if (saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    while (pendingSaveRef.current) {
      const nextPayload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      try {
        const response = await fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sanitizeUserDataPayload(nextPayload)),
        });

        if (response.ok) {
          console.log('Progress auto-saved to database');
          scheduleBackgroundInsightsRegen(nextPayload);
        } else {
          console.warn('Failed to auto-save progress:', response.status, response.statusText);
        }
      } catch (error) {
        console.warn('Error auto-saving progress:', error);
      }
    }
    saveInFlightRef.current = false;
  }, [scheduleBackgroundInsightsRegen]);

  const persistForm = useCallback(
    (partial: any) => {
      if (!partial || typeof partial !== 'object') return;
      setForm((prev: any) => {
        // If this "partial save" doesn't actually change anything, do nothing.
        // This is critical because some steps call onPartialSave during hydration,
        // which should NOT trigger saves or insight updates.
        let changed = false;
        try {
          const keys = Object.keys(partial);
          for (const key of keys) {
            const before = stableStringify(normalizeForComparison(prev?.[key]));
            const after = stableStringify(normalizeForComparison(partial?.[key]));
            if (before !== after) {
              changed = true;
              break;
            }
          }
        } catch {
          changed = true;
        }
        if (!changed) {
          formRef.current = prev;
          return prev;
        }

        if (typeof partial?.goalChoice === 'string' && partial.goalChoice.trim()) {
          goalChoiceTouchedRef.current = true;
        }
        if (typeof partial?.goalIntensity === 'string' && partial.goalIntensity.trim()) {
          goalIntensityTouchedRef.current = true;
        }
        if (typeof partial?.birthdate === 'string' && partial.birthdate.trim()) {
          birthdateTouchedRef.current = true;
        }

        let next = { ...prev, ...partial };
        if (shouldStampHealthSetup(partial)) {
          next = { ...next, healthSetupUpdatedAt: nextHealthSetupUpdateStamp() };
          lastLocalEditAtRef.current = Date.now();
        }
        formRef.current = next; // Keep latest edits available for exit-save flows.
        if (allowAutosave && !SAVE_HEALTH_SETUP_ON_LEAVE_ONLY) {
          debouncedSave(next);
        }
        // Mark dirty only if current form differs from baseline
        if (allowAutosave) {
          try {
            if (formBaselineRef.current && onboardingGuardSnapshotJson(next) !== formBaselineRef.current) {
              markUnsavedChanges();
            }
          } catch {
            markUnsavedChanges();
          }
        }
        return next;
      });
    },
    [debouncedSave, allowAutosave, markUnsavedChanges],
  );

  const userDataSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDataSyncPendingRef = useRef<any>(null);
  useEffect(() => {
    if (!allowAutosave) return;
    userDataSyncPendingRef.current = form;
    if (userDataSyncTimerRef.current) {
      clearTimeout(userDataSyncTimerRef.current);
    }
    userDataSyncTimerRef.current = setTimeout(() => {
      const nextForm = userDataSyncPendingRef.current;
      userDataSyncPendingRef.current = null;
      try {
        updateUserData(sanitizeUserDataPayload(nextForm));
      } catch {
        // Ignore
      }
    }, 300);
    return () => {
      if (userDataSyncTimerRef.current) {
        clearTimeout(userDataSyncTimerRef.current);
        userDataSyncTimerRef.current = null;
      }
    };
  }, [allowAutosave, form, updateUserData]);

  // Important: do NOT auto-save on login/refresh unless the user actually changed something.
  // Autosaves are triggered by persistForm when the user edits fields.

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const container = document.getElementById('onboarding-container');
      if (container) container.scrollTop = 0;
    };
    
    scrollToTop();
    
    // Backup scroll after a delay
    const timer = setTimeout(scrollToTop, 50);
    
    return () => clearTimeout(timer);
  }, [step]);

  // Listen for child step notifications (e.g., after re-analysis) to clear any navigation locks
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event?.data?.type === 'RESET_NAVIGATION_STATE') {
        setIsNavigating(false);
        setIsLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleNext = async (data: any) => {
    // Prevent double-clicks
    if (isNavigating) return;
    
    setIsNavigating(true);
    setIsLoading(true);

    try {
      const updatedForm = { ...form, ...data };
      setForm(updatedForm);
      
      // Keep shared user data context in sync so calorie targets/macros recalc immediately
      updateUserData(updatedForm);
      try {
        const canonical = onboardingGuardSnapshotJson(updatedForm);
        if (!formBaselineRef.current || canonical !== formBaselineRef.current) {
          markUnsavedChanges();
        }
      } catch {
        markUnsavedChanges();
      }
      
      // Re-enabled debounced save with safer mechanism
      if (!SAVE_HEALTH_SETUP_ON_LEAVE_ONLY) {
        debouncedSave(updatedForm);
      }
      
      // Add small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 150));
      
      setStep((prev) => {
        const newStep = Math.min(stepNames.length - 1, prev + 1);
        // Update URL to remember step position
        const url = new URL(window.location.href);
        url.searchParams.set('step', (newStep + 1).toString());
        window.history.replaceState({}, '', url.toString());
        
        // Force immediate scroll
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          const container = document.getElementById('onboarding-container');
          if (container) container.scrollTop = 0;
        });
        return newStep;
      });
    } finally {
      setIsLoading(false);
      setIsNavigating(false);
    }
  };

  const handleBack = () => {
    // Prevent navigation during loading
    if (isNavigating) return;
    
    // Reset navigation state to prevent freeze
    setIsNavigating(false);
    setIsLoading(false);
    
    setStep((prev) => {
      const newStep = Math.max(0, prev - 1);
      // Update URL to remember step position
      const url = new URL(window.location.href);
      url.searchParams.set('step', (newStep + 1).toString());
      window.history.replaceState({}, '', url.toString());
      
      // Force immediate scroll
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const container = document.getElementById('onboarding-container');
        if (container) container.scrollTop = 0;
      });
      return newStep;
    });
  };

  const goToStep = (stepIndex: number) => {
    // Prevent navigation during loading
    if (isNavigating) return;
    
    // Reset navigation state to prevent freeze
    setIsNavigating(false);
    setIsLoading(false);
    
    setStep(stepIndex);
    // Update URL to remember step position
    const url = new URL(window.location.href);
    url.searchParams.set('step', (stepIndex + 1).toString());
    window.history.replaceState({}, '', url.toString());
    
    // Force immediate scroll
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const container = document.getElementById('onboarding-container');
      if (container) container.scrollTop = 0;
    });
  };

  // Mobile sliding window navigation
  const getMobileProgressWindow = () => {
    const currentStep = step + 1; // 1-indexed for display
    const totalSteps = 11;
    
    // Show current + 2 before/after when possible
    let start = Math.max(1, currentStep - 2);
    let end = Math.min(totalSteps, currentStep + 2);
    
    // Adjust if we're near the beginning or end
    if (end - start < 4) {
      if (start === 1) {
        end = Math.min(totalSteps, start + 4);
      } else if (end === totalSteps) {
        start = Math.max(1, end - 4);
      }
    }
    
    const steps = [];
    for (let i = start; i <= end; i++) {
      steps.push(i);
    }
    
    return { steps, canGoLeft: start > 1, canGoRight: end < totalSteps };
  };

  const mobileProgress = getMobileProgressWindow();

  const handleDeferFirstTime = () => {
    // Allow user to leave onboarding for this browser session without being
    // forced back from the dashboard, but continue to remind them on future
    // visits until health setup is actually complete.
    try {
      sessionStorage.setItem('onboardingDeferredThisSession', '1')
    } catch {
      // Ignore storage errors – deferral will just apply to this navigation
    }
    triggerInsightsUpdateOnExit('defer')
    window.location.replace('/dashboard?deferred=1');
  };

  const handleContinueFirstTime = () => {
    setFirstTimeModalDismissed(true);
    setShowFirstTimeModal(false);
  };

  const handleBottomNav = useCallback((path: string) => {
    return (event?: React.MouseEvent) => {
      event?.preventDefault();
      try {
        triggerInsightsUpdateOnExitRef.current('bottom-nav');
      } catch {}
      window.location.assign(path);
    };
  }, []);

  const handleHeaderMenuNav = useCallback((path: string) => {
    return (event?: React.MouseEvent) => {
      event?.preventDefault();
      setDropdownOpen(false);
      try {
        triggerInsightsUpdateOnExitRef.current('header-menu');
      } catch {}
      window.location.assign(path);
    };
  }, []);

  // Refresh UsageMeter when credits are updated elsewhere
  useEffect(() => {
    const handler = () => setUsageMeterRefresh((v) => v + 1);
    try { window.addEventListener('helfiCreditsUpdated', handler as any); } catch {}
    return () => { try { window.removeEventListener('helfiCreditsUpdated', handler as any); } catch {} };
  }, []);

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900 overflow-y-auto overflow-x-hidden" id="onboarding-container">
      {showFirstTimeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900">Complete your health setup</h2>
            <p className="mt-2 text-sm text-gray-600">In order for Helfi to track your health you must complete the health setup.</p>
            <div className="mt-6 space-y-3">
              <button type="button" onClick={handleContinueFirstTime} className="w-full inline-flex items-center justify-center rounded-md bg-helfi-green text-white px-4 py-2 font-medium hover:opacity-90">Continue</button>
              <button type="button" onClick={handleDeferFirstTime} className="w-full inline-flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-800 px-4 py-2 font-medium hover:bg-gray-50">I'll do it later</button>
            </div>
          </div>
        </div>
      )}
      <div className="min-h-full flex flex-col max-w-full">
        {/* Sophisticated Progress with Numbered Steps */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-8 py-3 safe-area-inset-top z-50">
          <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
            {/* Back Button */}
            <a 
              href="/dashboard"
              className="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              title="back button to Dashboard"
              onClick={() => {
                triggerInsightsUpdateOnExit('dashboard');
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="ml-2 hidden md:inline font-medium">Go To Dashboard</span>
            </a>
            
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Health Info
            </h1>
            
            {/* Refresh Button & Profile Dropdown */}
            <div className="flex items-center space-x-2">
              {/* Refresh Button */}
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                title="Refresh"
                aria-label="Refresh"
              >
                <svg
                  className="w-4 h-4 text-gray-600 dark:text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>
              
              {/* Profile Avatar & Dropdown */}
              <div className="relative dropdown-container" id="profile-dropdown">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="focus:outline-none"
                  aria-label="Open profile menu"
                >
                  {hasProfileImage ? (
                    <Image
                      src={userImage}
                      alt="Profile"
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-helfi-green shadow-sm flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                  )}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg py-2 z-50 border border-gray-100 dark:border-gray-700 animate-fade-in">
                    <div className="flex items-center px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    {hasProfileImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                        <UserIcon className="w-6 h-6 text-white" aria-hidden="true" />
                      </div>
                    )}
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{userName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{session?.user?.email || 'user@email.com'}</div>
                      </div>
                    </div>
                    <Link href="/profile" onClick={handleHeaderMenuNav('/profile')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Profile</Link>
                    <Link href="/account" onClick={handleHeaderMenuNav('/account')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Account Settings</Link>
                    <Link href="/profile/image" onClick={handleHeaderMenuNav('/profile/image')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Upload/Change Profile Photo</Link>
                    <Link href="/billing" onClick={handleHeaderMenuNav('/billing')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Subscription & Billing</Link>
                    {affiliateMenu && (
                      <Link href={affiliateMenu.href} onClick={handleHeaderMenuNav(affiliateMenu.href)} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                        {affiliateMenu.label}
                      </Link>
                    )}
                    <Link href="/notifications" onClick={handleHeaderMenuNav('/notifications')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Notifications</Link>
                    <Link href="/privacy" onClick={handleHeaderMenuNav('/privacy')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Privacy Settings</Link>
                    <Link href="/help" onClick={handleHeaderMenuNav('/help')} className="block px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Help & Support</Link>
                    <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
                    <button
                      onClick={() => signOut()}
                      className="block w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Mobile: Sliding Window Navigation */}
          <div className="sm:hidden mb-2">
            <div className="flex items-center justify-center space-x-2">
              {/* Left Arrow */}
              <button
                onClick={() => goToStep(step - 1)}
                disabled={step === 0 || isNavigating}
                className={`p-1 rounded ${
                  step === 0 || isNavigating
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Sliding Step Numbers */}
              <div className="flex items-center space-x-1">
                {mobileProgress.steps.map((stepNum) => (
                  <button
                    key={stepNum}
                    onClick={() => goToStep(stepNum - 1)}
                    disabled={isNavigating}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      stepNum === step + 1 
                        ? 'bg-green-600 text-white' 
                        : stepNum < step + 1
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                    } ${isNavigating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105'}`}
                    title={`Go to step ${stepNum}: ${stepNames[stepNum - 1]}`}
                  >
                    {stepNum}
                  </button>
                ))}
              </div>

              {/* Right Arrow */}
              <button
                onClick={() => goToStep(step + 1)}
                disabled={step === stepNames.length - 1 || isNavigating}
                className={`p-1 rounded ${
                  step === stepNames.length - 1 || isNavigating
                    ? 'text-gray-300 cursor-not-allowed' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Mobile Step Name and Progress */}
            <div className="text-center mt-2">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{stepNames[step]}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Step {step + 1} of {stepNames.length}</div>
            </div>
          </div>
          
          {/* Desktop: Full Numbered Steps (unchanged) */}
          <div className="hidden sm:block relative mb-3">
            <div className="flex items-center justify-center max-w-4xl mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((stepNum, index) => (
                <div key={stepNum} className="flex items-center">
                  <button 
                    onClick={() => goToStep(stepNum - 1)}
                    disabled={isNavigating}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all z-10 ${
                      isNavigating 
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:scale-105'
                    } ${
                      stepNum === step + 1 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : stepNum < step + 1
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-300 text-gray-600 hover:bg-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={`Go to step ${stepNum}: ${stepNames[stepNum - 1]}`}
                  >
                    {stepNum}
                  </button>
                  {index < 10 && (
                    <div className={`h-0.5 w-4 transition-all ${
                      stepNum < step + 1 ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3 max-w-4xl mx-auto">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${((step + 1) / stepNames.length) * 100}%` }}
            />
          </div>

          {/* Credits Meter */}
          <div className="max-w-4xl mx-auto">
            <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <div className="flex items-center space-x-2 text-green-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm font-medium">Loading...</span>
              </div>
            </div>
          )}

          {/* Skip and Step Info - Desktop Only */}
          <div className="hidden sm:flex items-center justify-between max-w-4xl mx-auto">
            <button className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Skip</button>
            <div className="text-center">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{stepNames[step]}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Step {step + 1} of 11</div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{step + 1}/11</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-2 pb-20">
          {step === 0 && <GenderStep onNext={handleNext} initial={form.gender} initialAgreed={form.termsAccepted} onPartialSave={persistForm} />}
          {step === 1 && <PhysicalStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} serverHydrationKey={serverHydrationKey} onUnsavedChange={markUnsavedChanges} onInsightsSaved={() => { setHasGlobalUnsavedChanges(false); syncFormBaseline(); }} />}
          {step === 2 && <ExerciseStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} onUnsavedChange={markUnsavedChanges} onInsightsSaved={() => { setHasGlobalUnsavedChanges(false); syncFormBaseline(); }} />}
          {step === 3 && <HealthGoalsStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} onUnsavedChange={markUnsavedChanges} onInsightsSaved={() => { setHasGlobalUnsavedChanges(false); syncFormBaseline(); }} />}
          {step === 4 && <HealthSituationsStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} onUnsavedChange={markUnsavedChanges} onInsightsSaved={() => { setHasGlobalUnsavedChanges(false); syncFormBaseline(); }} />}
          {step === 5 && <SupplementsStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} onNavigateToAnalysis={(data?: any) => {
            // REAL FIX: Use flushSync to ensure state updates complete before navigation
            if (data) {
              flushSync(() => {
                setForm((prevForm: any) => ({ ...prevForm, ...data }));
              });
              // Save immediately (not debounced) so newly added supplements persist across refresh
              try {
                const updated = { ...form, ...data };
                (async () => {
                  try {
                    await fetch('/api/user-data', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(sanitizeUserDataPayload(updated))
                    });
                  } catch (e) {
                    console.warn('Supplements immediate save failed:', e);
                  }
                })();
              } catch (e) {
                console.warn('Supplements immediate save scheduling failed:', e);
              }
              // Now navigation happens after state is guaranteed to be updated
              goToStep(7);
            } else {
              goToStep(7);
            }
          }} />}
          {step === 6 && <MedicationsStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} onRequestAnalysis={() => setAnalysisRequestId((prev) => prev + 1)} onNavigateToAnalysis={(data?: any) => {
            // REAL FIX: Use flushSync to ensure state updates complete before navigation
            if (data) {
              flushSync(() => {
                setForm((prevForm: any) => ({ ...prevForm, ...data }));
              });
              // Save immediately (not debounced) so newly added medications persist across refresh
              try {
                const updated = { ...form, ...data };
                (async () => {
                  try {
                    await fetch('/api/user-data', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(sanitizeUserDataPayload(updated))
                    });
                  } catch (e) {
                    console.warn('Medications immediate save failed:', e);
                  }
                })();
              } catch (e) {
                console.warn('Medications immediate save scheduling failed:', e);
              }
              // Now navigation happens after state is guaranteed to be updated
              goToStep(7);
            } else {
              goToStep(7);
            }
          }} />}
          {step === 7 && <InteractionAnalysisStep 
            onNext={handleNext} 
            onBack={handleBack} 
            initial={form} 
            analysisRequestId={analysisRequestId}
            onAnalysisSettled={() => { 
              setIsNavigating(false); 
              setIsLoading(false);
            }}
          />}
          {step === 8 && <BloodResultsStep onNext={handleNext} onBack={handleBack} initial={form} onPartialSave={persistForm} />}
          {step === 9 && <AIInsightsStep onNext={handleNext} onBack={handleBack} initial={form} />}
          {step === 10 && <ReviewStep onBack={handleBack} data={form} />}
        </div>

        <UpdateInsightsPopup
          isOpen={showGlobalUpdatePopup}
          onClose={() => {
            pendingNavigationRef.current = null;
            setShowGlobalUpdatePopup(false);
          }}
          onAddMore={() => {
            setShowGlobalUpdatePopup(false);
            runPendingNavigation();
          }}
          onUpdateInsights={async () => {
            setIsGlobalGenerating(true);
            try {
              const changeTypes = detectChangedInsightTypes(formBaselineRef.current, formRef.current || form);
              // Step 1: Save data immediately
              const payload = sanitizeUserDataPayload(formRef.current || form);
              const saveResponse = await fetch('/api/user-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              if (!saveResponse.ok) {
                alert('Failed to save your changes. Please try again.');
                return;
              }

              // Data saved successfully
              updateUserData(payload);
          try {
            window.dispatchEvent(new Event('userData:refresh'));
          } catch {}

              // Step 2: Fire regen in background WITHOUT waiting (only when change types exist)
              if (changeTypes.length) {
                fireAndForgetInsightsRegen(changeTypes);
              }
              
              // Step 3: Close popup immediately - data is saved, regen is in background
              setHasGlobalUnsavedChanges(false);
              syncFormBaseline();
              setShowGlobalUpdatePopup(false);
              runPendingNavigation();
            } catch (error) {
              console.warn('Error saving data:', error);
              alert('Failed to save your changes. Please try again.');
            } finally {
              setIsGlobalGenerating(false);
            }
          }}
          isGenerating={isGlobalGenerating}
        />

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
          <div className="flex items-center justify-around">
            
            {/* Dashboard */}
            <Link href="/dashboard" onClick={handleBottomNav('/dashboard')} className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Dashboard</span>
            </Link>

            {/* Insights */}
            <Link href="/insights" onClick={handleBottomNav('/insights')} className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Insights</span>
            </Link>

            {/* Food */}
            <Link href="/food" onClick={handleBottomNav('/food')} className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Food</span>
            </Link>

            {/* More */}
            <MobileMoreMenu />

            {/* Settings */}
            <Link href="/settings" onClick={handleBottomNav('/settings')} className="flex flex-col items-center py-2 px-1 min-w-0 flex-1">
              <div className="text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756.426-1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-medium truncate">Settings</span>
            </Link>
          </div>
        </nav>

        {/* Background Regen Status Indicator */}
        {backgroundRegenStatus.isRegenerating && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in duration-300 pointer-events-none">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/90 to-slate-800/90 px-4 py-2.5 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur max-w-[90vw]">
              <svg className="h-4 w-4 animate-spin text-emerald-200/90" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="font-medium leading-snug">{backgroundRegenStatus.message || 'Updating insights...'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
