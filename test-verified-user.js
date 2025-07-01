const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function createVerifiedUser() {
  try {
    console.log('🔧 Creating verified test user...')
    
    // Delete existing test user if exists
    await prisma.user.deleteMany({
      where: { email: 'verified-test@helfi.ai' }
    })
    
    // Create verified user
    const verifiedUser = await prisma.user.create({
      data: {
        email: 'verified-test@helfi.ai',
        name: 'Verified Test User',
        emailVerified: new Date(), // This makes the user verified
      }
    })
    
    console.log('✅ Verified user created:', {
      id: verifiedUser.id,
      email: verifiedUser.email,
      name: verifiedUser.name,
      emailVerified: verifiedUser.emailVerified
    })
    
  } catch (error) {
    console.error('❌ Error creating verified user:', error)
  } finally {
    await prisma.$disconnect()
  }
}

createVerifiedUser() 