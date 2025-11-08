# Security Improvements for Helfi Medical Data

## Overview
This document outlines security improvements needed to protect user medical data in the Helfi application. Medical data requires higher security standards than typical user data.

## Current Security Status

### ✅ Currently Implemented
1. **Authentication**: NextAuth.js with secure session management
2. **User Isolation**: Data linked to `userId` with foreign key constraints
3. **HTTPS**: All connections encrypted (Vercel default)
4. **Environment Variables**: Secrets stored securely (not in code)
5. **Cascade Deletion**: User data deleted when account is deleted
6. **SQL Injection Protection**: Prisma ORM prevents SQL injection

### ⚠️ Needs Improvement
1. **Database Encryption at Rest**: Unverified
2. **Field-Level Encryption**: Not implemented
3. **Audit Logging**: Not implemented
4. **Data Retention Policies**: Not defined
5. **Access Controls**: Basic only
6. **Compliance**: HIPAA compliance not verified

---

## Required Security Improvements

### 1. Database Encryption at Rest

**Priority: HIGH**

**Current Status:** Unknown - needs verification with database provider

**Action Required:**
- [ ] Verify PostgreSQL database encryption at rest
- [ ] If using Vercel Postgres, confirm encryption is enabled
- [ ] If using external provider (Neon, Supabase, etc.), verify encryption settings
- [ ] Document encryption status in security documentation

**Implementation:**
```typescript
// Add to documentation
// Database: PostgreSQL
// Encryption at Rest: [ENABLED/DISABLED]
// Provider: [Vercel Postgres/Neon/Supabase/etc.]
// Encryption Method: [AES-256/etc.]
```

