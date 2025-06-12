'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

// Back to Top Button Component
function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  return (
    <button
      onClick={scrollToTop}
      className={`fixed bottom-8 right-8 z-50 bg-helfi-green text-white p-3 rounded-full shadow-lg hover:bg-helfi-green/90 transition-all duration-300 transform ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
      }`}
      aria-label="Back to top"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    </button>
  )
}

export default function SplashPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-helfi-green/5 via-white to-blue-50">
      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-24 h-24 md:w-32 md:h-32">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={128}
                height={128}
                className="w-full h-full object-contain"
                priority
              />
            </div>
          </div>
          <div className="space-x-4">
            <button 
              onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-secondary hover:bg-gray-100 transition-colors"
            >
              Join Waitlist
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 py-20">
        <div className="max-w-7xl mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-helfi-black mb-6 leading-tight">
              <span className="block">Your Personal</span>
              <span className="text-helfi-green block">Health Intelligence</span>
              <span className="block">Platform</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
              Track your health metrics, supplements, and medications. Get AI-powered insights 
              and personalized recommendations to optimize your wellbeing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 sm:space-x-4 sm:gap-0 justify-center">
              <button 
                onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-primary text-lg px-8 py-4"
              >
                Join the Waitlist
              </button>
              <button 
                onClick={() => alert('Coming Soon! 🎬\n\nWe\'re working on an exciting demo video to show you all the amazing features of Helfi. Stay tuned!')}
                className="btn-secondary text-lg px-8 py-4"
              >
                Watch Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-4">
              Everything you need for optimal health
            </h2>
            <p className="text-xl text-gray-600">
              Comprehensive health tracking meets artificial intelligence
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8">
              <div className="w-16 h-16 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Smart Health Tracking</h3>
              <p className="text-gray-600">
                Track weight, sleep, mood, energy levels, and custom health metrics with intelligent pattern recognition.
              </p>
            </div>

            <div className="text-center p-8">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">AI-Powered Insights</h3>
              <p className="text-gray-600">
                Get personalized recommendations based on your unique health patterns and goals using advanced AI analysis.
              </p>
            </div>

            <div className="text-center p-8">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Supplement Management</h3>
              <p className="text-gray-600">
                Track supplements and medications with photo recognition, interaction checking, and optimal timing recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-4 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Choose the plan that fits your health journey
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-gray-200">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-helfi-black mb-2">Basic</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-helfi-black">Free</span>
                </div>
                <ul className="space-y-3 text-left mb-8">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Basic health tracking
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Manual data entry
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Basic progress charts
                  </li>
                </ul>
                                 <button 
                   onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                   className="btn-secondary w-full"
                 >
                   Join Waitlist
                 </button>
              </div>
            </div>

            {/* Premium Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-helfi-green relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-helfi-green text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-helfi-black mb-2">Premium</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-helfi-black">$9.99</span>
                  <span className="text-gray-600">/month</span>
                </div>
                <ul className="space-y-3 text-left mb-8">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Everything in Basic
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    AI-powered insights & recommendations
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Photo supplement recognition
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Weekly AI health reports
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Advanced analytics & trends
                  </li>
                </ul>
                                 <button 
                   onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                   className="btn-primary w-full"
                 >
                   Join Waitlist
                 </button>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-gray-200">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-helfi-black mb-2">Pro</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-helfi-black">$19.99</span>
                  <span className="text-gray-600">/month</span>
                </div>
                <ul className="space-y-3 text-left mb-8">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Everything in Premium
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Healthcare provider integration
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Custom health goal creation
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Priority support
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Data export & API access
                  </li>
                </ul>
                                 <button 
                   onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                   className="btn-secondary w-full"
                 >
                   Join Waitlist
                 </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist Signup Section */}
      <section id="waitlist-signup" className="px-4 py-20 bg-helfi-green">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Be the first to know when we launch!
          </h2>
          <p className="text-xl text-green-100 mb-8">
            Join our exclusive waitlist and get early access to Helfi when we're ready. 
            Plus, get health optimization tips delivered to your inbox.
          </p>
          
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const email = formData.get('email') as string;
              const name = formData.get('name') as string;
              
              // Send to your email collection endpoint
              fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
              }).then(() => {
                alert('Thanks for joining our waitlist! We\'ll be in touch soon.');
                (e.target as HTMLFormElement).reset();
              }).catch(() => {
                alert('Something went wrong. Please try again.');
              });
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Your name"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-helfi-green focus:ring-2 focus:ring-helfi-green/20 outline-none"
                />
                <input
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-helfi-green focus:ring-2 focus:ring-helfi-green/20 outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-helfi-green text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Join the Waitlist
              </button>
            </form>
            
            <div className="mt-6 text-sm text-gray-600">
              <p>✨ Early access when we launch</p>
              <p>📧 Health tips and platform updates</p>
              <p>🎯 No spam, unsubscribe anytime</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-helfi-black text-white px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="text-2xl font-bold mb-4">
                <span className="text-helfi-green">Helfi</span>
              </div>
              <p className="text-gray-400 mb-4">
                Your personal health intelligence platform. Track, analyze, and optimize your wellbeing with AI-powered insights.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
                             <ul className="space-y-2 text-gray-400">
                 <li><a href="#" className="hover:text-white">Features</a></li>
                 <li><a href="#" className="hover:text-white">Pricing</a></li>
                 <li><a href="#" className="hover:text-white">About</a></li>
                 <li><a href="#" className="hover:text-white">Contact</a></li>
               </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Helfi. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Back to Top Button */}
      <BackToTopButton />

    </div>
  )
} 