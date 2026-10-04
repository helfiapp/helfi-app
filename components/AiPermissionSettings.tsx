'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import AiConsentModal, { hasSavedAiConsent, setAiConsent } from './AiConsentModal'

export default function AiPermissionSettings() {
  const { data: session } = useSession()
  const [allowed, setAllowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => { void hasSavedAiConsent().then(value => { if (active) setAllowed(value) }) }
    refresh()
    window.addEventListener('helfi:ai-consent-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('helfi:ai-consent-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [session?.user?.id])
  const save = async (value: boolean) => {
    if (busy) return
    setBusy(true); setError('')
    try { await setAiConsent(value); setAllowed(value); setOpen(false) }
    catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-2">
    <h3 className="font-medium text-gray-900 dark:text-white">AI help permission</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400">{allowed ? 'Allowed. Withdraw to stop future sharing with OpenAI, including weekly AI reports.' : 'Off. Ordinary food, water, mood and device tracking still work.'}</p>
    <button type="button" disabled={busy} onClick={() => allowed ? void save(false) : setOpen(true)} className="rounded-lg border px-4 py-2 text-sm font-semibold text-helfi-green disabled:opacity-50">{busy ? 'Saving…' : allowed ? 'Withdraw AI permission' : 'Review AI permission'}</button>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <AiConsentModal open={open} onAgree={() => void save(true)} onCancel={() => setOpen(false)} />
  </div>
}
