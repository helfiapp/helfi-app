'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

// GUARD RAIL: Notification inbox UI behavior is locked. Do not change without owner approval.

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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'unread').length,
    [items]
  )

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items, selectedIds]
  )

  const selectedCount = selectedIds.length

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

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)))
  }, [items])

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]))
  }

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(items.map((item) => item.id))
    }
  }

  const deleteSelected = async () => {
    if (deleting || selectedIds.length === 0) return
    const ok = window.confirm('Delete selected notifications?')
    if (!ok) return
    setDeleting(true)
    try {
      await fetch('/api/notifications/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_selected', ids: selectedIds }),
      }).catch(() => {})
      await loadInbox()
      setSelectedIds([])
      try {
        window.dispatchEvent(new Event('notifications:refresh'))
      } catch {
        // ignore
      }
    } finally {
      setDeleting(false)
    }
  }

  const deleteAll = async () => {
    if (deleting || items.length === 0) return
    const ok = window.confirm('Delete all notifications?')
    if (!ok) return
    setDeleting(true)
    try {
      await fetch('/api/notifications/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_all' }),
      }).catch(() => {})
      await loadInbox()
      setSelectedIds([])
      try {
        window.dispatchEvent(new Event('notifications:refresh'))
      } catch {
        // ignore
      }
    } finally {
      setDeleting(false)
    }
  }

  const deleteOne = async (id: string) => {
    if (!id || deleting) return
    const ok = window.confirm('Delete this notification?')
    if (!ok) return
    setDeleting(true)
    try {
      await fetch('/api/notifications/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_selected', ids: [id] }),
      }).catch(() => {})
      await loadInbox()
      try {
        window.dispatchEvent(new Event('notifications:refresh'))
      } catch {
        // ignore
      }
    } finally {
      setDeleting(false)
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
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notification inbox</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Missed a pop-up? It will show here so you can open it later.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleSelectAll}
                disabled={items.length === 0}
                className={`text-sm font-semibold whitespace-nowrap ${
                  items.length === 0
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                }`}
              >
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
              <button
                onClick={deleteSelected}
                disabled={selectedCount === 0 || deleting}
                className={`text-sm font-semibold whitespace-nowrap ${
                  selectedCount === 0 || deleting
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-red-600 hover:text-red-700'
                }`}
              >
                Delete selected
              </button>
              <button
                onClick={deleteAll}
                disabled={items.length === 0 || deleting}
                className={`text-sm font-semibold whitespace-nowrap ${
                  items.length === 0 || deleting
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-red-600 hover:text-red-700'
                }`}
              >
                Delete all
              </button>
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
            {selectedCount > 0 && (
              <span className="ml-3 text-gray-600 dark:text-gray-300">
                Selected: <span className="font-semibold">{selectedCount}</span>
              </span>
            )}
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
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-helfi-green focus:ring-helfi-green/30"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        aria-label="Select notification"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{item.title}</p>
                        {item.body && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.body}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteOne(item.id)}
                      disabled={deleting}
                      className={`text-sm font-semibold ${
                        deleting ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-700'
                      }`}
                    >
                      Delete
                    </button>
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
