'use client'

import { Suspense, useEffect, useState } from 'react'
import VoiceChat from '@/components/VoiceChat'
import { useRouter, useSearchParams } from 'next/navigation'

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFood = searchParams.get('context') === 'food'
  const openHistory = searchParams.get('history') === '1'
  const selectedDate = searchParams.get('date') || ''
  const voicePrompt = searchParams.get('voicePrompt') || ''
  const voicePromptToken = searchParams.get('voicePromptToken') || ''
  const [privateVoicePrompt, setPrivateVoicePrompt] = useState('')
  const entryContext = isFood ? 'food' : 'general'
  const handleExit = () => {
    router.push('/food')
  }

  useEffect(() => {
    let cancelled = false
    if (voicePrompt || !voicePromptToken) {
      setPrivateVoicePrompt('')
      return () => {
        cancelled = true
      }
    }

    fetch(`/api/native/voice-prompt-handoff?token=${encodeURIComponent(voicePromptToken)}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) return ''
        const data = await response.json().catch(() => ({}))
        return typeof data?.prompt === 'string' ? data.prompt : ''
      })
      .then((prompt) => {
        if (!cancelled) setPrivateVoicePrompt(prompt)
      })
      .catch(() => {
        if (!cancelled) setPrivateVoicePrompt('')
      })

    return () => {
      cancelled = true
    }
  }, [voicePrompt, voicePromptToken])

  return (
    <VoiceChat
      className="flex-1"
      entryContext={entryContext}
      selectedDate={selectedDate}
      openHistoryOnLoad={openHistory}
      initialInput={voicePrompt || privateVoicePrompt}
      onExit={isFood ? handleExit : undefined}
    />
  )
}

export default function ChatPage() {
  return (
    <div className="bg-[#f6f8f7] flex flex-col flex-1 min-h-0">
      <Suspense fallback={null}>
        <ChatPageContent />
      </Suspense>
    </div>
  )
}
