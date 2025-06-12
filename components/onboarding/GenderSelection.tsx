'use client'

import { useState } from 'react'

interface GenderSelectionProps {
  onNext: (data: { gender: string }) => void
  initialData?: string
}

export default function GenderSelection({ onNext, initialData }: GenderSelectionProps) {
  const [gender, setGender] = useState(initialData || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (gender) {
      onNext({ gender })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setGender('MALE')}
          className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
            gender === 'MALE'
              ? 'border-helfi-green bg-helfi-green/5'
              : 'border-gray-200 hover:border-helfi-green/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-helfi-black">Male</h3>
              <p className="text-sm text-gray-600">
                Optimize your health insights for male physiology
              </p>
            </div>
            {gender === 'MALE' && (
              <div className="w-6 h-6 rounded-full bg-helfi-green flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setGender('FEMALE')}
          className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
            gender === 'FEMALE'
              ? 'border-helfi-green bg-helfi-green/5'
              : 'border-gray-200 hover:border-helfi-green/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-helfi-black">Female</h3>
              <p className="text-sm text-gray-600">
                Optimize your health insights for female physiology
              </p>
            </div>
            {gender === 'FEMALE' && (
              <div className="w-6 h-6 rounded-full bg-helfi-green flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}
          </div>
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!gender}
          className={`btn-primary ${
            !gender ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Continue
        </button>
      </div>
    </form>
  )
} 