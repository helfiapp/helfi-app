'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { FeaturePageImage } from '@/data/feature-pages'

type MockupCarouselProps = {
  images: FeaturePageImage[]
  ariaLabel?: string
}

export default function MockupCarousel({ images, ariaLabel = 'Food diary mockups' }: MockupCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [manualPause, setManualPause] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const getScrollAmount = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return 0
    const firstSlide = container.querySelector<HTMLElement>('[data-carousel-item]')
    if (!firstSlide) return 0
    const styles = window.getComputedStyle(container)
    const gapValue = parseFloat(styles.columnGap || styles.gap || '0') || 0
    return firstSlide.offsetWidth + gapValue
  }, [])

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = scrollContainerRef.current
      if (!container) return
      const slideWidth = getScrollAmount() || container.clientWidth
      container.scrollTo({ left: slideWidth * index, behavior: 'smooth' })
    },
    [getScrollAmount]
  )

  const scrollByAmount = useCallback(
    (direction: number) => {
      const container = scrollContainerRef.current
      if (!container) return
      const slideWidth = getScrollAmount() || container.clientWidth
      container.scrollTo({ left: container.scrollLeft + slideWidth * direction, behavior: 'smooth' })
    },
    [getScrollAmount]
  )

  const advance = useCallback(
    (direction: number) => {
      if (isMobile) {
        const container = scrollContainerRef.current
        if (!container) return
        const slideWidth = getScrollAmount() || container.clientWidth
        const currentIndex = Math.round(container.scrollLeft / slideWidth)
        const nextIndex = (currentIndex + direction + images.length) % images.length
        scrollToIndex(nextIndex)
      } else {
        scrollByAmount(direction)
      }
    },
    [getScrollAmount, images.length, isMobile, scrollByAmount, scrollToIndex]
  )

  const pauseAutoScroll = useCallback(() => {
    setManualPause(true)
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current)
    }
    resumeTimeoutRef.current = setTimeout(() => {
      setManualPause(false)
    }, 3500)
  }, [])

  useEffect(() => {
    if (images.length <= 1) return
    if (isMobile) {
      if (isHovering || manualPause) return
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current)
      }
      autoScrollRef.current = setInterval(() => {
        advance(1)
      }, 5000)
      return () => {
        if (autoScrollRef.current) {
          clearInterval(autoScrollRef.current)
          autoScrollRef.current = null
        }
      }
    }

    if (isHovering || manualPause) return
    const container = scrollContainerRef.current
    if (!container) return

    const speed = 0.35
    const animate = () => {
      if (!scrollContainerRef.current) return
      const maxScroll = scrollContainerRef.current.scrollWidth / 2
      if (scrollContainerRef.current.scrollLeft >= maxScroll) {
        scrollContainerRef.current.scrollLeft = 0
      }
      scrollContainerRef.current.scrollLeft += speed
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [advance, images.length, isMobile, isHovering, manualPause])

  useEffect(() => {
    if (!isMobile) return
    const container = scrollContainerRef.current
    if (!container) return

    const handleResize = () => {
      const slideWidth = getScrollAmount() || container.clientWidth
      const currentIndex = Math.round(container.scrollLeft / slideWidth)
      scrollToIndex(currentIndex)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [getScrollAmount, isMobile, scrollToIndex])

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current)
      }
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (expandedIndex === null) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedIndex(null)
      }
      if (event.key === 'ArrowRight') {
        setExpandedIndex((prev) => (prev === null ? prev : (prev + 1) % images.length))
      }
      if (event.key === 'ArrowLeft') {
        setExpandedIndex((prev) => (prev === null ? prev : (prev - 1 + images.length) % images.length))
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [expandedIndex, images.length])

  const handleArrowClick = (direction: number) => {
    pauseAutoScroll()
    advance(direction)
  }

  const handleImageClick = (index: number) => {
    if (isMobile) return
    setExpandedIndex(index)
  }

  if (images.length === 0) {
    return null
  }

  return (
    <div
      className="relative px-12 md:px-16"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      aria-label={ariaLabel}
    >
      <div className="overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex gap-6 overflow-hidden"
          role="region"
          aria-roledescription="carousel"
        >
          {[...images, ...images].map((image, index) => (
            <button
              key={`${image.src}-${index}`}
              type="button"
              data-carousel-item
              onClick={() => handleImageClick(index % images.length)}
              className="rounded-2xl bg-black/20 shadow-lg backdrop-blur-sm border border-white/30 overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/70 transition-transform hover:-translate-y-1"
              style={{
                flex: isMobile ? '0 0 100%' : '0 0 calc((100% - 6rem) / 5)',
              }}
            >
              <Image
                src={image.src}
                alt={image.alt}
                width={image.width ?? 1419}
                height={image.height ?? 2796}
                sizes={isMobile ? '90vw' : '(min-width: 1024px) 18vw, 40vw'}
                className="w-full h-auto max-h-[420px] object-contain"
                priority={false}
              />
            </button>
          ))}
        </div>
      </div>

      {!isMobile && (
        <>
          <button
            type="button"
            onClick={() => handleArrowClick(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 h-11 w-11 rounded-full bg-white/90 shadow-md border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 transition-colors z-10"
            aria-label="Previous mockup"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-700" fill="currentColor" aria-hidden="true">
              <path d="M12.5 5l-5 5 5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleArrowClick(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 h-11 w-11 rounded-full bg-white/90 shadow-md border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 transition-colors z-10"
            aria-label="Next mockup"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-700" fill="currentColor" aria-hidden="true">
              <path d="M7.5 5l5 5-5 5" />
            </svg>
          </button>
        </>
      )}

      {isMobile && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => handleArrowClick(-1)}
            className="h-10 w-10 rounded-full bg-white shadow-md border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 transition-colors"
            aria-label="Previous mockup"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-700" fill="currentColor" aria-hidden="true">
              <path d="M12.5 5l-5 5 5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleArrowClick(1)}
            className="h-10 w-10 rounded-full bg-white shadow-md border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 transition-colors"
            aria-label="Next mockup"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-700" fill="currentColor" aria-hidden="true">
              <path d="M7.5 5l5 5-5 5" />
            </svg>
          </button>
        </div>
      )}

      {expandedIndex !== null && !isMobile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={() => setExpandedIndex(null)}
            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/90 text-gray-700 hover:bg-white"
            aria-label="Close image preview"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 mx-auto" fill="currentColor" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setExpandedIndex((prev) => (prev === null ? prev : (prev - 1 + images.length) % images.length))}
            className="absolute left-8 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/90 text-gray-700 hover:bg-white"
            aria-label="Previous image"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 mx-auto" fill="currentColor" aria-hidden="true">
              <path d="M12.5 5l-5 5 5 5" />
            </svg>
          </button>
          <div className="max-w-6xl w-full px-6">
            <Image
              src={images[expandedIndex].src}
              alt={images[expandedIndex].alt}
              width={images[expandedIndex].width ?? 1419}
              height={images[expandedIndex].height ?? 2796}
              sizes="90vw"
              className="w-full h-auto max-h-[85vh] object-contain rounded-2xl"
              priority
            />
          </div>
          <button
            type="button"
            onClick={() => setExpandedIndex((prev) => (prev === null ? prev : (prev + 1) % images.length))}
            className="absolute right-8 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/90 text-gray-700 hover:bg-white"
            aria-label="Next image"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 mx-auto" fill="currentColor" aria-hidden="true">
              <path d="M7.5 5l5 5-5 5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
