import { prisma } from '@/lib/prisma'

export type HealthProfile = {
  weightKg: number | null
  heightCm: number | null
  ageYears: number | null
  primaryGoal: 'LOSE' | 'MAINTAIN' | 'GAIN' | 'SHRED' | null
  intensity: 'MILD' | 'STANDARD' | 'AGGRESSIVE' | null
  bodyType: 'ECTO' | 'MESO' | 'ENDO' | null
}

function calculateAgeYears(birthdate?: string | null): number | null {
  if (!birthdate) return null
  const [y, m, d] = birthdate.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  const dayDiff = today.getDate() - d
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  if (!Number.isFinite(age) || age <= 0 || age > 110) return null
  return age
}

function mapGoal(choice?: string | null): HealthProfile['primaryGoal'] {
  const v = (choice || '').toLowerCase()
  if (v.includes('shred')) return 'SHRED'
  if (v.includes('lose')) return 'LOSE'
  if (v.includes('gain') || v.includes('bulk')) return 'GAIN'
  if (v.includes('maintain')) return 'MAINTAIN'
  return null
}

function mapIntensity(v?: string | null): HealthProfile['intensity'] {
  const raw = (v || '').toLowerCase()
  if (raw === 'mild') return 'MILD'
  if (raw === 'aggressive') return 'AGGRESSIVE'
  if (raw === 'standard') return 'STANDARD'
  return null
}

function mapBodyType(v: any): HealthProfile['bodyType'] {
  if (v === 'ECTOMORPH') return 'ECTO'
  if (v === 'MESOMORPH') return 'MESO'
  if (v === 'ENDOMORPH') return 'ENDO'
  return null
}

export async function getHealthProfileForUser(userId: string): Promise<HealthProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { healthGoals: true },
  })

  if (!user) {
    return {
      weightKg: null,
      heightCm: null,
      ageYears: null,
      primaryGoal: null,
      intensity: null,
      bodyType: null,
    }
  }

  const profileInfoGoal = user.healthGoals.find((goal: any) => goal.name === '__PROFILE_INFO_DATA__')
  let dateOfBirth = ''
  try {
    const parsed = profileInfoGoal?.category ? JSON.parse(profileInfoGoal.category) : null
    if (parsed && typeof parsed?.dateOfBirth === 'string') dateOfBirth = parsed.dateOfBirth
  } catch {
    // ignore
  }

  const primaryGoalRecord = user.healthGoals.find((goal: any) => goal.name === '__PRIMARY_GOAL__')
  let goalChoice = ''
  let goalIntensity = ''
  try {
    const parsed = primaryGoalRecord?.category ? JSON.parse(primaryGoalRecord.category) : null
    if (parsed && typeof parsed?.goalChoice === 'string') goalChoice = parsed.goalChoice
    if (parsed && typeof parsed?.goalIntensity === 'string') goalIntensity = parsed.goalIntensity
  } catch {
    // ignore
  }

  return {
    weightKg: typeof user.weight === 'number' && Number.isFinite(user.weight) ? user.weight : null,
    heightCm: typeof user.height === 'number' && Number.isFinite(user.height) ? user.height : null,
    ageYears: calculateAgeYears(dateOfBirth),
    primaryGoal: mapGoal(goalChoice),
    intensity: mapIntensity(goalIntensity),
    bodyType: mapBodyType(user.bodyType),
  }
}

