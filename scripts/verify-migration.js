#!/usr/bin/env node

/**
 * Quick script to verify the stripeSubscriptionId column was added
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function verify() {
  try {
    // Try to query the column - if it exists, this will work
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Subscription' 
      AND column_name = 'stripeSubscriptionId'
    `
    
    if (result && result.length > 0) {
      console.log('✅ Migration successful! Column "stripeSubscriptionId" exists in Subscription table.')
      console.log('Column details:', result[0])
    } else {
      console.log('❌ Column not found. Migration may have failed.')
    }
  } catch (error) {
    console.error('Error verifying migration:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

verify()

