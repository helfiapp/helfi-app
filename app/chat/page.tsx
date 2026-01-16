'use client'

import { Suspense } from 'react'
import VoiceChat from '@/components/VoiceChat'
import { useRouter, useSearchParams } from 'next/navigation'

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFood = searchParams.get('context') === 'food'
  const entryContext = isFood ? 'food' : 'general'
  const handleExit = () => {
    router.push('/food')
  }
  return <VoiceChat className="flex-1" entryContext={entryContext} onExit={isFood ? handleExit : undefined} />
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
