import { prisma } from '@/lib/prisma'
import { calculateDistanceKm } from '@/lib/practitioner-utils'
import { createTrackingToken } from '@/lib/practitioner-tracking'

type RecommendationSource = 'onboarding' | 'chat' | 'image' | 'symptom-analysis' | string

type PractitionerRecommendationInput = {
  lat: number
  lng: number
  issueText: string
  sourceArea?: RecommendationSource
  country?: string | null
  radiusKm?: number
  maxRadiusKm?: number
  limit?: number
}

type PractitionerTarget = {
  terms: string[]
  category: string
  subcategory?: string
  issueLabel: string
  reasonLabel: string
  score: number
}

const DEFAULT_RADIUS_KM = 10
const MAX_RADIUS_KM = 15
const DEFAULT_LIMIT = 3

const PRACTITIONER_TARGETS: PractitionerTarget[] = [
  {
    terms: ['back pain', 'sore back', 'lower back pain', 'upper back pain', 'backache', 'neck pain', 'spine', 'sciatica'],
    category: 'Allied Health',
    subcategory: 'Physiotherapist',
    issueLabel: 'back pain',
    reasonLabel: 'Physiotherapy can be relevant for back, neck, and movement-related pain.',
    score: 95,
  },
  {
    terms: ['back pain', 'sore back', 'lower back pain', 'upper back pain', 'backache', 'neck pain', 'spine', 'sciatica'],
    category: 'Allied Health',
    subcategory: 'Chiropractor',
    issueLabel: 'back pain',
    reasonLabel: 'Chiropractic care can be relevant for some back and neck concerns.',
    score: 90,
  },
  {
    terms: ['back pain', 'sore back', 'lower back pain', 'upper back pain', 'backache', 'neck pain', 'posture', 'hip pain'],
    category: 'Allied Health',
    subcategory: 'Osteopath',
    issueLabel: 'back pain',
    reasonLabel: 'Osteopathy can be relevant for posture, mobility, and musculoskeletal pain.',
    score: 86,
  },
  {
    terms: ['sports injury', 'injury', 'sprain', 'strain', 'knee injury', 'shoulder pain', 'acl injury', 'running injury', 'gym injury'],
    category: 'Musculoskeletal & Pain',
    subcategory: 'Sports Physiotherapy',
    issueLabel: 'injury',
    reasonLabel: 'Sports physiotherapy can be relevant for injury recovery and movement support.',
    score: 92,
  },
  {
    terms: ['sports injury', 'injury', 'sprain', 'strain', 'running injury', 'gym injury'],
    category: 'GPs & Doctors',
    subcategory: 'Sports Doctor',
    issueLabel: 'injury',
    reasonLabel: 'A sports doctor can be relevant for injury assessment and care planning.',
    score: 88,
  },
  {
    terms: ['rash', 'skin rash', 'itchy skin', 'hives', 'eczema', 'psoriasis', 'acne', 'mole', 'skin lesion', 'skin issue', 'wound'],
    category: 'GPs & Doctors',
    subcategory: 'Dermatologist',
    issueLabel: 'skin concern',
    reasonLabel: 'Dermatology can be relevant for rashes, lesions, and other skin concerns.',
    score: 96,
  },
  {
    terms: ['rash', 'skin rash', 'itchy skin', 'hives', 'swelling', 'wound', 'infection', 'skin issue'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'skin concern',
    reasonLabel: 'A GP can be a useful first step for many skin, swelling, and infection concerns.',
    score: 82,
  },
  {
    terms: ['anxiety', 'stress', 'panic', 'panic attacks', 'depression', 'low mood', 'burnout', 'overthinking'],
    category: 'Mental Health',
    subcategory: 'Psychologist',
    issueLabel: 'mental health concern',
    reasonLabel: 'Psychology can be relevant for anxiety, stress, mood, and coping support.',
    score: 95,
  },
  {
    terms: ['anxiety', 'stress', 'grief', 'burnout', 'relationship stress', 'counselling', 'counseling'],
    category: 'Mental Health',
    subcategory: 'Counsellor',
    issueLabel: 'mental health concern',
    reasonLabel: 'Counselling can be relevant for stress, grief, and emotional support.',
    score: 88,
  },
  {
    terms: ['anxiety', 'panic', 'depression', 'low mood', 'mental health'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'mental health concern',
    reasonLabel: 'A GP can be a useful first step for mental health support and referrals.',
    score: 76,
  },
  {
    terms: ['gut', 'digestion', 'digestive', 'ibs', 'bloating', 'constipation', 'diarrhea', 'diarrhoea', 'reflux', 'heartburn', 'abdominal pain', 'stomach pain', 'bowel movements'],
    category: 'Allied Health',
    subcategory: 'Dietitian',
    issueLabel: 'gut or digestion concern',
    reasonLabel: 'Dietitians can be relevant for digestion, gut symptoms, and food-related support.',
    score: 92,
  },
  {
    terms: ['gut', 'digestion', 'digestive', 'ibs', 'bloating', 'constipation', 'diarrhea', 'diarrhoea', 'reflux', 'heartburn', 'abdominal pain', 'stomach pain'],
    category: 'Nutrition & Metabolic Health',
    subcategory: 'Dietitian',
    issueLabel: 'gut or digestion concern',
    reasonLabel: 'Dietitians can be relevant for digestion, gut symptoms, and food-related support.',
    score: 92,
  },
  {
    terms: ['gut', 'digestion', 'digestive', 'ibs', 'reflux', 'heartburn', 'abdominal pain', 'stomach pain', 'bowel movements'],
    category: 'GPs & Doctors',
    subcategory: 'Gastroenterologist',
    issueLabel: 'gut or digestion concern',
    reasonLabel: 'Gastroenterology can be relevant for ongoing gut and digestive concerns.',
    score: 90,
  },
  {
    terms: ['gut', 'digestion', 'digestive', 'stomach pain', 'abdominal pain', 'bowel movements'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'gut or digestion concern',
    reasonLabel: 'A GP can be a useful first step for digestive symptoms and referrals.',
    score: 74,
  },
  {
    terms: ['hormone', 'hormones', 'thyroid', 'pcos', 'menopause', 'insulin resistance', 'metabolic syndrome'],
    category: 'GPs & Doctors',
    subcategory: 'Endocrinologist',
    issueLabel: 'hormone concern',
    reasonLabel: 'Endocrinology can be relevant for hormone, thyroid, and metabolic concerns.',
    score: 94,
  },
  {
    terms: ['low testosterone', 'testosterone', 'erection quality', 'erectile dysfunction', 'libido', 'low libido', 'mens health', 'men health'],
    category: "Men's Health",
    subcategory: "Men's Health GP",
    issueLabel: "men's health concern",
    reasonLabel: "A men's health GP can be relevant for libido, testosterone, and male health concerns.",
    score: 92,
  },
  {
    terms: ['low testosterone', 'testosterone', 'erection quality', 'erectile dysfunction', 'libido', 'low libido'],
    category: "Men's Health",
    subcategory: 'Hormone / Testosterone Clinic',
    issueLabel: "men's health concern",
    reasonLabel: 'Hormone clinics can be relevant for testosterone and libido concerns.',
    score: 88,
  },
  {
    terms: ['sleep', 'sleep quality', 'insomnia', 'snoring', 'sleep apnea', 'sleep apnoea', 'daytime sleepiness', 'wake up tired'],
    category: 'GPs & Doctors',
    subcategory: 'Sleep Physician',
    issueLabel: 'sleep concern',
    reasonLabel: 'Sleep medicine can be relevant for insomnia, snoring, and poor sleep quality.',
    score: 94,
  },
  {
    terms: ['sleep', 'sleep quality', 'insomnia', 'stress sleep', 'anxiety sleep'],
    category: 'Mental Health',
    subcategory: 'Psychologist',
    issueLabel: 'sleep concern',
    reasonLabel: 'Psychology can be relevant when stress, anxiety, or habits affect sleep.',
    score: 78,
  },
  {
    terms: ['sleep', 'sleep quality', 'insomnia', 'snoring', 'wake up tired'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'sleep concern',
    reasonLabel: 'A GP can be a useful first step for sleep problems and referrals.',
    score: 74,
  },
  {
    terms: ['tooth pain', 'toothache', 'dental pain', 'sore gums', 'gum pain', 'bleeding gums'],
    category: 'Dental & Oral Health',
    subcategory: 'Dentist',
    issueLabel: 'dental concern',
    reasonLabel: 'Dental care can be relevant for tooth, gum, and oral health concerns.',
    score: 96,
  },
  {
    terms: ['eye', 'eye pain', 'vision', 'blurred vision', 'floaters', 'glaucoma', 'cataract'],
    category: 'Eye & Hearing',
    subcategory: 'Optometrist',
    issueLabel: 'eye concern',
    reasonLabel: 'Optometry can be relevant for vision and eye concerns.',
    score: 90,
  },
  {
    terms: ['eye specialist', 'vision loss', 'sudden vision', 'eye pressure'],
    category: 'Eye & Hearing',
    subcategory: 'Ophthalmologist',
    issueLabel: 'eye concern',
    reasonLabel: 'Ophthalmology can be relevant for more serious or specialist eye concerns.',
    score: 92,
  },
  {
    terms: ['hearing', 'hearing loss', 'tinnitus', 'ringing ears', 'muffled hearing'],
    category: 'Eye & Hearing',
    subcategory: 'Audiologist',
    issueLabel: 'hearing concern',
    reasonLabel: 'Audiology can be relevant for hearing loss, tinnitus, and hearing checks.',
    score: 94,
  },
  {
    terms: ['ear pain', 'ear infection', 'sinus', 'blocked ears', 'tonsillitis', 'hearing loss'],
    category: 'GPs & Doctors',
    subcategory: 'ENT Specialist',
    issueLabel: 'ear, nose, or throat concern',
    reasonLabel: 'ENT care can be relevant for ear, nose, throat, sinus, and hearing concerns.',
    score: 88,
  },
  {
    terms: ['headache', 'headaches', 'migraine', 'head pressure', 'dizziness', 'vertigo'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'headache or dizziness concern',
    reasonLabel: 'A GP can be a useful first step for headaches, dizziness, and referrals.',
    score: 82,
  },
  {
    terms: ['headache', 'headaches', 'migraine', 'nerve symptoms', 'numbness', 'tingling', 'vertigo'],
    category: 'GPs & Doctors',
    subcategory: 'Neurologist',
    issueLabel: 'headache or nerve concern',
    reasonLabel: 'Neurology can be relevant for migraines, nerve symptoms, or ongoing headaches.',
    score: 88,
  },
  {
    terms: ['allergies', 'allergy', 'hay fever', 'hives', 'food allergy', 'anaphylaxis'],
    category: 'GPs & Doctors',
    subcategory: 'Immunologist / Allergist',
    issueLabel: 'allergy concern',
    reasonLabel: 'Allergy care can be relevant for hay fever, hives, and food allergy concerns.',
    score: 90,
  },
  {
    terms: ['allergies', 'allergy', 'hay fever', 'hives'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'allergy concern',
    reasonLabel: 'A GP can be a useful first step for allergy symptoms and referrals.',
    score: 74,
  },
  {
    terms: ['energy', 'fatigue', 'low energy', 'always tired', 'feeling tired', 'feeling unwell'],
    category: 'GPs & Doctors',
    subcategory: 'General Practitioner (GP)',
    issueLabel: 'energy or fatigue concern',
    reasonLabel: 'A GP can be a useful first step for fatigue and low energy.',
    score: 78,
  },
]

function normalize(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: string | null | undefined): string {
  return normalize(value).replace(/\s+/g, '')
}

function matchesTerm(text: string, term: string): boolean {
  const normalizedText = normalize(text)
  const normalizedTerm = normalize(term)
  if (!normalizedText || !normalizedTerm) return false
  if (normalizedText.includes(normalizedTerm)) return true
  return compact(normalizedText).includes(compact(normalizedTerm))
}

function uniqueTargets(issueText: string): PractitionerTarget[] {
  const matched = PRACTITIONER_TARGETS.filter((target) =>
    target.terms.some((term) => matchesTerm(issueText, term))
  )
  const bestByKey = new Map<string, PractitionerTarget>()
  matched.forEach((target) => {
    const key = `${normalize(target.category)}|${normalize(target.subcategory)}`
    const current = bestByKey.get(key)
    if (!current || target.score > current.score) bestByKey.set(key, target)
  })
  return Array.from(bestByKey.values()).sort((a, b) => b.score - a.score)
}

function profileScore(listing: any): number {
  let score = 0
  const images = listing.images as any
  if (images?.logoUrl) score += 1
  if (listing.description) score += 1
  if (listing.hoursJson) score += 1
  if (listing.websiteUrl) score += 2
  if (listing.phone) score += 1
  if (listing.emailPublic) score += 1
  if (listing.addressLine1 || listing.suburbCity) score += 1
  return score
}

function contactScore(listing: any): number {
  if (listing.websiteUrl) return 3
  if (listing.phone) return 2
  if (listing.emailPublic) return 1
  return 0
}

export function extractPractitionerRecommendationText(input: {
  issueText?: string | null
  symptoms?: string[] | null
  possibleCauses?: Array<{ name?: string | null }> | null
  summary?: string | null
  notes?: string | null
}) {
  return [
    input.issueText,
    Array.isArray(input.symptoms) ? input.symptoms.join(', ') : '',
    Array.isArray(input.possibleCauses)
      ? input.possibleCauses.map((cause) => cause?.name).filter(Boolean).join(', ')
      : '',
    input.summary,
    input.notes,
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}

export async function getPractitionerRecommendations(input: PractitionerRecommendationInput) {
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { results: [], radiusKm: DEFAULT_RADIUS_KM, matchedIssues: [] }
  }

  const issueText = String(input.issueText || '').trim()
  const targets = uniqueTargets(issueText)
  if (!targets.length) {
    return { results: [], radiusKm: DEFAULT_RADIUS_KM, matchedIssues: [] }
  }

  const requestedRadius = Number.isFinite(Number(input.radiusKm)) ? Number(input.radiusKm) : DEFAULT_RADIUS_KM
  const defaultRadius = Math.max(1, Math.min(DEFAULT_RADIUS_KM, requestedRadius))
  const maxRadius = Math.max(defaultRadius, Math.min(MAX_RADIUS_KM, Number(input.maxRadiusKm) || MAX_RADIUS_KM))
  const limit = Math.max(1, Math.min(6, Number(input.limit) || DEFAULT_LIMIT))
  const country = normalize(input.country)

  const listings = await prisma.practitionerListing.findMany({
    where: {
      status: 'ACTIVE',
      reviewStatus: 'APPROVED',
      visibilityReason: { in: ['TRIAL_ACTIVE', 'SUB_ACTIVE'] },
      lat: { not: null },
      lng: { not: null },
    },
    include: {
      category: true,
      subcategory: true,
    },
  })

  const scored = listings
    .map((listing) => {
      if (country && normalize(listing.country) && normalize(listing.country) !== country) return null
      const categoryName = normalize(listing.category?.name)
      const subcategoryName = normalize(listing.subcategory?.name)

      const target = targets.find((candidate) => {
        const targetCategory = normalize(candidate.category)
        const targetSubcategory = normalize(candidate.subcategory)
        if (targetSubcategory) {
          return targetSubcategory === subcategoryName || targetSubcategory === categoryName
        }
        return targetCategory === categoryName
      })
      if (!target) return null

      const distanceKm = calculateDistanceKm({ lat, lng }, { lat: listing.lat as number, lng: listing.lng as number })
      if (!Number.isFinite(distanceKm) || distanceKm > maxRadius) return null

      const exactSubcategory = normalize(target.subcategory) === subcategoryName
      const matchScore = target.score + (exactSubcategory ? 20 : 0)
      return {
        listing,
        target,
        distanceKm,
        matchScore,
        profileScore: profileScore(listing),
        contactScore: contactScore(listing),
      }
    })
    .filter(Boolean) as Array<{
      listing: any
      target: PractitionerTarget
      distanceKm: number
      matchScore: number
      profileScore: number
      contactScore: number
    }>

  const order = (items: typeof scored) =>
    items.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
      if (b.profileScore !== a.profileScore) return b.profileScore - a.profileScore
      if (b.contactScore !== a.contactScore) return b.contactScore - a.contactScore
      return String(a.listing.displayName || '').localeCompare(String(b.listing.displayName || ''))
    })

  const withinDefault = order(scored.filter((item) => item.distanceKm <= defaultRadius))
  const selected = withinDefault.length >= limit ? withinDefault.slice(0, limit) : order(scored).slice(0, limit)
  const usedRadius = selected.some((item) => item.distanceKm > defaultRadius) ? maxRadius : defaultRadius

  const results = selected.map((item) => ({
    id: item.listing.id,
    displayName: item.listing.displayName,
    slug: item.listing.slug,
    categoryName: item.listing.category?.name || null,
    subcategoryName: item.listing.subcategory?.name || null,
    description: item.listing.description || null,
    phone: item.listing.phone || null,
    websiteUrl: item.listing.websiteUrl || null,
    emailPublic: item.listing.emailPublic || null,
    addressLine1: item.listing.addressLine1 || null,
    suburbCity: item.listing.suburbCity || null,
    stateRegion: item.listing.stateRegion || null,
    country: item.listing.country || null,
    lat: item.listing.lat,
    lng: item.listing.lng,
    serviceType: item.listing.serviceType,
    distanceKm: Math.round(item.distanceKm * 10) / 10,
    reason: item.target.reasonLabel,
    matchedIssue: item.target.issueLabel,
    trackingToken: createTrackingToken(item.listing.id),
  }))

  return {
    results,
    radiusKm: usedRadius,
    matchedIssues: Array.from(new Set(selected.map((item) => item.target.issueLabel))),
    sourceArea: input.sourceArea || null,
  }
}
