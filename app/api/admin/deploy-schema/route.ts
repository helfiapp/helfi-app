import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    // Basic security check - only allow with admin token
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.includes('temp-admin-token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🚀 Starting database schema deployment...')
    
    // Generate Prisma client first
    console.log('📦 Generating Prisma client...')
    const generateResult = await execAsync('npx prisma generate')
    console.log('✅ Prisma client generated:', generateResult.stdout)

    // Deploy schema to database
    console.log('🔧 Deploying schema to production database...')
    const pushResult = await execAsync('npx prisma db push --accept-data-loss')
    console.log('✅ Schema deployed successfully:', pushResult.stdout)

    return NextResponse.json({
      success: true,
      message: 'Database schema deployed successfully!',
      details: {
        generate: generateResult.stdout,
        push: pushResult.stdout
      }
    })

  } catch (error: any) {
    console.error('❌ Database deployment error:', error)
    return NextResponse.json({
      success: false,
      error: 'Database deployment failed',
      details: error.message
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Database schema deployment endpoint. Use POST with admin authentication.',
    status: 'Ready to deploy schema'
  })
} 