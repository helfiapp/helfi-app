'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

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

export default function HeroCarousel() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isPaused, setIsPaused] = useState(false)
  const scrollPositionRef = useRef(0)

  const scrollLeft = () => {
    const container = scrollContainerRef.current
    if (!container) return
    
    // Calculate scroll amount - scroll by 1 image width
    const imageWidth = 250 + 24 // width + gap
    const newScrollLeft = Math.max(0, container.scrollLeft - imageWidth)
    
    container.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    scrollPositionRef.current = newScrollLeft
    setIsPaused(true) // Pause auto-scroll when manually scrolling
    
    // Resume auto-scroll after a delay
    setTimeout(() => setIsPaused(false), 3000)
  }

  const scrollRight = () => {
    const container = scrollContainerRef.current
    if (!container) return
    
    // Calculate scroll amount - scroll by 1 image width
    const imageWidth = 250 + 24 // width + gap
    const maxScroll = container.scrollWidth - container.clientWidth
    const newScrollLeft = Math.min(maxScroll, container.scrollLeft + imageWidth)
    
    container.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    scrollPositionRef.current = newScrollLeft
    setIsPaused(true) // Pause auto-scroll when manually scrolling
    
    // Resume auto-scroll after a delay
    setTimeout(() => setIsPaused(false), 3000)
  }

  // Auto-scroll from right to left
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Check if mobile - show one image at a time on mobile
    const isMobile = window.innerWidth < 768

    let animationFrameId: number
    const scrollSpeed = isMobile ? 0.3 : 0.5 // Slower on mobile

    const scroll = () => {
      if (!isPaused) {
        scrollPositionRef.current += scrollSpeed
        const maxScroll = container.scrollWidth - container.clientWidth
        
        if (scrollPositionRef.current >= maxScroll) {
          scrollPositionRef.current = 0 // Reset to start for seamless loop
        }
        
        container.scrollLeft = scrollPositionRef.current
      }
      animationFrameId = requestAnimationFrame(scroll)
    }

    animationFrameId = requestAnimationFrame(scroll)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isPaused])

  return (
    <div 
      className="relative w-full px-16 md:px-20"
      style={{ paddingTop: '2rem', paddingBottom: '2rem' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Left Scroll Button */}
      <button
        onClick={scrollLeft}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-50 bg-black/20 hover:bg-black/30 backdrop-blur-sm rounded-full p-2 md:p-3 transition-all duration-200 opacity-60 hover:opacity-100"
        aria-label="Scroll left"
      >
        <svg 
          className="w-5 h-5 md:w-6 md:h-6 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      {/* Right Scroll Button */}
      <button
        onClick={scrollRight}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-50 bg-black/20 hover:bg-black/30 backdrop-blur-sm rounded-full p-2 md:p-3 transition-all duration-200 opacity-60 hover:opacity-100"
        aria-label="Scroll right"
      >
        <svg 
          className="w-5 h-5 md:w-6 md:h-6 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {/* Horizontal Scrolling Container - sized to show exactly 5 images */}
      <div
        ref={scrollContainerRef}
        className="flex gap-6 overflow-x-hidden items-center mx-auto"
        style={{ 
          scrollBehavior: 'auto',
          width: 'calc(5 * (250px + 24px))', // Exactly 5 images: 5 * (width + gap)
          maxWidth: '100%'
        }}
      >
        {/* Duplicate images for seamless loop */}
        {[...screenshots, ...screenshots].map((screenshot, index) => (
          <div
            key={`${screenshot}-${index}`}
            className="flex-shrink-0 w-[250px] h-auto relative"
          >
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-xl">
              <Image
                src={`/screenshots/hero/${screenshot}`}
                alt={`Helfi ${screenshot.replace('.png', '').replace(/_/g, ' ')}`}
                fill
                className="object-contain"
                priority={index < 2}
                loading={index < 3 ? 'eager' : 'lazy'}
                sizes="250px"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
