'use client'

import VoiceChat from '@/components/VoiceChat'
import { useSearchParams } from 'next/navigation'

export default function ChatPage() {
  const searchParams = useSearchParams()
  const entryContext = searchParams.get('context') === 'food' ? 'food' : 'general'
  return (
    <div className="bg-[#f6f8f7] flex flex-col flex-1 min-h-0">
      <VoiceChat className="flex-1" entryContext={entryContext} />
    </div>
  )
}
