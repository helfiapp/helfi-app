import { API_BASE_URL } from '../config'
import { getSessionToken } from './session'

export async function fetchAuthed(path: string, init?: RequestInit): Promise<Response> {
  const token = await getSessionToken()
  const headers = new Headers(init?.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

