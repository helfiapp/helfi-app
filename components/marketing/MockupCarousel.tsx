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
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const [manualPause, setManualPause] = useState(false)
  const [expandedImage, setExpandedImage] = useState<FeaturePageImage | null>(null)
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const advance = useCallback(
    (direction: number) => {
      setActiveIndex((prev) => {
        if (images.length === 0) return prev
        const nextIndex = (prev + direction + images.length) % images.length
        scrollToIndex(nextIndex)
        return nextIndex
      })
    },
    [images.length, scrollToIndex]
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
    if (isHovering || manualPause) return
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current)
    }
    autoScrollRef.current = setInterval(() => {
      advance(1)
    }, isMobile ? 5000 : 4000)
    return () => {
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current)
        autoScrollRef.current = null
      }
    }
  }, [advance, images.length, isMobile, isHovering, manualPause])

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current)
      }
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!expandedImage) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedImage(null)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [expandedImage])

  const handleArrowClick = (direction: number) => {
    pauseAutoScroll()
    advance(direction)
  }

  const handleImageClick = (image: FeaturePageImage) => {
    if (isMobile) return
    setExpandedImage(image)
  }

  if (images.length === 0) {
    return null
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      aria-label={ariaLabel}
    >
      <div className="overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex gap-4 scroll-smooth"
          role="region"
          aria-roledescription="carousel"
        >
          {images.map((image) => (
            <button
              key={image.src}
              type="button"
              data-carousel-item
              onClick={() => handleImageClick(image)}
              className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden focus:outline-none focus:ring-2 focus:ring-helfi-green/40"
              style={{
                flex: isMobile ? '0 0 100%' : '0 0 calc((100% - 4rem) / 5)',
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
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-white shadow-md border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 transition-colors"
            aria-label="Previous mockup"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-700" fill="currentColor" aria-hidden="true">
              <path d="M12.5 5l-5 5 5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleArrowClick(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-10 w-10 rounded-full bg-white shadow-md border border-emerald-100 flex items-center justify-center hover:bg-emerald-50 transition-colors"
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

      {expandedImage && !isMobile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/90 text-gray-700 hover:bg-white"
            aria-label="Close image preview"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 mx-auto" fill="currentColor" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
          <div className="max-w-5xl w-full">
            <Image
              src={expandedImage.src}
              alt={expandedImage.alt}
              width={expandedImage.width ?? 1419}
              height={expandedImage.height ?? 2796}
              sizes="90vw"
              className="w-full h-auto max-h-[85vh] object-contain rounded-2xl"
              priority
            />
          </div>
        </div>
      )}
    </div>
  )
}
