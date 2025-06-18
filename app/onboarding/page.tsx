'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface FormData {
  gender?: string
  weight?: string
  height?: string
  bodyType?: string
  exerciseFrequency?: string
  exerciseTypes?: string[]
  healthGoals?: string[]
  supplements?: any[]
  medications?: any[]
  aiInsights?: boolean
}

export default function SimpleOnboarding() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>({})
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const router = useRouter()

  const steps = [
    'Gender',
    'Physical Stats', 
    'Exercise',
    'Health Goals',
    'Supplements',
    'Medications',
    'AI Insights',
    'Review'
  ]

  // Load existing data on mount
  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      // Try database first
      const response = await fetch('/api/user-data')
      if (response.ok) {
        const result = await response.json()
        if (result.data) {
          console.log('✅ Loaded data from database:', result.data)
          setForm(result.data)
          return
        }
      }
      
      // Fallback to localStorage
      const saved = localStorage.getItem('onboardingData')
      if (saved) {
        console.log('📱 Loaded data from localStorage')
        setForm(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load user data:', error)
    }
  }

  const saveData = async (data: FormData) => {
    try {
      // Save to localStorage immediately
      localStorage.setItem('onboardingData', JSON.stringify(data))
      
      // Try to save to database
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        console.log('✅ Data synced to database')
        return true
      } else {
        console.warn('⚠️ Database sync failed, data saved locally')
        return false
      }
    } catch (error) {
      console.error('Error saving data:', error)
      return false
    }
  }

  const syncData = async () => {
    setSyncing(true)
    try {
      const success = await saveData(form)
      if (success) {
        alert('✅ Data synced successfully! Your data is now available across all devices.')
      } else {
        alert('❌ Sync failed. Please try again.')
      }
    } catch (error) {
      alert('❌ Sync failed. Please try again.')
    }
    setSyncing(false)
  }

  const handleNext = (data: any) => {
    const newForm = { ...form, ...data }
    setForm(newForm)
    saveData(newForm)
    
    if (step < steps.length - 1) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    await saveData(form)
    localStorage.removeItem('onboardingData')
    router.push('/dashboard')
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return <GenderStep onNext={handleNext} initial={form.gender} />
      case 1:
        return <PhysicalStep onNext={handleNext} onBack={handleBack} initial={form} />
      case 2:
        return <ExerciseStep onNext={handleNext} onBack={handleBack} initial={form} />
      case 3:
        return <HealthGoalsStep onNext={handleNext} onBack={handleBack} initial={form.healthGoals} />
      case 4:
        return <SupplementsStep onNext={handleNext} onBack={handleBack} initial={form.supplements} />
      case 5:
        return <MedicationsStep onNext={handleNext} onBack={handleBack} initial={form.medications} />
      case 6:
        return <AIInsightsStep onNext={handleNext} onBack={handleBack} initial={form.aiInsights} />
      case 7:
        return <ReviewStep onBack={handleBack} onComplete={handleComplete} data={form} loading={loading} />
      default:
        return <div>Unknown step</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Step {step + 1} of {steps.length}</span>
            <span>{steps[step]}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Sync Button */}
        {Object.keys(form).length > 0 && (
          <div className="mb-4">
            <button
              onClick={syncData}
              disabled={syncing}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? '🔄 Syncing...' : '🔄 Sync Data to All Devices'}
            </button>
          </div>
        )}

        {/* Step Content */}
        {renderStep()}
      </div>
    </div>
  )
}

