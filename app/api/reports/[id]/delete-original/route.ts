/**
 * API Route: POST /api/reports/[id]/delete-original
 * Securely deletes the original PDF from Vercel Blob if user opts to remove it
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { del } from '@vercel/blob';
import { createAuditEvent } from '@/lib/audit';
import { AuditEventType } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const reportId = params.id;

    // Get report
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Verify ownership
    if (report.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if already deleted
    if (report.originalDeletedAt) {
      return NextResponse.json(
        { error: 'Original PDF already deleted' },
        { status: 400 }
      );
    }

    // Delete from Vercel Blob
    try {
      await del(report.s3Key); // s3Key field stores the blob path
    } catch (deleteError) {
      console.error('Failed to delete blob:', deleteError);
      // Continue - blob might already be deleted
    }

    // Update report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        originalDeletedAt: new Date(),
        retainOriginal: false,
      },
    });

    // Log audit event
    await createAuditEvent({
      reportId,
      userId: user.id,
      eventType: AuditEventType.ORIGINAL_DELETED,
      eventDescription: 'User requested deletion of original PDF',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Original PDF deleted successfully',
    });
  } catch (error) {
    console.error('❌ Delete original PDF error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete original PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
