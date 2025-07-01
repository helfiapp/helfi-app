const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function debugSignin() {
  try {
    console.log('🔍 Starting signin debug...')
    
    // Check if test user exists
    console.log('📋 Checking for test user...')
    const testUser = await prisma.user.findUnique({
      where: { email: 'test-agent39@helfi.ai' }
    })
    
    if (testUser) {
      console.log('✅ Test user found:', {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        emailVerified: testUser.emailVerified,
        createdAt: testUser.createdAt
      })
      
      // Test the session callback logic
      console.log('🧪 Testing session callback logic...')
      const sessionUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      })
      
      if (sessionUser) {
        console.log('✅ Session lookup successful')
      } else {
        console.log('❌ Session lookup failed')
      }
      
    } else {
      console.log('❌ Test user not found')
      
      // Check what users exist
      console.log('📋 Checking existing users...')
      const users = await prisma.user.findMany({
        select: { id: true, email: true, emailVerified: true },
        take: 5
      })
      console.log('Existing users:', users)
    }
    
    // Test database connection
    console.log('🔌 Testing database connection...')
    const userCount = await prisma.user.count()
    console.log(`✅ Database connected. Total users: ${userCount}`)
    
  } catch (error) {
    console.error('❌ Debug error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugSignin() 