import { NextRequest } from 'next/server'
import { handleNativeAssistantRequest, readNativeAssistantSnapshot } from '@/lib/native-assistant-app'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) { return handleNativeAssistantRequest(request) }
export async function GET(request: NextRequest) { return readNativeAssistantSnapshot(request) }
