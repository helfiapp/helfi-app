'use client'

import React from 'react'
import Link from 'next/link'
import PublicHeader from '@/components/marketing/PublicHeader'
import PublicFooter from '@/components/marketing/PublicFooter'

export default function FAQPage() {
  const [openFaqId, setOpenFaqId] = React.useState<string | null>(null)

  const faqs = [
    {
      category: "Getting Started",
      questions: [
        {
          q: "How do I get started with Helfi?",
          a: "Create an account and complete Health Setup with your health goals and the details you choose to share. You can use ordinary tracking without AI. AI features require your separate data-sharing permission."
        },
        {
          q: "What information do I need to provide during onboarding?",
          a: "You'll provide basic information like height, weight, age, activity level, health goals, current medications, supplements, and any dietary preferences or restrictions. All information is kept secure and private."
        },
        {
          q: "How long does it take to see results?",
          a: "You can start tracking straight away. Reports depend on what you log and your report settings. Weekly reports follow the seven-day schedule shown in Insights."
        }
      ]
    },
    {
      category: "Food Tracking & AI Food Notes",
      questions: [
        {
          q: "How do AI food photo notes work?",
          a: "You can take a photo of your meal and Helfi will help identify likely food items, estimate portions, and create nutrition notes you can review and edit."
        },
        {
          q: "How accurate are the nutrition estimates?",
          a: "Food photo results are estimates. You can always review, edit, or replace them before relying on your diary totals."
        },
        {
          q: "Can I track meals without photos?",
          a: "Yes. You can manually log meals, search the food database, or use voice notes. Photos are optional."
        },
        {
          q: "What if the AI gets something wrong?",
          a: "Review and correct food notes before saving them. Another AI estimate may use credits; check the cost shown in the app."
        }
      ]
    },
    {
      category: "Plans & Billing",
      questions: [
        {
          q: "How do Helfi subscriptions work?",
          a: "Choose a monthly credit plan in Billing, which shows the current price, currency, and credit allowance. Subscription credits refresh monthly and do not roll over."
        },
        {
          q: "What happens if I run out of credits?",
          a: "You can buy the credit packs shown in Billing. Top-up credits are valid for 12 months. Check the credit cost shown for an AI action before using it."
        },
        {
          q: "Can I cancel my subscription anytime?",
          a: "Manage or cancel your subscription through the provider where you bought it: Apple App Store, Google Play, or Helfi web Billing. Cancellation stops future renewals; your current subscription continues until its expiry."
        },
        {
          q: "Can I try AI features for free?",
          a: "Some AI features include a limited free allowance. The allowance varies by feature and is shown in the app. After it is used, AI actions require available credits. Ordinary non-AI tracking remains available without an AI subscription."
        }
      ]
    },
    {
      category: "Privacy & Data Security",
      questions: [
        {
          q: "How is my health data protected?",
          a: "Helfi uses account controls and encryption to protect data. Service providers help store and process it. With your separate AI permission, selected data is sent to OpenAI for AI features. See the Privacy Policy for details."
        },
        {
          q: "Can I delete my data?",
          a: "You can delete your account in Account Settings. The Privacy Policy explains deletion and required audit-log retention. Use the available export option first, or contact support@helfi.ai for help with a data copy."
        },
        {
          q: "Where is my data stored?",
          a: "Helfi stores data with the service providers described in the Privacy Policy. That policy explains how data is used, retained, and deleted."
        }
      ]
    },
    {
      category: "Technical Support",
      questions: [
        {
          q: "What devices does Helfi work on?",
          a: "You can use Helfi in a supported web browser on phones, tablets, and computers. Native phone apps are also supported. Features and app availability depend on your device and the current release."
        },
        {
          q: "Do I need to download an app?",
          a: "You can use Helfi in your browser without downloading an app. You can also add the website to your home screen. Native apps provide phone-specific features where available."
        },
        {
          q: "What if I'm having technical issues?",
          a: "Contact our support team through the support form. Include your device, the page you were using, and what went wrong so the team can investigate."
        },
        {
          q: "Can I use Helfi offline?",
          a: "AI processing and account syncing need an internet connection. If a request fails while you are offline, reconnect and check the app before trying again."
        }
      ]
    }
  ]

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.flatMap((category) =>
      category.questions.map((question) => ({
        '@type': 'Question',
        name: question.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: question.a,
        },
      })),
    ),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />

      {/* Page Title */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">Helfi FAQ and Help Center</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Find clear answers about pricing, food tracking, AI insights, privacy, and support</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">How can we help you today?</h2>
            <p className="text-gray-600">
              Browse the most common Helfi questions below. <Link href="/billing" className="text-helfi-green hover:text-helfi-green/80 font-medium">View current plans and credits</Link>. Need account help? <Link href="/support" className="text-helfi-green hover:text-helfi-green/80 font-medium">Contact our support team</Link>
            </p>
          </div>

          <div className="mb-10 grid gap-4 md:grid-cols-3">
            <Link href="/features/nutrition-food" className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 hover:bg-emerald-50 transition-colors">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-700 font-semibold">Popular feature</p>
              <p className="text-sm font-semibold text-gray-900 mt-2">Food tracking feature guide</p>
            </Link>
            <Link href="/features/ai-insights" className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 hover:bg-emerald-50 transition-colors">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-700 font-semibold">Popular feature</p>
              <p className="text-sm font-semibold text-gray-900 mt-2">AI insights feature guide</p>
            </Link>
            <Link href="/news" className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 hover:bg-emerald-50 transition-colors">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-700 font-semibold">Latest updates</p>
              <p className="text-sm font-semibold text-gray-900 mt-2">Read Helfi News and product updates</p>
            </Link>
          </div>

          <div className="space-y-8">
            {faqs.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <h3 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  {category.category}
                </h3>
                <div className="space-y-4">
                  {category.questions.map((faq, faqIndex) => {
                    const faqId = `${categoryIndex}-${faqIndex}`
                    const isOpen = openFaqId === faqId

                    return (
                      <div
                        key={faqIndex}
                        className="border border-gray-200 rounded-xl bg-white hover:border-helfi-green/50 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFaqId(isOpen ? null : faqId)}
                          className="w-full text-left p-4 md:p-5 flex items-center justify-between gap-4"
                          aria-expanded={isOpen}
                          aria-controls={`faq-answer-${faqId}`}
                        >
                          <h4 className="font-semibold text-gray-900 pr-2">{faq.q}</h4>
                          <span
                            className={`flex-shrink-0 w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 transition-transform ${
                              isOpen ? 'rotate-45 border-helfi-green text-helfi-green' : ''
                            }`}
                          >
                            +
                          </span>
                        </button>

                        {isOpen && (
                          <div id={`faq-answer-${faqId}`} className="px-4 md:px-5 pb-4 md:pb-5">
                            <div className="h-px w-full bg-gray-100 mb-4" />
                            <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Contact Support CTA */}
          <div className="mt-12 text-center bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Still have questions?</h3>
            <p className="text-gray-600 mb-4">Our support team is here to help you succeed with your health journey.</p>
            <Link 
              href="/support" 
              className="inline-block bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema),
        }}
      />
      <PublicFooter />
    </div>
  )
} 
