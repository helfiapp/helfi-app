'use client'

import { Suspense } from 'react'
import VoiceChat from '@/components/VoiceChat'
import { useSearchParams } from 'next/navigation'

function ChatPageContent() {
  const searchParams = useSearchParams()
  const entryContext = searchParams.get('context') === 'food' ? 'food' : 'general'
  return <VoiceChat className="flex-1" entryContext={entryContext} />
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
