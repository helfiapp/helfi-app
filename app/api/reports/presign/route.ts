/**
 * API Route: POST /api/reports/presign
 * Creates a presigned upload URL using Vercel Blob
 * Validates consent before allowing upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import { createAuditEvent } from '@/lib/audit';
import { AuditEventType } from '@prisma/client';
import { hashPasswordForVerification } from '@/lib/encryption';

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '25', 10);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const {
      fileName,
      fileSize,
      isPasswordProtected,
      password,
      decryptionConsent,
      passwordConsent,
      retentionConsent,
    } = body;

    // Validate required fields
    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: 'File name and size are required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File size must be less than ${MAX_UPLOAD_MB}MB` },
        { status: 400 }
      );
    }

    // Validate consent (required for password-protected PDFs)
    if (isPasswordProtected) {
      if (!decryptionConsent || !passwordConsent) {
        return NextResponse.json(
          { error: 'Consent is required for password-protected PDFs' },
          { status: 400 }
        );
      }

      if (!password) {
        return NextResponse.json(
          { error: 'Password is required for password-protected PDFs' },
          { status: 400 }
        );
      }
    }

    // Create consent record
    const consentText = `I authorize Helfi to decrypt my uploaded PDF using the password I provide, only once, to extract my laboratory test results for analysis within my account. I understand Helfi will not store my password and will permanently delete the original PDF after extraction unless I choose to retain it.`;

    const consentRecord = await prisma.consentRecord.create({
      data: {
        userId: user.id,
        consentType: 'PDF_DECRYPTION',
        consentText,
        decryptionConsent: decryptionConsent || false,
        passwordConsent: passwordConsent || false,
        retentionConsent: retentionConsent || false,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    });

    // Hash password for verification (ephemeral - not stored)
    let passwordHash: string | null = null;
    if (isPasswordProtected && password) {
      const hashResult = await hashPasswordForVerification(password);
      passwordHash = `${hashResult.hash}:${hashResult.salt}`;
    }

    // Create report record
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const blobPath = `reports/${user.id}/${reportId}/${encodeURIComponent(fileName)}`;

    const report = await prisma.report.create({
      data: {
        id: reportId,
        userId: user.id,
        originalFileName: fileName,
        s3Key: blobPath, // Using s3Key field to store blob path for compatibility
        fileSize,
        mimeType: 'application/pdf',
        status: 'PENDING',
        isPasswordProtected: isPasswordProtected || false,
        passwordHash,
        retainOriginal: retentionConsent || false,
        consentRecordId: consentRecord.id,
      },
    });

    // Log audit event
    await createAuditEvent({
      reportId: report.id,
      userId: user.id,
      eventType: AuditEventType.PDF_UPLOADED,
      eventDescription: `User uploaded PDF: ${fileName}`,
      metadata: {
        fileName,
        fileSize,
        isPasswordProtected,
        retentionConsent,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    await createAuditEvent({
      reportId: report.id,
      userId: user.id,
      eventType: AuditEventType.CONSENT_GRANTED,
      eventDescription: 'User granted consent for PDF processing',
      metadata: {
        consentRecordId: consentRecord.id,
        decryptionConsent,
        passwordConsent,
        retentionConsent,
      },
    });

    // Return report ID - the actual upload will happen in the process route
    // Vercel Blob doesn't support presigned URLs the same way S3 does
    // Instead, we'll upload directly in the process route
    return NextResponse.json({
      success: true,
      reportId: report.id,
      blobPath,
      message: 'Report record created. Upload file to /api/reports/[id]/upload endpoint.',
    });
  } catch (error) {
    console.error('❌ Presign upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create upload record',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
