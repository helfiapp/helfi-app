/**
 * API Route: POST /api/reports/[id]/process
 * Processes uploaded PDF: decrypts, extracts lab values, encrypts data
 * Password is provided in request body (ephemeral, not stored)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { del, head, getObjectStorageProviderName } from '@/lib/object-storage';
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

    const respondAfterCleanup = async (labValueCount: number) => {
      if (!report.retainOriginal && !report.originalDeletedAt) {
        try {
          await del(report.s3Key);
          await prisma.report.update({
            where: { id: reportId },
            data: { originalDeletedAt: new Date() },
          });
          await createAuditEvent({
            reportId,
            userId: user.id,
            eventType: AuditEventType.ORIGINAL_DELETED,
            eventDescription: 'Original PDF deleted per user consent',
          });
        } catch {
          console.error('Original PDF cleanup did not complete.');
          return NextResponse.json({
            error: 'Report processed, but the original PDF could not be deleted. Please try again.',
            reportId,
            status: 'COMPLETED',
            originalDeleted: false,
          }, { status: 503 });
        }
      }
      return NextResponse.json({ success: true, reportId, labValueCount, status: 'COMPLETED' });
    };

    // A completed extraction can confirm or retry cleanup without extracting values twice.
    if (report.status === 'COMPLETED') {
      return respondAfterCleanup(await prisma.labResult.count({ where: { reportId } }));
    }

    if (report.status === 'PROCESSING') {
      return NextResponse.json({ error: 'Report is already processing' }, { status: 409 });
    }

    // Only password-protected PDFs require the decryption/password consent pair.
    if (
      report.isPasswordProtected &&
      (!report.consentRecord.decryptionConsent || !report.consentRecord.passwordConsent)
    ) {
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
          const failedPassword = await prisma.report.updateMany({
            where: { id: reportId, status: { in: ['PENDING', 'FAILED', 'DECRYPTION_FAILED'] } },
            data: {
              status: 'DECRYPTION_FAILED',
              processingError: 'Password verification failed',
            },
          });

          if (failedPassword.count === 0) {
            return NextResponse.json({ error: 'Report processing state changed. Check its status.' }, { status: 409 });
          }

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

    // Only one request may start extraction for this uploaded report.
    const claimed = await prisma.report.updateMany({
      where: { id: reportId, status: { in: ['PENDING', 'FAILED', 'DECRYPTION_FAILED'] } },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Report processing state changed. Check its status.' }, { status: 409 });
    }

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
        headers: getObjectStorageProviderName() === 'vercel-blob'
          ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
          : undefined,
      });

      if (!blobResponse.ok) {
        throw new Error(`Failed to fetch PDF from blob: ${blobResponse.statusText}`);
      }

      let pdfBuffer: Buffer = Buffer.from(await blobResponse.arrayBuffer());
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

      return respondAfterCleanup(labResults.length);
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
