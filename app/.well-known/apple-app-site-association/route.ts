import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: 'Z54KD5Q94J.ai.helfi.app',
          paths: ['/r/*', '/affiliate', '/affiliate/*'],
        },
      ],
    },
  })
}
