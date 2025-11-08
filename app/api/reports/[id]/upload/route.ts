/**
 * API Route: POST /api/reports/[id]/upload
 * Handles direct file upload to Vercel Blob
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
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

    // Get file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(report.s3Key, file, {
      access: 'private', // Private access - only accessible via API
      addRandomSuffix: false, // Use our custom path
    });

    // Update report with blob URL and pathname
    await prisma.report.update({
      where: { id: reportId },
      data: {
        s3Key: blob.pathname, // Store blob pathname for deletion
        // Store blob URL in metadata for retrieval
        metadata: {
          blobUrl: blob.url,
          blobPathname: blob.pathname,
        },
      },
    });

    await createAuditEvent({
      reportId,
      userId: user.id,
      eventType: AuditEventType.PDF_UPLOADED,
      eventDescription: 'PDF file uploaded to Vercel Blob',
      metadata: {
        blobUrl: blob.url,
        blobPath: blob.pathname,
      },
    });

    return NextResponse.json({
      success: true,
      reportId: report.id,
      blobUrl: blob.url,
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

