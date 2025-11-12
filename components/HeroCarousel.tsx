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
      className="relative w-full overflow-visible py-16"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Horizontal Scrolling Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 md:gap-6 overflow-x-hidden overflow-y-visible items-center snap-x snap-mandatory md:snap-none"
        style={{ scrollBehavior: 'auto' }}
      >
        {/* Duplicate images for seamless loop */}
        {[...screenshots, ...screenshots].map((screenshot, index) => (
          <div
            key={`${screenshot}-${index}`}
            className="flex-shrink-0 w-[280px] md:w-[220px] lg:w-[250px] h-auto transition-transform duration-300 ease-out hover:scale-125 hover:z-50 relative mx-auto md:mx-0"
          >
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-xl">
              <Image
                src={`/screenshots/hero/${screenshot}`}
                alt={`Helfi ${screenshot.replace('.png', '').replace(/_/g, ' ')}`}
                fill
                className="object-contain"
                priority={index < 2} // Prioritize first two images
                loading={index < 3 ? 'eager' : 'lazy'}
                sizes="(max-width: 768px) 280px, (max-width: 1024px) 220px, 250px"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
