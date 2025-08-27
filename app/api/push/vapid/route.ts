import { NextResponse } from 'next/server'

// Safe to expose: VAPID public key (no secret)
const FALLBACK_PUBLIC_KEY = 'BNEzs3dtRnQc555-9RGcLDt9XbH8PL6lgCFzeU4AReZMBF7zbiNCyWkr3ouz777DIjiJbXapj3s4_5xywJzjm1M'

export async function GET() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || FALLBACK_PUBLIC_KEY
  return NextResponse.json({ publicKey: pub })
}


