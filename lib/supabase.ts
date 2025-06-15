import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// For client-side usage
export function createSupabaseClient() {
  return createBrowserClient(
    'https://scxduglaqerhsgvpdsxy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjeGR1cWxhZ2VyaHNndnBkc3h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzI1MjMsImV4cCI6MjA2NTU0ODUyM30.s5eEl3Fj_041vSkLgPIoz1LOyug0io_uPjV56JuXjA0'
  )
}

// For server components
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  
  return createServerClient(
    'https://scxduglaqerhsgvpdsxy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjeGR1cWxhZ2VyaHNndnBkc3h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzI1MjMsImV4cCI6MjA2NTU0ODUyM30.s5eEl3Fj_041vSkLgPIoz1LOyug0io_uPjV56JuXjA0',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
} 