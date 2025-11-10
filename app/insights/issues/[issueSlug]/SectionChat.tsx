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
  const [isListening, setIsListening] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const enabled = (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || 'true').toLowerCase() === 'true' || (process.env.NEXT_PUBLIC_INSIGHTS_CHAT || '') === '1'
  const [threadId, setThreadId] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let finalTranscript = ''

    recognition.onstart = () => {
      setIsListening(true)
      finalTranscript = ''
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript += transcript
        }
      }
      
      setInput(finalTranscript + interimTranscript)
    }

    recognition.onerror = (event: any) => {
      setIsListening(false)
      if (event.error !== 'no-speech') {
        setError('Speech recognition error. Please try again.')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim())
      }
    }

    recognitionRef.current = recognition
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop()
    }
  }, [enabled])

  function startListening() {
    if (!recognitionRef.current || isListening) return
    try {
      recognitionRef.current.start()
    } catch (err) {
      setError('Failed to start voice recognition')
    }
  }

  function stopListening() {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

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

  // Only auto-scroll when user sends a message, not on initial load
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  
  useEffect(() => {
    // Only scroll if user has interacted (sent a message)
    if (hasUserInteracted && messages.length > 0) {
      // Use setTimeout to ensure scroll happens after render
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [messages, loading, hasUserInteracted])

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
      setHasUserInteracted(true) // Mark that user has interacted
      setLoading(true)
      setError(null)
      stopListening()
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
          <p className="text-[11px] text-gray-400 mt-0.5">Typical cost: ~1–2 credits</p>
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
          {recognitionRef.current && (
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={loading}
              className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-base font-semibold shrink-0 min-h-[44px] ${
                isListening
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-purple-500 text-white hover:bg-purple-600'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-label={isListening ? 'Stop listening' : 'Start voice input'}
            >
              {isListening ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              )}
            </button>
          )}
          <textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              // Trigger resize on change
              setTimeout(() => {
                const textarea = event.target as HTMLTextAreaElement
                textarea.style.height = 'auto'
                const maxHeight = 120
                const newHeight = Math.min(textarea.scrollHeight, maxHeight)
                textarea.style.height = `${newHeight}px`
                textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
              }, 0)
            }}
            onKeyDown={onComposerKeyDown}
            placeholder={recognitionRef.current ? `Type or use voice input...` : `Message AI about ${issueName} (${section})`}
            rows={1}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base leading-6 focus:border-helfi-green focus:outline-none focus:ring-2 focus:ring-helfi-green/20 resize-none transition-all duration-200 min-h-[52px] max-h-[120px] bg-white"
            style={{ height: '52px' }}
          />
          <button
            type="submit"
            disabled={loading || isListening}
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
