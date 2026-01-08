'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

type MegaMenuItem = {
  label: string
  href: string
  description: string
  icon: JSX.Element
}

type MegaMenuSection = {
  title: string
  items: MegaMenuItem[]
}

export default function PublicHeader() {
  const { data: session, status } = useSession()
  const loginHref = '/auth/signin'
  const signupHref = '/auth/signin?mode=signup'
  const iconClassName = 'h-4 w-4 text-helfi-green'

  const megaMenuSections: MegaMenuSection[] = [
    {
      title: 'Track',
      items: [
        {
          label: 'Health Tracking',
          href: '/features/health-tracking',
          description: 'Daily health metrics with wearable syncs.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h3l2.2-4.5L13 16l2.2-4H20" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 20.5C3.6 18.6 2.5 16 2.5 13.1 2.5 8.6 6.1 5 10.6 5h.6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h.6c4.5 0 8.1 3.6 8.1 8.1 0 2.9-1.1 5.5-3 7.4" />
            </svg>
          ),
        },
        {
          label: 'Daily Check-ins',
          href: '/features/daily-check-ins',
          description: 'Daily ratings, reminders, and health tips.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h10M7 12h10M7 17h6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14a2 2 0 0 1 2 2v10a4 4 0 0 1-4 4H7a2 2 0 0 1-2-2V5z" />
            </svg>
          ),
        },
        {
          label: 'Mood Tracking',
          href: '/features/mood-tracking',
          description: 'Mood logs and journaling insights.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 10.5h.01M15.5 10.5h.01" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 15c1.1 1 2.3 1.5 3.5 1.5S14.4 16 15.5 15" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Analyze',
      items: [
        {
          label: 'Food Diary',
          href: '/features/nutrition-food',
          description: 'Photo logging, macros, and trends.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v7M10 3v7M6 7h4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v8a2 2 0 0 0 2 2h1v8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 4h2" />
            </svg>
          ),
        },
        {
          label: 'Lab Reports',
          href: '/features/lab-reports',
          description: 'Upload labs and review results.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 3v5.2L6 16a4 4 0 0 0 3.6 5.7h4.8A4 4 0 0 0 18 16l-4-7.8V3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.8 14h6.4" />
            </svg>
          ),
        },
        {
          label: 'Medical Imaging',
          href: '/features/medical-imaging',
          description: 'Interpretation of medical images.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 18v2M17 18v2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M12 8v4" />
            </svg>
          ),
        },
        {
          label: 'Symptom Tracking',
          href: '/features/symptom-tracking',
          description: 'Log symptoms and spot patterns.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Understand',
      items: [
        {
          label: 'AI Insights',
          href: '/features/ai-insights',
          description: 'Weekly reports and focused insights.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.2 4.5L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.5L12 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 3l1.2 2.4L22 6.5l-2.8 1.1L18 10l-1.2-2.4L14 6.5l2.8-1.1L18 3z" />
            </svg>
          ),
        },
        {
          label: 'Supplement Safety',
          href: '/features/supplement-safety',
          description: 'Interaction checks and stack safety.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3.5" y="8" width="17" height="10" rx="5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 11.5h3" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Assist',
      items: [
        {
          label: 'Voice AI',
          href: '/features/voice-ai',
          description: 'Hands-free, guided conversations.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 21h7" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Programs',
      items: [
        {
          label: 'Affiliate Program',
          href: '/affiliate/apply',
          description: 'Earn by sharing Helfi.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 0 1 0 7L12.5 20.5a5 5 0 0 1-7-7L7 11" />
            </svg>
          ),
        },
        {
          label: 'FAQ',
          href: '/faq',
          description: 'Answers to common questions.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
            </svg>
          ),
        },
        {
          label: 'Help',
          href: '/help',
          description: 'Get support and guidance.',
          icon: (
            <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a7 7 0 0 1 7 7v4a3 3 0 0 1-3 3h-1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20h6" />
            </svg>
          ),
        },
      ],
    },
  ]

  const scrollToSection = (id: string) => {
    if (typeof window === 'undefined') return
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      return
    }
    window.location.href = `/#${id}`
  }

  return (
    <nav className="relative z-50 px-6 py-1">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/'
              }
            }}
            className="w-28 h-28 md:w-40 md:h-40 cursor-pointer hover:opacity-80 transition-opacity"
            aria-label="Go to homepage"
          >
            <Image
              src="/mobile-assets/LOGOS/helfi-01-01.png"
              alt="Helfi Logo"
              width={160}
              height={160}
              className="w-full h-full object-contain"
              priority
            />
          </button>
        </div>

        <div className="hidden md:flex items-center space-x-8">
          <div className="relative group">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
              aria-haspopup="true"
            >
              Features
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M5.5 7.5l4.5 4.5 4.5-4.5" />
              </svg>
            </Link>
            <div className="absolute left-1/2 top-full z-50 mt-0 w-[min(96vw,1120px)] -translate-x-1/2 translate-y-2 opacity-0 pointer-events-none transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto pt-8">
              <div className="rounded-2xl border border-emerald-100 bg-white shadow-xl p-5">
                <div className="grid gap-10 md:grid-cols-3 lg:grid-cols-5">
                  {megaMenuSections.map((section) => (
                    <div key={section.title} className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                        {section.title}
                      </p>
                      <div className="space-y-4">
                        {section.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="group/item flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-emerald-50 transition-colors"
                          >
                            <span className="mt-1">{item.icon}</span>
                            <span>
                              <span className="block text-sm font-semibold text-gray-900 group-hover/item:text-helfi-green">
                                {item.label}
                              </span>
                              <span className="block text-[11px] text-gray-500 leading-snug">
                                {item.description}
                              </span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50/80 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Explore all features</p>
                    <p className="text-xs text-gray-600">See the full platform breakdown in one place.</p>
                  </div>
                  <Link
                    href="/features"
                    className="text-sm font-semibold text-helfi-green hover:text-helfi-green/80"
                  >
                    Visit features →
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => scrollToSection('pricing')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('why-helfi')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            Why Helfi
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('faq')}
            className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
          >
            FAQ
          </button>
          {status === 'authenticated' ? (
            <Link
              href="/dashboard"
              className="btn-primary text-lg px-6 py-3 bg-helfi-green hover:bg-green-600 text-white"
            >
              Go to Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={loginHref}
                className="btn-secondary text-lg px-6 py-3 text-helfi-green hover:bg-helfi-green hover:text-white transition-colors"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                className="btn-primary text-lg px-6 py-3 bg-helfi-green hover:bg-green-600 text-white"
              >
                Create account
              </Link>
            </div>
          )}
        </div>

        <div className="md:hidden flex items-center space-x-3">
          {status === 'authenticated' ? (
            <Link
              href="/dashboard"
              className="btn-primary text-base px-3 py-2 bg-helfi-green hover:bg-green-600 text-white"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href={loginHref}
                className="btn-secondary text-base px-3 py-2 text-helfi-green hover:bg-helfi-green hover:text-white transition-colors"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                className="btn-primary text-base px-3 py-2 bg-helfi-green hover:bg-green-600 text-white"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
