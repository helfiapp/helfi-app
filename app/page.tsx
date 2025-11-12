'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import HeroCarousel from '@/components/HeroCarousel'
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
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showWaitlistModal, setShowWaitlistModal] = useState(false)
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [videoLoaded, setVideoLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleWaitlistCta = () => {
    setShowInfoModal(true)
  }

  const handleCreditPurchase = () => {
    setShowInfoModal(true)
  }

  const handleInfoModalSubscribe = () => {
    setShowInfoModal(false)
    setShowWaitlistModal(true)
  }

  const handleInfoModalClose = () => {
    setShowInfoModal(false)
  }

  const handleWaitlistModalClose = () => {
    setShowWaitlistModal(false)
  }

  const handleDemoModalClose = () => {
    setShowDemoModal(false)
  }

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false)
    setSuccessMessage('')
  }

  const handleErrorModalClose = () => {
    setShowErrorModal(false)
    setErrorMessage('')
  }

  const handleWaitlistSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const name = String(formData.get('name') || '').trim()

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) {
        setSuccessMessage(data.message || 'Thanks for joining our waitlist! We\'ll be in touch soon.')
        setShowWaitlistModal(false)
        setShowSuccessModal(true)
        ;(e.target as HTMLFormElement).reset()
      } else if (res.status === 409) {
        setSuccessMessage('You\'re already on the waitlist. We\'ll notify you when we go live.')
        setShowWaitlistModal(false)
        setShowSuccessModal(true)
      } else {
        setErrorMessage(data?.error || 'Something went wrong. Please try again.')
        setShowErrorModal(true)
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
      setShowErrorModal(true)
    }
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-helfi-green/5 via-white to-blue-50">
      {/* Medical Disclaimer Banner */}
      <div className="bg-helfi-green p-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center bg-white text-helfi-green px-3 py-1 rounded-full font-semibold text-sm mb-2">
            Medical Disclaimer
          </div>
          <p className="text-sm text-white">
            Helfi is not a medical device and does not provide medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider before making health-related decisions. <Link href="/terms" className="underline text-white hover:text-white/90">View full disclaimer</Link>
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-6 py-2">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <button 
              onClick={() => window.location.reload()}
              className="w-28 h-28 md:w-40 md:h-40 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={160}
                height={160}
                className="w-full h-full object-contain"
                priority
              />
            </button>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <button 
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
            >
              Features
            </button>
            <button 
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
            >
              Pricing
            </button>
            <button 
              onClick={() => document.getElementById('why-helfi')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
            >
              Why Helfi
            </button>
            <button 
              onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-gray-700 hover:text-helfi-green transition-colors font-medium text-lg"
            >
              FAQ
            </button>
            <button 
              onClick={() => setShowWaitlistModal(true)}
              className="btn-secondary hover:bg-gray-100 transition-colors text-lg"
            >
              Join Waitlist
            </button>
          </div>

          {/* Mobile Menu */}
          <div className="md:hidden flex items-center space-x-3">
            <button 
              onClick={() => setShowWaitlistModal(true)}
              className="btn-secondary hover:bg-gray-100 transition-colors text-base px-3 py-2"
            >
              Join Waitlist
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full min-h-screen flex flex-col overflow-visible bg-gray-900" style={{ overflow: 'visible' }}>
        {/* Full-Width Background Video */}
        <div className="absolute inset-0 z-0">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="/screenshots/hero/hero-poster.jpg"
            className="absolute inset-0 w-full h-full object-cover z-0"
            onCanPlay={() => setVideoLoaded(true)}
            onLoadedData={() => setVideoLoaded(true)}
            onError={(e) => {
              console.error('Video error:', e)
              setVideoLoaded(false)
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          >
            <source src="/screenshots/hero/hero-background.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          {/* Dark overlay on video */}
          <div className="absolute inset-0 bg-black/60 z-[1]" />
          {/* Dark background fallback - only shown when video doesn't load */}
          {!videoLoaded && (
            <div className="absolute inset-0 bg-gray-900 z-0" />
          )}
        </div>

        {/* Content Container */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
          {/* Text Content */}
          <div className="text-center mb-6">
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-6 leading-tight">
              Your Personal <span className="text-helfi-green">Health Intelligence Platform</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-10 leading-relaxed max-w-4xl mx-auto">
              Track your health metrics, supplements, and medications. Get AI-powered insights 
              and personalized recommendations to optimize your wellbeing. Analyze food photos, 
              lab reports, and medical images—all in one intelligent platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => setShowWaitlistModal(true)}
                className="btn-primary text-lg px-8 py-4 bg-helfi-green hover:bg-green-600 text-white"
              >
                Join the Waitlist
              </button>
              <button 
                onClick={() => setShowDemoModal(true)}
                className="btn-secondary text-lg px-8 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white hover:bg-white/20"
              >
                Watch Demo
              </button>
            </div>
          </div>
        </div>

        {/* Full-Screen Horizontal Scrolling Carousel */}
        <div className="relative z-10 w-full overflow-visible" style={{ paddingTop: '4rem', paddingBottom: '4rem' }}>
          <HeroCarousel />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-4 sm:px-6 lg:px-10 xl:px-16 py-16 lg:py-20 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-4">
              Everything you need for optimal health
            </h2>
            <p className="text-xl text-gray-600">
              Comprehensive health tracking meets artificial intelligence
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-helfi-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Smart Health Tracking</h3>
              <p className="text-gray-600 leading-relaxed">
                Track weight, sleep, mood, energy levels, and custom health metrics with intelligent pattern recognition. Connect wearables for automatic data sync.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">AI-Powered Insights</h3>
              <p className="text-gray-600 leading-relaxed">
                Get personalized recommendations based on your unique health patterns and goals. Advanced AI analyzes correlations across nutrition, supplements, sleep, and symptoms.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Medication & Supplement Safety</h3>
              <p className="text-gray-600 leading-relaxed">
                Track supplements and medications with photo recognition. Automatic interaction checking alerts you to dangerous combinations and optimal timing recommendations.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Food Photo Analysis</h3>
              <p className="text-gray-600 leading-relaxed">
                Simply snap a photo of your meal. AI identifies ingredients, estimates portions, and calculates complete nutritional breakdown including macros, vitamins, and minerals.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Lab Report Analysis</h3>
              <p className="text-gray-600 leading-relaxed">
                Upload PDF lab reports or photos. AI extracts and tracks biomarkers over time, identifying trends and flagging values that need attention. Encrypted and secure.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-helfi-black mb-4">Symptom Tracking & Analysis</h3>
              <p className="text-gray-600 leading-relaxed">
                Log symptoms with photos and descriptions. AI identifies patterns, correlates with your nutrition and supplement intake, and suggests potential causes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Health Tracking Matters Section */}
      <section id="why-helfi" className="px-6 py-20 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Why Personal Health Intelligence Matters
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              In today's fast-paced world, maintaining optimal health requires more than just good intentions. 
              Our AI-powered health intelligence platform transforms how you understand and optimize your wellbeing.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start mt-16">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="bg-red-100 rounded-full p-3 mt-1 flex-shrink-0">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-helfi-black mb-3">Hidden Health Patterns</h3>
                  <p className="text-gray-600">
                    Many health issues develop silently over time. Without consistent tracking, patterns that could 
                    indicate emerging problems often go unnoticed until they become serious.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-yellow-100 rounded-full p-3 mt-1 flex-shrink-0">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-helfi-black mb-3">Supplement Confusion</h3>
                  <p className="text-gray-600">
                    With thousands of supplements available, knowing what works, what's safe, and what interacts 
                    with your medications is overwhelming without expert guidance.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-orange-100 rounded-full p-3 mt-1 flex-shrink-0">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.996-.833-2.764 0L3.052 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-helfi-black mb-3">Safety &amp; Interaction Alerts</h3>
                  <p className="text-gray-600">
                    Stay safe with automatic detection of dangerous drug interactions, supplement conflicts, and personalized warnings.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="bg-helfi-green/20 rounded-full p-3 mt-1 flex-shrink-0">
                  <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-helfi-black mb-3">Personalized Insights</h3>
                  <p className="text-gray-600">
                    Our AI learns your unique patterns and provides recommendations tailored specifically to your 
                    body, lifestyle, and health goals.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-blue-100 rounded-full p-3 mt-1 flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-helfi-black mb-3">Proactive Prevention</h3>
                  <p className="text-gray-600">
                    Identify potential health issues before they become problems, allowing you to take preventive 
                    action and maintain optimal wellness.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-purple-100 rounded-full p-3 mt-1 flex-shrink-0">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-helfi-black mb-3">Optimization Guidance</h3>
                  <p className="text-gray-600">
                    Get science-backed recommendations for supplements, timing, dosages, and lifestyle changes 
                    to maximize your health outcomes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Health Intelligence Benefits Section */}
      <section className="px-4 sm:px-6 lg:px-10 xl:px-16 py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Transform Your Health with AI Intelligence
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover how artificial intelligence can revolutionize your approach to wellness, nutrition, and longevity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
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
      <section className="px-4 sm:px-6 lg:px-10 xl:px-16 py-16 lg:py-20 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="max-w-6xl mx-auto">
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

            <div className="flex justify-center">
              <div className="w-full max-w-lg h-96 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl shadow-2xl overflow-hidden">
                <img 
                  src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749922074/WOMAN_TALKING_INTO_HER_PHONE_zi9fh8.jpg"
                  alt="Woman speaking into phone using voice AI"
                  className="w-full h-full object-cover object-center"
                  style={{objectPosition: 'center 20%'}}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="px-4 sm:px-6 lg:px-10 xl:px-16 py-16 lg:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Choose the plan that fits your health journey
            </p>
          </div>

          {/* Plans Section */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Plans</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* $20 plan */}
              <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">$20 / month</h3>
                <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 1,000 credits</p>
                <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
                </ul>
                <button onClick={handleWaitlistCta} className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors" type="button">
                  Choose $20 Plan
                </button>
              </div>

              {/* $30 plan */}
              <div className="border-2 border-helfi-green rounded-2xl p-8 relative shadow-sm hover:shadow-lg transition-shadow bg-white">
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-helfi-green text-white px-3 py-1 rounded-full text-sm font-medium">Most Popular</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">$30 / month</h3>
                <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 1,700 credits</p>
                <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
                </ul>
                <button onClick={handleWaitlistCta} className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors" type="button">
                  Choose $30 Plan
                </button>
              </div>

              {/* $50 plan */}
              <div className="border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow bg-white">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">$50 / month</h3>
                <p className="text-3xl font-bold text-gray-900 mb-1">Monthly wallet: 3,000 credits</p>
                <p className="text-xs text-gray-500 mb-4">Credits refresh monthly. No rollover.</p>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> All features unlocked</li>
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Percentage‑based usage meter</li>
                  <li className="flex items-center"><span className="w-4 h-4 text-green-500 mr-2">✓</span> Top‑ups valid 12 months</li>
                </ul>
                <button onClick={handleWaitlistCta} className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors" type="button">
                  Choose $50 Plan
                </button>
              </div>
            </div>
          </div>

          {/* Buy Extra Credits Section */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Buy Extra Credits</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Try with $5 (250 credits)</h3>
                <p className="text-sm text-gray-600 mb-6">One‑time top‑up. Credits valid for 12 months.</p>
                <button onClick={handleCreditPurchase} className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors" type="button">
                  Buy $5 Credits
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">$10 (500 credits)</h3>
                <p className="text-sm text-gray-600 mb-6">One‑time top‑up. Credits valid for 12 months.</p>
                <button onClick={handleCreditPurchase} className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors" type="button">
                  Buy $10 Credits
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">$20 (1,000 credits)</h3>
                <p className="text-sm text-gray-600 mb-6">One‑time top‑up. Credits valid for 12 months.</p>
                <button onClick={handleCreditPurchase} className="w-full bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors" type="button">
                  Buy $20 Credits
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="px-6 py-20 bg-white">
        <div className="max-w-6xl mx-auto">
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
      <section className="px-4 sm:px-6 lg:px-10 xl:px-16 py-16 lg:py-20 bg-gradient-to-br from-helfi-green/5 to-blue-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-helfi-black mb-6">
              Why Health Optimization Matters More Than Ever
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              In 2024, chronic diseases affect 6 in 10 adults in the US. Many of these conditions are preventable 
              through proper nutrition, supplement optimization, and lifestyle tracking.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
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
      <section id="waitlist-signup" className="px-8 md:px-48 lg:px-64 py-20 bg-helfi-green">
        <div className="max-w-4xl mx-auto text-center">
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
              const email = String(formData.get('email') || '').trim().toLowerCase();
              const name = String(formData.get('name') || '').trim();

              fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
              }).then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (res.ok && data?.success) {
                  setSuccessMessage(data.message || 'Thanks for joining our waitlist! We\'ll be in touch soon.');
                  setShowSuccessModal(true);
                  (e.target as HTMLFormElement).reset();
                } else if (res.status === 409) {
                  // Fallback in case older deployments still return 409
                  setSuccessMessage('You\'re already on the waitlist. We\'ll notify you when we go live.');
                  setShowSuccessModal(true);
                } else {
                  setErrorMessage(data?.error || 'Something went wrong. Please try again.');
                  setShowErrorModal(true);
                }
              }).catch(() => {
                setErrorMessage('Something went wrong. Please try again.');
                setShowErrorModal(true);
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
        <div className="max-w-6xl mx-auto">
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
                <li><Link href="/support" className="hover:text-white">Contact</Link></li>
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

      {/* Info Modal */}
      {showInfoModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleInfoModalClose}
        >
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Coming Soon</h3>
            <p className="text-gray-600 mb-6">
              We are currently in the process of building this amazing application. If you would like to be notified the moment we go live, please sign up.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleInfoModalClose}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={handleInfoModalSubscribe}
                className="bg-helfi-green text-white px-6 py-2 rounded-lg hover:bg-helfi-green/90 transition-colors"
              >
                Subscribe Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waitlist Form Modal */}
      {showWaitlistModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleWaitlistModalClose}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold text-gray-900">Join the Waitlist</h3>
              <button
                onClick={handleWaitlistModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Be the first to know when we launch! Join our exclusive waitlist and get early access to Helfi when we're ready.
            </p>
            <form onSubmit={handleWaitlistSubmit} className="space-y-4">
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
                className="w-full bg-helfi-green text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-helfi-green/90 transition-colors"
              >
                Join the Waitlist
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Demo Modal */}
      {showDemoModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleDemoModalClose}
        >
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-helfi-green/20 to-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Coming Soon!</h3>
              </div>
              <button
                onClick={handleDemoModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 text-lg leading-relaxed mb-4">
                We're working on an exciting demo video to show you all the amazing features of Helfi.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Stay tuned for a comprehensive walkthrough of how our AI-powered health intelligence platform can transform your wellness journey!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDemoModalClose}
                className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Got it
              </button>
              <button
                onClick={() => {
                  setShowDemoModal(false)
                  setShowWaitlistModal(true)
                }}
                className="flex-1 bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
              >
                Join Waitlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleSuccessModalClose}
        >
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-helfi-green/20 to-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-helfi-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Success!</h3>
              </div>
              <button
                onClick={handleSuccessModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 text-lg leading-relaxed">
                {successMessage}
              </p>
            </div>
            <button
              onClick={handleSuccessModalClose}
              className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleErrorModalClose}
        >
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Oops!</h3>
              </div>
              <button
                onClick={handleErrorModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 text-lg leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleErrorModalClose}
                className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowErrorModal(false)
                  setShowWaitlistModal(true)
                }}
                className="flex-1 bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
} 