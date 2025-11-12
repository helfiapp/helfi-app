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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const scrollLeft = () => {
    const container = scrollContainerRef.current
    if (!container) return
    
    // Calculate scroll amount - scroll by 1 image width
    const imageWidth = isMobile ? 320 + 24 : 250 + 24 // width + gap
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
    const imageWidth = isMobile ? 320 + 24 : 250 + 24 // width + gap
    const maxScroll = container.scrollWidth - container.clientWidth
    const newScrollLeft = Math.min(maxScroll, container.scrollLeft + imageWidth)
    
    container.scrollTo({ left: newScrollLeft, behavior: 'smooth' })
    scrollPositionRef.current = newScrollLeft
    setIsPaused(true) // Pause auto-scroll when manually scrolling
    
    // Resume auto-scroll after a delay
    setTimeout(() => setIsPaused(false), 3000)
  }

  // Mobile: Smooth scroll animation - hold for 5 seconds, then quickly flash to next
  useEffect(() => {
    if (!isMobile) return

    const container = scrollContainerRef.current
    if (!container) return

    let advanceTimeoutId: NodeJS.Timeout
    let resumeTimeoutId: NodeJS.Timeout
    let currentSlideIndex = 0
    let isUserScrolling = false
    let isAutoScrolling = false // Track when we're auto-scrolling
    let scrollAnimationFrameId: number
    const imageWidth = 320 + 24 // width + gap for mobile

    const advanceSlide = () => {
      // Check if paused or user is scrolling
      if (isPaused || isUserScrolling) {
        advanceTimeoutId = setTimeout(advanceSlide, 100) // Check again in 100ms
        return
      }

      // Move to next slide
      currentSlideIndex = (currentSlideIndex + 1) % screenshots.length
      
      // Mark that we're auto-scrolling
      isAutoScrolling = true
      
      // Calculate target scroll position
      const targetScrollPosition = currentSlideIndex * imageWidth
      const startScrollPosition = container.scrollLeft
      const distance = targetScrollPosition - startScrollPosition
      const startTime = performance.now()
      const scrollDuration = 1000 // Slower scroll: 1 second
      
      setCurrentIndex(currentSlideIndex)
      
      // Custom slow smooth scroll animation
      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / scrollDuration, 1)
        
        // Easing function for smooth deceleration
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        
        const currentScrollPosition = startScrollPosition + (distance * easeOutCubic)
        container.scrollLeft = currentScrollPosition
        scrollPositionRef.current = currentScrollPosition
        
        if (progress < 1) {
          scrollAnimationFrameId = requestAnimationFrame(animateScroll)
        } else {
          // Scroll complete
          isAutoScrolling = false
          // Hold for 5 seconds before next transition
          advanceTimeoutId = setTimeout(advanceSlide, 5000)
        }
      }
      
      // Start the scroll animation
      scrollAnimationFrameId = requestAnimationFrame(animateScroll)
    }

    // Pause auto-advance when user manually scrolls
    const handleScroll = () => {
      // Ignore scrolls during our auto-scroll animation
      if (isAutoScrolling) {
        return
      }

      // This is a user-initiated scroll
      isUserScrolling = true
      setIsPaused(true)
      
      // Clear any pending advance
      if (advanceTimeoutId) {
        clearTimeout(advanceTimeoutId)
      }
      
      // Cancel any ongoing scroll animation
      if (scrollAnimationFrameId) {
        cancelAnimationFrame(scrollAnimationFrameId)
        isAutoScrolling = false
      }
      
      // Clear any existing resume timeout
      if (resumeTimeoutId) {
        clearTimeout(resumeTimeoutId)
      }
      
      // Resume auto-advance after user stops scrolling for 5 seconds
      resumeTimeoutId = setTimeout(() => {
        isUserScrolling = false
        setIsPaused(false)
        // Sync currentSlideIndex with actual scroll position
        const scrollPos = container.scrollLeft
        currentSlideIndex = Math.round(scrollPos / imageWidth) % screenshots.length
        advanceTimeoutId = setTimeout(advanceSlide, 5000)
      }, 5000)
    }

    // Initialize to first slide
    container.scrollLeft = 0
    scrollPositionRef.current = 0
    
    // Add scroll listener
    container.addEventListener('scroll', handleScroll, { passive: true })
    
    // Start the cycle after 5 seconds (hold first slide for 5 seconds)
    advanceTimeoutId = setTimeout(advanceSlide, 5000)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (advanceTimeoutId) {
        clearTimeout(advanceTimeoutId)
      }
      if (resumeTimeoutId) {
        clearTimeout(resumeTimeoutId)
      }
      if (scrollAnimationFrameId) {
        cancelAnimationFrame(scrollAnimationFrameId)
      }
    }
  }, [isMobile, isPaused])

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
      className="relative w-full px-4 md:px-16 lg:px-20"
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
        className="flex gap-6 overflow-x-auto items-center mx-auto scrollbar-hide"
        style={{ 
          scrollBehavior: 'auto',
          width: isMobile ? '100%' : 'calc(5 * (250px + 24px))', // Mobile: full width, Desktop: exactly 5 images
          maxWidth: '100%',
          scrollSnapType: isMobile ? 'x mandatory' : 'none',
        }}
      >
        {/* Duplicate images for seamless loop */}
        {[...screenshots, ...screenshots].map((screenshot, index) => (
          <div
            key={`${screenshot}-${index}`}
            className={`flex-shrink-0 relative ${isMobile ? 'w-[320px]' : 'w-[250px]'} h-auto`}
            style={isMobile ? { scrollSnapAlign: 'center' } : {}}
          >
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-xl">
              <Image
                src={`/screenshots/hero/${screenshot}`}
                alt={`Helfi ${screenshot.replace('.png', '').replace(/_/g, ' ')}`}
                fill
                className="object-contain"
                priority={index < 2}
                loading={index < 3 ? 'eager' : 'lazy'}
                sizes={isMobile ? "320px" : "250px"}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
