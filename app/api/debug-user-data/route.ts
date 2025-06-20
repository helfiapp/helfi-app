import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    console.log('=== DEBUG USER DATA ===')
    
    // Look up user data for the test email
    const user = await prisma.user.findUnique({
      where: { email: "info@sonicweb.com.au" },
      include: {
        sessions: {
          orderBy: { expires: 'desc' },
          take: 2
        },
        supplements: true,
        medications: true,
        healthGoals: true
      }
    })
    
    if (!user) {
      return NextResponse.json({
        error: 'User not found',
        email: 'info@sonicweb.com.au'
      })
    }
    
    console.log('User found:', user.email)
    console.log('User has:', {
      supplements: user.supplements.length,
      medications: user.medications.length,
      healthGoals: user.healthGoals.length
    })
    
    return NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        // Basic profile info
        gender: user.gender,
        weight: user.weight,
        height: user.height,
        bodyType: user.bodyType,
        exerciseFrequency: user.exerciseFrequency,
        exerciseTypes: user.exerciseTypes,
        // Related data counts
        supplementsCount: user.supplements.length,
        medicationsCount: user.medications.length,
        healthGoalsCount: user.healthGoals.length,
        activeSessions: user.sessions.length,
        // Actual data
        supplements: user.supplements.map(s => ({
          name: s.name,
          dosage: s.dosage,
          timing: s.timing,
          createdAt: s.createdAt
        })),
        medications: user.medications.map(m => ({
          name: m.name,
          dosage: m.dosage,
          timing: m.timing,
          createdAt: m.createdAt
        })),
        healthGoals: user.healthGoals.map(g => ({
          name: g.name,
          category: g.category,
          currentRating: g.currentRating,
          createdAt: g.createdAt
        })),
        sessions: user.sessions.map(s => ({
          token: s.sessionToken.substring(0, 10) + '...',
          expires: s.expires,
          expired: s.expires < new Date()
        }))
      },
      debug: {
        lastUpdated: user.updatedAt,
        hasBasicInfo: !!(user.gender && user.weight && user.height),
        hasExerciseInfo: !!(user.exerciseFrequency && user.exerciseTypes.length > 0)
      }
    })
    
  } catch (error) {
    console.error('Error debugging user data:', error)
    return NextResponse.json({
      error: 'Failed to debug user data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 