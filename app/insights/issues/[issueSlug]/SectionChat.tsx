'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

interface SectionChatProps {
  issueSlug: string
  section: string
  issueName: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function SectionChat({ issueSlug, section, issueName }: SectionChatProps) {
  const storageKey = useMemo(() => `helfi:insights:thread:${issueSlug}:${section}`, [issueSlug, section])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-24))
        }
      }
    } catch {}
  }, [storageKey])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text) {
      setError('Enter a question to ask the AI.')
      return
    }
    try {
      setLoading(true)
      setError(null)
      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
      setMessages(nextMessages)
      setInput('')
      const response = await fetch('/api/insights/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          issue: issueName || issueSlug,
          messages: nextMessages,
        }),
      })
      if (!response.ok) {
        throw new Error('Unable to fetch AI response right now.')
      }
      const data = await response.json()
      const reply: ChatMessage[] = Array.isArray(data?.messages)
        ? data.messages.filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        : []
      if (reply.length) setMessages(reply)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Ask AI about this section</h3>
      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
        {messages.length === 0 && !loading && (
          <div className="text-sm text-gray-400">Start a conversation about {issueName} ({section}). Your chat history will stay here.</div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={
              m.role === 'user'
                ? 'inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-helfi-green text-white px-4 py-2 text-sm'
                : 'inline-block max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800 px-4 py-2 text-sm'
            }>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="inline-block max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-500 px-4 py-2 text-sm">Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
    </section>
  )
}
