export type FeaturePageCta = {
  label: string
  href: string
}

export type FeaturePageImage = {
  src: string
  alt: string
}

export type FeaturePageSegment = {
  title: string
  description: string
  bullets: string[]
  image: FeaturePageImage
}

export type FeaturePageContent = {
  slug: string
  title: string
  subtitle: string
  intro: string
  summary: string
  heroImage: FeaturePageImage
  primaryCta: FeaturePageCta
  secondaryCta: FeaturePageCta
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

export const featurePages: FeaturePageContent[] = [
  {
    slug: 'health-tracking',
    title: 'Health Tracking and Wearables',
    subtitle: 'Daily health signals and device data, all in one view.',
    intro:
      'Helfi brings your check-ins and device syncs together so you can see trends without juggling multiple apps.',
    summary: 'Daily dashboards and device syncs that keep trends visible.',
    heroImage: {
      src: '/screenshots/hero/DASHBOARD.png',
      alt: 'Helfi dashboard on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Daily health dashboard',
        description:
          'See key signals like activity, sleep, and check-in trends in one place.',
        bullets: [
          'Weekly summaries to keep patterns visible',
          '30-day charts for longer trends',
          'Fast access to recent check-ins',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Daily health dashboard view',
        },
      },
      {
        title: 'Fitbit and Garmin sync',
        description:
          'Connect supported devices and pull wellness data into your health timeline.',
        bullets: [
          'Fitbit summaries and correlations',
          'Garmin Connect wellness data',
          'Device status and sync guidance',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Health trends with device data',
        },
      },
      {
        title: 'Device roadmap visibility',
        description:
          'Share which devices you use so future integrations match your stack.',
        bullets: [
          'Record interest in upcoming integrations',
          'Keep your health data in one place',
          'No extra setup when support launches',
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
    summary: 'Weekly reports and focused insights built from your last 7 days.',
    heroImage: {
      src: '/screenshots/hero/INSIGHTS.png',
      alt: 'AI insights on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Weekly health report',
        description:
          'Every week, get a report built from your last 7 days of activity, nutrition, symptoms, and check-ins.',
        bullets: [
          'Weekly cadence for steady progress',
          'Highlights wins and flags changes',
          'Clear next-step suggestions',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Weekly report view',
        },
      },
      {
        title: 'Issue-based insights',
        description:
          'Explore focused views for energy, sleep, digestion, and other topics based on your data.',
        bullets: [
          'Nutrition, supplements, sleep, exercise, and lifestyle views',
          'Track progress over time',
          'Bring focused questions to your provider',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Issue-based insights on a phone',
        },
      },
      {
        title: 'Safety and interaction checks',
        description:
          'Review potential conflicts between supplements and medications before you add something new.',
        bullets: [
          'Interaction summaries in plain language',
          'Safety reminders you can reference later',
          'Designed to support informed decisions',
        ],
        image: {
          src: '/screenshots/hero/SUPPLEMENT INTERACTIONS.png',
          alt: 'Supplement interaction summary',
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
      'Snap a photo or build a meal manually. Helfi helps you keep a consistent food diary that ties into your goals.',
    summary: 'Photo-assisted meal logging with flexible edits and trends.',
    heroImage: {
      src: '/screenshots/hero/FOOD ANALYSIS.png',
      alt: 'Food analysis on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Photo-assisted meal logging',
        description:
          'Upload a meal photo and review Helfi suggestions before saving.',
        bullets: [
          'Quick capture from your phone',
          'Edit ingredients and portions',
          'Keep a visual meal record',
        ],
        image: {
          src: '/screenshots/hero/FOOD ANALYSIS.png',
          alt: 'Meal photo analysis on a phone',
        },
      },
      {
        title: 'Manual edits and build-a-meal',
        description:
          'Adjust portions or build a meal when you want more control.',
        bullets: [
          'Search and add ingredients',
          'Save common meals',
          'Keep macros and nutrients aligned',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Manual meal logging on a phone',
        },
      },
      {
        title: 'Nutrition trends',
        description:
          'See how nutrition lines up with energy, mood, and goals.',
        bullets: [
          'Daily and weekly summaries',
          'Macro balance at a glance',
          'Track progress against goals',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Nutrition trends on a phone',
        },
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
    summary: 'Track supplements and medications with safety-focused summaries.',
    heroImage: {
      src: '/screenshots/hero/SUPPLEMENT INTERACTIONS.png',
      alt: 'Supplement safety on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Supplement and medication lists',
        description:
          'Log what you take, when you take it, and why it matters to you.',
        bullets: [
          'Keep dosage and timing organized',
          'Reduce missed or duplicated entries',
          'Maintain a consistent routine',
        ],
        image: {
          src: '/screenshots/hero/SUPPLEMENT INTERACTIONS.png',
          alt: 'Supplement list on a phone',
        },
      },
      {
        title: 'Interaction checks',
        description:
          'Review potential interactions across your stack before making changes.',
        bullets: [
          'Safety flags for known conflicts',
          'Contextual notes you can share',
          'A place to log decisions',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Interaction check summary',
        },
      },
      {
        title: 'Goal-aligned guidance',
        description:
          'Match supplements to your goals and avoid unnecessary overlap.',
        bullets: [
          'Align with your health priorities',
          'Spot gaps in your routine',
          'Track changes over time',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Supplement insights on a phone',
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
    summary: 'Upload lab reports and track biomarkers over time.',
    heroImage: {
      src: '/screenshots/hero/UPLOAD BLOOD RESULTS.png',
      alt: 'Lab report upload on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Upload PDFs or photos',
        description:
          'Add lab reports from your phone or desktop and keep them organized by date.',
        bullets: [
          'Supports common lab formats',
          'Fast upload flow',
          'Keep a searchable history',
        ],
        image: {
          src: '/screenshots/hero/UPLOAD BLOOD RESULTS.png',
          alt: 'Lab report upload screen',
        },
      },
      {
        title: 'Track biomarkers over time',
        description:
          'See how key markers shift across multiple tests.',
        bullets: [
          'Side-by-side comparisons',
          'Trend summaries for key markers',
          'Exportable insights',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Lab result trends on a phone',
        },
      },
      {
        title: 'Secure handling',
        description:
          'Lab data is encrypted and stored with strict access controls.',
        bullets: [
          'Encrypted storage',
          'Access tied to your account',
          'Delete data any time',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Secure lab report history',
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
    subtitle: 'Store images and get structured summaries you can revisit.',
    intro:
      'Upload medical images to keep them organized and pair them with notes for follow-ups.',
    summary: 'Centralize medical images with AI-assisted summaries.',
    heroImage: {
      src: '/screenshots/hero/HEALTH ISSUES.png',
      alt: 'Medical imaging summary on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Upload medical images',
        description:
          'Store images such as X-rays or scans in your Helfi timeline.',
        bullets: [
          'Centralized storage',
          'Organized by date',
          'Attach notes and context',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Medical images list on a phone',
        },
      },
      {
        title: 'AI-assisted summaries',
        description:
          'Get structured summaries to help you remember what was discussed.',
        bullets: [
          'Clear, readable notes',
          'Designed for personal understanding',
          'Not a medical diagnosis',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Medical image summary view',
        },
      },
      {
        title: 'History and comparison',
        description:
          'Keep imaging in one place so it is easier to review over time.',
        bullets: [
          'Review past visits',
          'Prepare questions for follow-ups',
          'Export when needed',
        ],
        image: {
          src: '/screenshots/hero/DASHBOARD.png',
          alt: 'Medical imaging history on a phone',
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
    summary: 'Track symptoms and connect them to nutrition, sleep, and routines.',
    heroImage: {
      src: '/screenshots/hero/SYMPTOM ANALYZER.png',
      alt: 'Symptom tracking on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Structured symptom logs',
        description:
          'Record symptoms, timing, and severity in seconds.',
        bullets: [
          'Daily check-in flow',
          'Add notes when needed',
          'Consistent history over time',
        ],
        image: {
          src: '/screenshots/hero/SYMPTOM ANALYZER.png',
          alt: 'Symptom log entry screen',
        },
      },
      {
        title: 'Pattern discovery',
        description:
          'See how symptoms shift alongside nutrition, sleep, and supplements.',
        bullets: [
          'Correlations across your data',
          'Highlight recurring triggers',
          'Weekly summaries to review',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Symptom trend view on a phone',
        },
      },
      {
        title: 'Shareable history',
        description:
          'Bring a clear record to appointments or reviews.',
        bullets: [
          'Organized timelines',
          'Exportable history',
          'Better conversations',
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
    summary: 'Quick mood check-ins with journaling and trend views.',
    heroImage: {
      src: '/screenshots/hero/TODAYS CHECK IN.png',
      alt: 'Mood tracking on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Quick mood check-ins',
        description:
          'Log mood in seconds with quick taps.',
        bullets: [
          'Low-friction daily tracking',
          'Optional notes',
          'Built for consistency',
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
        bullets: [
          'Short written entries',
          'Capture tags and context',
          'Review by date',
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
        bullets: [
          'Weekly patterns',
          'Personal trends',
          'Aligned with your goals',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Mood insights on a phone',
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
    summary: 'Daily check-ins paired with tips and trend history.',
    heroImage: {
      src: '/screenshots/hero/TODAYS CHECK IN.png',
      alt: 'Daily check-in on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Daily ratings',
        description:
          'Rate how you feel and capture quick notes.',
        bullets: [
          'One tap entries',
          'Optional notes',
          'Consistent time series',
        ],
        image: {
          src: '/screenshots/hero/TODAYS CHECK IN.png',
          alt: 'Daily check-in flow',
        },
      },
      {
        title: 'Check-in history',
        description:
          'Review trends over weeks and months.',
        bullets: [
          'History view',
          'Spot changes fast',
          'Tied into weekly reports',
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
        bullets: [
          'Short, practical ideas',
          'Track what you try',
          'Save favorites',
        ],
        image: {
          src: '/screenshots/hero/HEALTH ISSUES.png',
          alt: 'Health tips on a phone',
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
    summary: 'Hands-free logging and voice-based questions for your health data.',
    heroImage: {
      src: '/screenshots/hero/ASK AI.png',
      alt: 'Voice AI assistant on a phone',
    },
    primaryCta,
    secondaryCta,
    segments: [
      {
        title: 'Voice-first logging',
        description:
          'Capture meals, symptoms, or supplements without typing.',
        bullets: [
          'Hands-free entries',
          'Fast on mobile',
          'Review and adjust after saving',
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
        bullets: [
          'Context-aware responses',
          'Weekly report alignment',
          'Clear summaries',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS.png',
          alt: 'Voice AI responses on a phone',
        },
      },
      {
        title: 'Private and controlled',
        description:
          'You decide what gets saved and what stays as a conversation.',
        bullets: [
          'Review before saving',
          'Delete any time',
          'No shared data',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Voice AI settings on a phone',
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
