import { createBrowserClient } from '@supabase/ssr'

// For client-side usage only
export function createSupabaseClient() {
  return createBrowserClient(
    'https://scxduglaqerhsgvpdsxy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjeGR1cWxhZ2VyaHNndnBkc3h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzI1MjMsImV4cCI6MjA2NTU0ODUyM30.s5eEl3Fj_041vSkLgPIoz1LOyug0io_uPjV56JuXjA0'
  )
} 