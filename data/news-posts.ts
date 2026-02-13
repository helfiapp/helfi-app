export type NewsPostSection = {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export type NewsPost = {
  slug: string
  title: string
  excerpt: string
  category: string
  publishedAt: string
  readingTime: string
  author: string
  seoTitle: string
  seoDescription: string
  sections: NewsPostSection[]
}

export const newsPosts: NewsPost[] = [
  {
    slug: 'mobile-apps-coming-soon',
    title: 'Helfi iOS and Android Apps Are Coming Soon',
    excerpt:
      'We are building dedicated iPhone and Android apps so daily tracking is faster, simpler, and always with you.',
    category: 'Product Update',
    publishedAt: '2026-02-14',
    readingTime: '5 min read',
    author: 'Helfi Team',
    seoTitle: 'Helfi iOS and Android Apps Coming Soon | Apple Health, Google Health, Sleep Coach',
    seoDescription:
      'Helfi is launching iOS and Android apps with Apple Health support, Google Health data support, and a new sleep coach experience.',
    sections: [
      {
        heading: 'Why we are building mobile apps now',
        paragraphs: [
          'Many people told us the same thing: they love the web app, but they want faster tracking while they are out and about. That is exactly why we are now building full iOS and Android apps.',
          'The goal is simple. Open the app, log in seconds, and move on with your day. We want food logging, hydration tracking, and daily health check-ins to feel lightweight and natural, not like extra work.',
        ],
      },
      {
        heading: 'Apple Health and Google health data support',
        paragraphs: [
          'We are designing the mobile apps to work with Apple Health on iPhone and Google health data through Health Connect on Android. This helps bring your steps, activity, and key trend signals into one clearer view.',
          'Our focus is to make this useful, not noisy. Instead of just showing raw numbers, Helfi will highlight patterns that matter and explain what to do next in plain English.',
        ],
        bullets: [
          'See activity and trend data in one place',
          'Get clearer summaries instead of scattered dashboards',
          'Use one app workflow across iPhone and Android',
        ],
      },
      {
        heading: 'Sleep coach feature in development',
        paragraphs: [
          'We are also building a sleep coach experience so you can monitor sleep trends over time and spot what helps or hurts your recovery.',
          'The sleep coach is being designed to connect sleep signals with your daily habits like food timing, hydration, and evening routines. The aim is practical guidance you can actually use each week.',
        ],
      },
      {
        heading: 'What happens next',
        paragraphs: [
          'Over the next releases, we will share screenshots, rollout timing, and early access updates in this News section. If you are already using Helfi on web, you will be able to move to mobile with a familiar experience.',
          'We are excited about this next step and grateful for every feature request that helped shape it.',
        ],
      },
    ],
  },
  {
    slug: 'complete-food-tracking-workflow',
    title: 'A Better Food Tracking Workflow From Photo to Final Log',
    excerpt:
      'Helfi combines photo logging, barcode scanning, ingredient search, and fast edits so food tracking stays accurate without slowing you down.',
    category: 'Food Tracking',
    publishedAt: '2026-02-13',
    readingTime: '6 min read',
    author: 'Helfi Team',
    seoTitle: 'Food Tracking App Workflow: Photo, Barcode, Ingredient Search, and Meal Builder',
    seoDescription:
      'Learn how Helfi food tracking works with photo logging, barcode scan, ingredient search, meal builder, and reusable meal tools for faster daily logging.',
    sections: [
      {
        heading: 'Food tracking should fit real life',
        paragraphs: [
          'Most people stop tracking because it takes too long. We built Helfi food tracking to match real routines: quick capture first, cleanup second, and smarter reuse over time.',
          'That means you can log in multiple ways depending on what is easiest in the moment. You are never forced into one strict method.',
        ],
      },
      {
        heading: 'Multiple ways to log meals',
        paragraphs: [
          'You can start with a meal photo, scan a barcode, search ingredients, or build a meal manually. Once the entry is created, you can edit quickly before saving the final version.',
        ],
        bullets: [
          'Photo logging for fast capture',
          'Barcode scanning for packaged foods',
          'Ingredient search for full control',
          'Build-a-meal tools for custom entries',
        ],
      },
      {
        heading: 'Built for speed on busy days',
        paragraphs: [
          'Helfi also includes practical time-savers: copy meals, duplicate entries, favorite common meals, and reuse combinations. These small tools reduce daily friction and keep logging consistent.',
          'When logging is easier, people stay with it longer. That leads to better nutrition awareness and clearer trends over time.',
        ],
      },
      {
        heading: 'Why this matters for your goals',
        paragraphs: [
          'Consistency is more important than perfection. A complete food tracking workflow helps you see pattern changes in calories, macros, and meal timing so you can make better decisions week by week.',
          'This is the core reason we keep improving the food diary experience: meaningful data only helps when it is easy to collect.',
        ],
      },
    ],
  },
  {
    slug: 'weekly-health-insights-you-can-use',
    title: 'Weekly Health Insights You Can Actually Use',
    excerpt:
      'Good health insights should be practical. Here is how Helfi turns daily data into weekly actions you can follow without overwhelm.',
    category: 'AI Insights',
    publishedAt: '2026-02-12',
    readingTime: '5 min read',
    author: 'Helfi Team',
    seoTitle: 'Weekly Health Insights App: Turn Daily Health Data Into Practical Actions',
    seoDescription:
      'See how Helfi weekly health insights connect food, activity, and routine data into practical actions you can use each week.',
    sections: [
      {
        heading: 'The real problem with most health data',
        paragraphs: [
          'People collect a lot of health data but still feel unsure what to do. Charts are easy to generate, but useful direction is harder to find.',
          'Helfi weekly insights were designed to close that gap. The report focuses on clear takeaways and realistic next steps, not just more numbers.',
        ],
      },
      {
        heading: 'How weekly summaries help',
        paragraphs: [
          'A weekly view is long enough to show patterns and short enough to act on. Instead of reacting to every small daily change, you get a steadier picture of what is improving and what needs attention.',
        ],
        bullets: [
          'Spot trend direction instead of daily noise',
          'Connect habits to outcomes',
          'Choose one or two actions for the coming week',
        ],
      },
      {
        heading: 'From insight to action',
        paragraphs: [
          'The best insight is the one you can actually use by tomorrow. That is why Helfi recommendations are written in direct, simple language and tied to your current routine.',
          'Over time, this creates a better feedback loop: track, review, adjust, repeat. That is how steady progress usually happens.',
        ],
      },
    ],
  },
  {
    slug: 'meal-water-sleep-consistency',
    title: 'Meals, Water, and Sleep: The Small Habits That Build Better Weeks',
    excerpt:
      'Big health changes usually come from small repeated habits. Here is a simple way to improve consistency with food, hydration, and sleep routines.',
    category: 'Healthy Habits',
    publishedAt: '2026-02-11',
    readingTime: '6 min read',
    author: 'Helfi Team',
    seoTitle: 'Healthy Habit Tracking: Meal Consistency, Hydration, and Sleep Trends',
    seoDescription:
      'Learn how tracking meals, water intake, and sleep trends together can improve daily energy and weekly health consistency.',
    sections: [
      {
        heading: 'Consistency beats intensity',
        paragraphs: [
          'A perfect day once in a while does less than a solid routine most days. That is why we recommend simple habits you can repeat, even on busy schedules.',
          'Meal consistency, hydration, and sleep timing are three of the most useful foundations because they affect energy, focus, and recovery.',
        ],
      },
      {
        heading: 'A simple weekly structure',
        paragraphs: [
          'You do not need an extreme plan. Start with a few baseline targets and track them daily so you can review the week with confidence.',
        ],
        bullets: [
          'Log your main meals each day',
          'Track water and drink choices through the day',
          'Watch sleep trend direction, not one perfect score',
          'Review once weekly and make one adjustment at a time',
        ],
      },
      {
        heading: 'Use trends to stay realistic',
        paragraphs: [
          'Everyone has off days. Trend-based tracking helps you avoid all-or-nothing thinking and focus on what is improving across the month.',
          'When progress feels visible and manageable, people are far more likely to keep going. That is where long-term results come from.',
        ],
      },
    ],
  },
]

export const newsPostBySlug = new Map(newsPosts.map((post) => [post.slug, post]))
