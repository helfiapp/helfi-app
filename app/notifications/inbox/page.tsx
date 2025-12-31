'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

type InboxItem = {
  id: string
  title: string
  body: string | null
  url: string | null
  status: 'read' | 'unread'
  createdAt: string
}

export default function NotificationInboxPage() {
  const router = useRouter()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'unread').length,
    [items]
  )

  const loadInbox = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/notifications/inbox?limit=50', { cache: 'no-store' as any })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      const list = Array.isArray(data?.items) ? data.items : []
      setItems(list)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInbox()
  }, [])

  const markRead = async (id: string) => {
    if (!id) return
    await fetch('/api/notifications/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', id }),
    }).catch(() => {})
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'read' } : item)))
    try {
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      // ignore
    }
  }

  const markAllRead = async () => {
    if (busy) return
    setBusy(true)
    await fetch('/api/notifications/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    }).catch(() => {})
    setItems((prev) => prev.map((item) => ({ ...item, status: 'read' })))
    try {
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      // ignore
    }
    setBusy(false)
  }

  const handleOpen = async (item: InboxItem) => {
    if (item.status === 'unread') {
      await markRead(item.id)
    }
    if (item.url) {
      router.push(item.url)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Notifications" backHref="/notifications" />

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notification inbox</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Missed a pop-up? It will show here so you can open it later.
              </p>
            </div>
            <button
              onClick={markAllRead}
              disabled={busy || unreadCount === 0}
              className={`text-sm font-semibold ${
                busy || unreadCount === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-helfi-green hover:text-helfi-green/80'
              }`}
            >
              Mark all as read
            </button>
          </div>

          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Unread: <span className="font-semibold text-gray-900 dark:text-white">{unreadCount}</span>
          </div>

          {loading ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">Loading notifications…</div>
          ) : items.length === 0 ? (
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              No notifications yet. When new alerts arrive, they will show up here.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    item.status === 'unread'
                      ? 'border-helfi-green/40 bg-helfi-green/5'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{item.title}</p>
                      {item.body && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.body}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {item.status === 'unread' && (
                      <span className="mt-1 h-2 w-2 rounded-full bg-helfi-green" />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.url && (
                      <button
                        onClick={() => handleOpen(item)}
                        className="text-sm font-semibold text-helfi-green hover:text-helfi-green/80"
                      >
                        Open
                      </button>
                    )}
                    {item.status === 'unread' && (
                      <button
                        onClick={() => markRead(item.id)}
                        className="text-sm font-semibold text-gray-600 hover:text-gray-800"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
