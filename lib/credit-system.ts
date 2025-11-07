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

  //
  // ===== Wallet Engine (Cursor‑style percentage wallet) =====
  //

  private static PLAN_PRICE_CENTS: Record<string, number> = {
    FREE: 0,
    PREMIUM: 2000, // $20/month
    // If a Premium Plus is added later in schema, we can map it here.
    PREMIUM_PLUS: 3000, // $30/month (defensive default)
  };

  private static walletPercentOfPlan(): number {
    // 50% of subscription price becomes monthly wallet allowance
    const p = Number(process.env.HELFI_WALLET_PLAN_PERCENT || '0.5');
    return p > 0 && p <= 1 ? p : 0.5;
  }

  private static monthlyCapCentsForPlan(plan: string | null | undefined): number {
    const price = CreditManager.PLAN_PRICE_CENTS[String(plan || 'FREE')] ?? 0;
    return Math.floor(price * CreditManager.walletPercentOfPlan());
  }

  private async ensureMonthlyReset(now = new Date()): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: this.userId } });
    if (!user) return;
    const last = (user as any).walletMonthlyResetAt as Date | null;
    const monthChanged =
      !last ||
      last.getUTCFullYear() !== now.getUTCFullYear() ||
      last.getUTCMonth() !== now.getUTCMonth();
    if (monthChanged) {
      await prisma.user.update({
        where: { id: this.userId },
        data: {
          walletMonthlyUsedCents: 0,
          walletMonthlyResetAt: now,
        } as any,
      });
    }
  }

  async getWalletStatus() {
    await this.ensureMonthlyReset();
    const user = await prisma.user.findUnique({
      where: { id: this.userId },
      include: { subscription: true },
    });
    if (!user) throw new Error('User not found');
    const plan = user.subscription?.plan || 'FREE';
    const monthlyCapCents = CreditManager.monthlyCapCentsForPlan(plan);
    const monthlyUsedCents = (user as any).walletMonthlyUsedCents || 0;

    // Fetch available (non-expired) top-ups
    const now = new Date();
    const topUps = await prisma.creditTopUp.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
    });
    const topUpsTotalAvailable =
      topUps.reduce((sum, t) => sum + Math.max(0, t.amountCents - t.usedCents), 0) || 0;

    const monthlyRemaining = Math.max(0, monthlyCapCents - monthlyUsedCents);
    const totalAvailable = monthlyRemaining + topUpsTotalAvailable;
    const percentUsed =
      monthlyCapCents <= 0 ? 0 : Math.min(100, Math.floor((monthlyUsedCents / monthlyCapCents) * 100));

    return {
      plan,
      monthlyCapCents,
      monthlyUsedCents,
      monthlyRemainingCents: monthlyRemaining,
      percentUsed,
      topUps: topUps.map((t) => ({
        id: t.id,
        availableCents: Math.max(0, t.amountCents - t.usedCents),
        expiresAt: t.expiresAt,
      })),
      totalAvailableCents: totalAvailable,
    };
  }

  /**
   * Charge the user's wallet and top-ups by a given cost in cents.
   * Consumes monthly allowance first, then earliest-expiring top-ups (FIFO).
   * Returns true if the charge succeeded, false if insufficient funds.
   */
  async chargeCents(costCents: number): Promise<boolean> {
    if (costCents <= 0) return true;
    await this.ensureMonthlyReset();

    const user = await prisma.user.findUnique({
      where: { id: this.userId },
      include: { subscription: true },
    });
    if (!user) throw new Error('User not found');

    const plan = user.subscription?.plan || 'FREE';
    const monthlyCapCents = CreditManager.monthlyCapCentsForPlan(plan);
    const monthlyUsedCents = (user as any).walletMonthlyUsedCents || 0;
    let remainingMonthly = Math.max(0, monthlyCapCents - monthlyUsedCents);

    // Early insufficient check (monthly + all top-ups)
    const now = new Date();
    const topUps = await prisma.creditTopUp.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
    });
    const topUpsAvailable = topUps.reduce((sum, t) => sum + Math.max(0, t.amountCents - t.usedCents), 0);
    if (remainingMonthly + topUpsAvailable < costCents) {
      return false;
    }

    let toCharge = costCents;

    // 1) Consume monthly allowance
    const fromMonthly = Math.min(toCharge, remainingMonthly);
    if (fromMonthly > 0) {
      await prisma.user.update({
        where: { id: this.userId },
        data: { walletMonthlyUsedCents: (monthlyUsedCents + fromMonthly) as any },
      });
      toCharge -= fromMonthly;
    }

    if (toCharge <= 0) return true;

    // 2) Consume FIFO from top-ups
    for (const tu of topUps) {
      const available = Math.max(0, tu.amountCents - tu.usedCents);
      if (available <= 0) continue;
      const consume = Math.min(available, toCharge);
      await prisma.creditTopUp.update({
        where: { id: tu.id },
        data: { usedCents: tu.usedCents + consume },
      });
      toCharge -= consume;
      if (toCharge <= 0) break;
    }

    return toCharge <= 0;
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