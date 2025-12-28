/**
 * API Route: POST /api/reports/[id]/process
 * Processes uploaded PDF: decrypts, extracts lab values, encrypts data
 * Password is provided in request body (ephemeral, not stored)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { del, head } from '@vercel/blob';
import { processPDF } from '@/lib/pdf-processor';
import { encryptFieldsBatch, verifyPasswordHash } from '@/lib/encryption';
import { decryptBuffer } from '@/lib/file-encryption';
import { createAuditEvent } from '@/lib/audit';
import { AuditEventType, ReportStatus } from '@prisma/client';

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
      include: { consentRecord: true },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Verify ownership
    if (report.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if already processed
    if (report.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Report already processed' },
        { status: 400 }
      );
    }

    // Verify consent
    if (!report.consentRecord.decryptionConsent || !report.consentRecord.passwordConsent) {
      return NextResponse.json(
        { error: 'Consent not granted' },
        { status: 403 }
      );
    }

    // Parse request body for password
    const body = await request.json();
    const password = body.password;

    // Verify password if PDF is password-protected
    if (report.isPasswordProtected) {
      if (!password) {
        return NextResponse.json(
          { error: 'Password is required' },
          { status: 400 }
        );
      }

      // Verify password hash
      if (report.passwordHash) {
        const [hashHex, saltHex] = report.passwordHash.split(':');
        const isValid = await verifyPasswordHash(password, hashHex, saltHex);
        
        if (!isValid) {
          await prisma.report.update({
            where: { id: reportId },
            data: {
              status: 'DECRYPTION_FAILED',
              processingError: 'Password verification failed',
            },
          });

          await createAuditEvent({
            reportId,
            userId: user.id,
            eventType: AuditEventType.PDF_PROCESSING_FAILED,
            eventDescription: 'PDF decryption failed: incorrect password',
          });

          return NextResponse.json(
            { error: 'Incorrect password' },
            { status: 401 }
          );
        }
      }
    }

    // Update status to PROCESSING
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });

    await createAuditEvent({
      reportId,
      userId: user.id,
      eventType: AuditEventType.PDF_PROCESSING_STARTED,
      eventDescription: 'PDF processing started',
    });

    try {
      // Download PDF from Vercel Blob
      // Get blob info using head function (more reliable than constructing URL)
      const blobInfo = await head(report.s3Key);
      
      if (!blobInfo) {
        throw new Error('Blob not found');
      }

      // Fetch PDF from blob URL
      const blobResponse = await fetch(blobInfo.url, {
        headers: {
          'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        },
      });

      if (!blobResponse.ok) {
        throw new Error(`Failed to fetch PDF from blob: ${blobResponse.statusText}`);
      }

      let pdfBuffer = Buffer.from(await blobResponse.arrayBuffer());
      const reportMeta = (report.metadata || {}) as any;
      if (reportMeta?.encrypted === true) {
        pdfBuffer = decryptBuffer(pdfBuffer, reportMeta?.encryption?.iv, reportMeta?.encryption?.tag);
      }

      // Process PDF
      const processingResult = await processPDF(
        pdfBuffer,
        report.isPasswordProtected ? password : undefined
      );

      await createAuditEvent({
        reportId,
        userId: user.id,
        eventType: AuditEventType.PDF_DECRYPTED,
        eventDescription: 'PDF successfully decrypted',
        metadata: {
          pageCount: processingResult.pageCount,
          labValueCount: processingResult.labValues.length,
        },
      });

      // Encrypt lab values
      const labResults = [];
      for (const labValue of processingResult.labValues) {
        const fields: Record<string, string> = {
          analyteName: labValue.analyteName,
          value: labValue.value,
        };

        if (labValue.unit) fields.unit = labValue.unit;
        if (labValue.referenceRange) fields.referenceRange = labValue.referenceRange;
        if (labValue.collectionDate) fields.collectionDate = labValue.collectionDate;
        if (labValue.accessionNumber) fields.accessionNumber = labValue.accessionNumber;
        if (labValue.laboratoryName) fields.laboratoryName = labValue.laboratoryName;

        const { encryptedFields, wrappedKey } = await encryptFieldsBatch(fields);

        const labResult = await prisma.labResult.create({
          data: {
            reportId: report.id,
            analyteNameEncrypted: encryptedFields.analyteName || '',
            valueEncrypted: encryptedFields.value || '',
            unitEncrypted: encryptedFields.unit || null,
            referenceRangeEncrypted: encryptedFields.referenceRange || null,
            collectionDateEncrypted: encryptedFields.collectionDate || null,
            accessionNumberEncrypted: encryptedFields.accessionNumber || null,
            laboratoryNameEncrypted: encryptedFields.laboratoryName || null,
            dataKeyEncrypted: wrappedKey,
          },
        });

        labResults.push(labResult);
      }

      await createAuditEvent({
        reportId,
        userId: user.id,
        eventType: AuditEventType.LAB_DATA_EXTRACTED,
        eventDescription: `Extracted ${labResults.length} lab values from PDF`,
        metadata: {
          labValueCount: labResults.length,
        },
      });

      await createAuditEvent({
        reportId,
        userId: user.id,
        eventType: AuditEventType.LAB_DATA_ENCRYPTED,
        eventDescription: 'Lab values encrypted and stored',
        metadata: {
          labValueCount: labResults.length,
        },
      });

      // Delete original PDF if user didn't consent to retention
      if (!report.retainOriginal) {
        try {
          await del(report.s3Key);
        } catch (deleteError) {
          console.error('Failed to delete blob:', deleteError);
          // Continue even if deletion fails - we'll log it
        }

        await prisma.report.update({
          where: { id: reportId },
          data: {
            originalDeletedAt: new Date(),
          },
        });

        await createAuditEvent({
          reportId,
          userId: user.id,
          eventType: AuditEventType.ORIGINAL_DELETED,
          eventDescription: 'Original PDF deleted per user consent',
        });
      }

      // Update report status to COMPLETED
      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'COMPLETED',
          processingCompletedAt: new Date(),
        },
      });

      await createAuditEvent({
        reportId,
        userId: user.id,
        eventType: AuditEventType.PDF_PROCESSING_COMPLETED,
        eventDescription: 'PDF processing completed successfully',
        metadata: {
          labValueCount: labResults.length,
        },
      });

      return NextResponse.json({
        success: true,
        reportId: report.id,
        labValueCount: labResults.length,
        status: 'COMPLETED',
      });
    } catch (error) {
      // Update status to FAILED
      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'FAILED',
          processingError: error instanceof Error ? error.message : 'Unknown error',
          processingCompletedAt: new Date(),
        },
      });

      await createAuditEvent({
        reportId,
        userId: user.id,
        eventType: AuditEventType.PDF_PROCESSING_FAILED,
        eventDescription: `PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  } catch (error) {
    console.error('❌ PDF processing error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
