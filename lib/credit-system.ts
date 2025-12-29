import { prisma } from '@/lib/prisma';
import { isSubscriptionActive } from '@/lib/subscription-utils';

// ABSOLUTE GUARD RAIL:
// `CreditManager` is the single source of truth for wallet credits and costs.
// Do NOT "quick-fix" bugs by changing credit prices or bypassing charges here
// without reading `GUARD_RAILS.md` (credits section) and getting explicit user
// approval.
//
// Credit costs for different features
export const CREDIT_COSTS = {
  FOOD_ANALYSIS: 10,
  INTERACTION_ANALYSIS: 3,
  MEDICAL_IMAGE_ANALYSIS: 2,
  FOOD_REANALYSIS: 1,
  SYMPTOM_ANALYSIS: 1,
  INSIGHTS_GENERATION: 7, // Fixed cost per full insights generation (all health issues)
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

  // Map subscription price directly to advertised credit amounts
  private static SUBSCRIPTION_CREDITS_MAP: Record<number, number> = {
    1000: 700,   // $10/month → 700 credits
    2000: 1400,  // $20/month → 1,400 credits
    3000: 2100,  // $30/month → 2,100 credits
    5000: 3500,  // $50/month → 3,500 credits
  };

  private static PLAN_PRICE_CENTS: Record<string, number> = {
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
    const price = CreditManager.PLAN_PRICE_CENTS[String(plan || 'PREMIUM')] ?? 0;
    return Math.floor(price * CreditManager.walletPercentOfPlan());
  }

  // Get credit cap from subscription price (uses direct mapping, not percentage)
  private static creditsForSubscriptionPrice(monthlyPriceCents: number | null | undefined): number {
    if (!monthlyPriceCents) return 0;
    // Use direct mapping if available, otherwise fall back to percentage
    if (CreditManager.SUBSCRIPTION_CREDITS_MAP[monthlyPriceCents]) {
      return CreditManager.SUBSCRIPTION_CREDITS_MAP[monthlyPriceCents];
    }
    // Fallback to 50% for any unmapped prices
    return Math.floor(monthlyPriceCents * CreditManager.walletPercentOfPlan());
  }

  private async ensureMonthlyReset(now = new Date(), db: any = prisma): Promise<void> {
    const user = await db.user.findUnique({ 
      where: { id: this.userId },
      include: { subscription: true }
    });
    if (!user) return;
    
    const last = (user as any).walletMonthlyResetAt as Date | null;
    
    const hasActiveSubscription = isSubscriptionActive(user.subscription, now);

    // Check if reset is needed based on subscription start date (if subscription exists)
    // Otherwise fall back to calendar month
    let shouldReset = false;
    
    if (hasActiveSubscription && user.subscription?.startDate) {
      // Reset based on subscription start date (same calendar day each month)
      const subStartDate = new Date(user.subscription.startDate);
      const startYear = subStartDate.getUTCFullYear();
      const startMonth = subStartDate.getUTCMonth();
      const startDay = subStartDate.getUTCDate();
      
      if (!last) {
        // Never reset before - reset now
        shouldReset = true;
      } else {
        // Check if we've passed the subscription renewal date this month
        const lastYear = last.getUTCFullYear();
        const lastMonth = last.getUTCMonth();
        const lastDay = last.getUTCDate();
        
        const currentYear = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth();
        const currentDay = now.getUTCDate();
        
        // Calculate which subscription month we should be in based on last reset
        let expectedMonthsSinceStart = (lastYear - startYear) * 12 + (lastMonth - startMonth);
        if (lastDay < startDay) {
          expectedMonthsSinceStart--;
        }
        
        // Calculate which subscription month we're actually in now
        let actualMonthsSinceStart = (currentYear - startYear) * 12 + (currentMonth - startMonth);
        if (currentDay < startDay) {
          actualMonthsSinceStart--;
        }
        
        // Reset if we've moved to a new subscription month
        shouldReset = actualMonthsSinceStart > expectedMonthsSinceStart;
      }
    } else {
      // No subscription - use calendar month reset
      const monthChanged =
        !last ||
        last.getUTCFullYear() !== now.getUTCFullYear() ||
        last.getUTCMonth() !== now.getUTCMonth();
      shouldReset = monthChanged;
    }
    
    if (shouldReset) {
      await db.user.update({
        where: { id: this.userId },
        data: {
          walletMonthlyUsedCents: 0,
          walletMonthlyResetAt: now,
          // Reset monthly per-feature usage counters
          monthlySymptomAnalysisUsed: 0,
          monthlyFoodAnalysisUsed: 0,
          monthlyMedicalImageAnalysisUsed: 0,
          monthlyInteractionAnalysisUsed: 0,
          monthlyInsightsGenerationUsed: 0,
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
    const hasActiveSubscription = isSubscriptionActive(user.subscription);
    const plan = hasActiveSubscription ? user.subscription?.plan || null : null;
    
    // Use monthlyPriceCents if available, otherwise fall back to plan-based calculation
    let monthlyCapCents = 0;
    if (plan && user.subscription && hasActiveSubscription) {
      if (user.subscription.monthlyPriceCents) {
        // Use direct credit mapping (e.g., $30 → 1,700 credits)
        monthlyCapCents = CreditManager.creditsForSubscriptionPrice(user.subscription.monthlyPriceCents);
      } else {
        // Fall back to plan-based calculation (defaults to $20)
        monthlyCapCents = CreditManager.monthlyCapCentsForPlan(plan);
      }
    }
    
    const monthlyUsedCents = (user as any).walletMonthlyUsedCents || 0;

    // Fetch available (non-expired) top-ups
    const now = new Date();
    const topUps = await prisma.creditTopUp.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
    });
    const topUpsTotalAvailable =
      topUps.reduce((sum, t) => sum + Math.max(0, t.amountCents - t.usedCents), 0) || 0;
    const topUpsTotalPurchased =
      topUps.reduce((sum, t) => sum + t.amountCents, 0) || 0;
    const topUpsTotalUsed =
      topUps.reduce((sum, t) => sum + t.usedCents, 0) || 0;
    const additionalAvailable = Math.max(0, (user as any).additionalCredits || 0);

    const monthlyRemaining = Math.max(0, monthlyCapCents - monthlyUsedCents);
    const totalAvailable = monthlyRemaining + topUpsTotalAvailable + additionalAvailable;
    
    // Calculate percentUsed: if user has subscription, use monthly wallet; otherwise use top-ups
    let percentUsed = 0;
    if (monthlyCapCents > 0) {
      // User has subscription - calculate based on monthly wallet
      percentUsed = Math.min(100, Math.floor((monthlyUsedCents / monthlyCapCents) * 100));
    } else if (topUpsTotalPurchased > 0) {
      // User has no subscription but has top-ups - calculate based on top-up usage
      percentUsed = Math.min(100, Math.floor((topUpsTotalUsed / topUpsTotalPurchased) * 100));
    }
    // If neither subscription nor top-ups, percentUsed remains 0

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
      additionalCreditsCents: additionalAvailable,
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
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.userId}))`;
      await this.ensureMonthlyReset(new Date(), tx);

      const user = await tx.user.findUnique({
        where: { id: this.userId },
        include: { subscription: true },
      });
      if (!user) throw new Error('User not found');

      const hasActiveSubscription = isSubscriptionActive(user.subscription);
      const plan = hasActiveSubscription ? user.subscription?.plan || null : null;
      const additionalAvailable = Math.max(0, (user as any).additionalCredits || 0);
      
      // Use monthlyPriceCents if available, otherwise fall back to plan-based calculation
      let monthlyCapCents = 0;
      if (plan && user.subscription && hasActiveSubscription) {
        if (user.subscription.monthlyPriceCents) {
          // Use direct credit mapping (e.g., $30 → 1,700 credits)
          monthlyCapCents = CreditManager.creditsForSubscriptionPrice(user.subscription.monthlyPriceCents);
        } else {
          monthlyCapCents = CreditManager.monthlyCapCentsForPlan(plan);
        }
      }
      
      const monthlyUsedCents = (user as any).walletMonthlyUsedCents || 0;
      let remainingMonthly = Math.max(0, monthlyCapCents - monthlyUsedCents);

      // Early insufficient check (monthly + all top-ups)
      const now = new Date();
      const topUps = await tx.creditTopUp.findMany({
        where: { userId: user.id, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'asc' },
      });
      const topUpsAvailable = topUps.reduce((sum, t) => sum + Math.max(0, t.amountCents - t.usedCents), 0);
      if (remainingMonthly + additionalAvailable + topUpsAvailable < costCents) {
        return false;
      }

      let toCharge = costCents;

      // 1) Consume monthly allowance
      const fromMonthly = Math.min(toCharge, remainingMonthly);
      if (fromMonthly > 0) {
        await tx.user.update({
          where: { id: this.userId },
          data: { walletMonthlyUsedCents: (monthlyUsedCents + fromMonthly) as any },
        });
        toCharge -= fromMonthly;
      }

      if (toCharge <= 0) return true;

      // 1b) Consume manual additional credits (non-expiring)
      const fromAdditional = Math.min(toCharge, additionalAvailable);
      if (fromAdditional > 0) {
        await tx.user.update({
          where: { id: this.userId },
          data: {
            additionalCredits: {
              decrement: fromAdditional,
            },
          },
        });
        toCharge -= fromAdditional;
      }

      if (toCharge <= 0) return true;

      // 2) Consume FIFO from top-ups
      for (const tu of topUps) {
        const available = Math.max(0, tu.amountCents - tu.usedCents);
        if (available <= 0) continue;
        const consume = Math.min(available, toCharge);
        await tx.creditTopUp.update({
          where: { id: tu.id },
          data: { usedCents: tu.usedCents + consume },
        });
        toCharge -= consume;
        if (toCharge <= 0) break;
      }

      return toCharge <= 0;
    });
  }

  /**
   * Charge subscription (monthly wallet) credits and top-ups separately.
   * This preserves the correct margin when different wallets have different
   * credit valuations (e.g., subscription vs. top-up pricing).
   */
  async chargeSplitCredits(subscriptionCredits: number, topUpCredits: number): Promise<boolean> {
    const sub = Math.max(0, Math.round(subscriptionCredits || 0));
    const top = Math.max(0, Math.round(topUpCredits || 0));
    if (sub === 0 && top === 0) return true;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.userId}))`;
      await this.ensureMonthlyReset(new Date(), tx);

      const user = await tx.user.findUnique({
        where: { id: this.userId },
        include: { subscription: true },
      });
      if (!user) throw new Error('User not found');

      const hasActiveSubscription = isSubscriptionActive(user.subscription);
      const plan = hasActiveSubscription ? user.subscription?.plan || null : null;
      let monthlyCapCents = 0;
      if (plan && user.subscription && hasActiveSubscription) {
        if (user.subscription.monthlyPriceCents) {
          monthlyCapCents = CreditManager.creditsForSubscriptionPrice(user.subscription.monthlyPriceCents);
        } else {
          monthlyCapCents = CreditManager.monthlyCapCentsForPlan(plan);
        }
      }
      const monthlyUsedCents = (user as any).walletMonthlyUsedCents || 0;
      const monthlyRemaining = Math.max(0, monthlyCapCents - monthlyUsedCents);

      const now = new Date();
      const topUps = await tx.creditTopUp.findMany({
        where: { userId: this.userId, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'asc' },
      });
      const topUpsAvailable =
        topUps.reduce((sum, t) => sum + Math.max(0, t.amountCents - t.usedCents), 0) || 0;

      // Guard rails: do not silently dip into top-ups for the subscription portion
      if (sub > monthlyRemaining) return false;
      if (top > topUpsAvailable) return false;

      if (sub > 0) {
        await tx.user.update({
          where: { id: this.userId },
          data: { walletMonthlyUsedCents: (monthlyUsedCents + sub) as any },
        });
      }

      if (top > 0) {
        let remainingTopUp = top;
        for (const tu of topUps) {
          const available = Math.max(0, tu.amountCents - tu.usedCents);
          if (available <= 0) continue;
          const consume = Math.min(available, remainingTopUp);
          await tx.creditTopUp.update({
            where: { id: tu.id },
            data: { usedCents: tu.usedCents + consume },
          });
          remainingTopUp -= consume;
          if (remainingTopUp <= 0) break;
        }
        if (remainingTopUp > 0) return false;
      }

      return true;
    });
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
    const isPremium = isSubscriptionActive(user.subscription);
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
      plan: isSubscriptionActive(user.subscription) ? user.subscription?.plan || null : null,
    };
  }
} 
