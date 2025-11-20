'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type MedicalAnalysisResult = {
  summary?: string | null
  possibleCauses?: Array<{ name: string; whyLikely: string; confidence: string }>
  redFlags?: string[]
  nextSteps?: string[]
  analysisText?: string
}

interface MedicalImageChatProps {
  analysisResult: MedicalAnalysisResult
}

export default function MedicalImageChat({ analysisResult }: MedicalImageChatProps) {
  const storageKey = useMemo(() => `helfi:medical-images:chat`, [])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced resize to keep composer smooth
  const resizeTextarea = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current)
    }
    resizeTimeoutRef.current = setTimeout(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.style.height = 'auto'
      const maxHeight = 200
      const newHeight = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${newHeight}px`
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }, 50)
  }, [])

  // Load any existing chat history (per device)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setMessages(
            parsed.filter(
              (m: any) =>
                m &&
                typeof m.content === 'string' &&
                (m.role === 'user' || m.role === 'assistant')
            ).slice(-24)
          )
        }
      }
    } catch {}
  }, [storageKey])

  // Persist messages
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  // Always scroll to bottom inside chat container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, loading])

  // Auto-resize textarea
  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const form = (event.target as HTMLTextAreaElement).closest('form') as HTMLFormElement | null
      form?.requestSubmit()
    }
  }

  async function handleClear() {
    try {
      setLoading(true)
      setError(null)
      setMessages([])
      try {
        localStorage.removeItem(storageKey)
      } catch {}
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

      const res = await fetch('/api/medical-images/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: text,
          analysisResult,
        }),
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
                  copy[copy.length - 1] = {
                    role: 'assistant',
                    content: (copy[copy.length - 1] as any).content + token,
                  }
                  return copy
                })
              }
            }
          }
        }
      } else {
        const data = await res.json().catch(() => null)
        const textOut = data?.assistant as string | undefined
        if (textOut) {
          setMessages((prev) => [...prev, { role: 'assistant', content: textOut }])
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Chat about your medical image</h3>
          <p className="text-xs text-gray-500">Ask follow-up questions – history saved locally</p>
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

      <div
        ref={containerRef}
        className="px-4 py-6 h-[420px] overflow-y-auto overflow-x-hidden space-y-6 min-w-0"
        aria-live="polite"
        style={{ maxWidth: '100%', wordWrap: 'break-word' }}
      >
        {messages.length === 0 && !loading && (
          <div className="text-sm text-gray-400">
            Ask follow‑ups like:
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
                What does the most likely condition actually mean?
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
                Which red flags mean I should see a doctor urgently?
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
                What everyday things can make this better or worse?
              </span>
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={idx} className="flex">
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-helfi-green text-white rounded-br-sm'
                  : 'mr-auto bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-xs text-gray-400">
            Thinking…
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600">
            {error}
          </div>
        )}

        <div />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <div className="flex-1">
            <label htmlFor="medical-chat-input" className="sr-only">
              Message AI about your medical image analysis
            </label>
            <textarea
              id="medical-chat-input"
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message AI about your medical image analysis"
              className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-helfi-green focus:outline-none focus:ring-2 focus:ring-helfi-green/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-helfi-green px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-helfi-green/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  )
}


