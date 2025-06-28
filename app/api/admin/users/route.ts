import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Simple authentication check
    const authHeader = request.headers.get('authorization')
    if (authHeader !== 'Bearer HelfiAdmin2024') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user statistics
    const totalUsers = await prisma.user.count()
    
    const usersWithProfiles = await prisma.user.count({
      where: {
        OR: [
          { name: { not: null } },
          { gender: { not: null } },
          { weight: { not: null } },
          { height: { not: null } }
        ]
      }
    })

    const usersWithGoals = await prisma.user.count({
      where: {
        healthGoals: {
          some: {}
        }
      }
    })

    const usersWithSupplements = await prisma.user.count({
      where: {
        supplements: {
          some: {}
        }
      }
    })

    const usersWithMedications = await prisma.user.count({
      where: {
        medications: {
          some: {}
        }
      }
    })

    const usersWithFoodLogs = await prisma.user.count({
      where: {
        foodLogs: {
          some: {}
        }
      }
    })

    // Get recent signups (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const recentSignups = await prisma.user.count({
      where: {
        createdAt: {
          gte: thirtyDaysAgo
        }
      }
    })

    // Get users by gender breakdown
    const genderStats = await prisma.user.groupBy({
      by: ['gender'],
      _count: {
        gender: true
      }
    })

    // Get recent users (last 10)
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        gender: true,
        _count: {
          select: {
            healthGoals: true,
            supplements: true,
            medications: true,
            foodLogs: true
          }
        }
      }
    })

    const stats = {
      totalUsers,
      usersWithProfiles,
      usersWithGoals,
      usersWithSupplements,
      usersWithMedications,
      usersWithFoodLogs,
      recentSignups,
      genderStats,
      recentUsers,
      completionRate: totalUsers > 0 ? Math.round((usersWithProfiles / totalUsers) * 100) : 0
    }

    return NextResponse.json(stats)

  } catch (error) {
    console.error('Error fetching user stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user stats' },
      { status: 500 }
    )
  }
} 