type NativeAuthIdentity = {
  token: string
  expiresAt: number
  user: { id: string }
}

let currentSession: NativeAuthIdentity | null = null

export function setCurrentNativeAuthSession(session: NativeAuthIdentity | null) {
  currentSession = session ? { token: session.token, expiresAt: session.expiresAt, user: { id: session.user.id } } : null
}

export function getCurrentNativeAuthSession() {
  if (!currentSession?.token || !currentSession.user.id || !Number.isFinite(currentSession.expiresAt) || currentSession.expiresAt <= Date.now()) return null
  return currentSession
}
