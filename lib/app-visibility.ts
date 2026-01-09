const APP_HIDDEN_AT_KEY = 'helfi:appHiddenAt'

export const markAppHidden = () => {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(APP_HIDDEN_AT_KEY, String(Date.now()))
  } catch {
    // Best effort only.
  }
}

export const readAppHiddenAt = (): number => {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.sessionStorage.getItem(APP_HIDDEN_AT_KEY)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}
