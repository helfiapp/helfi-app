'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({
    gender: '',
    weight: '',
    height: '',
    bodyType: '',
    exerciseFrequency: '',
    exerciseTypes: [],
    healthGoals: [],
    supplements: [],
    medications: [],
    aiInsights: true
  })
  
  const router = useRouter()
  const { data: session } = useSession()

  const saveToDatabase = async () => {
    if (!session?.user?.email) return
    
    try {
      const response = await fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: session.user.email,
          data: data
        })
      })
      
      if (response.ok) {
        console.log('✅ Data saved to database')
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('❌ Save failed:', error)
    }
  }

  const handleNext = () => {
    if (step < 7) {
      setStep(step + 1)
    } else {
      setLoading(true)
      saveToDatabase()
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const updateData = (newData) => {
    setData({ ...data, ...newData })
  }

  const steps = [
    'Gender',
    'Physical Stats',
    'Exercise',
    'Health Goals', 
    'Supplements',
    'Medications',
    'AI Insights',
    'Complete'
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Health Profile Setup</h1>
              <span className="text-sm text-gray-500">Step {step + 1} of {steps.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {step === 0 && (
            <GenderStep data={data} onNext={updateData} />
          )}
          
          {step === 1 && (
            <PhysicalStep data={data} onNext={updateData} />
          )}
          
          {step === 2 && (
            <ExerciseStep data={data} onNext={updateData} />
          )}
          
          {step === 3 && (
            <GoalsStep data={data} onNext={updateData} />
          )}
          
          {step === 4 && (
            <SupplementsStep data={data} onNext={updateData} />
          )}
          
          {step === 5 && (
            <MedicationsStep data={data} onNext={updateData} />
          )}
          
          {step === 6 && (
            <AIStep data={data} onNext={updateData} />
          )}
          
          {step === 7 && (
            <ReviewStep data={data} loading={loading} />
          )}

          <div className="flex gap-4 mt-8">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="flex-1 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {step === 7 ? (loading ? 'Saving...' : 'Complete Setup') : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GenderStep({ data, onNext }) {
  const [gender, setGender] = useState(data.gender || '')
  
  const options = ['Male', 'Female', 'Non-binary', 'Prefer not to say']
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">What's your gender?</h2>
      <div className="space-y-3">
        {options.map(option => (
          <button
            key={option}
            onClick={() => {
              setGender(option)
              onNext({ gender: option })
            }}
            className={`w-full p-4 rounded-lg border-2 text-left ${
              gender === option ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function PhysicalStep({ data, onNext }) {
  const [weight, setWeight] = useState(data.weight || '')
  const [height, setHeight] = useState(data.height || '')
  const [bodyType, setBodyType] = useState(data.bodyType || '')
  
  const bodyTypes = ['Ectomorph (Lean)', 'Mesomorph (Athletic)', 'Endomorph (Curvy)']
  
  const handleSubmit = () => {
    onNext({ weight, height, bodyType })
  }
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Physical Stats</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Weight (kg)</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            placeholder="Enter your weight"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Height (cm)</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
            placeholder="Enter your height"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-3">Body Type</label>
          <div className="space-y-2">
            {bodyTypes.map(type => (
              <button
                key={type}
                onClick={() => {
                  setBodyType(type)
                  setTimeout(handleSubmit, 100)
                }}
                className={`w-full p-3 rounded-lg border text-left ${
                  bodyType === type ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ExerciseStep({ data, onNext }) {
  const [frequency, setFrequency] = useState(data.exerciseFrequency || '')
  const [types, setTypes] = useState(data.exerciseTypes || [])
  
  const frequencies = ['Never', '1-2 times/week', '3-4 times/week', '5-6 times/week', 'Daily']
  const exerciseTypes = ['Walking', 'Running', 'Gym/Weights', 'Swimming', 'Cycling', 'Yoga', 'Boxing']
  
  const toggleType = (type) => {
    const newTypes = types.includes(type) 
      ? types.filter(t => t !== type)
      : [...types, type]
    setTypes(newTypes)
    onNext({ exerciseFrequency: frequency, exerciseTypes: newTypes })
  }
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Exercise Habits</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">How often do you exercise?</label>
          <div className="space-y-2">
            {frequencies.map(freq => (
              <button
                key={freq}
                onClick={() => {
                  setFrequency(freq)
                  onNext({ exerciseFrequency: freq, exerciseTypes: types })
                }}
                className={`w-full p-3 rounded-lg border text-left ${
                  frequency === freq ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-3">What types of exercise do you do?</label>
          <div className="grid grid-cols-2 gap-2">
            {exerciseTypes.map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`p-3 rounded-lg border text-sm ${
                  types.includes(type) ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalsStep({ data, onNext }) {
  const [goals, setGoals] = useState(data.healthGoals || [])
  
  const healthGoals = [
    'Weight Loss', 'Muscle Gain', 'Better Sleep', 'More Energy', 
    'Stress Management', 'Improved Focus', 'Better Mood', 'Overall Health'
  ]
  
  const toggleGoal = (goal) => {
    const newGoals = goals.includes(goal)
      ? goals.filter(g => g !== goal)
      : [...goals, goal]
    setGoals(newGoals)
    onNext({ healthGoals: newGoals })
  }
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Health Goals</h2>
      <p className="text-gray-600 mb-6">What are your main health and fitness goals?</p>
      
      <div className="grid grid-cols-2 gap-3">
        {healthGoals.map(goal => (
          <button
            key={goal}
            onClick={() => toggleGoal(goal)}
            className={`p-3 rounded-lg border text-sm ${
              goals.includes(goal) ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {goal}
          </button>
        ))}
      </div>
    </div>
  )
}

function SupplementsStep({ data, onNext }) {
  const [supplements, setSupplements] = useState(data.supplements || [])
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Supplements</h2>
      <p className="text-gray-600 mb-6">What supplements do you currently take? (Optional)</p>
      
      <div className="mb-6">
        <button
          onClick={() => onNext({ supplements: [] })}
          className="w-full p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          I don't take any supplements
        </button>
      </div>
      
      <div className="text-center text-gray-500">
        Supplement tracking coming soon...
      </div>
    </div>
  )
}

function MedicationsStep({ data, onNext }) {
  const [medications, setMedications] = useState(data.medications || [])
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Medications</h2>
      <p className="text-gray-600 mb-6">What medications do you currently take? (Optional)</p>
      
      <div className="mb-6">
        <button
          onClick={() => onNext({ medications: [] })}
          className="w-full p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          I don't take any medications
        </button>
      </div>
      
      <div className="text-center text-gray-500">
        Medication tracking coming soon...
      </div>
    </div>
  )
}

function AIStep({ data, onNext }) {
  const [aiInsights, setAiInsights] = useState(data.aiInsights ?? true)
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">AI Health Insights</h2>
      <p className="text-gray-600 mb-6">Would you like personalized AI health insights and recommendations?</p>
      
      <div className="space-y-3">
        <button
          onClick={() => {
            setAiInsights(true)
            onNext({ aiInsights: true })
          }}
          className={`w-full p-4 rounded-lg border-2 text-left ${
            aiInsights ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="font-medium">Yes, give me AI insights</div>
          <div className="text-sm text-gray-600">Get personalized health recommendations</div>
        </button>
        
        <button
          onClick={() => {
            setAiInsights(false)
            onNext({ aiInsights: false })
          }}
          className={`w-full p-4 rounded-lg border-2 text-left ${
            !aiInsights ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="font-medium">No thanks</div>
          <div className="text-sm text-gray-600">I'll skip the AI insights for now</div>
        </button>
      </div>
    </div>
  )
}

function ReviewStep({ data, loading }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Review Your Information</h2>
      
      <div className="space-y-4 bg-gray-50 p-6 rounded-lg">
        <div><strong>Gender:</strong> {data.gender}</div>
        <div><strong>Weight:</strong> {data.weight} kg</div>
        <div><strong>Height:</strong> {data.height} cm</div>
        <div><strong>Body Type:</strong> {data.bodyType}</div>
        <div><strong>Exercise Frequency:</strong> {data.exerciseFrequency}</div>
        <div><strong>Exercise Types:</strong> {data.exerciseTypes?.join(', ') || 'None'}</div>
        <div><strong>Health Goals:</strong> {data.healthGoals?.join(', ') || 'None'}</div>
        <div><strong>AI Insights:</strong> {data.aiInsights ? 'Enabled' : 'Disabled'}</div>
      </div>
      
      {loading && (
        <div className="text-center text-green-600 mt-4">
          ✅ Saving your health profile...
        </div>
      )}
    </div>
  )
} 