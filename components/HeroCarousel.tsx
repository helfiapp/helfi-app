'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

interface HeroCarouselProps {
  videoSrc?: string
  videoPoster?: string
}

// Optimal order for maximum impact - tells a story from onboarding to advanced features
const screenshots = [
  'DASHBOARD.png',                    // 1. Start with main overview
  "LET'S GET STARTED.png",           // 2. Show onboarding experience
  'FOOD ANALYSIS.png',                // 3. Core feature - food tracking
  'INSIGHTS.png',                     // 4. Core feature - AI insights
  'HEALTH ISSUES.png',                // 5. Health tracking
  'TODAYS CHECK IN.png',              // 6. Daily engagement
  'SYMPTOM ANALYZER.png',             // 7. Problem-solving feature
  'SUPPLEMENT INTERACTIONS.png',      // 8. Safety feature
  'INSIGHTS ENERGY.png',              // 9. Specific insight example
  'UPLOAD BLOOD RESULTS.png',         // 10. Advanced feature
  'ASK AI.png',                       // 11. AI chat capability
  'MORE MENU.png',                    // 12. Navigation/completeness
]

export default function HeroCarousel({ videoSrc, videoPoster }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-advance carousel every 4 seconds
  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % screenshots.length)
      }, 4000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPaused])

  // Handle video loading
  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current
      const handleCanPlay = () => setVideoLoaded(true)
      video.addEventListener('canplay', handleCanPlay)
      return () => video.removeEventListener('canplay', handleCanPlay)
    }
  }, [videoSrc])

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
    setIsPaused(true)
    // Resume auto-play after 8 seconds
    setTimeout(() => setIsPaused(false), 8000)
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + screenshots.length) % screenshots.length)
    setIsPaused(true)
    setTimeout(() => setIsPaused(false), 8000)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % screenshots.length)
    setIsPaused(true)
    setTimeout(() => setIsPaused(false), 8000)
  }

  return (
    <div className="relative w-full max-w-4xl mx-auto aspect-[9/16] md:aspect-[9/19] rounded-3xl overflow-hidden shadow-2xl bg-gray-900">
      {/* Video Background */}
      {videoSrc ? (
        <div className="absolute inset-0 z-0">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster={videoPoster}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            style={{ filter: 'brightness(0.7) contrast(1.1)' }}
            onError={() => setVideoLoaded(false)}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
          {/* Fallback gradient overlay if video doesn't load */}
          {!videoLoaded && (
            <div className="absolute inset-0 bg-gradient-to-br from-helfi-green/20 via-blue-500/20 to-purple-500/20" />
          )}
        </div>
      ) : (
        /* Gradient background when no video */
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-helfi-green/10 via-blue-500/10 to-purple-500/10" />
      )}

      {/* Carousel Container */}
      <div className="relative z-10 h-full">
        {/* Screenshot Images */}
        <div className="relative h-full overflow-hidden">
          {screenshots.map((screenshot, index) => (
            <div
              key={screenshot}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              <Image
                src={`/screenshots/hero/${screenshot}`}
                alt={`Helfi ${screenshot.replace('.png', '').replace(/_/g, ' ')}`}
                fill
                className="object-contain"
                priority={index === 0 || index === 1} // Prioritize first two images
                loading={index < 3 ? 'eager' : 'lazy'} // Lazy load images beyond first 3
                sizes="(max-width: 768px) 100vw, 400px"
              />
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all hover:scale-110"
          aria-label="Previous screenshot"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all hover:scale-110"
          aria-label="Next screenshot"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dots Indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {screenshots.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`transition-all rounded-full ${
                index === currentIndex
                  ? 'w-8 h-2 bg-white'
                  : 'w-2 h-2 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Pause/Play Indicator */}
        {isPaused && (
          <div className="absolute top-4 right-4 z-20 bg-black/50 text-white text-xs px-2 py-1 rounded">
            Paused
          </div>
        )}
      </div>
    </div>
  )
}

