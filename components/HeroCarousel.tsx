'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  const [isMobile, setIsMobile] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const getScrollAmount = () => {
    const container = scrollContainerRef.current
    if (!container || typeof window === 'undefined') return 0

    const firstSlide = container.querySelector<HTMLElement>('[data-carousel-slide]')
    if (!firstSlide) return 0

    const computedStyles = window.getComputedStyle(container)
    const gapValue =
      parseFloat(computedStyles.columnGap || computedStyles.gap || '0') || 0

    return firstSlide.offsetWidth + gapValue
  }

  const slidesToRender = useMemo(() => {
    if (!hasMounted) {
      return screenshots
    }
    return isMobile ? screenshots : [...screenshots, ...screenshots]
  }, [isMobile, hasMounted])

  const scrollLeft = () => {
    const container = scrollContainerRef.current
    if (!container) return
    
    // Calculate scroll amount - scroll by 1 image width
    const fallbackWidth = isMobile ? 336 : 276
    const imageWidth = getScrollAmount() || fallbackWidth
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
    const fallbackWidth = isMobile ? 336 : 276
    const imageWidth = getScrollAmount() || fallbackWidth
    const maxScroll = container.scrollWidth - container.clientWidth
    const newScrollLeft = Math.min(maxScroll, container.scrollLeft + imageWidth)
    
    container.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    scrollPositionRef.current = newScrollLeft
    setIsPaused(true) // Pause auto-scroll when manually scrolling
    
    // Resume auto-scroll after a delay
    setTimeout(() => setIsPaused(false), 3000)
  }

  // Mobile: manual swipe experience with snap points
  useEffect(() => {
    if (!isMobile) return

    const container = scrollContainerRef.current
    if (!container) return

    container.scrollLeft = 0
    scrollPositionRef.current = 0

    return () => {
      scrollPositionRef.current = 0
    }
  }, [isMobile])

  // Desktop: Continuous smooth scroll
  useEffect(() => {
    if (isMobile) return

    const container = scrollContainerRef.current
    if (!container) return

    let animationFrameId: number
    const scrollSpeed = 0.5

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
  }, [isMobile, isPaused])

  return (
    <div 
      className="relative w-full px-2 sm:px-4 lg:px-8"
      style={{ paddingTop: '2rem', paddingBottom: '2rem' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Left Scroll Button - Hidden on mobile */}
      <button
        onClick={scrollLeft}
        className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 z-50 bg-black/20 hover:bg-black/30 backdrop-blur-sm rounded-full p-2 md:p-3 transition-all duration-200 opacity-60 hover:opacity-100"
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

      {/* Right Scroll Button - Hidden on mobile */}
      <button
        onClick={scrollRight}
        className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 z-50 bg-black/20 hover:bg-black/30 backdrop-blur-sm rounded-full p-2 md:p-3 transition-all duration-200 opacity-60 hover:opacity-100"
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

      {/* Horizontal Scrolling Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto items-center scrollbar-hide"
        style={{ 
          scrollBehavior: 'auto',
          width: '100%',
          maxWidth: '100%',
          paddingLeft: isMobile ? '2.75rem' : '5.5rem',
          paddingRight: isMobile ? '2.75rem' : '5.5rem',
          scrollSnapType: isMobile ? 'x mandatory' : 'none',
        }}
      >
        {/* Render slides (desktop duplicates for seamless loop) */}
        {slidesToRender.map((screenshot, index) => (
          <div
            key={`${screenshot}-${index}`}
            data-carousel-slide
            className={`flex-shrink-0 relative ${isMobile ? 'w-[320px]' : 'w-[260px]'} h-auto`}
            style={{
              scrollSnapAlign: isMobile ? 'center' : 'none'
            }}
          >
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-xl">
              <Image
                src={`/screenshots/hero/${screenshot}`}
                alt={`Helfi ${screenshot.replace('.png', '').replace(/_/g, ' ')}`}
                fill
                className="object-contain"
                priority={index < 2}
                loading={index < 3 ? 'eager' : 'lazy'}
                sizes={isMobile ? '320px' : '260px'}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
