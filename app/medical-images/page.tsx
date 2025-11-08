'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import CreditPurchaseModal from '@/components/CreditPurchaseModal'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'

export default function MedicalImagesPage() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false)
  const [creditInfo, setCreditInfo] = useState<any>({
    dailyUsed: 0,
    dailyLimit: 0,
    additionalCredits: 0,
    plan: 'FREE',
    creditCost: 2, // Medical image analysis costs 2 credits
    featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
  })
  const [usageMeterRefresh, setUsageMeterRefresh] = useState<number>(0) // Trigger for UsageMeter refresh

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setAnalysis(null)
      setError('')
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAnalyze = async () => {
    if (!imageFile) {
      setError('Please select an image first')
      return
    }

    setError('')
    setAnalysis(null)
    setIsAnalyzing(true)

    try {
      const formData = new FormData()
      formData.append('image', imageFile)

      const response = await fetch('/api/test-vision', {
        method: 'POST',
        body: formData,
      })

      if (response.status === 402) {
        const data = await response.json()
        setCreditInfo({
          dailyUsed: 0,
          dailyLimit: 0,
          additionalCredits: data.additionalCredits ?? 0,
          plan: data.plan ?? 'FREE',
          creditCost: 2,
          featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
        })
        setShowCreditsModal(true)
        setIsAnalyzing(false)
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || data?.message || 'Failed to analyze image')
      }

      const result = await response.json()
      if (result.success && result.analysis) {
        setAnalysis(result.analysis)
        // Trigger usage meter refresh after successful analysis
        setUsageMeterRefresh(prev => prev + 1)
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleReset = () => {
    setImageFile(null)
    setImagePreview(null)
    setAnalysis(null)
    setError('')
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
            <div className="text-base font-semibold text-gray-900">Medical Image Analyzer</div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Medical Image Analyzer</h1>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h2 className="text-sm font-semibold text-blue-900 mb-2">What is this feature?</h2>
              <p className="text-sm text-blue-800 mb-2">
                Our AI-powered Medical Image Analyzer helps you understand medical images by providing detailed analysis and insights. 
                Upload photos of various medical conditions and receive AI-generated descriptions and observations.
              </p>
              <p className="text-sm text-blue-800 font-medium mb-1">Perfect for analyzing:</p>
              <ul className="text-sm text-blue-800 list-disc list-inside space-y-1 ml-2">
                <li>Skin conditions (rashes, hives, eczema, psoriasis)</li>
                <li>Skin anomalies (moles, lesions, growths)</li>
                <li>X-rays and medical scans</li>
                <li>Wounds and injuries</li>
                <li>Eye conditions</li>
                <li>Nail abnormalities</li>
                <li>Other visible medical concerns</li>
              </ul>
              <p className="text-xs text-blue-700 mt-3 italic">
                ⚠️ This tool provides informational analysis only and is not a substitute for professional medical advice, diagnosis, or treatment.
              </p>
            </div>

            {/* Image Upload */}
            <div className="mb-4">
              {!imagePreview ? (
                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-auto rounded-lg border border-gray-200 max-h-96 object-contain bg-gray-50"
                  />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
                    aria-label="Remove image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleAnalyze}
                disabled={!imageFile || isAnalyzing}
                className={`flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                  !imageFile || isAnalyzing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-helfi-green hover:bg-helfi-green/90'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  'Analyze Image'
                )}
              </button>
              {imagePreview && (
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-2">Typical cost: 2 credits</p>
              <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
              <FeatureUsageDisplay featureName="medicalImageAnalysis" featureLabel="Medical Image Analysis" refreshTrigger={usageMeterRefresh} />
            </div>

            {/* Analysis Results */}
            {analysis && (
              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Analysis Results</h2>
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-700 whitespace-pre-line">{analysis}</p>
                </div>
                <div className="mt-4 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <strong>⚠️ Important:</strong> This analysis is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider with any questions you may have regarding a medical condition.
                </div>
              </div>
            )}
          </div>
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

      {/* Mobile Bottom Navigation */}
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

