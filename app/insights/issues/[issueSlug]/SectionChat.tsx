'use client'

import { FormEvent, useState } from 'react'

interface SectionChatProps {
  issueSlug: string
  section: string
  issueName: string
}

export default function SectionChat({ issueSlug, section, issueName }: SectionChatProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) {
      setError('Enter a question to ask the AI.')
      return
    }
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/insights/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section,
          question: `${question.trim()} (Issue: ${issueName || issueSlug})`,
        }),
      })
      if (!response.ok) {
        throw new Error('Unable to fetch AI response right now.')
      }
      const data = await response.json()
      setAnswer(typeof data?.answer === 'string' ? data.answer : 'No response available yet.')
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
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
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
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap min-h-[160px] transition-colors">
        {loading ? (
          <span className="text-gray-500">Generating answer…</span>
        ) : answer ? (
          answer
        ) : (
          <span className="text-gray-400">Your AI guidance will appear here after you ask a question.</span>
        )}
      </div>
    </section>
  )
}
