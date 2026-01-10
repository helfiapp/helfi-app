export type FeaturePageCta = {
  label: string
  href: string
}

export type FeaturePageImage = {
  src: string
  alt: string
  width?: number
  height?: number
  kind?: 'phone' | 'photo'
}

export type FeaturePageCapability = {
  title: string
  description: string
}

export type FeaturePageUseCase = {
  title: string
  description: string
}

export type FeaturePageSegment = {
  title: string
  description: string
  details?: string[]
  bullets: string[]
  image: FeaturePageImage
  images?: FeaturePageImage[]
  alignImageWithHeading?: boolean
}

export type FeaturePageContent = {
  slug: string
  title: string
  subtitle: string
  intro: string
  overview: string[]
  summary: string
  heroImage: FeaturePageImage
  bannerImage?: FeaturePageImage
  carouselImages?: FeaturePageImage[]
  bannerLayout?: 'carousel' | 'grid'
  showHeroImage?: boolean
  showSegmentImages?: boolean
  overviewLayout?: 'default' | 'expanded'
  overviewAlign?: 'center' | 'start'
  overviewSpacing?: 'default' | 'spacious'
  ctaPlacement?: 'text' | 'image'
  primaryCta: FeaturePageCta
  secondaryCta: FeaturePageCta
  capabilities: FeaturePageCapability[]
  useCases: FeaturePageUseCase[]
  outcomes: string[]
  segments: FeaturePageSegment[]
  seo: {
    title: string
    description: string
  }
}

const primaryCta: FeaturePageCta = {
  label: 'Create account',
  href: '/auth/signin?mode=signup',
}

const secondaryCta: FeaturePageCta = {
  label: 'View pricing',
  href: '/#pricing',
}

const foodDiaryPhone = (src: string, alt: string): FeaturePageImage => ({
  src,
  alt,
  width: 1419,
  height: 2796,
  kind: 'phone',
})

const foodDiaryPhoto = (src: string, alt: string): FeaturePageImage => ({
  src,
  alt,
  width: 1200,
  height: 896,
  kind: 'photo',
})

const healthTrackingPhone = (src: string, alt: string): FeaturePageImage => ({
  src,
  alt,
  width: 1419,
  height: 2796,
  kind: 'phone',
})

const healthTrackingPhoto = (src: string, alt: string): FeaturePageImage => ({
  src,
  alt,
  width: 2048,
  height: 768,
  kind: 'photo',
})

