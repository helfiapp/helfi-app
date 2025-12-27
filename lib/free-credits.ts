import { prisma } from '@/lib/prisma';

/**
 * Free Credits System
 * 
 * New users receive:
 * - 5 x Food image analysis
 * - 2 x Symptom analysis
 * - 2 x Medical image analysis
 * - 2 x Supplement/Medication interaction analysis
 * - 1 x Full Health intake analysis (when completing onboarding page 11)
 * - 3 x Insights updates (when changing health setup)
 * 
 * These credits are consumed BEFORE wallet credits.
 * Low credits warning only shows AFTER free credits are exhausted.
 */

export type FreeCreditType = 
  | 'FOOD_ANALYSIS'
  | 'SYMPTOM_ANALYSIS'
  | 'MEDICAL_ANALYSIS'
  | 'INTERACTION_ANALYSIS'
  | 'HEALTH_INTAKE'
  | 'INSIGHTS_UPDATE';

const FREE_CREDIT_FIELDS: Record<FreeCreditType, keyof any> = {
  FOOD_ANALYSIS: 'freeFoodAnalysisRemaining',
  SYMPTOM_ANALYSIS: 'freeSymptomAnalysisRemaining',
  MEDICAL_ANALYSIS: 'freeMedicalAnalysisRemaining',
  INTERACTION_ANALYSIS: 'freeInteractionAnalysisRemaining',
  HEALTH_INTAKE: 'freeHealthIntakeRemaining',
  INSIGHTS_UPDATE: 'freeInsightsUpdateRemaining',
};

/**
 * Check if user has free credits remaining for a feature
 */
export async function hasFreeCredits(
  userId: string,
  creditType: FreeCreditType
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [FREE_CREDIT_FIELDS[creditType]]: true } as any,
  });

  if (!user) return false;

  const remaining = (user as any)[FREE_CREDIT_FIELDS[creditType]] as number | undefined;
  return (remaining ?? 0) > 0;
}

/**
 * Consume one free credit for a feature
 * Returns true if credit was consumed, false if none available
 */
export async function consumeFreeCredit(
  userId: string,
  creditType: FreeCreditType
): Promise<boolean> {
  const field = FREE_CREDIT_FIELDS[creditType];
  
  // Check current value
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [field]: true } as any,
  });

  if (!user) return false;

  const current = (user as any)[field] as number | undefined;
  if (!current || current <= 0) return false;

  // Decrement the counter
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        [field]: {
          decrement: 1,
        },
      } as any,
    });
    return true;
  } catch (error) {
    console.error(`Failed to consume free credit for ${creditType}:`, error);
    return false;
  }
}

/**
 * Get all free credit counts for a user
 */
export async function getFreeCreditsStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      freeFoodAnalysisRemaining: true,
      freeSymptomAnalysisRemaining: true,
      freeMedicalAnalysisRemaining: true,
      freeInteractionAnalysisRemaining: true,
      freeHealthIntakeRemaining: true,
      freeInsightsUpdateRemaining: true,
    } as any,
  });

  if (!user) {
    return {
      food: 0,
      symptom: 0,
      medical: 0,
      interaction: 0,
      healthIntake: 0,
      insights: 0,
      total: 0,
    };
  }

  const food = (user as any).freeFoodAnalysisRemaining ?? 0;
  const symptom = (user as any).freeSymptomAnalysisRemaining ?? 0;
  const medical = (user as any).freeMedicalAnalysisRemaining ?? 0;
  const interaction = (user as any).freeInteractionAnalysisRemaining ?? 0;
  const healthIntake = (user as any).freeHealthIntakeRemaining ?? 0;
  const insights = (user as any).freeInsightsUpdateRemaining ?? 0;

  return {
    food,
    symptom,
    medical,
    interaction,
    healthIntake,
    insights,
    total: food + symptom + medical + interaction + healthIntake + insights,
  };
}

/**
 * Check if user has exhausted all free credits
 */
export async function hasExhaustedFreeCredits(userId: string): Promise<boolean> {
  const status = await getFreeCreditsStatus(userId);
  return status.total === 0;
}
