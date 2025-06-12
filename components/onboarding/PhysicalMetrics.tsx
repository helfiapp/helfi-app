'use client'

import { useState } from 'react'

interface PhysicalMetricsProps {
  onNext: (data: { weight: string; height: string; bodyType: string }) => void
  onBack: () => void
  initialData?: {
    weight: string
    height: string
    bodyType: string
  }
}

const bodyTypes = [
  {
    id: 'ECTOMORPH',
    name: 'Ectomorph',
    description: 'Naturally lean, finds it hard to gain weight',
  },
  {
    id: 'MESOMORPH',
    name: 'Mesomorph',
    description: 'Athletic build, gains muscle easily',
  },
  {
    id: 'ENDOMORPH',
    name: 'Endomorph',
    description: 'Naturally larger build, gains weight easily',
  },
]

export default function PhysicalMetrics({
  onNext,
  onBack,
  initialData = { weight: '', height: '', bodyType: '' },
}: PhysicalMetricsProps) {
  const [weight, setWeight] = useState(initialData.weight)
  const [height, setHeight] = useState(initialData.height)
  const [bodyType, setBodyType] = useState(initialData.bodyType)
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (weight && height) {
      onNext({ weight, height, bodyType })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Unit Toggle */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 p-1">
          <button
            type="button"
            onClick={() => setUnit('metric')}
            className={`px-3 py-1 rounded-md text-sm ${
              unit === 'metric'
                ? 'bg-helfi-green text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Metric
          </button>
          <button
            type="button"
            onClick={() => setUnit('imperial')}
            className={`px-3 py-1 rounded-md text-sm ${
              unit === 'imperial'
                ? 'bg-helfi-green text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Imperial
          </button>
        </div>
      </div>

      {/* Weight Input */}
      <div>
        <label
          htmlFor="weight"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Weight
        </label>
        <div className="relative">
          <input
            type="number"
            id="weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-primary pr-12"
            placeholder={`Enter your weight in ${unit === 'metric' ? 'kg' : 'lbs'}`}
            required
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500">
              {unit === 'metric' ? 'kg' : 'lbs'}
            </span>
          </div>
        </div>
      </div>

      {/* Height Input */}
      <div>
        <label
          htmlFor="height"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Height
        </label>
        <div className="relative">
          <input
            type="number"
            id="height"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="input-primary pr-12"
            placeholder={`Enter your height in ${unit === 'metric' ? 'cm' : 'inches'}`}
            required
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500">
              {unit === 'metric' ? 'cm' : 'in'}
            </span>
          </div>
        </div>
      </div>

      {/* Body Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Body Type (Optional)
        </label>
        <div className="space-y-3">
          {bodyTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setBodyType(type.id)}
              className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                bodyType === type.id
                  ? 'border-helfi-green bg-helfi-green/5'
                  : 'border-gray-200 hover:border-helfi-green/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-helfi-black">{type.name}</h3>
                  <p className="text-sm text-gray-600">{type.description}</p>
                </div>
                {bodyType === type.id && (
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
          ))}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!weight || !height}
          className={`btn-primary ${
            !weight || !height ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Continue
        </button>
      </div>
    </form>
  )
} 