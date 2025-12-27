'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

interface LowCreditsModalProps {
  isOpen: boolean
  onClose: () => void
  creditsRemaining?: number
  featureName?: string
}

export default function LowCreditsModal({ 
  isOpen, 
  onClose, 
  creditsRemaining = 0,
  featureName = 'AI features'
}: LowCreditsModalProps) {
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 200)
  }

  if (!isOpen) return null

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className={`relative bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-200 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 rounded-full flex items-center justify-center">
              <svg 
                className="w-10 h-10 text-red-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" 
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
            Low Credits Warning
          </h2>

          {/* Message */}
          <p className="text-gray-600 text-center mb-2">
            You're running low on credits
            {creditsRemaining > 0 && (
              <span className="font-semibold text-red-600"> ({creditsRemaining} remaining)</span>
            )}
            .
          </p>
          <p className="text-gray-600 text-center mb-8">
            Purchase more credits or upgrade your subscription to continue using {featureName}.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/billing"
              onClick={handleClose}
              className="flex-1 px-6 py-3 bg-white border-2 border-gray-300 text-gray-800 font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-center"
            >
              Upgrade Plan
            </Link>
            <Link
              href="/billing"
              onClick={handleClose}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold rounded-xl hover:from-red-700 hover:to-red-600 transition-all duration-200 shadow-lg hover:shadow-xl text-center"
            >
              Buy Credits
            </Link>
          </div>

          {/* Additional info */}
          <p className="text-xs text-gray-500 text-center mt-6">
            Credits refresh monthly with your subscription plan
          </p>
        </div>
      </div>
    </div>
  )
}
