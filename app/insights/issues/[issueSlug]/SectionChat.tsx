'use client'

import React, { FormEvent, useState } from 'react'

interface SectionChatProps {
  issueSlug: string
  section: string
  issueName: string
  sectionContext?: any
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function SectionChat({ issueSlug, section, issueName, sectionContext }: SectionChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist chat per-issue+section so conversation continues like a typical chat widget
  const storeKey = `helfi:chat:${issueSlug}:${section}`
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey)
      if (raw) {
        const saved = JSON.parse(raw)
        if (Array.isArray(saved)) setMessages(saved)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey])
  React.useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storeKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!input.trim()) {
      setError('Enter a question to ask the AI.')
      return
    }
    try {
      setLoading(true)
      setError(null)
      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input.trim() }]
      setMessages(nextMessages)
      const response = await fetch('/api/insights/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section,
          issueName: issueName || issueSlug,
          messages: nextMessages,
          sectionContext: sectionContext ?? null,
        }),
      })
      if (!response.ok) {
        throw new Error('Unable to fetch AI response right now.')
      }
      const data = await response.json()
      const text = typeof data?.answer === 'string' ? data.answer : 'No response available yet.'
      setMessages((prev) => [...prev, { role: 'assistant', content: text }])
      setInput('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Ask AI about this section</h3>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Ask a follow-up question about ${issueName} (${section}).`}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base leading-6 focus:border-helfi-green focus:outline-none focus:ring-2 focus:ring-helfi-green/40 resize-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-[10px] text-base font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Ask AI'}
          </button>
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </form>
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 min-h-[160px] transition-colors">
        {messages.length === 0 && !loading && (
          <span className="text-gray-400">Your AI guidance will appear here after you ask a question.</span>
        )}
        <div className="space-y-3 max-h-[380px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-white border border-gray-200' : 'bg-gray-100'}`}>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{m.role === 'user' ? 'You' : 'AI'}</div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {loading && <div className="text-gray-500">Generating answer…</div>}
        </div>
      </div>
    </section>
  )
}