// Simple step components
function GenderStep({ onNext, initial }: { onNext: (data: any) => void, initial?: string }) {
  const [gender, setGender] = useState(initial || '')

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">What's your gender?</h2>
      <div className="space-y-3">
        {['male', 'female', 'other'].map(option => (
          <button
            key={option}
            onClick={() => setGender(option)}
            className={`w-full p-4 rounded-lg border-2 text-left capitalize ${
              gender === option ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <button
        onClick={() => onNext({ gender })}
        disabled={!gender}
        className="w-full mt-6 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  )
}

function PhysicalStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [weight, setWeight] = useState(initial?.weight || '')
  const [height, setHeight] = useState(initial?.height || '')
  const [bodyType, setBodyType] = useState(initial?.bodyType || '')

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Physical Stats</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Weight (kg)</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full p-3 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Height (cm)</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full p-3 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Body Type</label>
          <select
            value={bodyType}
            onChange={(e) => setBodyType(e.target.value)}
            className="w-full p-3 border rounded-lg"
          >
            <option value="">Select body type</option>
            <option value="ectomorph">Ectomorph (lean/thin)</option>
            <option value="mesomorph">Mesomorph (muscular/athletic)</option>
            <option value="endomorph">Endomorph (fuller/rounder)</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ weight, height, bodyType })}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function ExerciseStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [exerciseFrequency, setExerciseFrequency] = useState(initial?.exerciseFrequency || '')
  const [exerciseTypes, setExerciseTypes] = useState<string[]>(initial?.exerciseTypes || [])

  const toggleExerciseType = (type: string) => {
    setExerciseTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const frequencies = ['Never', '1-2 times/week', '3-4 times/week', '5-6 times/week', 'Every day']
  const types = ['Walking', 'Running', 'Gym/Weights', 'Swimming', 'Cycling', 'Yoga', 'Boxing', 'Team Sports']

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Exercise Habits</h2>
      
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">How often do you exercise?</label>
        <div className="space-y-2">
          {frequencies.map(freq => (
            <button
              key={freq}
              onClick={() => setExerciseFrequency(freq)}
              className={`w-full p-3 rounded-lg border text-left ${
                exerciseFrequency === freq ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {freq}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">What types of exercise do you do?</label>
        <div className="grid grid-cols-2 gap-2">
          {types.map(type => (
            <button
              key={type}
              onClick={() => toggleExerciseType(type)}
              className={`p-3 rounded-lg border text-sm ${
                exerciseTypes.includes(type) ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ exerciseFrequency, exerciseTypes })}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function HealthGoalsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: string[] }) {
  const [healthGoals, setHealthGoals] = useState<string[]>(initial || [])

  const toggleGoal = (goal: string) => {
    setHealthGoals(prev => 
      prev.includes(goal) 
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    )
  }

  const goals = [
    'Weight Loss', 'Muscle Gain', 'Energy', 'Sleep', 'Stress', 'Focus',
    'Libido', 'Mood', 'Strength', 'Endurance', 'Recovery', 'Overall Health'
  ]

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Health Goals</h2>
      <p className="text-gray-600 mb-6">What are your main health and fitness goals?</p>
      
      <div className="grid grid-cols-2 gap-3 mb-6">
        {goals.map(goal => (
          <button
            key={goal}
            onClick={() => toggleGoal(goal)}
            className={`p-3 rounded-lg border text-sm ${
              healthGoals.includes(goal) ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {goal}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ healthGoals })}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function SupplementsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any[] }) {
  const [supplements, setSupplements] = useState(initial || [])

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Supplements</h2>
      <p className="text-gray-600 mb-6">What supplements do you currently take?</p>
      
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ supplements })}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function MedicationsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any[] }) {
  const [medications, setMedications] = useState(initial || [])

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Medications</h2>
      <p className="text-gray-600 mb-6">What medications do you currently take?</p>
      
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ medications })}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function AIInsightsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: boolean }) {
  const [aiInsights, setAiInsights] = useState(initial !== undefined ? initial : true)

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">AI Insights</h2>
      <p className="text-gray-600 mb-6">Would you like personalized AI health insights?</p>
      
      <div className="space-y-3 mb-6">
        <button
          onClick={() => setAiInsights(true)}
          className={`w-full p-4 rounded-lg border-2 text-left ${
            aiInsights ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          Yes, give me AI insights
        </button>
        <button
          onClick={() => setAiInsights(false)}
          className={`w-full p-4 rounded-lg border-2 text-left ${
            !aiInsights ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          No, I'll skip this
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ aiInsights })}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

function ReviewStep({ onBack, onComplete, data, loading }: { 
  onBack: () => void, 
  onComplete: () => void, 
  data: FormData,
  loading: boolean 
}) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Review Your Information</h2>
      
      <div className="space-y-4 mb-6">
        <div><strong>Gender:</strong> {data.gender}</div>
        <div><strong>Weight:</strong> {data.weight} kg</div>
        <div><strong>Height:</strong> {data.height} cm</div>
        <div><strong>Body Type:</strong> {data.bodyType}</div>
        <div><strong>Exercise Frequency:</strong> {data.exerciseFrequency}</div>
        <div><strong>Exercise Types:</strong> {data.exerciseTypes?.join(', ')}</div>
        <div><strong>Health Goals:</strong> {data.healthGoals?.join(', ')}</div>
        <div><strong>AI Insights:</strong> {data.aiInsights ? 'Yes' : 'No'}</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={onComplete}
          disabled={loading}
          className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Completing...' : 'Complete Setup'}
        </button>
      </div>
    </div>
  )
}