export const featurePages: FeaturePageContent[] = [
  {
    slug: 'health-tracking',
    title: 'Health Tracking and Wearables',
    subtitle: 'Daily health signals and device data, all in one view.',
    intro:
      'Helfi combines daily check-ins, manual logs, and wearable data so you can track progress without juggling tools.',
    overview: [
      'You can capture the basics each day and see them alongside activity and wellness metrics pulled from supported devices, including sleep when a wearable is connected.',
      'Fitbit and Garmin Connect are supported today, and you can share interest in other integrations as the device roster expands.',
      'As a health tracking app, Helfi keeps wearable health data and daily check-ins connected in a single timeline.',
      'Because the data lives in one place, you can move from daily tracking to weekly review without digging through multiple apps.',
    ],
    summary: 'Daily dashboards and device syncs that keep trends visible.',
    heroImage: {
      src: '/WEBSITE IMAGES/HEALTH TRACKING/MAN IN GYM.png',
      alt: 'Man using the Helfi app at the gym',
      width: 1200,
      height: 896,
      kind: 'photo',
    },
    showHeroImage: true,
    overviewLayout: 'expanded',
    overviewAlign: 'start',
    overviewSpacing: 'spacious',
    ctaPlacement: 'image',
    bannerImage: healthTrackingPhoto(
      '/WEBSITE IMAGES/HEALTH TRACKING/HEALTH TRACKING BANNER.jpg',
      'Health tracking banner'
    ),
    carouselImages: [
      healthTrackingPhone(
        '/MOBILE MOCKUPS/HEALTH TRACKING/MOBILE MOCKUPS/DEVICES-portrait.png',
        'Device connections'
      ),
      healthTrackingPhone(
        '/MOBILE MOCKUPS/HEALTH TRACKING/MOBILE MOCKUPS/7 DAY HEALTH REPORT-portrait.png',
        'Weekly health report preview'
      ),
      healthTrackingPhone(
        '/MOBILE MOCKUPS/HEALTH TRACKING/MOBILE MOCKUPS/BOWEL MOVEMENTS-portrait.png',
        'Health focus area tracking'
      ),
      healthTrackingPhone(
        '/MOBILE MOCKUPS/HEALTH TRACKING/MOBILE MOCKUPS/SUPPLEMENTS-portrait.png',
        'Supplement insights on mobile'
      ),
    ],
    bannerLayout: 'grid',
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Unified daily dashboard',
        description:
          'A single daily view for activity, check-ins, and sleep data when a wearable is connected, with quick access to recent entries.',
      },
      {
        title: 'Wearable syncs',
        description:
          'Pull Fitbit and Garmin data into Helfi so your core metrics stay aligned with the rest of your health log.',
      },
      {
        title: 'Trend comparisons',
        description:
          'The 7-day health report helps you spot changes as routines shift or new habits begin.',
      },
    ],
    useCases: [
      {
        title: 'Busy professionals',
        description:
          'Stay consistent with short daily check-ins and device syncs that keep your progress visible without extra effort.',
      },
      {
        title: 'Athletes and active users',
        description:
          'Compare training load, recovery, and daily ratings to keep performance and wellness aligned.',
      },
      {
        title: 'Long-term tracking',
        description:
          'Build a reliable health timeline that supports future consultations or wellness planning.',
      },
    ],
    outcomes: [
      'Know what changed over the last 7 days without manual spreadsheets.',
      'Bring clearer context into weekly reports and provider conversations.',
      'Spot gaps in activity, check-ins, or wearable sleep tracking before they become patterns.',
      'Keep device and manual tracking in one place, ready for review.',
      'Reduce tracking fatigue with a single, consistent workflow.',
      'Build a long-term record that supports proactive decisions.',
    ],
    segments: [
      {
        title: 'Daily health dashboard',
        description:
          'Start each day with a focused snapshot of the metrics that matter most.',
        details: [
          'The dashboard highlights the latest activity signals alongside your most recent check-in. Sleep is shown when a wearable is connected.',
          'This keeps your daily routine visible before you dive into deeper analysis or reports.',
          'Over time, the dashboard becomes a quick reference point for how habits are trending.',
        ],
        bullets: [
          'Daily snapshot for activity and connected sleep data',
          '7-day report highlights at a glance',
          'Quick links to check-ins and trends',
          'Supports manual metrics you care about',
          'Designed for fast mobile review',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Daily health dashboard view',
        },
      },
      {
        title: 'Check-ins and rating history',
        description:
          'Capture how you feel in seconds and keep the history organized for review.',
        details: [
          'Daily ratings feed into weekly reports and show how energy or mood shifts over time.',
          'History views keep it easy to revisit specific days or compare weeks side by side.',
          'The more consistent the entries, the clearer your long-term trend lines become.',
        ],
        bullets: [
          'Fast daily ratings and optional notes',
          'History view for multi-week trends',
          'Works alongside mood tracking',
          'Feeds weekly summaries automatically',
          'Supports reminders and notifications',
        ],
        image: {
          src: '/screenshots/hero/TODAYS CHECK IN.png',
          alt: 'Daily check-in screen',
        },
      },
      {
        title: 'Wearable integrations',
        description:
          'Sync supported wearables to add context to your daily log.',
        details: [
          'Fitbit and Garmin Connect data can be pulled into Helfi so your activity and sleep metrics from your devices stay aligned.',
          'You can see summaries, charts, and correlations without leaving the platform.',
          'Device syncing keeps the data flow steady without manual imports.',
        ],
        bullets: [
          'Fitbit summaries, charts, and correlations',
          'Garmin wellness data and trend charts',
          'Sync guidance inside the app',
          'Clear device status at a glance',
          'Ready for weekly reporting',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Device data trends',
        },
      },
      {
        title: 'Device roadmap visibility',
        description:
          'Tell us which devices you use so future integrations match your stack.',
        details: [
          'Helfi records device interest preferences so you can be notified when new integrations launch.',
          'This keeps your future setup lightweight with no extra onboarding later.',
          'You can keep your device preferences updated as your tools change.',
        ],
        bullets: [
          'Track interest in upcoming integrations',
          'Keep your ecosystem organized',
          'Minimize setup when support launches',
          'Centralized device preferences',
          'Built for long-term tracking',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Device preferences on a phone',
        },
      },
    ],
    seo: {
      title: 'Health Tracking and Wearables',
      description:
        'Connect daily check-ins with Fitbit and Garmin data to keep health trends visible in one dashboard.',
    },
  },
  {
    slug: 'ai-insights',
    title: 'AI Insights and Weekly Reports',
    subtitle: 'A weekly view of what is helping and what needs attention.',
    intro:
      'Helfi uses your last 7 days of data to generate weekly reports and issue-specific insights.',
    overview: [
      'Weekly reporting keeps the focus on consistent patterns rather than noisy daily fluctuations.',
      'Insights are designed to help you ask better questions and stay aligned with your health goals.',
      'Issue-specific views break down nutrition, supplements, sleep, exercise, and lifestyle inputs in one place.',
      'This AI health insights layer turns daily tracking into a weekly health report you can act on.',
    ],
    summary: 'Weekly reports and focused insights built from your last 7 days.',
    heroImage: {
      src: '/screenshots/hero/INSIGHTS.png',
      alt: 'AI insights on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Weekly report cadence',
        description:
          'A clear weekly summary that highlights progress, challenges, and the next areas to focus on.',
      },
      {
        title: 'Issue-based analysis',
        description:
          'Focused views for energy, sleep, digestion, and other issues tied to your logged data.',
      },
      {
        title: 'Safety context',
        description:
          'Supplement and medication review tools help you keep a safe, aligned routine.',
      },
    ],
    useCases: [
      {
        title: 'Goal-driven health plans',
        description:
          'Use weekly insights to align daily habits with long-term health goals.',
      },
      {
        title: 'Pattern discovery',
        description:
          'Find links between nutrition, sleep, and symptoms without manual spreadsheets.',
      },
      {
        title: 'Provider preparation',
        description:
          'Bring organized weekly summaries into appointments or coaching sessions.',
      },
    ],
    outcomes: [
      'Weekly narrative that helps you track progress over time.',
      'Clearer questions for providers, coaches, or your own research.',
      'A repeatable cadence for building healthier routines.',
      'Visible links between your habits and how you feel.',
      'A structured place to review safety and interactions.',
      'Less time guessing what is working and why.',
    ],
    segments: [
      {
        title: 'Weekly report cadence',
        description:
          'Each report is generated from your last 7 days of tracking.',
        details: [
          'Weekly summaries reduce noise and focus on what is consistently showing up in your data.',
          'Reports highlight wins, emerging patterns, and areas that need attention next week.',
          'The weekly cadence makes it easier to iterate without feeling overwhelmed.',
        ],
        bullets: [
          '7-day reporting window',
          'Highlights trends in sleep, mood, nutrition, and activity',
          'Clear next-step guidance',
          'Easy to review and revisit',
          'Aligned with your ongoing tracking',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Weekly report view',
        },
      },
      {
        title: 'Issue-specific insights',
        description:
          'Explore targeted insights for the issues you care about most.',
        details: [
          'Issue pages break down nutrition, supplements, exercise, and lifestyle inputs for each topic.',
          'This helps you focus on the adjustments that matter without losing the bigger picture.',
          'You can review working, suggested, and avoid lists in one place.',
        ],
        bullets: [
          'Issue-focused dashboards',
          'Nutrition, supplement, sleep, and lifestyle segments',
          'Track progress week over week',
          'Organized for quick review',
          'Aligned with your health goals',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Issue-based insights on a phone',
        },
      },
      {
        title: 'Supplement safety and interactions',
        description:
          'Review potential conflicts across supplements and medications.',
        details: [
          'Safety summaries help you stay aware of known interactions when you add or adjust supplements.',
          'This keeps your routine documented and easier to discuss with a provider.',
          'Interaction views are designed to support safe decision making, not replace medical advice.',
        ],
        bullets: [
          'Plain-language interaction summaries',
          'Centralized supplement and medication lists',
          'Context you can reference later',
          'Built for safe decision making',
          'Supports weekly reviews',
        ],
        image: {
          src: '/screenshots/hero/SUPPLEMENT INTERACTIONS.png',
          alt: 'Supplement interaction summary',
        },
      },
      {
        title: 'Actionable next steps',
        description:
          'Turn the weekly review into a clear plan for the next seven days.',
        details: [
          'Helfi highlights the habits and signals that deserve focus so you can stay consistent.',
          'You can track progress and adjust your routine without losing the weekly context.',
          'The result is a tighter loop between tracking and action.',
        ],
        bullets: [
          'Focused weekly priorities',
          'Aligned with your goals and symptoms',
          'Helps reduce trial and error',
          'Keeps improvements measurable',
          'Designed for steady momentum',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Weekly action summary',
        },
      },
    ],
    seo: {
      title: 'AI Insights and Weekly Reports',
      description:
        'Get weekly health reports and focused insights from your last 7 days of data.',
    },
  },
  {
    slug: 'nutrition-food',
    title: 'Food Analysis and Nutrition Logging',
    subtitle: 'Log meals faster and keep nutrition trends clear.',
    intro:
      'Capture meals with photos or manual entries and keep a structured nutrition diary that supports your goals.',
    overview: [
      'Helfi is built to reduce the friction of meal logging while keeping the data accurate enough to review each week.',
      'Photo-assisted analysis gives you a starting point, and manual edits keep the final entry under your control.',
      'Consistent food logging feeds into weekly insights and makes nutrition trends more meaningful.',
      'As a food diary app and nutrition tracking app, it supports macro tracking, packaged foods, and manual entries in one flow.',
    ],
    summary: 'Photo-assisted meal logging with flexible edits and trends.',
    heroImage: foodDiaryPhoto(
      '/WEBSITE IMAGES/FOOD DIARY/WOMAN ANALYZING HER FOOD.png',
      'Reviewing a meal with the Helfi app'
    ),
    bannerImage: foodDiaryPhoto(
      '/WEBSITE IMAGES/FOOD DIARY/FOOD DIARY BANNER.jpg',
      'Food diary banner'
    ),
    carouselImages: [
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD ENTRIES-portrait.png',
        'Food diary entries list'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD IMAGE AI SCAN-portrait.png',
        'AI food photo scan'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD SCAN IN ACTION-portrait.png',
        'Food scan in action'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD SCAN SALMON MEAL-portrait.png',
        'Food scan results for a salmon meal'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD SCAN SALMON 2-portrait.png',
        'Food scan details for salmon'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD SCAN SALMON 3-portrait.png',
        'Food scan nutrition breakdown'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/INGREDIENT CARDS-portrait.png',
        'Ingredient cards view'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/EXPANDED INGREDIENT CARD-portrait.png',
        'Expanded ingredient card'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/ADD MEAL MENU-portrait.png',
        'Add meal menu'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/COPY-DUPLICATE MEALS-portrait.png',
        'Copy or duplicate meals'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD HEALTH WARNING-portrait.png',
        'Food health warning'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/ENERGY SUMMARY MACROS-portrait.png',
        'Macro summary view'
      ),
      foodDiaryPhone(
        '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/ENERGY SUMMARY CIRCLES-portrait.png',
        'Energy summary circles'
      ),
    ],
    showHeroImage: true,
    showSegmentImages: true,
    overviewLayout: 'expanded',
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Photo-assisted logging',
        description:
          'Snap a photo and review suggested ingredients before saving the entry.',
      },
      {
        title: 'Flexible meal editing',
        description:
          'Adjust portions, swap ingredients, or build meals manually when needed.',
      },
      {
        title: 'Nutrition trends',
        description:
          'Track macros, calories, and nutrient trends alongside your health goals.',
      },
      {
        title: 'Packaged food lookup',
        description:
          'Scan barcodes or search branded foods to log packaged items quickly.',
      },
    ],
    useCases: [
      {
        title: 'Everyday meal tracking',
        description:
          'Keep a consistent food diary without spending time on manual entries for every meal.',
      },
      {
        title: 'Goal-based nutrition',
        description:
          'Monitor nutrition against wellness goals such as energy, sleep, or digestion support.',
      },
      {
        title: 'Performance nutrition',
        description:
          'Track macronutrients and fueling habits to support training routines.',
      },
    ],
    outcomes: [
      'Faster meal logging with edits you control.',
      'Nutrition trends that show up in weekly reports.',
      'Clearer links between what you eat and how you feel.',
      'A consistent food diary that is easy to maintain.',
      'Better alignment between meals and health goals.',
      'Less manual work when reviewing nutrition patterns.',
    ],
    segments: [
      {
        title: 'Capture meals in real life',
        description:
          'Log meals wherever you eat so the diary stays accurate without interrupting the moment.',
        details: [
          'Snap meals at home, in the office, or out at a restaurant to keep the log realistic.',
          'Photos give you visual context later when you review trends or spot patterns.',
          'You can capture quickly and add detail once you have time.',
        ],
        bullets: [
          'Designed for real-world meals',
          'Works at home or while dining out',
          'Keeps a visual record for later review',
          'Pairs with the AI scan step next',
          'No heavy typing to get started',
        ],
        image: foodDiaryPhoto(
          '/WEBSITE IMAGES/FOOD DIARY/WOMAN MAKING FOOD.jpg',
          'Preparing a meal at home'
        ),
        images: [
          foodDiaryPhoto(
            '/WEBSITE IMAGES/FOOD DIARY/WOMAN MAKING FOOD.jpg',
            'Preparing a meal at home'
          ),
          foodDiaryPhoto(
            '/WEBSITE IMAGES/FOOD DIARY/FOOD ANALYZER IN ACTION.jpg',
            'Meal captured in the moment'
          ),
        ],
      },
      {
        title: 'AI photo scan and ingredient breakdown',
        description:
          'Upload a meal photo and start with a structured breakdown.',
        details: [
          'Photo analysis provides a quick starting point for ingredients and portions.',
          'You can review the entry and adjust it before saving the final log.',
          'This keeps the workflow fast while still letting you refine the data.',
        ],
        bullets: [
          'Quick capture from your phone',
          'Review suggested items before saving',
          'Ingredient cards auto-populate',
          'Built for fast daily use',
          'Keeps the diary consistent',
        ],
        image: foodDiaryPhone(
          '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD IMAGE AI SCAN-portrait.png',
          'AI meal scan on a phone'
        ),
        images: [
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD IMAGE AI SCAN-portrait.png',
            'AI meal scan on a phone'
          ),
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD SCAN IN ACTION-portrait.png',
            'Food scan in action on a phone'
          ),
        ],
      },
      {
        title: 'Manual edits and build-a-meal',
        description:
          'Create meals manually when you need more control.',
        details: [
          'Search ingredients, adjust portions, and build meals from scratch.',
          'This keeps entries accurate when a photo alone is not enough.',
          'Saved meals make it easier to repeat common recipes.',
        ],
        bullets: [
          'Manual ingredient search',
          'Portion control and adjustments',
          'Save common meals for reuse',
          'Full control over your log',
          'Aligned with your nutrition goals',
        ],
        image: foodDiaryPhone(
          '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/INGREDIENT CARDS-portrait.png',
          'Ingredient cards in the food diary'
        ),
        images: [
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/INGREDIENT CARDS-portrait.png',
            'Ingredient cards in the food diary'
          ),
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/EXPANDED INGREDIENT CARD-portrait.png',
            'Expanded ingredient card details'
          ),
        ],
      },
      {
        title: 'Nutrition diary and trends',
        description:
          'Stay consistent with a nutrition diary that feeds into weekly insights.',
        details: [
          'Daily entries build a stronger weekly report and keep goals visible.',
          'Trend views make it easier to spot changes in macros or calorie balance.',
          'You can compare weeks to see how changes in diet affect energy or mood.',
        ],
        bullets: [
          'Daily and weekly summaries',
          'Macro balance at a glance',
          'Goal alignment built in',
          'Works with check-ins and mood tracking',
          'Supports long-term trend review',
        ],
        image: foodDiaryPhone(
          '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/ENERGY SUMMARY MACROS-portrait.png',
          'Macro summary view on a phone'
        ),
        images: [
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/ENERGY SUMMARY MACROS-portrait.png',
            'Macro summary view on a phone'
          ),
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/ENERGY SUMMARY CIRCLES-portrait.png',
            'Energy summary rings and trends'
          ),
        ],
      },
      {
        title: 'Packaged foods and barcode scanning',
        description:
          'Log packaged foods faster with barcode lookup and branded product entries.',
        details: [
          'Barcode lookup pulls nutrition data from multiple sources so you can add packaged items without manual entry.',
          'Branded foods stay in your diary with serving sizes and nutrition details you can edit.',
          'This keeps packaged food logging consistent with your photo and manual entries.',
        ],
        bullets: [
          'Barcode scanning for packaged foods',
          'Branded product nutrition details',
          'Fast add to your food diary',
          'Edit portions and serving sizes',
          'Keeps entries aligned with weekly insights',
        ],
        image: {
          src: '/WEBSITE IMAGES/FOOD DIARY/BREAD SCAN.png',
          alt: 'Scanning a packaged bread barcode with the app',
          width: 1200,
          height: 896,
        },
        alignImageWithHeading: true,
      },
      {
        title: 'Food recommendations and context',
        description:
          'Use the recommendation tools to explore options that match your goals.',
        details: [
          'Helfi can explain how different foods align with your targets or recent trends.',
          'This helps you make informed choices without starting from scratch every meal.',
          'Recommendations are meant to support decision making, not replace professional advice.',
        ],
        bullets: [
          'Goal-aligned suggestions',
          'Explanation views for transparency',
          'Faster meal planning decisions',
          'Helps reduce guesswork',
          'Built around your tracking history',
        ],
        image: foodDiaryPhone(
          '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD HEALTH WARNING-portrait.png',
          'Nutrition context and health warning'
        ),
        images: [
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/FOOD HEALTH WARNING-portrait.png',
            'Nutrition context and health warning'
          ),
          foodDiaryPhone(
            '/MOBILE MOCKUPS/FOOD DIARY/MOBILE PHONE MOCKUPS/RECOMMENDED MEAL-portrait.png',
            'AI recommended meal details'
          ),
        ],
      },
    ],
    seo: {
      title: 'Food Analysis and Nutrition Logging',
      description:
        'Log meals with photos or manual edits and track nutrition trends alongside your health goals.',
    },
  },
  {
    slug: 'supplement-safety',
    title: 'Supplements and Medication Safety',
    subtitle: 'Track what you take and surface possible conflicts.',
    intro:
      'Keep supplements and medications in one place so safety checks stay simple and easy to review.',
    overview: [
      'A clean supplement and medication list makes it easier to stay consistent and avoid overlap.',
      'Helfi surfaces potential conflicts to support safer decisions, not replace medical advice.',
      'Weekly reviews keep your stack aligned with your goals and any recent health changes.',
      'Think of it as a supplement interaction checker and medication interaction checker built into your daily tracking.',
    ],
    summary: 'Track supplements and medications with safety-focused summaries.',
    heroImage: {
      src: '/screenshots/hero/SUPPLEMENT INTERACTIONS.png',
      alt: 'Supplement safety on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Supplement stack tracking',
        description:
          'Log supplements with timing, dosage, and purpose so routines stay consistent.',
      },
      {
        title: 'Medication list alignment',
        description:
          'Keep prescription medications and supplements visible in the same workflow.',
      },
      {
        title: 'Interaction review',
        description:
          'Surface potential conflicts so you can review them with context.',
      },
    ],
    useCases: [
      {
        title: 'Supplement planning',
        description:
          'Keep stacks organized while you refine timing, dosage, and quality.',
      },
      {
        title: 'Medication support',
        description:
          'Maintain a clear list for provider conversations and safety checks.',
      },
      {
        title: 'Safety-focused routines',
        description:
          'Reduce the risk of conflicts when adding or removing supplements.',
      },
    ],
    outcomes: [
      'Clearer supplement routines with less duplication.',
      'A documented list you can share during appointments.',
      'Fewer surprises when changing your stack.',
      'Safety reminders that stay visible week to week.',
      'Better alignment between goals and your supplement plan.',
      'Improved confidence when reviewing interactions.',
    ],
    segments: [
      {
        title: 'Supplement and medication lists',
        description:
          'Keep everything you take in one organized list.',
        details: [
          'Log supplements, prescriptions, and timing so your routine stays consistent.',
          'This view becomes the foundation for safety checks and weekly reviews.',
          'You can update entries as routines change without losing the history.',
        ],
        bullets: [
          'Centralized list with dosage and timing',
          'Works with photo-assisted logging',
          'Keeps routines consistent',
          'Easy to update over time',
          'Supports weekly review',
        ],
        image: {
          src: '/screenshots/hero/SUPPLEMENT INTERACTIONS.png',
          alt: 'Supplement list on a phone',
        },
      },
      {
        title: 'Medication alignment',
        description:
          'Keep medications and supplements aligned so nothing is missed.',
        details: [
          'Helfi keeps your medication list visible so you can compare new supplements against it.',
          'This helps you review changes with your provider or health coach.',
          'The combined view reduces the chance of overlapping ingredients.',
        ],
        bullets: [
          'Medication list alongside supplements',
          'Reduce overlap and duplication',
          'Better context for weekly reports',
          'Prepared for appointments',
          'Supports safe tracking',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Medication list overview',
        },
      },
      {
        title: 'Interaction review',
        description:
          'See potential conflicts in a structured summary.',
        details: [
          'Known interaction data helps surface possible conflicts before you add something new.',
          'The goal is to give you a clearer starting point for safe decisions.',
          'Use the summary to guide conversations with a qualified provider.',
        ],
        bullets: [
          'Plain-language interaction summaries',
          'Support for safer choices',
          'Notes for follow-up questions',
          'Regularly reviewed entries',
          'Aligned with weekly insights',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Interaction check summary',
        },
      },
      {
        title: 'Weekly safety check-ins',
        description:
          'Keep safety and timing aligned with your weekly routine.',
        details: [
          'Weekly insights make it easier to review your stack as your goals change.',
          'You can spot patterns in how supplements line up with energy, sleep, or symptoms.',
          'The goal is steady, informed adjustments rather than reactive changes.',
        ],
        bullets: [
          'Weekly review of your stack',
          'Aligned with health goals',
          'Helps maintain consistency',
          'Supports long-term tracking',
          'Reduces confusion over timing',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Weekly safety view',
        },
      },
    ],
    seo: {
      title: 'Supplements and Medication Safety',
      description:
        'Track supplements and medications with safety-focused summaries and interaction checks.',
    },
  },
  {
    slug: 'lab-reports',
    title: 'Lab Report Analysis',
    subtitle: 'Upload lab results and follow trends over time.',
    intro:
      'Helfi extracts key markers from lab reports so you can track changes and prepare questions.',
    overview: [
      'Upload PDFs or photos of lab results and keep them organized by date.',
      'Trends help you see how markers change between visits so you can plan follow-up conversations.',
      'Lab summaries connect to your weekly health view so you can track progress over time.',
      'The lab report analysis workflow supports biomarker tracking without manual spreadsheets.',
    ],
    summary: 'Upload lab reports and track biomarkers over time.',
    heroImage: {
      src: '/screenshots/hero/UPLOAD BLOOD RESULTS.png',
      alt: 'Lab report upload on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Secure lab uploads',
        description:
          'Store lab reports in an encrypted workflow built for sensitive health data.',
      },
      {
        title: 'Biomarker history',
        description:
          'Track key markers over time and compare past results in one place.',
      },
      {
        title: 'Structured summaries',
        description:
          'Extract and organize lab values so they are easier to review and discuss.',
      },
    ],
    useCases: [
      {
        title: 'Annual lab reviews',
        description:
          'Keep a running record of lab values so yearly comparisons are straightforward.',
      },
      {
        title: 'Performance or recovery tracking',
        description:
          'Monitor markers related to training, energy, or recovery in one place.',
      },
      {
        title: 'Clinical follow-ups',
        description:
          'Prepare for appointments with organized history and trend summaries.',
      },
    ],
    outcomes: [
      'A centralized history of lab results that is easy to review.',
      'Trend views that make it easier to discuss changes with a provider.',
      'Less time hunting through PDF files before appointments.',
      'Clearer summaries for your weekly reports.',
      'Improved context when adjusting supplements or routines.',
      'A reliable archive of your lab data.',
    ],
    segments: [
      {
        title: 'Upload PDFs or photos',
        description:
          'Bring lab results into Helfi without manual transcription.',
        details: [
          'Upload lab reports from your phone or desktop and keep them organized by date.',
          'The intake flow is designed to be quick while keeping sensitive data protected.',
          'You can add context around the visit so the results are easier to recall later.',
        ],
        bullets: [
          'Supports common lab formats',
          'Fast, guided upload flow',
          'Organized by date and visit',
          'Easy to revisit later',
          'Links to weekly reports',
        ],
        image: {
          src: '/screenshots/hero/UPLOAD BLOOD RESULTS.png',
          alt: 'Lab report upload screen',
        },
      },
      {
        title: 'Biomarker trends over time',
        description:
          'Track how key markers shift across multiple tests.',
        details: [
          'Helfi keeps prior results available so you can compare changes at a glance.',
          'Trend summaries help you focus on what moved and why it matters.',
          'Long-term trends are easier to spot when data is centralized.',
        ],
        bullets: [
          'Side-by-side comparisons',
          'Trend summaries for key markers',
          'Clearer follow-up questions',
          'Improved long-term visibility',
          'Supports proactive planning',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Lab result trends on a phone',
        },
      },
      {
        title: 'Notes and context',
        description:
          'Keep lab notes connected to your wider health log.',
        details: [
          'Add context around symptoms, diet changes, or supplements that may affect results.',
          'This keeps the lab history tied to the rest of your tracking.',
          'Your notes help you remember what changed between visits.',
        ],
        bullets: [
          'Add notes for each test',
          'Connect to weekly insights',
          'Keep context for appointments',
          'Better longitudinal tracking',
          'Works with symptom history',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Lab report history overview',
        },
      },
      {
        title: 'Secure handling',
        description:
          'Lab data is encrypted and stored with strict access controls.',
        details: [
          'Helfi uses encrypted storage for lab data and keeps access tied to your account.',
          'You can export or delete data any time from your account settings.',
          'Security safeguards are built into the upload and processing flow.',
        ],
        bullets: [
          'Encrypted storage',
          'Account-based access controls',
          'Export or delete any time',
          'Privacy-focused handling',
          'Clear audit trail',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Secure lab report storage',
        },
      },
    ],
    seo: {
      title: 'Lab Report Analysis',
      description:
        'Upload lab reports and track biomarker trends over time in a secure, organized view.',
    },
  },
  {
    slug: 'medical-imaging',
    title: 'Medical Image Analysis',
    subtitle: 'Store images and keep structured summaries you can revisit.',
    intro:
      'Upload medical images to keep them organized and pair them with notes for follow-ups.',
    overview: [
      'Medical images can be scattered across different providers and portals. Helfi keeps them in one place.',
      'Structured summaries help you remember what was discussed so you can prepare for future visits.',
      'The goal is to keep your imaging history visible alongside the rest of your health timeline.',
      'This medical image analysis workspace keeps your scans and notes organized and easy to revisit.',
    ],
    summary: 'Centralize medical images with AI-assisted summaries.',
    heroImage: {
      src: '/screenshots/hero/HEALTH ISSUES.png',
      alt: 'Medical imaging summary on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Image storage',
        description:
          'Upload scans or images and keep them organized with your health timeline.',
      },
      {
        title: 'Structured summaries',
        description:
          'Capture key notes so you can recall details later without searching through files.',
      },
      {
        title: 'History and review',
        description:
          'Keep imaging history ready for follow-ups and progress checks.',
      },
    ],
    useCases: [
      {
        title: 'Follow-up imaging',
        description:
          'Keep scans organized across multiple visits so you can review progress.',
      },
      {
        title: 'Specialist consultations',
        description:
          'Prepare context and summaries for specialists without hunting through files.',
      },
      {
        title: 'Long-term records',
        description:
          'Maintain a durable archive of imaging history alongside symptoms and labs.',
      },
    ],
    outcomes: [
      'A centralized place for medical imaging history.',
      'Structured summaries that make follow-ups easier.',
      'Better preparation for appointments.',
      'Clearer links between imaging and symptoms.',
      'Less time searching across multiple portals.',
      'Context you can revisit when needed.',
    ],
    segments: [
      {
        title: 'Upload medical images',
        description:
          'Store images such as X-rays or scans in your Helfi timeline.',
        details: [
          'Uploads are organized by date so you can keep imaging history tidy.',
          'Attach notes to highlight what matters from each appointment.',
          'This keeps your imaging library easy to navigate over time.',
        ],
        bullets: [
          'Centralized storage',
          'Organized by date',
          'Attach context and notes',
          'Easy to revisit later',
          'Built for long-term history',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Medical images list on a phone',
        },
      },
      {
        title: 'AI-assisted summaries',
        description:
          'Get structured summaries to help you remember key details.',
        details: [
          'Summaries are designed to support personal understanding, not provide medical diagnosis.',
          'Use them to organize questions for your next appointment.',
          'You can keep notes in plain language for quick recall.',
        ],
        bullets: [
          'Structured notes',
          'Clear summaries for recall',
          'Helpful context for follow-ups',
          'Supports informed conversations',
          'Designed to be easy to review',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Medical image summary view',
        },
      },
      {
        title: 'History and comparison',
        description:
          'Keep imaging history in one place so you can compare over time.',
        details: [
          'Track how imaging results shift between visits without losing older files.',
          'This helps you keep long-term context in one place.',
          'Comparisons are easier when everything is organized chronologically.',
        ],
        bullets: [
          'Review past visits',
          'Prepare questions for providers',
          'Organized timeline',
          'Export when needed',
          'Supports ongoing tracking',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Medical imaging history on a phone',
        },
      },
      {
        title: 'Shareable context',
        description:
          'Maintain notes you can share with a care team or coach.',
        details: [
          'Summaries and notes help you communicate clearly even if appointments are spaced out.',
          'Keep the key details ready without searching across apps.',
          'Share a consistent narrative with each new provider.',
        ],
        bullets: [
          'Simple context notes',
          'Consistent documentation',
          'Better appointment prep',
          'Keeps imaging history aligned',
          'Supports informed decisions',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Medical imaging notes view',
        },
      },
    ],
    seo: {
      title: 'Medical Image Analysis',
      description:
        'Store medical images, add context, and keep structured summaries in one place.',
    },
  },
  {
    slug: 'symptom-tracking',
    title: 'Symptom Tracking',
    subtitle: 'Capture symptoms and connect them to your routine.',
    intro:
      'Log symptoms with context so patterns are easier to spot in weekly reviews.',
    overview: [
      'Structured symptom tracking helps you avoid vague notes that are hard to compare later.',
      'Helfi connects symptom entries with your nutrition, sleep, and supplement data for better context.',
      'Weekly summaries turn daily entries into trends you can act on.',
      'As a symptom tracker, it keeps your history organized and ready for review.',
    ],
    summary: 'Track symptoms and connect them to nutrition, sleep, and routines.',
    heroImage: {
      src: '/screenshots/hero/SYMPTOM ANALYZER.png',
      alt: 'Symptom tracking on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Structured symptom logs',
        description:
          'Capture symptoms with timing, severity, and notes in seconds.',
      },
      {
        title: 'Pattern review',
        description:
          'Weekly summaries help reveal recurring triggers and trends.',
      },
      {
        title: 'Context alignment',
        description:
          'See symptom entries next to sleep, nutrition, and supplement data.',
      },
    ],
    useCases: [
      {
        title: 'Chronic symptom tracking',
        description:
          'Keep a clear record of recurring symptoms and changes over time.',
      },
      {
        title: 'New symptom monitoring',
        description:
          'Track new symptoms and gather context quickly for follow-up.',
      },
      {
        title: 'Care team support',
        description:
          'Bring structured symptom history into appointments or coaching sessions.',
      },
    ],
    outcomes: [
      'A consistent symptom history that is easy to reference.',
      'Patterns you can bring into weekly reports or appointments.',
      'Better understanding of what influences symptoms.',
      'Clearer documentation for follow-up care.',
      'Less guesswork when symptoms change.',
      'More confidence in tracking adjustments.',
    ],
    segments: [
      {
        title: 'Structured symptom logs',
        description:
          'Record symptoms quickly with the context you need later.',
        details: [
          'Capture what you feel, when it started, and how intense it is in a consistent format.',
          'You can add notes or photos when it helps explain the entry.',
          'Consistent logging helps highlight trends that are easy to miss day to day.',
        ],
        bullets: [
          'Quick symptom capture',
          'Add notes for context',
          'Consistent history over time',
          'Supports photo attachments',
          'Works alongside check-ins',
        ],
        image: {
          src: '/screenshots/hero/SYMPTOM ANALYZER.png',
          alt: 'Symptom log entry screen',
        },
      },
      {
        title: 'Severity and context',
        description:
          'Add details that make symptoms easier to compare later.',
        details: [
          'Severity scales and tags help you track changes with more precision.',
          'This context makes weekly summaries more useful.',
          'You can review severity changes across days or weeks.',
        ],
        bullets: [
          'Severity and duration tracking',
          'Context notes and tags',
          'Better comparisons week to week',
          'Linked to check-ins',
          'Supports trend analysis',
        ],
        image: {
          src: '/screenshots/hero/TODAYS CHECK IN.png',
          alt: 'Symptom context capture',
        },
      },
      {
        title: 'Pattern discovery',
        description:
          'Review how symptoms shift alongside nutrition, sleep, and supplements.',
        details: [
          'Weekly summaries highlight relationships between symptoms and lifestyle changes.',
          'This helps you spot recurring triggers or improvements over time.',
          'Use trends to guide discussions with your care team.',
        ],
        bullets: [
          'Correlations across your data',
          'Highlight recurring triggers',
          'Weekly summaries to review',
          'Improved decision making',
          'Supports proactive changes',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Symptom trend view on a phone',
        },
      },
      {
        title: 'Shareable history',
        description:
          'Bring a clear symptom record to appointments or reviews.',
        details: [
          'A structured history helps you communicate what is changing and when.',
          'Export or summarize entries to keep the conversation focused.',
          'A consistent history makes it easier to track progress over time.',
        ],
        bullets: [
          'Organized timelines',
          'Exportable history',
          'Better conversations',
          'Consistent documentation',
          'Ready for follow-ups',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Symptom history summary',
        },
      },
    ],
    seo: {
      title: 'Symptom Tracking',
      description:
        'Log symptoms with context and review patterns alongside your nutrition and sleep data.',
    },
  },
  {
    slug: 'mood-tracking',
    title: 'Mood Tracking',
    subtitle: 'Build a daily mood record without extra effort.',
    intro:
      'Track moods, journal, and learn what supports better days.',
    overview: [
      'Quick mood check-ins keep you consistent without slowing you down.',
      'Helfi pairs mood entries with your broader health data so weekly insights have more depth.',
      'Mood history helps you connect emotional wellbeing with sleep, nutrition, and routines.',
      'It works as a mood tracker app that stays aligned with your overall health tracking.',
    ],
    summary: 'Quick mood check-ins with journaling and trend views.',
    heroImage: {
      src: '/screenshots/hero/TODAYS CHECK IN.png',
      alt: 'Mood tracking on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Quick mood entry',
        description:
          'Log your mood in seconds so tracking stays consistent.',
      },
      {
        title: 'Mood journal',
        description:
          'Add short notes when you want more context.',
      },
      {
        title: 'Mood insights',
        description:
          'Spot patterns tied to sleep, nutrition, and daily routines.',
      },
    ],
    useCases: [
      {
        title: 'Daily wellbeing check',
        description:
          'Track mood with minimal effort and build a personal wellbeing record.',
      },
      {
        title: 'Stress management',
        description:
          'See how mood shifts alongside work, sleep, or lifestyle changes.',
      },
      {
        title: 'Long-term reflection',
        description:
          'Build a timeline of mood and habits that supports reflection and planning.',
      },
    ],
    outcomes: [
      'A daily mood record that is easy to maintain.',
      'More context for weekly reports and check-ins.',
      'Clearer understanding of what supports better days.',
      'A journal you can review over time.',
      'Trends that help guide lifestyle changes.',
      'Less guesswork when moods shift.',
    ],
    segments: [
      {
        title: 'Quick mood check-ins',
        description:
          'Log your mood in seconds with a lightweight check-in flow.',
        details: [
          'Short inputs keep the process consistent and reduce tracking fatigue.',
          'Entries feed directly into your weekly insights.',
          'Quick tags make it easier to interpret mood changes later.',
        ],
        bullets: [
          'Low-friction daily tracking',
          'Optional notes when needed',
          'Built for consistency',
          'Feeds weekly reporting',
          'Designed for mobile use',
        ],
        image: {
          src: '/screenshots/hero/TODAYS CHECK IN.png',
          alt: 'Mood check-in on a phone',
        },
      },
      {
        title: 'Mood journal',
        description:
          'Add context when it matters and revisit entries later.',
        details: [
          'Short journal entries help capture the events or habits behind a mood shift.',
          'This context helps you review patterns over time.',
          'The journal is designed to stay lightweight so you keep using it.',
        ],
        bullets: [
          'Short written entries',
          'Capture tags and context',
          'Review by date',
          'Aligned with check-ins',
          'Supports long-term reflection',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Mood journal entry view',
        },
      },
      {
        title: 'Insights over time',
        description:
          'See how mood changes with sleep, nutrition, and activity.',
        details: [
          'Weekly summaries highlight relationships between mood and daily habits.',
          'Use the trend view to spot changes before they become patterns.',
          'Mood trends help inform future routine adjustments.',
        ],
        bullets: [
          'Weekly patterns',
          'Personal trends',
          'Aligned with goals',
          'Supports long-term review',
          'Pairs with health tracking',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Mood insights on a phone',
        },
      },
      {
        title: 'Mood history',
        description:
          'Keep a history of mood entries for longer-term reflection.',
        details: [
          'History views help you see how a month or quarter has shifted.',
          'Use it to keep long-term progress visible.',
          'The timeline is easy to review alongside weekly reports.',
        ],
        bullets: [
          'Monthly review options',
          'Consistent time series',
          'Easy to revisit entries',
          'Helps with planning',
          'Supports accountability',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Mood history on a phone',
        },
      },
    ],
    seo: {
      title: 'Mood Tracking',
      description:
        'Track mood with quick check-ins, journaling, and trends tied to your health data.',
    },
  },
  {
    slug: 'daily-check-ins',
    title: 'Daily Check-ins and Health Tips',
    subtitle: 'Keep a simple daily signal that powers your insights.',
    intro:
      'Daily check-ins give Helfi a consistent signal to track trends and surface weekly patterns.',
    overview: [
      'The daily check-in flow keeps tracking lightweight while still capturing the signals that matter most.',
      'Health tips help you stay engaged with small improvements that align with your long-term goals.',
      'The combination builds a reliable weekly story you can review and act on.',
      'If you need a simple daily health check-in habit, this is designed to stay effortless.',
    ],
    summary: 'Daily check-ins paired with tips and trend history.',
    heroImage: {
      src: '/screenshots/hero/TODAYS CHECK IN.png',
      alt: 'Daily check-in on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Daily signal tracking',
        description:
          'Quick ratings and notes create a consistent daily signal for insights.',
      },
      {
        title: 'History and trends',
        description:
          'Review check-ins across weeks to spot changes early.',
      },
      {
        title: 'Health tips feed',
        description:
          'Short tips help keep progress moving without overwhelm.',
      },
    ],
    useCases: [
      {
        title: 'Daily accountability',
        description:
          'Keep a simple habit that takes under a minute and stays consistent.',
      },
      {
        title: 'Habit building',
        description:
          'Use tips and reminders to support small daily improvements.',
      },
      {
        title: 'Weekly review preparation',
        description:
          'Build a steady data stream that makes weekly insights more accurate.',
      },
    ],
    outcomes: [
      'Consistent daily signals that improve weekly insights.',
      'Better visibility into how routines impact results.',
      'A simple habit that supports long-term tracking.',
      'Practical tips you can apply immediately.',
      'A reliable history of how you felt each day.',
      'More confidence when reviewing trends.',
    ],
    segments: [
      {
        title: 'Daily ratings',
        description:
          'Rate how you feel and capture quick notes.',
        details: [
          'The daily check-in flow is designed to take less than a minute.',
          'These ratings become the backbone for weekly insight summaries.',
          'Optional notes help explain why the day felt different.',
        ],
        bullets: [
          'One-tap entries',
          'Optional notes',
          'Consistent time series',
          'Feeds weekly insights',
          'Designed for mobile use',
        ],
        image: {
          src: '/screenshots/hero/TODAYS CHECK IN.png',
          alt: 'Daily check-in flow',
        },
      },
      {
        title: 'Check-in history',
        description:
          'Review trends across weeks and months.',
        details: [
          'History views make it easy to spot changes or improvements over time.',
          'Pair this with weekly reports to see how daily signals impact outcomes.',
          'Long-term history supports seasonal or routine comparisons.',
        ],
        bullets: [
          'History view for quick review',
          'Spot changes over time',
          'Works with weekly reports',
          'Aligned with mood tracking',
          'Supports long-term planning',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Check-in history trends',
        },
      },
      {
        title: 'Health tips feed',
        description:
          'Read tips based on your goals and tracking habits.',
        details: [
          'Short, practical tips help you make small improvements without overload.',
          'Keep a running list of ideas you want to try in the coming weeks.',
          'Tips are designed to support momentum rather than overwhelm.',
        ],
        bullets: [
          'Short, practical ideas',
          'Goal-aligned suggestions',
          'Save favorites',
          'Supports ongoing progress',
          'Encourages consistent tracking',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Health tips on a phone',
        },
      },
      {
        title: 'Reminder controls',
        description:
          'Set reminders and keep check-ins consistent.',
        details: [
          'Notification settings help you maintain the habit without feeling overwhelmed.',
          'Adjust reminders as your routine changes.',
          'The goal is to keep tracking consistent without friction.',
        ],
        bullets: [
          'Flexible reminder settings',
          'Daily habit support',
          'Adjust timing any time',
          'Keeps tracking on schedule',
          'Supports sustainable routines',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Reminder settings view',
        },
      },
    ],
    seo: {
      title: 'Daily Check-ins and Health Tips',
      description:
        'Keep a consistent daily check-in and review trend history with personalized health tips.',
    },
  },
  {
    slug: 'voice-ai',
    title: 'Voice AI Assistant',
    subtitle: 'Log updates and ask questions hands-free.',
    intro:
      'Talk to Helfi to record notes or ask questions about your data without typing.',
    overview: [
      'Voice AI keeps your tracking consistent when you are on the move or short on time.',
      'You can review what gets saved so your data stays accurate and intentional.',
      'Voice conversations can be used alongside traditional logging for flexibility.',
      'Think of it as a voice health assistant that fits into your daily routine.',
    ],
    summary: 'Hands-free logging and voice-based questions for your health data.',
    heroImage: {
      src: '/screenshots/hero/ASK AI.png',
      alt: 'Voice AI assistant on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Voice capture',
        description:
          'Record updates, supplements, or symptoms without typing.',
      },
      {
        title: 'Contextual questions',
        description:
          'Ask about trends or weekly patterns and get focused responses.',
      },
      {
        title: 'Review and control',
        description:
          'You decide what gets saved and can edit any entries.',
      },
    ],
    useCases: [
      {
        title: 'On-the-go logging',
        description:
          'Capture updates while commuting or between meetings without opening a keyboard.',
      },
      {
        title: 'Quick weekly check-ins',
        description:
          'Ask about weekly patterns or next steps without scrolling through charts.',
      },
      {
        title: 'Hands-free journaling',
        description:
          'Record context when it is fresh and review it later in your log.',
      },
    ],
    outcomes: [
      'Less friction when logging daily updates.',
      'Faster questions and answers about your weekly trends.',
      'Better context captured while it is fresh.',
      'Full control over what gets stored.',
      'A flexible workflow that adapts to your day.',
      'Reduced skipped entries due to time pressure.',
    ],
    segments: [
      {
        title: 'Voice-first logging',
        description:
          'Capture meals, symptoms, or supplements without typing.',
        details: [
          'Voice capture keeps tracking consistent when you are busy or away from a keyboard.',
          'You can review and edit entries before they become part of your log.',
          'This makes it easier to maintain high-quality data without extra effort.',
        ],
        bullets: [
          'Hands-free entries',
          'Fast on mobile',
          'Review and adjust after saving',
          'Works alongside manual logging',
          'Keeps tracking consistent',
        ],
        image: {
          src: '/screenshots/hero/ASK AI.png',
          alt: 'Voice AI logging on a phone',
        },
      },
      {
        title: 'Ask about your patterns',
        description:
          'Ask questions about trends in your data and weekly reports.',
        details: [
          'Voice AI helps you explore what happened this week without digging through charts.',
          'Use it to summarize patterns or identify what to focus on next.',
          'It is designed to keep conversations concise and actionable.',
        ],
        bullets: [
          'Context-aware responses',
          'Weekly report alignment',
          'Clear summaries',
          'Designed for fast answers',
          'Supports follow-up questions',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Voice AI responses on a phone',
        },
      },
      {
        title: 'Review and edit',
        description:
          'Control what is saved to your log.',
        details: [
          'You decide what entries become part of your data and can edit anything later.',
          'This keeps your record accurate and aligned with your goals.',
          'Your log stays clean even when you speak quickly.',
        ],
        bullets: [
          'Review before saving',
          'Edit any entry later',
          'Delete data any time',
          'Privacy-first controls',
          'Keeps logs accurate',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Voice AI settings on a phone',
        },
      },
      {
        title: 'Private and controlled',
        description:
          'Keep conversations focused on your health data without oversharing.',
        details: [
          'Voice interactions are designed to stay within your Helfi account and tracking context.',
          'You can keep conversations light or detailed depending on the moment.',
          'The control stays with you at all times.',
        ],
        bullets: [
          'Account-based access',
          'No shared data',
          'Flexible conversation depth',
          'Aligned with your settings',
          'Designed for daily use',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Voice AI privacy overview',
        },
      },
    ],
    seo: {
      title: 'Voice AI Assistant',
      description:
        'Log health updates and ask questions hands-free with Helfi voice AI.',
    },
  },
]

export const featurePageSlugs = featurePages.map((page) => page.slug)

export function getFeaturePage(slug: string) {
  return featurePages.find((page) => page.slug === slug) || null
}
