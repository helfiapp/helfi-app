import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Credit costs for different features
export const CREDIT_COSTS = {
  FOOD_ANALYSIS: 1,
  INTERACTION_ANALYSIS: 3,
  MEDICAL_IMAGE_ANALYSIS: 2,
  FOOD_REANALYSIS: 1,
  SYMPTOM_ANALYSIS: 1,
} as const;

export type FeatureType = keyof typeof CREDIT_COSTS;

export interface CreditStatus {
  hasCredits: boolean;
  dailyCreditsRemaining: number;
  additionalCreditsRemaining: number;
  totalCreditsRemaining: number;
  featureUsageToday: {
    foodAnalysis: number;
    interactionAnalysis: number;
  };
  dailyLimits: {
    total: number;
    foodAnalysis: number;
    interactionAnalysis: number;
  };
}

export class CreditManager {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // Check if user has enough credits for a feature
  async checkCredits(featureType: FeatureType): Promise<CreditStatus> {
    const user = await prisma.user.findUnique({
      where: { id: this.userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Reset daily/monthly usage if needed
    const now = new Date();
    const lastReset = user.lastAnalysisResetDate;
    const shouldReset = !lastReset || 
      (now.getTime() - lastReset.getTime()) > 24 * 60 * 60 * 1000;

    if (shouldReset) {
      await this.resetDailyUsage();
      user.dailyAnalysisUsed = 0;
      user.dailyFoodAnalysisUsed = 0;
      user.dailyFoodReanalysisUsed = 0;
      user.dailyMedicalAnalysisUsed = 0;
      user.dailyInteractionAnalysisUsed = 0;
    }

    const lastMonthlyReset = user.lastMonthlyResetDate;
    const monthChanged = !lastMonthlyReset ||
      (lastMonthlyReset.getUTCFullYear() !== now.getUTCFullYear() ||
       lastMonthlyReset.getUTCMonth() !== now.getUTCMonth());
    if (monthChanged) {
      await prisma.user.update({
        where: { id: this.userId },
        data: {
          monthlyInteractionAnalysisUsed: 0,
          lastMonthlyResetDate: now,
        }
      });
      user.monthlyInteractionAnalysisUsed = 0;
    }

    const creditCost = CREDIT_COSTS[featureType];
    const dailyCreditsRemaining = Math.max(0, user.dailyAnalysisCredits - user.dailyAnalysisUsed);
    const totalCreditsRemaining = dailyCreditsRemaining + user.additionalCredits;
    const hasCredits = totalCreditsRemaining >= creditCost;

    // Calculate daily limits based on plan
    const isPremium = user.subscription?.plan === 'PREMIUM';
    const dailyFoodLimit = isPremium ? 30 : 3;
    const dailyMedicalLimit = isPremium ? 15 : 0;
    const monthlyInteractionLimit = isPremium ? 30 : 0;
    const dailyFoodReanalysisLimit = isPremium ? 10 : 0;

    return {
      hasCredits,
      dailyCreditsRemaining,
      additionalCreditsRemaining: user.additionalCredits,
      totalCreditsRemaining,
      featureUsageToday: {
        foodAnalysis: user.dailyFoodAnalysisUsed || 0,
        interactionAnalysis: user.dailyInteractionAnalysisUsed || 0,
      },
      dailyLimits: {
        total: dailyFoodLimit,
        foodAnalysis: dailyFoodLimit,
        interactionAnalysis: Math.floor(dailyFoodLimit / CREDIT_COSTS.INTERACTION_ANALYSIS),
      },
    };
  }

  // Consume credits for a feature
  async consumeCredits(featureType: FeatureType): Promise<boolean> {
    const creditStatus = await this.checkCredits(featureType);
    
    if (!creditStatus.hasCredits) {
      return false;
    }

    const creditCost = CREDIT_COSTS[featureType];
    
    // Determine how to consume credits (daily first, then additional)
    const dailyCreditsToUse = Math.min(creditCost, creditStatus.dailyCreditsRemaining);
    const additionalCreditsToUse = creditCost - dailyCreditsToUse;

    // Update database
    const updateData: any = {
      dailyAnalysisUsed: {
        increment: dailyCreditsToUse,
      },
      additionalCredits: {
        decrement: additionalCreditsToUse,
      },
      totalAnalysisCount: {
        increment: 1,
      },
    };

    // Update feature-specific counters
    if (featureType === 'FOOD_ANALYSIS') {
      updateData.dailyFoodAnalysisUsed = {
        increment: 1,
      };
      updateData.totalFoodAnalysisCount = {
        increment: 1,
      };
    } else if (featureType === 'INTERACTION_ANALYSIS') {
      updateData.dailyInteractionAnalysisUsed = {
        increment: 1,
      };
      updateData.totalInteractionAnalysisCount = {
        increment: 1,
      };
    }

    await prisma.user.update({
      where: { id: this.userId },
      data: updateData,
    });

    return true;
  }

  // Reset daily usage
  private async resetDailyUsage(): Promise<void> {
    await prisma.user.update({
      where: { id: this.userId },
      data: {
        dailyAnalysisUsed: 0,
        dailyFoodAnalysisUsed: 0,
        dailyFoodReanalysisUsed: 0,
        dailyMedicalAnalysisUsed: 0,
        dailyInteractionAnalysisUsed: 0,
        lastAnalysisResetDate: new Date(),
      },
    });
  }

  // Add credits to user account (admin function)
  static async addCredits(userId: string, amount: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        additionalCredits: {
          increment: amount,
        },
      },
    });
  }

  // Reset daily quota (admin function)
  static async resetDailyQuota(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        dailyAnalysisUsed: 0,
        dailyFoodAnalysisUsed: 0,
        dailyInteractionAnalysisUsed: 0,
        lastAnalysisResetDate: new Date(),
      },
    });
  }

  // Get detailed credit usage (admin function)
  static async getCreditUsage(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      daily: {
        limit: user.dailyAnalysisCredits,
        used: user.dailyAnalysisUsed,
        remaining: Math.max(0, user.dailyAnalysisCredits - user.dailyAnalysisUsed),
      },
      additional: {
        available: user.additionalCredits,
      },
      featureUsage: {
        today: {
          foodAnalysis: user.dailyFoodAnalysisUsed || 0,
          interactionAnalysis: user.dailyInteractionAnalysisUsed || 0,
        },
        lifetime: {
          total: user.totalAnalysisCount,
          foodAnalysis: user.totalFoodAnalysisCount || 0,
          interactionAnalysis: user.totalInteractionAnalysisCount || 0,
        },
      },
      lastReset: user.lastAnalysisResetDate,
      plan: user.subscription?.plan || 'FREE',
    };
  }
} 