'use client'

import { useState } from 'react'

interface ExerciseInfoProps {
  onNext: (data: { exerciseFrequency: string; exerciseTypes: string[]; customExercises: string[] }) => void
  onBack: () => void
  initialData?: {
    exerciseFrequency?: string
    exerciseTypes?: string[]
    customExercises?: string[]
  }
}

const frequencyOptions = [
  { value: '0', label: 'I don\'t exercise regularly' },
  { value: '1', label: '1 day a week' },
  { value: '2', label: '2 days a week' },
  { value: '3', label: '3 days a week' },
  { value: '4', label: '4 days a week' },
  { value: '5', label: '5 days a week' },
  { value: '6', label: '6 days a week' },
  { value: '7', label: 'Every day' },
]

const exerciseTypes = [
  'Weight Training',
  'Cardio/Running',
  'Yoga',
  'Pilates',
  'Swimming',
  'Cycling',
  'Walking',
  'Hiking',
  'Rock Climbing',
  'CrossFit',
  'Martial Arts',
  'Dance',
  'Tennis',
  'Basketball',
  'Soccer',
  'Golf',
  'Boxing',
  'HIIT',
  'Stretching',
  'Calisthenics',
]

export default function ExerciseInfo({
  onNext,
  onBack,
  initialData = { exerciseFrequency: '', exerciseTypes: [], customExercises: [] },
}: ExerciseInfoProps) {
  const [exerciseFrequency, setExerciseFrequency] = useState(initialData.exerciseFrequency || '')
  const [selectedTypes, setSelectedTypes] = useState<string[]>(initialData.exerciseTypes || [])
  const [customExercises, setCustomExercises] = useState<string[]>(initialData.customExercises || [])
  const [customInput, setCustomInput] = useState('')

  const handleTypeToggle = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const addCustomExercise = () => {
    if (customInput.trim() && !customExercises.includes(customInput.trim())) {
      setCustomExercises(prev => [...prev, customInput.trim()])
      setCustomInput('')
    }
  }

  const removeCustomExercise = (exercise: string) => {
    setCustomExercises(prev => prev.filter(e => e !== exercise))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onNext({ 
      exerciseFrequency, 
      exerciseTypes: selectedTypes, 
      customExercises 
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-helfi-black mb-3">
          Tell us about your exercise routine
        </h2>
        <p className="text-gray-600">
          Understanding your activity level helps us provide better health recommendations and track your fitness progress.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Exercise Frequency */}
        <div>
          <label 
            htmlFor="exercise-frequency" 
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            How often do you exercise?
          </label>
          <select
            id="exercise-frequency"
            value={exerciseFrequency}
            onChange={(e) => setExerciseFrequency(e.target.value)}
            className="input-primary"
            required
          >
            <option value="">Select frequency...</option>
            {frequencyOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Exercise Types */}
        {exerciseFrequency && exerciseFrequency !== '0' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What types of exercise do you do? (Select all that apply)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {exerciseTypes.map(type => (
                <label
                  key={type}
                  className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedTypes.includes(type)
                      ? 'border-helfi-green bg-helfi-green/5'
                      : 'border-gray-200 hover:border-helfi-green/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => handleTypeToggle(type)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-medium text-gray-700">{type}</span>
                    {selectedTypes.includes(type) && (
                      <div className="w-5 h-5 rounded-full bg-helfi-green flex items-center justify-center ml-2">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Custom Exercise Input */}
        {exerciseFrequency && exerciseFrequency !== '0' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add other exercises not listed above
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Enter exercise type"
                className="input-primary flex-1"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomExercise())}
              />
              <button
                type="button"
                onClick={addCustomExercise}
                disabled={!customInput.trim()}
                className="btn-primary px-6"
              >
                Add
              </button>
            </div>

            {/* Custom Exercises List */}
            {customExercises.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Your custom exercises:</p>
                <div className="flex flex-wrap gap-2">
                  {customExercises.map(exercise => (
                    <span
                      key={exercise}
                      className="px-3 py-1 bg-helfi-green/10 text-helfi-green text-sm rounded-full flex items-center space-x-1"
                    >
                      <span>{exercise}</span>
                      <button
                        type="button"
                        onClick={() => removeCustomExercise(exercise)}
                        className="ml-1 hover:bg-helfi-green/20 rounded-full p-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            disabled={!exerciseFrequency}
            className={`btn-primary ${
              !exerciseFrequency ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  )
} 