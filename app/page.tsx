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
      {/* Medical Disclaimer Banner */}
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Medical Disclaimer:</strong> Helfi is not a medical device and does not provide medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider before making health-related decisions. <Link href="/terms" className="underline hover:text-blue-900">View full disclaimer</Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <button 
              onClick={() => window.location.reload()}
              className="w-24 h-24 md:w-32 md:h-32 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={128}
                height={128}
                className="w-full h-full object-contain"
                priority
              />
            </button>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <button 
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium"
            >
              Features
            </button>
            <button 
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium"
            >
              Pricing
            </button>
            <button 
              onClick={() => document.getElementById('why-helfi')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium"
            >
              Why Helfi
            </button>
            <button 
              onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium"
            >
              FAQ
            </button>
            <button 
              onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-secondary hover:bg-gray-100 transition-colors"
            >
              Join Waitlist
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button 
              onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-secondary hover:bg-gray-100 transition-colors text-sm px-4 py-2"
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
      <section id="features" className="px-4 py-20 bg-white">
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

      {/* Why Health Tracking Matters Section */}
      <section id="why-helfi" className="px-4 py-20 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Why Personal Health Intelligence Matters
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              In today's fast-paced world, maintaining optimal health requires more than just good intentions. 
              Our AI-powered health intelligence platform transforms how you understand and optimize your wellbeing.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl font-bold text-helfi-black mb-6">The Modern Health Challenge</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="bg-red-100 rounded-full p-2 mt-1">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Overwhelming Information</h4>
                    <p className="text-gray-600">Millions of health articles, supplements, and conflicting advice make it impossible to know what's right for your unique body.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="bg-orange-100 rounded-full p-2 mt-1">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Supplement Interactions</h4>
                    <p className="text-gray-600">Dangerous drug interactions happen daily because people don't track their supplements, medications, and nutrients properly.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="bg-yellow-100 rounded-full p-2 mt-1">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.996-.833-2.764 0L3.052 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Missed Health Patterns</h4>
                    <p className="text-gray-600">Without proper tracking, you miss crucial patterns between your diet, supplements, sleep, and how you feel.</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-3xl font-bold text-helfi-black mb-6">The Helfi Solution</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="bg-helfi-green/20 rounded-full p-2 mt-1">
                    <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">AI-Powered Personalization</h4>
                    <p className="text-gray-600">Our advanced AI analyzes your unique health profile to provide personalized recommendations that actually work for your body.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="bg-blue-100 rounded-full p-2 mt-1">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Safety First Approach</h4>
                    <p className="text-gray-600">Automatically detect dangerous supplement-medication interactions and get instant alerts to keep you safe.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="bg-purple-100 rounded-full p-2 mt-1">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Effortless Tracking</h4>
                    <p className="text-gray-600">Simply take photos of your food or say "Hey Helfi, I just took my vitamins" - our AI handles the rest automatically.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Health Intelligence Benefits Section */}
      <section className="px-4 py-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Transform Your Health with AI Intelligence
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover how artificial intelligence can revolutionize your approach to wellness, nutrition, and longevity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6 bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl">
              <div className="w-16 h-16 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-helfi-black mb-3">Smart Supplement Optimization</h3>
              <p className="text-gray-600 text-sm">
                Optimize your supplement timing, dosages, and combinations based on your unique metabolism and health goals.
              </p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-helfi-black mb-3">Instant Health Insights</h3>
              <p className="text-gray-600 text-sm">
                Get real-time analysis of how your lifestyle choices affect your energy, mood, sleep quality, and overall wellbeing.
              </p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-helfi-black mb-3">Predictive Health Analytics</h3>
              <p className="text-gray-600 text-sm">
                Identify health trends before they become problems with advanced pattern recognition and predictive modeling.
              </p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.996-.833-2.764 0L3.052 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-helfi-black mb-3">Safety & Interaction Alerts</h3>
              <p className="text-gray-600 text-sm">
                Stay safe with automatic detection of dangerous drug interactions, supplement conflicts, and personalized warnings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Voice AI Section */}
      <section className="px-4 py-20 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-helfi-black mb-6">
                Meet Your AI Health Assistant
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Experience the future of health tracking with our revolutionary voice AI technology. 
                Simply speak naturally and let Helfi handle the complex analysis.
              </p>
              
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-100">
                  <div className="flex items-start space-x-4">
                    <div className="bg-purple-100 rounded-full p-2 mt-1">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Natural Voice Commands</h4>
                      <p className="text-gray-600 text-sm">"Hey Helfi, I just went for a 5km run and feeling great!"</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                  <div className="flex items-start space-x-4">
                    <div className="bg-blue-100 rounded-full p-2 mt-1">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Instant Analysis</h4>
                      <p className="text-gray-600 text-sm">"I'm feeling tired after lunch, what might be causing this?"</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-xl shadow-sm border border-green-100">
                  <div className="flex items-start space-x-4">
                    <div className="bg-helfi-green/20 rounded-full p-2 mt-1">
                      <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Smart Recommendations</h4>
                      <p className="text-gray-600 text-sm">"Based on your pattern, try taking magnesium 2 hours before your usual sleep time."</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="bg-gradient-to-br from-purple-100 to-blue-100 rounded-3xl p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-blue-400/20"></div>
                <div className="relative z-10">
                  <div className="mb-6 flex justify-center">
                    <img 
                      src="https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                      alt="Woman talking on phone with voice AI"
                      className="w-24 h-24 rounded-full object-cover shadow-lg"
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Talk to Helfi</h3>
                  <p className="text-gray-700 mb-6">
                    The most natural way to track your health. Just speak, and let AI do the work.
                  </p>
                  <button
                    onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all duration-200"
                  >
                    Try Voice AI Free
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="px-4 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Choose the plan that fits your health journey
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-gray-200">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-helfi-black mb-2">Health Basics</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-helfi-black">Free</span>
                  <div className="text-sm text-gray-500 mt-1">Forever</div>
                </div>
                <ul className="space-y-3 text-left mb-8">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Complete onboarding & profile setup
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Initial supplement interaction check
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    3 AI food photo analyses per day
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Basic health goal tracking
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Weekly health summary emails
                  </li>
                </ul>
                <button 
                  onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-secondary w-full"
                >
                  Get Started Free
                </button>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-helfi-green relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-helfi-green text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-helfi-black mb-2">AI Health Coach</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-helfi-black">$12</span>
                  <span className="text-gray-600">/month</span>
                  <div className="text-sm text-gray-500 mt-1">$99/year (save 31%)</div>
                </div>
                <ul className="space-y-3 text-left mb-8">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Everything in Health Basics
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited supplement interaction updates
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    20 AI food photo analyses per day
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Personalized health insights
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-helfi-green mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Smart symptom tracking & correlation
                  </li>
                </ul>
                <button 
                  onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                  className="btn-primary w-full"
                >
                  Start 14-Day Free Trial
                </button>
              </div>
            </div>

            {/* Ultimate Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-purple-200 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Premium AI
                </span>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-helfi-black mb-2">Personal Health Assistant</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-helfi-black">$20</span>
                  <span className="text-gray-600">/month</span>
                  <div className="text-sm text-gray-500 mt-1">$179/year (save 25%)</div>
                </div>
                <ul className="space-y-3 text-left mb-8">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Everything in AI Health Coach
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <strong>"Talk to Helfi" voice AI assistant</strong>
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited AI food photo analyses
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    All device integrations (Fitbit, Apple, etc.)
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Real-time health monitoring & alerts
                  </li>
                </ul>
                <button 
                  onClick={() => document.getElementById('waitlist-signup')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all duration-200 w-full"
                >
                  Start 14-Day Free Trial
                </button>
              </div>
            </div>
          </div>

          {/* Enhanced Trial Benefits Section */}
          <div className="text-center mt-16">
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-2xl p-8 max-w-5xl mx-auto shadow-lg">
              <div className="mb-6">
                <div className="inline-flex items-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md">
                  🎯 14-Day Free Trial includes everything!
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100 hover:shadow-md transition-shadow">
                  <div className="text-3xl mb-3">🎤</div>
                  <h5 className="font-semibold text-gray-900 mb-2">Voice AI Commands</h5>
                  <p className="text-sm text-gray-600">Say "Hey Helfi, I just ate lunch" and watch the magic happen</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100 hover:shadow-md transition-shadow">
                  <div className="text-3xl mb-3">📱</div>
                  <h5 className="font-semibold text-gray-900 mb-2">Device Integration</h5>
                  <p className="text-sm text-gray-600">Connect Fitbit, Apple Watch, Oura Ring and more instantly</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100 hover:shadow-md transition-shadow">
                  <div className="text-3xl mb-3">🧠</div>
                  <h5 className="font-semibold text-gray-900 mb-2">Unlimited AI Insights</h5>
                  <p className="text-sm text-gray-600">Get personalized health recommendations 24/7</p>
                </div>
              </div>
              
              <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-blue-700 font-medium">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  No credit card required
                </div>
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cancel anytime
                </div>
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Keep your data forever
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="px-4 py-20 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about Helfi's AI-powered health intelligence platform
            </p>
          </div>

          <div className="space-y-8">
            <div className="bg-gray-50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-helfi-black mb-4">
                How does Helfi's AI analyze my health data?
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Our advanced AI engine uses machine learning algorithms to analyze patterns in your nutrition, supplement intake, 
                sleep, exercise, and mood data. It identifies correlations that humans might miss, providing personalized insights 
                about what works best for your unique body and lifestyle. The more data you provide, the more accurate and 
                personalized your recommendations become.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-helfi-black mb-4">
                Is my health data secure and private?
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Absolutely. Your health data is encrypted using bank-level security (AES-256 encryption) and stored in 
                HIPAA-compliant servers. We never sell your personal information to third parties, and you maintain complete 
                control over your data. You can export or delete your information at any time. Our AI processing happens 
                securely on our servers, ensuring your sensitive health information never leaves our protected environment.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-helfi-black mb-4">
                Can Helfi detect dangerous supplement and medication interactions?
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Yes! One of Helfi's most important features is our comprehensive interaction checker. Our database contains 
                thousands of known interactions between supplements, medications, and nutrients. When you log new supplements 
                or medications, Helfi automatically checks for potential conflicts and alerts you immediately. This includes 
                interactions that affect absorption, effectiveness, or could cause adverse effects.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-helfi-black mb-4">
                How accurate is the food photo recognition?
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Our AI food recognition system has been trained on millions of food images and achieves over 85% accuracy for 
                common foods. It can identify ingredients, estimate portion sizes, and calculate nutritional content including 
                calories, macronutrients, vitamins, and minerals. For best results, take photos in good lighting and include 
                reference objects for size. You can always edit the AI's suggestions to ensure accuracy.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-helfi-black mb-4">
                What devices can I connect to Helfi?
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Helfi integrates with popular fitness and health devices including Fitbit, Apple Watch, Oura Ring, Garmin watches, 
                Google Fit, Samsung Health, Withings smart scales, and Polar heart rate monitors. These integrations provide 
                automatic tracking of steps, heart rate, sleep patterns, weight, and exercise data, giving our AI more comprehensive 
                information to provide better health insights and recommendations.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-helfi-black mb-4">
                How does the voice AI feature work?
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Our voice AI assistant allows you to interact with Helfi using natural speech. Simply say commands like 
                "Hey Helfi, I just took my morning vitamins" or "I'm feeling tired, what might be causing this?" The AI 
                processes your speech, logs relevant information automatically, and provides instant analysis and recommendations. 
                It's designed to understand context and natural language, making health tracking as simple as having a conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits for Health Optimization Section */}
      <section className="px-4 py-20 bg-gradient-to-br from-helfi-green/5 to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Why Health Optimization Matters More Than Ever
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              In 2024, chronic diseases affect 6 in 10 adults in the US. Many of these conditions are preventable 
              through proper nutrition, supplement optimization, and lifestyle tracking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-xl font-bold text-helfi-black mb-4">Prevent Chronic Disease</h3>
              <p className="text-gray-600">
                Studies show that proper nutrition tracking and supplement optimization can reduce the risk of heart disease, 
                diabetes, and other chronic conditions by up to 40%. Early intervention through data-driven insights is key.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">💊</div>
              <h3 className="text-xl font-bold text-helfi-black mb-4">Optimize Supplement Efficacy</h3>
              <p className="text-gray-600">
                Most people take supplements incorrectly, reducing their effectiveness by 50-70%. Proper timing, dosages, 
                and interaction awareness can dramatically improve health outcomes and save money on ineffective supplementation.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">🧠</div>
              <h3 className="text-xl font-bold text-helfi-black mb-4">Enhance Mental Performance</h3>
              <p className="text-gray-600">
                Tracking correlations between nutrition, supplements, and cognitive performance helps identify what boosts 
                your mental clarity, focus, and mood. Personalized insights lead to sustained cognitive enhancement.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-bold text-helfi-black mb-4">Increase Energy Levels</h3>
              <p className="text-gray-600">
                By analyzing patterns in your sleep, nutrition, and supplement intake, Helfi identifies what factors 
                contribute to energy crashes and sustained vitality, helping you maintain consistent energy throughout the day.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">🏃</div>
              <h3 className="text-xl font-bold text-helfi-black mb-4">Improve Athletic Performance</h3>
              <p className="text-gray-600">
                Athletes who track nutrition and supplementation with AI guidance show 20-30% improvements in recovery time 
                and performance metrics compared to those using generic approaches.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-bold text-helfi-black mb-4">Save Money on Healthcare</h3>
              <p className="text-gray-600">
                Preventive health optimization through proper tracking and AI insights can reduce healthcare costs by 
                thousands of dollars annually by preventing costly chronic diseases and optimizing supplement spending.
              </p>
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
                <li>
                  <button 
                    onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                    className="hover:text-white text-left"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                    className="hover:text-white text-left"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => document.getElementById('why-helfi')?.scrollIntoView({ behavior: 'smooth' })}
                    className="hover:text-white text-left"
                  >
                    Why Helfi
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
                    className="hover:text-white text-left"
                  >
                    FAQ
                  </button>
                </li>
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