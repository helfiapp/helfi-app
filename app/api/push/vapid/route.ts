import { NextResponse } from 'next/server'
 
// Return only the configured VAPID public key.
// If it's missing, return an empty key so the client can surface a clear error.
export async function GET() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  return NextResponse.json({ publicKey: pub })
}
 
 
