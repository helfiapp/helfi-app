'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { FeaturePageImage } from '@/data/feature-pages'

type MockupGalleryProps = {
  images: FeaturePageImage[]
  ariaLabel?: string
}

export default function MockupGallery({ images, ariaLabel = 'Health tracking mockups' }: MockupGalleryProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const ignoreClickRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    images.forEach((image) => {
      const preload = new window.Image()
      preload.src = image.src
    })
  }, [images])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setPortalTarget(document.body)
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

  const handleImageClick = (index: number) => {
    if (ignoreClickRef.current) return
    setExpandedIndex(index)
  }

  const closeLightbox = () => {
    setExpandedIndex(null)
    ignoreClickRef.current = true
    window.setTimeout(() => {
      ignoreClickRef.current = false
    }, 200)
  }

  if (images.length === 0) {
    return null
  }

  return (
    <div className="relative px-6 md:px-10" aria-label={ariaLabel}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            onClick={() => handleImageClick(index)}
            className="rounded-2xl bg-transparent border border-transparent overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-transform hover:-translate-y-1"
          >
            <Image
              src={image.src}
              alt={image.alt}
              width={image.width ?? 1419}
              height={image.height ?? 2796}
              sizes="(min-width: 1024px) 22vw, (min-width: 640px) 42vw, 80vw"
              className="w-full h-auto max-h-[420px] object-contain"
            />
          </button>
        ))}
      </div>

      {expandedIndex !== null && portalTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[2000] bg-black/85 cursor-zoom-out"
            role="dialog"
            aria-modal="true"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              closeLightbox()
            }}
          >
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                closeLightbox()
              }}
              className="absolute top-6 right-6 z-[2010] h-11 w-11 rounded-full bg-black/70 text-white hover:bg-black/80 shadow-md flex items-center justify-center text-2xl leading-none"
              aria-label="Close image preview"
            >
              <span aria-hidden="true">×</span>
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                setExpandedIndex((prev) => (prev === null ? prev : (prev - 1 + images.length) % images.length))
              }}
              className="absolute left-8 top-1/2 -translate-y-1/2 z-[2010] h-12 w-12 rounded-full bg-white/90 text-gray-700 hover:bg-white"
              aria-label="Previous image"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5 mx-auto" fill="currentColor" aria-hidden="true">
                <path d="M12.5 5l-5 5 5 5" />
              </svg>
            </button>
            <div className="relative z-[2010] flex h-full items-center justify-center px-6">
              <div
                className="max-w-6xl w-full cursor-zoom-out"
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
              >
                <Image
                  src={images[expandedIndex].src}
                  alt={images[expandedIndex].alt}
                  width={images[expandedIndex].width ?? 1419}
                  height={images[expandedIndex].height ?? 2796}
                  sizes="90vw"
                  className="w-full h-auto max-h-[85vh] object-contain rounded-2xl cursor-default"
                  priority
                />
              </div>
            </div>
            <button
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                setExpandedIndex((prev) => (prev === null ? prev : (prev + 1) % images.length))
              }}
              className="absolute right-8 top-1/2 -translate-y-1/2 z-[2010] h-12 w-12 rounded-full bg-white/90 text-gray-700 hover:bg-white"
              aria-label="Next image"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5 mx-auto" fill="currentColor" aria-hidden="true">
                <path d="M7.5 5l5 5-5 5" />
              </svg>
            </button>
          </div>,
          portalTarget
        )}
    </div>
  )
}
