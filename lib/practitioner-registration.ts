type RegistrationRule = {
  label: string
  helper: string
  digitCounts?: number[]
  minDigits?: number
  maxDigits?: number
}

const COUNTRY_RULES: Array<{ match: string[]; rule: RegistrationRule }> = [
  {
    match: ['australia', 'au'],
    rule: { label: 'ABN', helper: '11 digits', digitCounts: [11] },
  },
  {
    match: ['united states', 'united states of america', 'usa', 'us'],
    rule: { label: 'EIN', helper: '9 digits', digitCounts: [9] },
  },
  {
    match: ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
    rule: { label: 'Company number', helper: '8 digits', digitCounts: [8] },
  },
  {
    match: ['new zealand', 'nz'],
    rule: { label: 'NZBN', helper: '13 digits', digitCounts: [13] },
  },
  {
    match: ['canada', 'ca'],
    rule: { label: 'Business number (BN)', helper: '9 digits', digitCounts: [9] },
  },
]

const DEFAULT_RULE: RegistrationRule = {
  label: 'Business registration number',
  helper: '6-20 digits',
  minDigits: 6,
  maxDigits: 20,
}

function normalizeCountry(input: string | null | undefined): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function formatDigitRequirement(rule: RegistrationRule): string {
  if (rule.digitCounts && rule.digitCounts.length > 0) {
    if (rule.digitCounts.length === 1) return `${rule.digitCounts[0]} digits`
    const counts = [...rule.digitCounts].sort((a, b) => a - b)
    const last = counts.pop()
    return `${counts.join(', ')} or ${last} digits`
  }
  if (rule.minDigits && rule.maxDigits) {
    return `${rule.minDigits}-${rule.maxDigits} digits`
  }
  return 'valid digits'
}

export function getBusinessRegistrationRule(country: string | null | undefined): RegistrationRule {
  const normalized = normalizeCountry(country)
  if (!normalized) return DEFAULT_RULE

  for (const entry of COUNTRY_RULES) {
    if (entry.match.some((match) => normalized === match || normalized.includes(match))) {
      return entry.rule
    }
  }

  return DEFAULT_RULE
}

export function validateBusinessRegistrationNumber(
  value: string | null | undefined,
  country: string | null | undefined
): {
  valid: boolean
  error?: string
  digits?: string
  rule: RegistrationRule
} {
  const rule = getBusinessRegistrationRule(country)
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return {
      valid: false,
      error: 'Business registration number is required.',
      rule,
    }
  }

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) {
    return {
      valid: false,
      error: `${rule.label} must include digits.`,
      rule,
    }
  }
  if (/[A-Za-z]/.test(trimmed)) {
    return {
      valid: false,
      error: `${rule.label} must use digits only.`,
      rule,
    }
  }

  if (rule.digitCounts && !rule.digitCounts.includes(digits.length)) {
    return {
      valid: false,
      error: `${rule.label} must be ${formatDigitRequirement(rule)}.`,
      rule,
    }
  }

  if (rule.minDigits && rule.maxDigits) {
    if (digits.length < rule.minDigits || digits.length > rule.maxDigits) {
      return {
        valid: false,
        error: `${rule.label} must be ${formatDigitRequirement(rule)}.`,
        rule,
      }
    }
  }

  return { valid: true, digits, rule }
}
