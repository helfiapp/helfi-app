'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState, useCallback } from 'react'

interface VoiceChatProps {
  context?: {
    symptoms?: string[]
    duration?: string
    notes?: string
    analysisResult?: any
    issueSlug?: string
    section?: string
  }
  onCostEstimate?: (cost: number) => void
  className?: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function VoiceChat({ context, onCostEstimate, className = '' }: VoiceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  
  const endRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced resize function to prevent pulsating
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
    }, 50) // Debounce resize by 50ms
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check for speech recognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      return
    }

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
      
      // Update input with both final and interim results
      setInput(finalTranscript + interimTranscript)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please enable microphone access.')
      } else if (event.error !== 'no-speech') {
        setError('Speech recognition error. Please try again.')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      // Only set final transcript if we have one
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim())
      }
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, loading])

  // Auto-resize textarea with debounce
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

  function startListening() {
    if (!recognitionRef.current || isListening) return
    try {
      recognitionRef.current.start()
    } catch (err) {
      console.error('Failed to start recognition:', err)
      setError('Failed to start voice recognition')
    }
  }

  function stopListening() {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text) {
      setError('Enter a question or use voice input.')
      return
    }

    try {
      setLoading(true)
      setError(null)
      stopListening()
      
      const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
      setMessages(nextMessages)
      setInput('')

      // Estimate cost before sending
      const estimateRes = await fetch('/api/chat/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, estimateOnly: true }),
      })
      
      if (estimateRes.status === 402) {
        const estimateData = await estimateRes.json()
        setError(`Insufficient credits. Estimated cost: ${(estimateData.estimatedCost / 100).toFixed(2)} credits. Available: ${(estimateData.availableCredits / 100).toFixed(2)} credits.`)
        setLoading(false)
        return
      }
      
      if (estimateRes.ok) {
        const estimateData = await estimateRes.json()
        const cost = estimateData.estimatedCost || 0
        setEstimatedCost(cost)
        if (onCostEstimate) {
          onCostEstimate(cost)
        }
      }

      const url = `/api/chat/voice`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: text, ...context }),
      })

      if (res.status === 402) {
        const data = await res.json()
        setError(`Insufficient credits. Estimated cost: ${(data.estimatedCost / 100).toFixed(2)} credits. Available: ${(data.availableCredits / 100).toFixed(2)} credits.`)
        setLoading(false)
        return
      }

      if (res.ok && (res.headers.get('content-type') || '').includes('text/event-stream') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let hasAssistant = false
        let fullResponse = ''
        
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const chunk of parts) {
            if (chunk.startsWith('data: ')) {
              const token = chunk.slice(6)
              fullResponse += token
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
            } else if (chunk.startsWith('event: end')) {
              // Response complete
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
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    try {
      setLoading(true)
      setError(null)
      setMessages([])
      stopListening()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Messages Area - ChatGPT style */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-6 min-w-0" aria-live="polite" style={{ maxWidth: '100%', wordWrap: 'break-word' }}>
        {messages.length === 0 && !loading && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">How can I help you today?</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'What supplements should I take?',
                'How are my medications interacting?',
                'Why am I feeling tired?',
                'What should I eat today?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-sm text-gray-700 transition-colors"
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-4 max-w-3xl mx-auto ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              {m.role === 'user' ? (
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              )}
            </div>
            <div className={`flex-1 min-w-0 ${m.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block max-w-full px-4 py-2.5 rounded-2xl ${
                m.role === 'user' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-900'
              }`} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                <div className="text-lg leading-relaxed break-words" style={{ whiteSpace: 'pre-wrap' }}>
                  {m.content.split('\n').map((line, idx) => {
                    const trimmed = line.trim()
                    if (!trimmed) {
                      return <div key={idx} className="h-3" />
                    }
                    
                    if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
                      return (
                        <div key={idx} className="font-bold text-gray-900 mb-2 mt-3 first:mt-0">
                          {trimmed.slice(2, -2)}
                        </div>
                      )
                    }
                    
                    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                    if (numberedMatch) {
                      return (
                        <div key={idx} className="ml-4 mb-1.5">
                          <span className="font-medium">{numberedMatch[1]}.</span> {numberedMatch[2]}
                        </div>
                      )
                    }
                    
                    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/)
                    if (bulletMatch) {
                      return (
                        <div key={idx} className="ml-4 mb-1.5">
                          <span className="mr-2">•</span> {bulletMatch[1]}
                        </div>
                      )
                    }
                    
                    const parts = trimmed.split(/(\*\*.*?\*\*)/g)
                    return (
                      <div key={idx} className="mb-2">
                        {parts.map((part, j) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                          }
                          return <span key={j}>{part}</span>
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4 max-w-3xl mx-auto">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="inline-block px-4 py-2.5 rounded-2xl bg-gray-100">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area - ChatGPT style */}
      <div className="border-t border-gray-200 bg-white">
        {error && (
          <div className="px-4 py-2 text-sm text-red-600 bg-red-50">{error}</div>
        )}
        <form className="px-4 py-3" onSubmit={handleSubmit}>
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            {recognitionRef.current && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={loading}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
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
            <div className="flex-1 relative flex items-center min-w-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value)
                  resizeTextarea()
                }}
                onKeyDown={onComposerKeyDown}
                placeholder="Ask anything"
                rows={1}
                className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 pr-12 text-base leading-6 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 resize-none transition-all duration-200 min-h-[52px] max-h-[200px]"
                style={{ height: '52px' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim() || isListening}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

