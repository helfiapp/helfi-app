'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function FAQPage() {
  const { data: session } = useSession()
  const [openFaqId, setOpenFaqId] = React.useState<string | null>(null)

  const faqs = [
    {
      category: "Getting Started",
      questions: [
        {
          q: "How do I get started with Helfi?",
          a: "Simply sign up for an account and complete our comprehensive onboarding process. We'll guide you through setting up your health profile, including your physical metrics, health goals, medications, and supplements. This helps our AI provide personalized recommendations from day one."
        },
        {
          q: "What information do I need to provide during onboarding?",
          a: "You'll provide basic information like height, weight, age, activity level, health goals, current medications, supplements, and any dietary preferences or restrictions. All information is kept secure and private."
        },
        {
          q: "How long does it take to see results?",
          a: "You'll start seeing personalized insights immediately after completing your profile. More detailed patterns and recommendations develop as you track your food and health metrics over 1-2 weeks."
        }
      ]
    },
    {
      category: "Food Tracking & AI Analysis",
      questions: [
        {
          q: "How does the AI food analysis work?",
          a: "Simply take a photo of your meal and our AI will analyze the food items, estimate portions, calculate nutritional content, and provide personalized recommendations based on your health goals and dietary needs."
        },
        {
          q: "How accurate is the nutritional analysis?",
          a: "Our AI uses advanced computer vision and a comprehensive nutritional database to provide highly accurate estimates. While not 100% perfect, it's significantly more accurate and convenient than manual logging."
        },
        {
          q: "Can I track meals without photos?",
          a: "Yes! You can manually log meals, search our food database, or use voice notes. However, photo analysis is the most convenient and accurate method."
        },
        {
          q: "What if the AI gets something wrong?",
          a: "You can always edit or correct the AI's analysis. Premium users get reanalysis credits to have meals re-analyzed for better accuracy."
        }
      ]
    },
    {
      category: "Premium Features & Billing",
      questions: [
        {
          q: "What's included in the Premium plan?",
          a: "Premium includes 30 daily AI food analyses, 30 reanalysis credits per day, 30 medical image analyses per day, advanced insights, priority support, and export capabilities. It's $20/month."
        },
        {
          q: "What happens if I exceed my daily limits?",
          a: "You can purchase additional credits: $5 for 100 credits or $10 for 150 credits. Credits don't expire and can be used for any type of analysis."
        },
        {
          q: "Can I cancel my subscription anytime?",
          a: "Yes, you can cancel anytime from your billing settings. You'll continue to have Premium access until the end of your billing period."
        },
        {
          q: "Is there a free trial?",
          a: "No, we no longer offer free trials. However, you can try each AI feature once for free. After that, you'll need a subscription or credits to continue using AI features. Non-AI features remain free for all users."
        }
      ]
    },
    {
      category: "Privacy & Data Security",
      questions: [
        {
          q: "How is my health data protected?",
          a: "We use enterprise-grade encryption, secure cloud storage, and strict access controls. Your data is never sold or shared with third parties. We comply with healthcare privacy standards."
        },
        {
          q: "Can I delete my data?",
          a: "Yes, you can delete your account and all associated data at any time from your account settings. We provide data export options before deletion."
        },
        {
          q: "Where is my data stored?",
          a: "Your data is stored securely in the cloud with automatic backups and redundancy to ensure it's never lost while maintaining the highest security standards."
        }
      ]
    },
    {
      category: "Technical Support",
      questions: [
        {
          q: "What devices does Helfi work on?",
          a: "Helfi works on any device with a web browser - smartphones, tablets, laptops, and desktops. We're optimized for mobile use with responsive design."
        },
        {
          q: "Do I need to download an app?",
          a: "No, Helfi is a web application that works in your browser. You can add it to your home screen for an app-like experience."
        },
        {
          q: "What if I'm having technical issues?",
          a: "Contact our support team through the support form, and we'll help resolve any issues quickly. Premium users get priority support."
        },
        {
          q: "Can I use Helfi offline?",
          a: "Some features work offline, but AI analysis and syncing require an internet connection. We're working on enhanced offline capabilities."
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
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo on the left */}
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="/mobile-assets/LOGOS/helfi-01-01.png"
                alt="Helfi Logo"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
          </div>
          
          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            {session ? (
              <Link 
                href="/dashboard" 
                className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
              >
                Back to Dashboard
              </Link>
            ) : (
              <Link 
                href="/" 
                className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
              >
                Back to Home
              </Link>
            )}
          </div>
        </div>
      </nav>

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
              Browse the most common Helfi questions below. Need account help? <Link href="/support" className="text-helfi-green hover:text-helfi-green/80 font-medium">Contact our support team</Link>
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
    </div>
  )
} 
