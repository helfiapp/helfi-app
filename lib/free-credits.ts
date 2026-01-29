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
 * - 2 x Symptom follow-up chats
 * - 2 x Medical image follow-up chats
 * - 2 x Insights chats
 * - 2 x Voice chats
 * - 2 x Food re-analyses
 * - 2 x Interaction re-analyses
 * 
 * These credits are consumed BEFORE wallet credits.
 * Low credits warning only shows AFTER free credits are exhausted.
 */

export type FreeCreditType = 
  | 'FOOD_ANALYSIS'
  | 'FOOD_REANALYSIS'
  | 'SYMPTOM_ANALYSIS'
  | 'SYMPTOM_CHAT'
  | 'MEDICAL_ANALYSIS'
  | 'MEDICAL_CHAT'
  | 'INTERACTION_ANALYSIS'
  | 'INTERACTION_REANALYSIS'
  | 'SUPPLEMENT_IMAGE'
  | 'MEDICATION_IMAGE'
  | 'HEALTH_INTAKE'
  | 'INSIGHTS_UPDATE'
  | 'INSIGHTS_CHAT'
  | 'VOICE_CHAT';

const FREE_CREDIT_FIELDS: Record<FreeCreditType, keyof any> = {
  FOOD_ANALYSIS: 'freeFoodAnalysisRemaining',
  FOOD_REANALYSIS: 'freeFoodReanalysisRemaining',
  SYMPTOM_ANALYSIS: 'freeSymptomAnalysisRemaining',
  SYMPTOM_CHAT: 'freeSymptomChatRemaining',
  MEDICAL_ANALYSIS: 'freeMedicalAnalysisRemaining',
  MEDICAL_CHAT: 'freeMedicalChatRemaining',
  INTERACTION_ANALYSIS: 'freeInteractionAnalysisRemaining',
  INTERACTION_REANALYSIS: 'freeInteractionReanalysisRemaining',
  SUPPLEMENT_IMAGE: 'freeSupplementImageRemaining',
  MEDICATION_IMAGE: 'freeMedicationImageRemaining',
  HEALTH_INTAKE: 'freeHealthIntakeRemaining',
  INSIGHTS_UPDATE: 'freeInsightsUpdateRemaining',
  INSIGHTS_CHAT: 'freeInsightsChatRemaining',
  VOICE_CHAT: 'freeVoiceChatRemaining',
};

export const EXTRA_FREE_CREDITS = {
  freeSymptomChatRemaining: 2,
  freeMedicalChatRemaining: 2,
  freeInsightsChatRemaining: 2,
  freeVoiceChatRemaining: 2,
  freeFoodReanalysisRemaining: 2,
  freeInteractionReanalysisRemaining: 2,
};

export const NEW_USER_FREE_CREDITS = {
  freeFoodAnalysisRemaining: 5,
  freeSymptomAnalysisRemaining: 2,
  freeMedicalAnalysisRemaining: 2,
  freeInteractionAnalysisRemaining: 2,
  freeSupplementImageRemaining: 10,
  freeMedicationImageRemaining: 10,
  freeHealthIntakeRemaining: 1,
  freeInsightsUpdateRemaining: 3,
  ...EXTRA_FREE_CREDITS,
};

