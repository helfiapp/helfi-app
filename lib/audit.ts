/**
 * Audit logging utility for PDF processing events
 * Ensures full audit trail for compliance
 */

import { prisma } from '@/lib/prisma';
import { AuditEventType } from '@prisma/client';

export interface AuditEventData {
  reportId?: string;
  userId: string;
  eventType: AuditEventType;
  eventDescription: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit event
 * Automatically redacts sensitive information from metadata
 */
export async function createAuditEvent(data: AuditEventData): Promise<void> {
  try {
    // Redact sensitive information from metadata
    const redactedMetadata = data.metadata ? redactSensitiveData(data.metadata) : undefined;
    
    await prisma.auditEvent.create({
      data: {
        reportId: data.reportId,
        userId: data.userId,
        eventType: data.eventType,
        eventDescription: data.eventDescription,
        metadata: redactedMetadata,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  } catch (error) {
    // Don't throw - audit logging failures shouldn't break the main flow
    console.error('❌ Failed to create audit event:', error);
  }
}

/**
 * Redact sensitive information from metadata
 * Removes passwords, full file contents, and other PII
 */
function redactSensitiveData(metadata: Record<string, any>): Record<string, any> {
  const redacted = { ...metadata };
  
  // Remove password fields
  if (redacted.password) {
    redacted.password = '[REDACTED]';
  }
  
  if (redacted.passwordHash) {
    redacted.passwordHash = '[REDACTED]';
  }
  
  // Truncate large text fields
  if (redacted.text && typeof redacted.text === 'string' && redacted.text.length > 500) {
    redacted.text = redacted.text.substring(0, 500) + '...[TRUNCATED]';
  }
  
  // Remove file buffers
  if (redacted.buffer) {
    redacted.buffer = '[BINARY_DATA_REDACTED]';
  }
  
  if (redacted.pdfBuffer) {
    redacted.pdfBuffer = '[BINARY_DATA_REDACTED]';
  }
  
  // Remove S3 keys that might contain sensitive paths
  if (redacted.s3Key) {
    redacted.s3Key = redacted.s3Key.replace(/[^/]+$/, '[FILENAME_REDACTED]');
  }
  
  return redacted;
}

/**
 * Get audit events for a report
 */
export async function getReportAuditEvents(reportId: string) {
  return prisma.auditEvent.findMany({
    where: { reportId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get audit events for a user
 */
export async function getUserAuditEvents(userId: string, limit = 100) {
  return prisma.auditEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

