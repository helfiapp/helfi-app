'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function MedicalDisclaimerBanner() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="bg-helfi-green text-white">
      <div className="max-w-6xl mx-auto px-4">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold tracking-wide"
          aria-expanded={isOpen}
          aria-controls="medical-disclaimer-content"
        >
          <span>Medical Disclaimer</span>
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M10 14l-6-7h12l-6 7z" />
          </svg>
        </button>

        <div
          id="medical-disclaimer-content"
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen ? 'max-h-64 opacity-100 pb-4' : 'max-h-0 opacity-0'
          }`}
        >
          <p className="text-sm text-white/95 text-center">
            Helfi is not a medical device and does not provide medical advice, diagnosis, or treatment.
            Always consult with a qualified healthcare provider before making health-related decisions.{' '}
            <Link href="/terms" className="underline text-white hover:text-white/90">
              View full disclaimer
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
