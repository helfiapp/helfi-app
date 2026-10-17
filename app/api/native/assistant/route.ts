import { NextRequest } from 'next/server'
import { handleNativeAssistantRequest } from '@/lib/native-assistant-app'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) { return handleNativeAssistantRequest(request) }
