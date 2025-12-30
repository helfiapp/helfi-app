import { useEffect, useRef } from 'react'

export function useSaveOnLeave(onSave: () => void) {
  const saveRef = useRef(onSave)

  useEffect(() => {
    saveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    const handler = () => {
      try {
        saveRef.current()
      } catch {
        // Ignore failures during unload.
      }
    }

    window.addEventListener('pagehide', handler)
    window.addEventListener('beforeunload', handler)

    return () => {
      window.removeEventListener('pagehide', handler)
      window.removeEventListener('beforeunload', handler)
      handler()
    }
  }, [])
}
