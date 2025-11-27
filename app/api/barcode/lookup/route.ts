import { NextRequest, NextResponse } from 'next/server'

// Stub barcode lookup endpoint. In future we can integrate Open Food Facts or a paid DB.
// For now, it returns 404 so UI can fall back to OCR/AI.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').trim()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  return NextResponse.json({ found: false }, { status: 404 })
}


