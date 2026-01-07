export type FeaturePageCta = {
  label: string
  href: string
}

export type FeaturePageImage = {
  src: string
  alt: string
}

export type FeaturePageCapability = {
  title: string
  description: string
}

export type FeaturePageSegment = {
  title: string
  description: string
  details?: string[]
  bullets: string[]
  image: FeaturePageImage
}

export type FeaturePageContent = {
  slug: string
  title: string
  subtitle: string
  intro: string
  overview: string[]
  summary: string
  heroImage: FeaturePageImage
  primaryCta: FeaturePageCta
  secondaryCta: FeaturePageCta
  capabilities: FeaturePageCapability[]
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

export const featurePages: FeaturePageContent[] = [
  {
    slug: 'health-tracking',
    title: 'Health Tracking and Wearables',
    subtitle: 'Daily health signals and device data, all in one view.',
    intro:
      'Helfi combines daily check-ins, manual logs, and wearable data so you can track progress without juggling tools.',
    overview: [
      'You can capture the basics each day and see them alongside activity, sleep, and wellness metrics pulled from supported devices.',
      'Fitbit and Garmin Connect are supported today, and you can share interest in other integrations as the device roster expands.',
    ],
    summary: 'Daily dashboards and device syncs that keep trends visible.',
    heroImage: {
      src: '/screenshots/hero/DASHBOARD.png',
      alt: 'Helfi dashboard on a phone',
    },
    primaryCta,
    secondaryCta,
    capabilities: [
      {
        title: 'Unified daily dashboard',
        description:
          'A single daily view for activity, sleep, and check-in trends with quick access to your recent entries.',
      },
      {
        title: 'Wearable syncs',
        description:
          'Pull Fitbit and Garmin data into Helfi so your core metrics stay aligned with the rest of your health log.',
      },
      {
        title: 'Trend comparisons',
        description:
          'Weekly and 30-day views help you spot changes as routines shift or new habits begin.',
      },
    ],
    outcomes: [
      'Know what changed over the last 7 and 30 days without manual spreadsheets.',
      'Bring clearer context into weekly reports and provider conversations.',
      'Spot gaps in sleep, activity, or check-ins before they become trends.',
      'Keep device and manual tracking in one place, ready for review.',
    ],
    segments: [
      {
        title: 'Daily health dashboard',
        description:
          'Start each day with a focused snapshot of the metrics that matter most.',
        details: [
          'The dashboard highlights the latest activity and sleep signals alongside your most recent check-in.',
          'This keeps your daily routine visible before you dive into deeper analysis or reports.',
        ],
        bullets: [
          'Daily snapshot for activity and sleep',
          'Weekly rollups at a glance',
          'Quick links to check-ins and trends',
          'Supports manual metrics you care about',
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
          'Daily ratings feed into your weekly reports and show how energy or mood shifts over time.',
          'History views keep it easy to revisit specific days or compare weeks side by side.',
        ],
        bullets: [
          'Fast daily ratings and optional notes',
          'History view for multi-week trends',
          'Works alongside mood tracking',
          'Feeds weekly summaries automatically',
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
          'Fitbit and Garmin Connect data can be pulled into Helfi so your activity and sleep metrics stay aligned.',
          'You can see summaries, charts, and correlations without leaving the platform.',
        ],
        bullets: [
          'Fitbit summaries, charts, and correlations',
          'Garmin wellness data and trend charts',
          'Sync guidance inside the app',
          'Clear device status at a glance',
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
        ],
        bullets: [
          'Track interest in upcoming integrations',
          'Keep your ecosystem organized',
          'Minimize setup when support launches',
          'Centralized device preferences',
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
    outcomes: [
      'Weekly narrative that helps you track progress over time.',
      'Clearer questions for providers, coaches, or your own research.',
      'A repeatable cadence for building healthier routines.',
      'Visible links between your habits and how you feel.',
    ],
    segments: [
      {
        title: 'Weekly report cadence',
        description:
          'Each report is generated from your last 7 days of tracking.',
        details: [
          'Weekly summaries reduce noise and focus on what is consistently showing up in your data.',
          'Reports highlight wins, emerging patterns, and areas that need attention next week.',
        ],
        bullets: [
          '7-day reporting window',
          'Highlights trends in sleep, mood, nutrition, and activity',
          'Clear next-step guidance',
          'Easy to review and revisit',
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
        ],
        bullets: [
          'Issue-focused dashboards',
          'Nutrition, supplement, sleep, and lifestyle segments',
          'Track progress week over week',
          'Organized for quick review',
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
        ],
        bullets: [
          'Interaction summaries in plain language',
          'Centralized supplement and medication lists',
          'Context you can reference later',
          'Built for safe decision making',
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
        ],
        bullets: [
          'Focused weekly priorities',
          'Aligned with your goals and symptoms',
          'Helps reduce trial and error',
          'Keeps improvements measurable',
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
    ],
    summary: 'Photo-assisted meal logging with flexible edits and trends.',
    heroImage: {
      src: '/screenshots/hero/FOOD ANALYSIS.png',
      alt: 'Food analysis on a phone',
    },
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
    ],
    outcomes: [
      'Faster meal logging with edits you control.',
      'Nutrition trends that show up in weekly reports.',
      'Clearer links between what you eat and how you feel.',
      'A consistent food diary that is easy to maintain.',
    ],
    segments: [
      {
        title: 'Photo-assisted meal logging',
        description:
          'Upload a meal photo and start with a structured breakdown.',
        details: [
          'Photo analysis provides a quick starting point for ingredients and portions.',
          'You can review the entry and adjust it before saving the final log.',
        ],
        bullets: [
          'Quick capture from your phone',
          'Review suggested items before saving',
          'Keep a visual food record',
          'Works alongside manual entries',
        ],
        image: {
          src: '/screenshots/hero/FOOD ANALYSIS.png',
          alt: 'Meal photo analysis on a phone',
        },
      },
      {
        title: 'Manual edits and build-a-meal',
        description:
          'Create meals manually when you need more control.',
        details: [
          'Search ingredients, adjust portions, and build meals from scratch.',
          'This keeps entries accurate when a photo alone is not enough.',
        ],
        bullets: [
          'Manual ingredient search',
          'Portion control and adjustments',
          'Save common meals for reuse',
          'Full control over your log',
        ],
        image: {
          src: '/screenshots/hero/MORE MENU.png',
          alt: 'Manual meal logging on a phone',
        },
      },
      {
        title: 'Nutrition diary and trends',
        description:
          'Stay consistent with a nutrition diary that feeds into weekly insights.',
        details: [
          'Daily entries build a stronger weekly report and keep goals visible.',
          'Trend views make it easier to spot changes in macros or calorie balance.',
        ],
        bullets: [
          'Daily and weekly summaries',
          'Macro balance at a glance',
          'Goal alignment built in',
          'Works with check-ins and mood tracking',
        ],
        image: {
          src: '/screenshots/hero/INSIGHTS ENERGY.png',
          alt: 'Nutrition trends on a phone',
        },
      },
      {
        title: 'Food recommendations and context',
        description:
          'Use the recommendation tools to explore options that match your goals.',
        details: [
          'Helfi can explain how different foods align with your targets or recent trends.',
          'This helps you make informed choices without starting from scratch every meal.',
        ],
        bullets: [
          'Goal-aligned suggestions',
          'Explanation views for transparency',
          'Faster meal planning decisions',
          'Helps reduce guesswork',
        ],
        image: {
          src: '/screenshots/hero/ASK AI.png',
          alt: 'Food recommendations overview',
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
    overview: [
      'A clean supplement and medication list makes it easier to stay consistent and avoid overlap.',
      'Helfi surfaces potential conflicts to support safer decisions, not replace medical advice.',
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
    outcomes: [
      'Clearer supplement routines with less duplication.',
      'A documented list you can share during appointments.',
      'Fewer surprises when changing your stack.',
      'Safety reminders that stay visible week to week.',
    ],
    segments: [
      {
        title: 'Supplement and medication lists',
        description:
          'Keep everything you take in one organized list.',
        details: [
          'Log supplements, prescriptions, and timing so your routine stays consistent.',
          'This view becomes the foundation for safety checks and weekly reviews.',
        ],
        bullets: [
          'Centralized list with dosage and timing',
          'Works with photo-assisted logging',
          'Keeps routines consistent',
          'Easy to update over time',
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
        ],
        bullets: [
          'Medication list alongside supplements',
          'Reduce overlap and duplication',
          'Better context for weekly reports',
          'Prepared for appointments',
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
        ],
        bullets: [
          'Plain-language interaction summaries',
          'Support for safer choices',
          'Notes for follow-up questions',
          'Regularly reviewed entries',
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
        ],
        bullets: [
          'Weekly review of your stack',
          'Aligned with health goals',
          'Helps maintain consistency',
          'Supports long-term tracking',
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
    outcomes: [
      'A centralized history of lab results that is easy to review.',
      'Trend views that make it easier to discuss changes with a provider.',
      'Less time hunting through PDF files before appointments.',
      'Clearer summaries for your weekly reports.',
    ],
    segments: [
      {
        title: 'Upload PDFs or photos',
        description:
          'Bring lab results into Helfi without manual transcription.',
        details: [
          'Upload lab reports from your phone or desktop and keep them organized by date.',
          'The intake flow is designed to be quick while keeping sensitive data protected.',
        ],
        bullets: [
          'Supports common lab formats',
          'Fast, guided upload flow',
          'Organized by date and visit',
          'Easy to revisit later',
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
        ],
        bullets: [
          'Side-by-side comparisons',
          'Trend summaries for key markers',
          'Clearer follow-up questions',
          'Improved long-term visibility',
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
        ],
        bullets: [
          'Add notes for each test',
          'Connect to weekly insights',
          'Keep context for appointments',
          'Better longitudinal tracking',
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
        ],
        bullets: [
          'Encrypted storage',
          'Account-based access controls',
          'Export or delete any time',
          'Privacy-focused handling',
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
    outcomes: [
      'A centralized place for medical imaging history.',
      'Structured summaries that make follow-ups easier.',
      'Better preparation for appointments.',
      'Clearer links between imaging and symptoms.',
    ],
    segments: [
      {
        title: 'Upload medical images',
        description:
          'Store images such as X-rays or scans in your Helfi timeline.',
        details: [
          'Uploads are organized by date so you can keep imaging history tidy.',
          'Attach notes to highlight what matters from each appointment.',
        ],
        bullets: [
          'Centralized storage',
          'Organized by date',
          'Attach context and notes',
          'Easy to revisit later',
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
        ],
        bullets: [
          'Structured notes',
          'Clear summaries for recall',
          'Helpful context for follow-ups',
          'Supports informed conversations',
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
        ],
        bullets: [
          'Review past visits',
          'Prepare questions for providers',
          'Organized timeline',
          'Export when needed',
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
        ],
        bullets: [
          'Simple context notes',
          'Consistent documentation',
          'Better appointment prep',
          'Keeps imaging history aligned',
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
    outcomes: [
      'A consistent symptom history that is easy to reference.',
      'Patterns you can bring into weekly reports or appointments.',
      'Better understanding of what influences symptoms.',
      'Clearer documentation for follow-up care.',
    ],
    segments: [
      {
        title: 'Structured symptom logs',
        description:
          'Record symptoms quickly with the context you need later.',
        details: [
          'Capture what you feel, when it started, and how intense it is in a consistent format.',
          'You can add notes or photos when it helps explain the entry.',
        ],
        bullets: [
          'Quick symptom capture',
          'Add notes for context',
          'Consistent history over time',
          'Supports photo attachments',
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
        ],
        bullets: [
          'Severity and duration tracking',
          'Context notes and tags',
          'Better comparisons week to week',
          'Linked to check-ins',
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
        ],
        bullets: [
          'Correlations across your data',
          'Highlight recurring triggers',
          'Weekly summaries to review',
          'Improved decision making',
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
        ],
        bullets: [
          'Organized timelines',
          'Exportable history',
          'Better conversations',
          'Consistent documentation',
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
    outcomes: [
      'A daily mood record that is easy to maintain.',
      'More context for weekly reports and check-ins.',
      'Clearer understanding of what supports better days.',
      'A journal you can review over time.',
    ],
    segments: [
      {
        title: 'Quick mood check-ins',
        description:
          'Log your mood in seconds with a lightweight check-in flow.',
        details: [
          'Short inputs keep the process consistent and reduce tracking fatigue.',
          'Entries feed directly into your weekly insights.',
        ],
        bullets: [
          'Low-friction daily tracking',
          'Optional notes when needed',
          'Built for consistency',
          'Feeds weekly reporting',
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
        ],
        bullets: [
          'Short written entries',
          'Capture tags and context',
          'Review by date',
          'Aligned with check-ins',
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
        ],
        bullets: [
          'Weekly patterns',
          'Personal trends',
          'Aligned with goals',
          'Supports long-term review',
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
        ],
        bullets: [
          'Monthly review options',
          'Consistent time series',
          'Easy to revisit entries',
          'Helps with planning',
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
    outcomes: [
      'Consistent daily signals that improve weekly insights.',
      'Better visibility into how routines impact results.',
      'A simple habit that supports long-term tracking.',
      'Practical tips you can apply immediately.',
    ],
    segments: [
      {
        title: 'Daily ratings',
        description:
          'Rate how you feel and capture quick notes.',
        details: [
          'The daily check-in flow is designed to take less than a minute.',
          'These ratings become the backbone for weekly insight summaries.',
        ],
        bullets: [
          'One-tap entries',
          'Optional notes',
          'Consistent time series',
          'Feeds weekly insights',
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
        ],
        bullets: [
          'History view for quick review',
          'Spot changes over time',
          'Works with weekly reports',
          'Aligned with mood tracking',
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
        ],
        bullets: [
          'Short, practical ideas',
          'Goal-aligned suggestions',
          'Save favorites',
          'Supports ongoing progress',
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
        ],
        bullets: [
          'Flexible reminder settings',
          'Daily habit support',
          'Adjust timing any time',
          'Keeps tracking on schedule',
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
    outcomes: [
      'Less friction when logging daily updates.',
      'Faster questions and answers about your weekly trends.',
      'Better context captured while it is fresh.',
      'Full control over what gets stored.',
    ],
    segments: [
      {
        title: 'Voice-first logging',
        description:
          'Capture meals, symptoms, or supplements without typing.',
        details: [
          'Voice capture keeps tracking consistent when you are busy or away from a keyboard.',
          'You can review and edit entries before they become part of your log.',
        ],
        bullets: [
          'Hands-free entries',
          'Fast on mobile',
          'Review and adjust after saving',
          'Works alongside manual logging',
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
        ],
        bullets: [
          'Context-aware responses',
          'Weekly report alignment',
          'Clear summaries',
          'Designed for fast answers',
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
        ],
        bullets: [
          'Review before saving',
          'Edit any entry later',
          'Delete data any time',
          'Privacy-first controls',
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
        ],
        bullets: [
          'Account-based access',
          'No shared data',
          'Flexible conversation depth',
          'Aligned with your settings',
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