export async function ensureFreeCreditColumns() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "freeSymptomChatRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeMedicalChatRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeInsightsChatRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeVoiceChatRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeFoodReanalysisRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeInteractionReanalysisRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeSupplementImageRemaining" INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeMedicationImageRemaining" INT DEFAULT 0
    `)
  } catch (error) {
    console.warn('Failed to ensure free credit columns:', error)
  }
}

/**
 * Check if user has free credits remaining for a feature
 */
export async function hasFreeCredits(
  userId: string,
  creditType: FreeCreditType
): Promise<boolean> {
  await ensureFreeCreditColumns()
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
  await ensureFreeCreditColumns()
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
  await ensureFreeCreditColumns()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      freeFoodAnalysisRemaining: true,
      freeFoodReanalysisRemaining: true,
      freeSymptomAnalysisRemaining: true,
      freeSymptomChatRemaining: true,
      freeMedicalAnalysisRemaining: true,
      freeMedicalChatRemaining: true,
      freeInteractionAnalysisRemaining: true,
      freeInteractionReanalysisRemaining: true,
      freeSupplementImageRemaining: true,
      freeMedicationImageRemaining: true,
      freeHealthIntakeRemaining: true,
      freeInsightsUpdateRemaining: true,
      freeInsightsChatRemaining: true,
      freeVoiceChatRemaining: true,
    } as any,
  });

  if (!user) {
    return {
      food: 0,
      foodReanalysis: 0,
      symptom: 0,
      symptomChat: 0,
      medical: 0,
      medicalChat: 0,
      interaction: 0,
      interactionReanalysis: 0,
      supplementImage: 0,
      medicationImage: 0,
      healthIntake: 0,
      insights: 0,
      insightsChat: 0,
      voiceChat: 0,
      total: 0,
    };
  }

  const food = (user as any).freeFoodAnalysisRemaining ?? 0;
  let foodReanalysis = (user as any).freeFoodReanalysisRemaining ?? 0;
  const symptom = (user as any).freeSymptomAnalysisRemaining ?? 0;
  let symptomChat = (user as any).freeSymptomChatRemaining ?? 0;
  const medical = (user as any).freeMedicalAnalysisRemaining ?? 0;
  let medicalChat = (user as any).freeMedicalChatRemaining ?? 0;
  const interaction = (user as any).freeInteractionAnalysisRemaining ?? 0;
  let interactionReanalysis = (user as any).freeInteractionReanalysisRemaining ?? 0;
  const supplementImage = (user as any).freeSupplementImageRemaining ?? 0;
  const medicationImage = (user as any).freeMedicationImageRemaining ?? 0;
  const healthIntake = (user as any).freeHealthIntakeRemaining ?? 0;
  const insights = (user as any).freeInsightsUpdateRemaining ?? 0;
  let insightsChat = (user as any).freeInsightsChatRemaining ?? 0;
  let voiceChat = (user as any).freeVoiceChatRemaining ?? 0;

  const extrasTotal =
    symptomChat +
    medicalChat +
    insightsChat +
    voiceChat +
    foodReanalysis +
    interactionReanalysis;

  const createdAt = (user as any).createdAt ? new Date((user as any).createdAt).getTime() : 0;
  const isRecentAccount = createdAt > 0 && Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;

  if (extrasTotal === 0 && isRecentAccount) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: EXTRA_FREE_CREDITS as any,
      });
      symptomChat = EXTRA_FREE_CREDITS.freeSymptomChatRemaining;
      medicalChat = EXTRA_FREE_CREDITS.freeMedicalChatRemaining;
      insightsChat = EXTRA_FREE_CREDITS.freeInsightsChatRemaining;
      voiceChat = EXTRA_FREE_CREDITS.freeVoiceChatRemaining;
      foodReanalysis = EXTRA_FREE_CREDITS.freeFoodReanalysisRemaining;
      interactionReanalysis = EXTRA_FREE_CREDITS.freeInteractionReanalysisRemaining;
    } catch (error) {
      console.warn('Failed to backfill free credits:', error);
    }
  }

  return {
    food,
    foodReanalysis,
    symptom,
    symptomChat,
    medical,
    medicalChat,
    interaction,
    interactionReanalysis,
    supplementImage,
    medicationImage,
    healthIntake,
    insights,
    insightsChat,
    voiceChat,
    total:
      food +
      foodReanalysis +
      symptom +
      symptomChat +
      medical +
      medicalChat +
      interaction +
      interactionReanalysis +
      supplementImage +
      medicationImage +
      healthIntake +
      insights +
      insightsChat +
      voiceChat,
  };
}

/**
 * Check if user has exhausted all free credits
 */
export async function hasExhaustedFreeCredits(userId: string): Promise<boolean> {
  const status = await getFreeCreditsStatus(userId);
  return status.total === 0;
}