**Files to Update:**
- `SECURITY.md` (create if doesn't exist)
- Database configuration documentation

---

### 2. Field-Level Encryption for Sensitive Data

**Priority: HIGH**

**Current Status:** No encryption for sensitive medical fields

**What Needs Encryption:**
- Medication names (`Medication.name`)
- Supplement names (`Supplement.name`)
- Health issue names (`HealthGoal.name`)
- Health log notes (`HealthLog.notes`)
- Food log descriptions (`FoodLog.description`)
- Interaction analysis data (`InteractionAnalysis.analysisData`)
- User health metrics (weight, height, body type)

**Implementation Plan:**

**Step 1: Install Encryption Library**
```bash
npm install crypto-js @types/crypto-js
# OR
npm install node:crypto (built-in)
```

**Step 2: Create Encryption Utility**
```typescript
// lib/encryption.ts
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY // 32-byte key
const ALGORITHM = 'aes-256-gcm'

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
  
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
```

**Step 3: Update Prisma Schema**
```prisma
model Medication {
  id        String   @id @default(cuid())
  userId    String
  name      String   // Encrypted at application level
  nameEncrypted Boolean @default(false) // Flag to track encryption status
  // ... rest of fields
}
```

**Step 4: Create Database Migration**
- Add `nameEncrypted` boolean flag to track encryption status
- Migrate existing data: encrypt all existing records
- Update application code to encrypt on write, decrypt on read

**Step 5: Update Application Code**
```typescript
// Before saving
const encryptedName = encrypt(medication.name)
await prisma.medication.create({
  data: {
    name: encryptedName,
    nameEncrypted: true,
    // ...
  }
})

// When reading
const medication = await prisma.medication.findUnique({ where: { id } })
if (medication.nameEncrypted) {
  medication.name = decrypt(medication.name)
}
```

**Files to Create/Update:**
- `lib/encryption.ts` (new)
- `prisma/schema.prisma` (add encryption flags)
- `prisma/migrations/[timestamp]_add_encryption_flags/migration.sql` (new)
- `app/api/user-data/route.ts` (update to encrypt/decrypt)
- All API routes that read/write sensitive data

**Environment Variable Required:**
- `ENCRYPTION_KEY` (32-byte hex string, generate with `crypto.randomBytes(32).toString('hex')`)

**Testing:**
- [ ] Test encryption/decryption functions
- [ ] Test migration of existing data
- [ ] Test read/write operations with encrypted data
- [ ] Verify data is encrypted in database
- [ ] Test performance impact

---

### 3. Audit Logging

**Priority: MEDIUM**

**Current Status:** No audit logging implemented

**What Needs Logging:**
- User login/logout events
- Data access (who accessed what medical data)
- Data modifications (create, update, delete)
- API endpoint access
- Failed authentication attempts
- Admin actions

**Implementation Plan:**

**Step 1: Create Audit Log Table**
```prisma
model AuditLog {
  id          String   @id @default(cuid())
  userId      String?  // Nullable for system events
  action      String   // 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'READ', 'ADMIN_ACTION'
  resource    String   // 'Medication', 'HealthLog', 'User', etc.
  resourceId  String?  // ID of the resource accessed
  details     Json?    // Additional context
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())
  
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@index([resource, createdAt])
}
```

**Step 2: Create Audit Logging Utility**
```typescript
// lib/audit-log.ts
import { prisma } from '@/lib/prisma'

export async function logAuditEvent(params: {
  userId?: string
  action: string
  resource: string
  resourceId?: string
  details?: any
  ipAddress?: string
  userAgent?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      }
    })
  } catch (error) {
    console.error('Failed to log audit event:', error)
    // Don't throw - audit logging should not break application
  }
}
```

**Step 3: Add Logging to Critical Operations**
- Authentication (login/logout)
- Medical data access (read operations)
- Medical data modifications (create/update/delete)
- Admin panel actions
- Data exports

**Step 4: Create Audit Log Viewer (Admin Only)**
- Admin panel page to view audit logs
- Filter by user, action, resource, date range
- Export audit logs for compliance

**Files to Create/Update:**
- `prisma/schema.prisma` (add AuditLog model)
- `prisma/migrations/[timestamp]_add_audit_log/migration.sql` (new)
- `lib/audit-log.ts` (new)
- `lib/auth.ts` (add login/logout logging)
- `app/api/user-data/route.ts` (add data access logging)
- `app/admin-panel/audit-logs/page.tsx` (new)

**Testing:**
- [ ] Test audit log creation
- [ ] Test audit log queries
- [ ] Test admin audit log viewer
- [ ] Verify performance impact
- [ ] Test log retention policies

---

### 4. Data Retention Policies

**Priority: MEDIUM**

**Current Status:** No retention policies defined

**What Needs Policies:**
- How long to keep medical data after account deletion
- How long to keep audit logs
- How long to keep inactive user data
- How long to keep backup data

**Implementation Plan:**

**Step 1: Define Retention Policies**
```typescript
// lib/data-retention.ts
export const RETENTION_POLICIES = {
  // Medical data deleted immediately on account deletion
  MEDICAL_DATA_ON_DELETE: 'IMMEDIATE',
  
  // Audit logs kept for 7 years (compliance requirement)
  AUDIT_LOGS_RETENTION_DAYS: 2555, // 7 years
  
  // Inactive user data deleted after 2 years
  INACTIVE_USER_RETENTION_DAYS: 730, // 2 years
  
  // Backup data retention
  BACKUP_RETENTION_DAYS: 90, // 3 months
}
```

**Step 2: Implement Automated Cleanup**
```typescript
// app/api/admin/cleanup-retention/route.ts
// Run via cron job weekly
export async function POST(req: NextRequest) {
  // Verify admin authentication
  // Delete old audit logs
  // Delete inactive user data
  // Clean up old backups
}
```

**Step 3: Update Account Deletion**
```typescript
// Ensure all medical data is deleted when account is deleted
// Currently handled by Prisma cascade delete, but verify
```

**Files to Create/Update:**
- `lib/data-retention.ts` (new)
- `app/api/admin/cleanup-retention/route.ts` (new)
- `vercel.json` (add cleanup cron job)
- `app/api/user-data/route.ts` (verify deletion logic)

**Testing:**
- [ ] Test account deletion removes all data
- [ ] Test audit log cleanup
- [ ] Test inactive user cleanup
- [ ] Verify backup cleanup

---

### 5. Enhanced Access Controls

**Priority: MEDIUM**

**Current Status:** Basic access controls (user can only access their own data)

**Improvements Needed:**
- Role-based access control (RBAC)
- API rate limiting
- IP whitelisting for admin access
- Two-factor authentication (2FA) for admin accounts
- Session timeout policies

**Implementation Plan:**

**Step 1: Add Role-Based Access Control**
```prisma
model User {
  // ... existing fields
  role UserRole @default(USER)
}

enum UserRole {
  USER
  ADMIN
  MODERATOR
}
```

**Step 2: Create Access Control Middleware**
```typescript
// middleware/access-control.ts
export function requireRole(roles: UserRole[]) {
  return async (req: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    })
    
    if (!user || !roles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
}
```

**Step 3: Implement API Rate Limiting**
```typescript
// lib/rate-limit.ts
import { LRUCache } from 'lru-cache'

const rateLimit = new LRUCache<string, number>({
  max: 500,
  ttl: 60000, // 1 minute
})

export function checkRateLimit(identifier: string, limit: number): boolean {
  const count = rateLimit.get(identifier) || 0
  if (count >= limit) {
    return false
  }
  rateLimit.set(identifier, count + 1)
  return true
}
```

**Step 4: Add 2FA for Admin Accounts**
- Use TOTP (Time-based One-Time Password)
- Libraries: `speakeasy`, `qrcode`
- Store 2FA secret encrypted
- Require 2FA for admin login

**Files to Create/Update:**
- `prisma/schema.prisma` (add UserRole enum)
- `middleware/access-control.ts` (new)
- `lib/rate-limit.ts` (new)
- `app/api/admin/**` (add access control checks)
- `lib/auth.ts` (add 2FA support)

**Testing:**
- [ ] Test role-based access
- [ ] Test rate limiting
- [ ] Test 2FA for admin
- [ ] Test session timeout

---

### 6. HIPAA Compliance (If Applicable)

**Priority: HIGH (if handling PHI)**

**Current Status:** Not verified

**HIPAA Requirements:**
- Administrative safeguards
- Physical safeguards
- Technical safeguards
- Breach notification procedures
- Business Associate Agreements (BAAs)

**Action Required:**
- [ ] Determine if Helfi handles Protected Health Information (PHI)
- [ ] If yes, conduct HIPAA compliance audit
- [ ] Implement required safeguards
- [ ] Create Business Associate Agreements with vendors
- [ ] Implement breach notification procedures
- [ ] Train staff on HIPAA compliance
- [ ] Document compliance measures

**Key Requirements:**
1. **Encryption**: All PHI encrypted at rest and in transit ✅ (HTTPS) ⚠️ (at rest needs verification)
2. **Access Controls**: Role-based access ✅ (basic) ⚠️ (needs enhancement)
3. **Audit Logs**: Track all PHI access ✅ (needs implementation)
4. **Breach Notification**: Notify within 60 days ⚠️ (needs procedure)
5. **BAAs**: Agreements with cloud providers ⚠️ (needs verification)

**Files to Create:**
- `HIPAA_COMPLIANCE.md` (documentation)
- `BREACH_NOTIFICATION_PROCEDURE.md` (procedure)
- `app/api/admin/breach-notification/route.ts` (if needed)

---

### 7. Regular Security Audits

**Priority: LOW**

**Current Status:** No regular audits scheduled

**Implementation:**
- [ ] Schedule quarterly security audits
- [ ] Review access logs monthly
- [ ] Review audit logs for suspicious activity
- [ ] Penetration testing annually
- [ ] Dependency vulnerability scanning (automated)
- [ ] Code security reviews

**Tools:**
- `npm audit` for dependency vulnerabilities
- Snyk or Dependabot for automated scanning
- OWASP ZAP for penetration testing
- Manual code reviews

---

### 8. Backup Encryption

**Priority: MEDIUM**

**Current Status:** Unknown - needs verification

**Action Required:**
- [ ] Verify database backups are encrypted
- [ ] Verify backup storage location is secure
- [ ] Test backup restoration process
- [ ] Document backup procedures

---

### 9. Secure API Endpoints

**Priority: MEDIUM**

**Current Status:** Basic authentication

**Improvements:**
- [ ] Add request signing for sensitive endpoints
- [ ] Implement API keys for third-party integrations
- [ ] Add request validation and sanitization
- [ ] Implement CORS policies
- [ ] Add request size limits

**Files to Update:**
- `middleware.ts` (add CORS, rate limiting)
- All API routes (add validation)

---

### 10. Data Export Security

**Priority: LOW**

**Current Status:** Basic export functionality exists

**Improvements:**
- [ ] Encrypt exported data files
- [ ] Add password protection for exports
- [ ] Log all data exports
- [ ] Limit export frequency
- [ ] Secure export file storage

**Files to Update:**
- `app/api/export/route.ts` (add encryption, logging)

---

## Implementation Priority

### Phase 1 (Critical - Do First)
1. ✅ Verify database encryption at rest
2. ✅ Implement field-level encryption for sensitive data
3. ✅ Add audit logging

### Phase 2 (Important - Do Next)
4. ✅ Define and implement data retention policies
5. ✅ Enhance access controls (RBAC, rate limiting)
6. ✅ Verify HIPAA compliance requirements

### Phase 3 (Nice to Have)
7. ✅ Regular security audits
8. ✅ Backup encryption verification
9. ✅ Secure API endpoints enhancements
10. ✅ Data export security improvements

---

## Environment Variables Required

Add these to Vercel environment variables:

```bash
# Encryption
ENCRYPTION_KEY=<32-byte hex string>

# Audit Logging (optional)
AUDIT_LOG_RETENTION_DAYS=2555

# Rate Limiting (optional)
RATE_LIMIT_REQUESTS_PER_MINUTE=60

# 2FA (optional, for admin)
TOTP_ISSUER=Helfi
```

---

## Testing Checklist

For each security improvement:
- [ ] Unit tests for encryption/decryption
- [ ] Integration tests for API endpoints
- [ ] Security testing (penetration testing)
- [ ] Performance testing (ensure no significant slowdown)
- [ ] Documentation updated
- [ ] Team trained on new security measures

---

## Compliance Considerations

### HIPAA (If Applicable)
- [ ] Conduct compliance audit
- [ ] Implement required safeguards
- [ ] Create BAAs with vendors
- [ ] Document compliance measures

### GDPR (If EU Users)
- [ ] Right to access (data export)
- [ ] Right to deletion (account deletion)
- [ ] Data portability
- [ ] Privacy policy updates

### Other Regulations
- [ ] Review local regulations
- [ ] Implement required measures
- [ ] Document compliance

---

## Notes

- All security improvements should be tested thoroughly before deployment
- Security is an ongoing process, not a one-time task
- Regular reviews and updates are essential
- Document all security measures for compliance audits
- Train team members on security best practices

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [PostgreSQL Security Best Practices](https://www.postgresql.org/docs/current/security.html)

