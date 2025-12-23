'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import MoodTabs from '@/components/mood/MoodTabs'
import InsightsBottomNav from '@/app/insights/InsightsBottomNav'

export const dynamic = 'force-dynamic'

type JournalEntry = {
  id: string
  localDate: string
  title: string
  content: string
  images: any
  createdAt: string
}

function asDateString(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateLabel(localDate: string) {
  const today = asDateString(new Date())
  const yesterday = asDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))
  if (localDate === today) return 'Today'
  if (localDate === yesterday) return 'Yesterday'
  const d = new Date(`${localDate}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeImages(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string' && item.trim())
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && item.trim())
      }
    } catch {}
  }
  return []
}

export default function MoodJournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [localDate, setLocalDate] = useState(asDateString(new Date()))
  const [contentHtml, setContentHtml] = useState('')
  const [images, setImages] = useState<string[]>([])

  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mood/journal/entries?limit=30', { cache: 'no-store' as any })
      if (!res.ok) throw new Error('Failed to load journal')
      const data = await res.json()
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load journal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [])

  const handleCommand = (command: string) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    document.execCommand(command)
    setContentHtml(el.innerHTML)
  }

  const handleImagePick = () => {
    fileInputRef.current?.click()
  }

  const handleImages = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const uploads = Array.from(files).slice(0, 6)
      for (const file of uploads) {
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch('/api/mood/journal/upload', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const msg = await res.json().catch(() => null)
          throw new Error(msg?.error || 'Upload failed')
        }
        const data = await res.json()
        if (data?.url) {
          setImages((prev) => [...prev, data.url])
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to upload image')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    const content = editorRef.current?.innerHTML?.trim() || ''
    if (!title.trim() && !content && images.length === 0) {
      setError('Add a title, some text, or a photo first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/mood/journal/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, images, localDate }),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        throw new Error(msg?.error || 'Failed to save entry')
      }
      setTitle('')
      setContentHtml('')
      setImages([])
      if (editorRef.current) editorRef.current.innerHTML = ''
      setNotice('Journal entry saved.')
      setTimeout(() => setNotice(null), 2000)
      loadEntries()
    } catch (e: any) {
      setError(e?.message || 'Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  const visibleEntries = useMemo(() => entries, [entries])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Mood" backHref="/mood" />
      <MoodTabs />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {notice && (
          <div className="rounded-xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Journal</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Write it out, add photos, and keep the story of your day.</p>
            </div>
            <input
              type="date"
              value={localDate}
              onChange={(e) => setLocalDate(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200"
            />
          </div>

          <input
            type="text"
            placeholder="Entry title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-helfi-green/10"
          />

          <div className="flex flex-wrap gap-2">
            {([
              { cmd: 'bold', label: 'B' },
              { cmd: 'italic', label: 'I' },
              { cmd: 'underline', label: 'U' },
              { cmd: 'insertUnorderedList', label: 'Bullet list' },
              { cmd: 'insertOrderedList', label: '1. List' },
            ] as const).map((btn) => (
              <button
                key={btn.cmd}
                type="button"
                onClick={() => handleCommand(btn.cmd)}
                className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-200"
              >
                {btn.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleImagePick}
              className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-semibold text-helfi-green"
            >
              {uploading ? 'Uploading...' : 'Add photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => handleImages(e.target.files)}
              className="hidden"
            />
          </div>

          <div className="relative rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 min-h-[180px]">
            {!contentHtml && (
              <div className="pointer-events-none absolute left-4 top-3 text-sm text-gray-400">Start writing...</div>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => setContentHtml(editorRef.current?.innerHTML || '')}
              className="min-h-[140px] text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
            />
          </div>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {images.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="Journal" className="h-20 w-20 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((item) => item !== url))}
                    className="absolute -top-2 -right-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full p-1 text-xs"
                    aria-label="Remove"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-helfi-green text-white text-sm font-semibold py-3 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save entry'}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent journal entries</h3>
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              Loading journal entries...
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 px-4 py-6 text-sm">
              No journal entries yet.
            </div>
          ) : (
            visibleEntries.map((entry) => {
              const entryImages = normalizeImages(entry.images)
              const preview = stripHtml(entry.content || '').slice(0, 140)
              const createdAt = entry.createdAt ? new Date(entry.createdAt) : null
              const time = createdAt ? createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
              return (
                <div key={entry.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDateLabel(entry.localDate)}</span>
                    <span>{time}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {entry.title || 'Untitled entry'}
                  </div>
                  {preview && (
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {preview}
                    </div>
                  )}
                  {entryImages.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entryImages.slice(0, 4).map((url: string) => (
                        <img key={url} src={url} alt="Journal" className="h-16 w-16 rounded-xl object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </main>

      <InsightsBottomNav />
    </div>
  )
}
