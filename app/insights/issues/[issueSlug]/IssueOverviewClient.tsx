'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { IssueSummary, IssueSectionKey } from '@/lib/insights/issue-engine'
import { ISSUE_SECTION_ORDER } from '@/lib/insights/issue-engine'

interface IssueOverviewClientProps {
  issue: IssueSummary
  issueSlug: string
}

// Progress bar that tracks regeneration of all sections
function AllSectionsProgressBar({ issueSlug, sections, onComplete }: { 
  issueSlug: string
  sections: IssueSectionKey[]
  onComplete: () => void 
}) {
  const [progress, setProgress] = useState(0)
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'starting' | 'generating' | 'complete'>('starting')
  const [startTime] = useState(Date.now())
  
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let isComplete = false
    
    const pollStatus = async () => {
      try {
        // Poll each section's status
        const statusPromises = sections.map(async (section) => {
          try {
            const response = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}`)
            if (!response.ok) return { section, status: 'unknown' }
            const data = await response.json()
            const meta = data._meta || {}
            return { section, status: meta.status || 'missing' }
          } catch {
            return { section, status: 'unknown' }
          }
        })
        
        const statuses = await Promise.all(statusPromises)
        const freshCount = statuses.filter(s => s.status === 'fresh').length
        const generatingCount = statuses.filter(s => s.status === 'generating' || s.status === 'stale').length
        
        // Calculate progress based on completed sections (primary metric)
        const sectionProgress = (freshCount / sections.length) * 100
        
        // Also factor in elapsed time for smoother progress updates
        const elapsed = Date.now() - startTime
        const elapsedSeconds = elapsed / 1000
        
        // Faster time-based progress estimate (quick path should be much faster - 10-30 seconds)
        let timeBasedProgress = 0
        if (elapsedSeconds < 5) {
          timeBasedProgress = (elapsedSeconds / 5) * 30 // 0-30% in first 5 seconds
        } else if (elapsedSeconds < 15) {
          timeBasedProgress = 30 + ((elapsedSeconds - 5) / 10) * 50 // 30-80% in next 10 seconds
        } else if (elapsedSeconds < 30) {
          timeBasedProgress = 80 + ((elapsedSeconds - 15) / 15) * 15 // 80-95% in next 15 seconds
        } else {
          timeBasedProgress = 95 // Cap at 95% until all complete
        }
        
        // Use section-based progress as primary, but show time-based progress if higher (for smoother updates)
        // This ensures progress bar moves even while waiting for status updates
        const finalProgress = freshCount === sections.length ? 100 : Math.max(sectionProgress, Math.min(timeBasedProgress, 95))
        
        setProgress(finalProgress)
        
        // Track completed sections
        const newCompleted = new Set<string>()
        statuses.forEach(({ section, status }) => {
          if (status === 'fresh') {
            newCompleted.add(section)
          }
        })
        setCompletedSections(newCompleted)
        
        // Check if all sections are complete
        if (freshCount === sections.length) {
          setStatus('complete')
          isComplete = true
          if (pollInterval) clearInterval(pollInterval)
          if (timeoutId) clearTimeout(timeoutId)
          setTimeout(() => {
            onComplete()
          }, 500)
          return
        } else if (generatingCount > 0 || freshCount > 0) {
          setStatus('generating')
        }
      } catch (error) {
        console.error('Error polling status:', error)
      }
    }
    
    // Start polling immediately, then every 2 seconds
    pollStatus()
    pollInterval = setInterval(pollStatus, 2000)
    
    // Safety timeout: if still not complete after 4 minutes, assume complete
    timeoutId = setTimeout(() => {
      if (!isComplete) {
        console.warn('Regeneration timeout - assuming complete')
        setStatus('complete')
        setProgress(100)
        if (pollInterval) clearInterval(pollInterval)
        setTimeout(() => {
          onComplete()
        }, 500)
      }
    }, 240000) // 4 minutes max for all sections
    
    return () => {
      if (pollInterval) clearInterval(pollInterval)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [issueSlug, sections, startTime, onComplete])
  
  const completedCount = completedSections.size
  const totalCount = sections.length
  
  return (
    <div className="w-full">
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
        <div 
          className="bg-helfi-green h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        ></div>
      </div>
      <p className="text-xs text-gray-600">
        {status === 'complete' 
          ? `✓ Regeneration complete! All ${totalCount} sections updated.` 
          : `Regenerating all insights... This may take 1-2 minutes. (${completedCount}/${totalCount} sections complete)`}
      </p>
    </div>
  )
}

export default function IssueOverviewClient({ issue, issueSlug }: IssueOverviewClientProps) {
  const [isRegenerating, setIsRegenerating] = useState(false)
  
  const sectionDescriptions: Record<string, string> = {
    overview: 'Snapshot of recent trends, blockers, and next actions for this issue.',
    supplements: 'Review current regimen, identify gaps, and spot potential additions.',
    medications: 'Track prescriptions, capture timing, and see what is actually helping.',
    interactions: 'Check supplement and medication combinations for timing or safety flags.',
    labs: 'Track bloodwork targets and know when to upload or re-test.',
    nutrition: 'See how logged meals support this issue and what to tweak next.',
    exercise: 'Understand training patterns and recommended adjustments.',
    lifestyle: 'Sleep, stress, and daily habits that influence this issue.',
  }

  const navigationOrder = ISSUE_SECTION_ORDER.filter((section) => section !== 'overview') as IssueSectionKey[]
  
  async function handleRegenerateAll() {
    try {
      setIsRegenerating(true)
      
      // Start regeneration for all sections (non-blocking)
      const response = await fetch(`/api/insights/issues/${issueSlug}/regenerate-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error('Unable to start regeneration right now.')
      }
      
      // Progress bar will poll and call handleRegenerationComplete when done
    } catch (err) {
      console.error('Error starting regeneration:', err)
      setIsRegenerating(false)
    }
  }
  
  function handleRegenerationComplete() {
    setIsRegenerating(false)
    // Optionally refresh the page to show updated data
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      {/* Regenerate All Button */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Regenerate All Insights</h2>
            <p className="text-sm text-gray-600">
              Refresh all sections for {issue.name} with your latest health data. This may take 1-2 minutes.
            </p>
          </div>
          <div className="flex-shrink-0">
            {isRegenerating ? (
              <div className="w-full max-w-md">
                <AllSectionsProgressBar 
                  issueSlug={issueSlug} 
                  sections={navigationOrder}
                  onComplete={handleRegenerationComplete}
                />
              </div>
            ) : (
              <button
                onClick={handleRegenerateAll}
                className="px-6 py-3 bg-helfi-green hover:bg-helfi-green/90 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🔄 Regenerate All Sections
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Section Links */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <Link
          href={`/insights/issues/${issueSlug}/overview`}
          className="block px-5 py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Overview report</h2>
              <p className="text-sm text-gray-600 mt-1">Generate a full summary across all data points for {issue.name}.</p>
            </div>
            <span className="text-2xl text-gray-400">›</span>
          </div>
        </Link>
        {navigationOrder.map((section) => (
          <Link
            key={section}
            href={`/insights/issues/${issueSlug}/${section}`}
            className="block px-5 py-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {section === 'interactions' ? 'Supplements × Medications' : section}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {sectionDescriptions[section] || 'Open detailed insights for this area.'}
                </p>
              </div>
              <span className="text-2xl text-gray-400">›</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}

