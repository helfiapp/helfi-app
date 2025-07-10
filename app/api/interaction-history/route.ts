import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch user's interaction analyses, ordered by most recent first
    const analyses = await prisma.interactionAnalysis.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        analysisName: true,
        overallRisk: true,
        supplementCount: true,
        medicationCount: true,
        createdAt: true,
        analysisData: true, // Include the full analysis data
        supplementsAnalyzed: true,
        medicationsAnalyzed: true,
      }
    });

    return NextResponse.json({ 
      success: true, 
      analyses 
    });

  } catch (error) {
    console.error('Error fetching interaction history:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch interaction history',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete all analyses for the user
    const deletedCount = await prisma.interactionAnalysis.deleteMany({
      where: { userId: user.id }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Deleted ${deletedCount.count} analyses`,
      deletedCount: deletedCount.count
    });

  } catch (error) {
    console.error('Error deleting interaction history:', error);
    return NextResponse.json({ 
      error: 'Failed to delete interaction history',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 