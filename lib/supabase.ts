import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// For client-side usage
export function createSupabaseClient() {
  return createBrowserClient(
    'https://slhpcwsoulwqlxcpwxbg.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaHBjd3NvdWx3cWx4Y3B3eGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5ODcwNjksImV4cCI6MjA2NTU2MzA2OX0.o7PYETNlZlaVzeD5sFCwq3YkTUHd5jZCRlxauLR0Rzs'
  )
}

// For server components
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  
  return createServerClient(
    'https://slhpcwsoulwqlxcpwxbg.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaHBjd3NvdWx3cWx4Y3B3eGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5ODcwNjksImV4cCI6MjA2NTU2MzA2OX0.o7PYETNlZlaVzeD5sFCwq3YkTUHd5jZCRlxauLR0Rzs',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
} 