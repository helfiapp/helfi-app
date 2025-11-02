'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'

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
  const enabled = (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || 'true').toLowerCase() === 'true' || (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || '') === '1'
  const [threadId, setThreadId] = useState<string | null>(null)

  // Initial load from server (persistent thread). Falls back to localStorage if server unavailable
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/chat`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && typeof data?.threadId === 'string') setThreadId(data.threadId)
          const serverMessages = Array.isArray(data?.messages)
            ? data.messages.map((m: any) => ({ role: m.role, content: m.content })).filter((m: any) => m?.content)
            : []
          if (!cancelled && serverMessages.length) setMessages(serverMessages)
        }
      } catch {}
      // Also hydrate from localStorage if server has nothing yet
      if (!cancelled && messages.length === 0) {
        try {
          const saved = localStorage.getItem(storageKey)
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) {
              setMessages(parsed.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-24))
            }
          }
        } catch {}
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, issueSlug, section])

  // Persist a lightweight copy locally for UX continuity
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const form = (event.target as HTMLTextAreaElement).closest('form') as HTMLFormElement | null
      form?.requestSubmit()
    }
  }

  async function handleClear() {
    try {
      if (!enabled) return
      setLoading(true)
      setError(null)
      await fetch(`/api/insights/issues/${issueSlug}/sections/${section}/chat`, { method: 'DELETE' })
      setMessages([])
      setThreadId(null)
      try { localStorage.removeItem(storageKey) } catch {}
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

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

      // Attempt streaming via SSE to new chat endpoint
      const url = `/api/insights/issues/${issueSlug}/sections/${section}/chat`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: text }),
      })
      if (res.ok && (res.headers.get('content-type') || '').includes('text/event-stream') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let hasAssistant = false
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const chunk of parts) {
            if (chunk.startsWith('data: ')) {
              const token = chunk.slice(6)
              if (!hasAssistant) {
                setMessages((prev) => [...prev, { role: 'assistant', content: token }])
                hasAssistant = true
              } else {
                setMessages((prev) => {
                  const copy = prev.slice()
                  copy[copy.length - 1] = { role: 'assistant', content: (copy[copy.length - 1] as any).content + token }
                  return copy
                })
              }
            }
          }
        }
      } else {
        // Fallback to non-streaming JSON
        const data = await res.json().catch(() => null)
        const textOut = data?.assistant as string | undefined
        if (textOut) setMessages((prev) => [...prev, { role: 'assistant', content: textOut }])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!enabled) return null
  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-0 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Chat about {issueName} ({section})</h3>
          <p className="text-xs text-gray-500">{threadId ? 'History saved for this section' : 'Start a conversation – it will be saved here'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={loading}
            className="text-xs rounded-md border border-gray-300 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="px-5 py-4 h-[420px] overflow-y-auto space-y-3" aria-live="polite">
        {messages.length === 0 && !loading && (
          <div className="text-sm text-gray-400">
            Ask follow‑ups like:
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                `How do these recommendations help ${issueName}?`,
                'Are there safety interactions to watch?',
                'What should I try first this week?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={m.role === 'user' ? 'flex items-start justify-end gap-2' : 'flex items-start justify-start gap-2'}>
            {m.role !== 'user' && (
              <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-helfi-green/10 text-helfi-green grid place-items-center text-xs font-bold">AI</div>
            )}
            <div
              className={
                m.role === 'user'
                  ? 'inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-helfi-green text-white px-4 py-2 text-sm shadow-sm'
                  : 'inline-block max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800 px-4 py-2 text-sm shadow-sm'
              }
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-gray-900 text-white grid place-items-center text-xs font-bold">You</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-start justify-start gap-2">
            <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-helfi-green/10 text-helfi-green grid place-items-center text-xs font-bold">AI</div>
            <div className="inline-block rounded-2xl rounded-bl-sm bg-gray-100 text-gray-600 px-4 py-2 text-sm">
              <span className="inline-flex items-center gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="border-t border-gray-200 px-5 py-3" onSubmit={handleSubmit}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={`Message AI about ${issueName} (${section})`}
            rows={1}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base leading-6 focus:border-helfi-green focus:outline-none focus:ring-2 focus:ring-helfi-green/40 resize-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-[10px] text-base font-semibold text-white disabled:opacity-60"
          >
            Send
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      </form>
    </section>
  )
}
