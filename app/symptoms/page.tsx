'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import CreditPurchaseModal from '@/components/CreditPurchaseModal'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import SymptomChat from './SymptomChat'

type AnalysisResult = {
  success: boolean
  analysisText?: string
  summary?: string | null
  possibleCauses?: Array<{ name: string; whyLikely: string; confidence: 'low' | 'medium' | 'high' }>
  redFlags?: string[]
  nextSteps?: string[]
  disclaimer?: string
  error?: string
}

export default function SymptomAnalysisPage() {
  const [symptomInput, setSymptomInput] = useState<string>('')
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [duration, setDuration] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [phase, setPhase] = useState<number>(0)
  const [progress, setProgress] = useState<number>(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string>('')

  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false)
  const [creditInfo, setCreditInfo] = useState<any>({ dailyUsed: 0, dailyLimit: 0, additionalCredits: 0, plan: 'FREE', creditCost: 1 })
  const [tagsExpanded, setTagsExpanded] = useState<boolean>(false)

  // Progress phases shown while analyzing
  const phases = useMemo(() => [
    'Gathering context',
    'Checking differentials',
    'Flagging red flags',
    'Drafting next steps'
  ], [])

  useEffect(() => {
    if (!isAnalyzing) return
    setPhase(0)
    setProgress(0)
    let pct = 0
    const timer = setInterval(() => {
      pct = Math.min(99, pct + Math.random() * 7 + 3)
      setProgress(pct)
      // advance phase roughly every ~25%
      if (pct > 75) setPhase(3)
      else if (pct > 50) setPhase(2)
      else if (pct > 25) setPhase(1)
      else setPhase(0)
    }, 350)
    return () => clearInterval(timer)
  }, [isAnalyzing])

  const quickTags = [
    'Fever','Headache','Cough','Sore throat','Runny nose','Nasal congestion','Sneezing','Fatigue','Body aches','Chills','Night sweats',
    'Shortness of breath','Chest pain','Palpitations','Dizziness','Lightheadedness','Confusion','Anxiety','Depressed mood','Insomnia',
    'Nausea','Vomiting','Diarrhea','Constipation','Abdominal pain','Bloating','Heartburn','Indigestion','Loss of appetite',
    'Back pain','Joint pain','Muscle pain','Swollen joints','Rash','Itchy skin','Hives','Head pressure','Loss of taste','Loss of smell',
    'Ear pain','Tooth pain','Sore gums','Swollen glands','Frequent urination','Burning urination','Blood in urine','Blood in stool'
  ]

  const handleAddTag = (tag: string) => {
    setSelectedSymptoms((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
  }

  const handleAddSymptom = () => {
    const s = symptomInput.trim()
    if (!s) return
    setSelectedSymptoms((prev) => (prev.includes(s) ? prev : [...prev, s]))
    setSymptomInput('')
  }

  const handleRemoveSymptom = (symptom: string) => {
    setSelectedSymptoms((prev) => prev.filter((s) => s !== symptom))
  }

  const handleAnalyze = async () => {
    setError('')
    setResult(null)
    const hasAny = selectedSymptoms.length > 0
    if (!hasAny) {
      setError('Please enter at least one symptom.')
      return
    }
    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-symptoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: selectedSymptoms, duration, notes })
      })

      if (res.status === 402) {
        const data = await res.json()
        setCreditInfo({
          dailyUsed: 0,
          dailyLimit: 0,
          additionalCredits: data.additionalCredits ?? 0,
          plan: data.plan ?? 'FREE',
          creditCost: data.creditCost ?? 1,
          dailyLimits: data.dailyLimits,
          featureUsageToday: data.featureUsageToday,
        })
        setShowCreditsModal(true)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to analyze symptoms')
      }

      const data: AnalysisResult = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
    } finally {
      setIsAnalyzing(false)
      setProgress(100)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/" className="w-16 h-16 md:w-20 md:h-20 cursor-pointer hover:opacity-80 transition-opacity">
              <Image
                src="https://res.cloudinary.com/dh7qpr43n/image/upload/v1749261152/HELFI_TRANSPARENT_rmssry.png"
                alt="Helfi Logo"
                width={80}
                height={80}
                className="w-full h-full object-contain"
                priority
              />
            </Link>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">AI Tools</div>
            <div className="text-base font-semibold text-gray-900">Symptom Analysis</div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Describe your symptoms</h1>
            <p className="text-sm text-gray-600 mb-4">List symptoms separated by commas (e.g., Headache, Fever). Add duration and any notes.</p>

            <div className="mb-3">
               <label className="block text-sm font-medium text-gray-700 mb-1">Symptoms</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={symptomInput}
                  onChange={(e) => setSymptomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSymptom() } }}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-helfi-green/30 focus:border-helfi-green"
                  placeholder="e.g., Headache"
                />
                <button onClick={handleAddSymptom} className="px-3 py-2 bg-helfi-green text-white rounded-lg hover:bg-helfi-green/90">+ Add</button>
              </div>

              {/* Selected symptoms */}
              {selectedSymptoms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedSymptoms.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full">
                      {s}
                      <button aria-label={`Remove ${s}`} onClick={() => handleRemoveSymptom(s)} className="ml-1 text-emerald-800 hover:text-emerald-900">×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Quick tags */}
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {(tagsExpanded ? quickTags : quickTags.slice(0, 12)).map((t) => {
                    const selected = selectedSymptoms.includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => handleAddTag(t)}
                        className={`${selected ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'} px-2 py-1 text-xs border rounded-full`}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
                {quickTags.length > 12 && (
                  <button
                    onClick={() => setTagsExpanded(!tagsExpanded)}
                    className="mt-2 text-sm text-helfi-green hover:text-helfi-green/80 font-medium"
                  >
                    {tagsExpanded ? 'Show less' : `Show ${quickTags.length - 12} more`}
                  </button>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-helfi-green/30 focus:border-helfi-green"
                  placeholder="e.g., 2 days, 1 week"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-helfi-green/30 focus:border-helfi-green"
                placeholder="e.g., started after travel, any triggers, patterns, etc."
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-3 text-sm">{error}</div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className={`inline-flex items-center px-4 py-2 rounded-lg font-medium text-white transition-colors ${isAnalyzing ? 'bg-helfi-green/60' : 'bg-helfi-green hover:bg-helfi-green/90'}`}
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze symptoms'}
            </button>
            <p className="mt-2 text-xs text-gray-500">Typical cost: 2–3 credits</p>

            {/* Progress Bar */}
            {isAnalyzing && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1 text-sm text-gray-600">
                  <span>{phases[phase]}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-2 bg-helfi-green transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Your analysis</h2>

              {result.summary && (
                <div className="mb-4">
                  <h3 className="font-medium text-gray-900 mb-1">Summary</h3>
                  <p className="text-gray-700 text-sm whitespace-pre-line">{result.summary}</p>
                </div>
              )}

              {Array.isArray(result.possibleCauses) && result.possibleCauses.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-gray-900 mb-2">Likely causes</h3>
                  <ul className="space-y-2">
                    {result.possibleCauses.map((c, idx) => (
                      <li key={idx} className="p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-gray-900">{c.name}</div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{c.confidence}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700">{c.whyLikely}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(result.redFlags) && result.redFlags.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-red-700 mb-2 flex items-center">Red flags</h3>
                  <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                    {result.redFlags.map((rf, idx) => (
                      <li key={idx}>{rf}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(result.nextSteps) && result.nextSteps.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-gray-900 mb-2">What to do next</h3>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {result.nextSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                {result.disclaimer || 'This is not medical advice. If you have concerning or worsening symptoms, contact a licensed medical professional or emergency services.'}
              </div>
            </div>
          )}

          {/* AI Chat */}
          {result && (
            <SymptomChat
              analysisResult={result}
              symptoms={selectedSymptoms}
              duration={duration}
              notes={notes}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Spacing */}
      <div className="h-20 md:h-0" />

      {/* Credit Modal */}
      <CreditPurchaseModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        creditInfo={creditInfo}
      />

      {/* Mobile Bottom Navigation (placeholder, will be updated globally in a later step) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          <Link href="/dashboard" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Dashboard</span>
          </Link>
          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Insights</span>
          </Link>
          <Link href="/food" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Food</span>
          </Link>
          <MobileMoreMenu />
          <Link href="/settings" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1">
            <div className="icon text-gray-400">
              <Cog6ToothIcon className="w-6 h-6" />
            </div>
            <span className="label text-xs mt-1 truncate text-gray-400 font-medium">Settings</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}


