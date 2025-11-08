# PDF Lab Report Intake & Encryption - Setup Guide

This document provides instructions for setting up the secure PDF lab report intake and encryption system.

## Environment Variables

Add the following environment variables to your `.env.local` file (or your deployment platform's environment variables):

```bash
# AWS Configuration
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# S3 Configuration
S3_BUCKET=helfi-reports
S3_REPORTS_PREFIX=reports/

# KMS Configuration
KMS_KEY_ID=arn:aws:kms:ap-southeast-2:XXXX:key/XXXXXXXX

# Optional: Redis for background job processing (if using BullMQ)
REDIS_URL=redis://localhost:6379

# Upload Limits
MAX_UPLOAD_MB=25

# OCR Configuration (optional, for future enhancement)
ENABLE_OCR=true
```

## AWS S3 Setup

### 1. Create S3 Bucket

1. Log into AWS Console
2. Navigate to S3 service
3. Create a new bucket named `helfi-reports` (or your preferred name)
4. Choose region: `ap-southeast-2` (or your preferred region)
5. **Disable public access** - Block all public access
6. Enable versioning (optional but recommended)

### 2. Configure Server-Side Encryption (SSE-KMS)

1. Go to bucket properties
2. Navigate to "Default encryption"
3. Enable encryption
4. Choose "AWS Key Management Service key (SSE-KMS)"
5. Select your KMS key (create one if needed - see KMS setup below)
6. Save changes

### 3. Configure Bucket Policy

Create a bucket policy that allows your application to:
- Put objects (for uploads)
- Get objects (for processing)
- Delete objects (for cleanup)

Example policy (replace `YOUR_ACCOUNT_ID` and `YOUR_ROLE_NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPresignedUploads",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_ROLE_NAME"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::helfi-reports/reports/*"
    }
  ]
}
```

### 4. Configure CORS (if needed for direct browser uploads)

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET"],
    "AllowedOrigins": ["https://helfi.ai", "https://*.vercel.app"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## AWS KMS Setup

### 1. Create Customer-Managed Key (CMK)

1. Navigate to AWS KMS service
2. Click "Create key"
3. Choose "Symmetric" key type
4. Choose "Encrypt and decrypt" key usage
5. Name the key: `helfi-reports-encryption`
6. Add description: "Key for encrypting lab report data"
7. Choose key administrator (your IAM user/role)
8. Choose key users (your application IAM role)
9. Review and create

### 2. Get Key ARN

After creating the key, copy the ARN (Amazon Resource Name). It will look like:
```
arn:aws:kms:ap-southeast-2:123456789012:key/12345678-1234-1234-1234-123456789012
```

Add this to your `KMS_KEY_ID` environment variable.

### 3. Configure Key Policy

Ensure your application IAM role has permissions to:
- `kms:Encrypt` - Wrap data encryption keys
- `kms:Decrypt` - Unwrap data encryption keys
- `kms:DescribeKey` - Get key metadata

Example key policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowApplicationEncryptDecrypt",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_ROLE_NAME"
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

## IAM Role Setup

### 1. Create IAM Role for Application

1. Navigate to IAM service
2. Create a new role
3. Choose "EC2" or "Lambda" as trusted entity (depending on your deployment)
4. Attach policies:
   - `AmazonS3FullAccess` (or create custom policy with only needed permissions)
   - Custom policy for KMS (see above)

### 2. Custom IAM Policy for S3 and KMS

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::helfi-reports/reports/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:ap-southeast-2:YOUR_ACCOUNT_ID:key/YOUR_KEY_ID"
    }
  ]
}
```

## Database Migration

Run the Prisma migration to create the necessary database tables:

```bash
npx prisma migrate dev --name pdf_encryption_pipeline
```

Or if you prefer to create the migration file first:

```bash
npx prisma migrate dev --name pdf_encryption_pipeline --create-only
# Review the migration file, then:
npx prisma migrate dev
```

## Security Checklist

- [ ] S3 bucket has public access blocked
- [ ] S3 bucket has SSE-KMS enabled
- [ ] KMS key has proper IAM permissions
- [ ] IAM role has minimal required permissions
- [ ] Environment variables are stored securely (not in code)
- [ ] KMS key ID is correctly configured
- [ ] Database migration has been run
- [ ] Audit logging is working
- [ ] Password handling is ephemeral (not stored)

## Testing

1. **Test Presigned Upload:**
   ```bash
   curl -X POST https://your-domain.com/api/reports/presign \
     -H "Content-Type: application/json" \
     -d '{"fileName":"test.pdf","fileSize":1024,"isPasswordProtected":false,"decryptionConsent":true,"passwordConsent":true,"retentionConsent":false}'
   ```

2. **Test PDF Processing:**
   After uploading a PDF, call the process endpoint with the report ID.

3. **Verify Encryption:**
   Check database to ensure lab values are encrypted (should see encrypted strings, not plain text).

4. **Verify Audit Logs:**
   Check `AuditEvent` table for proper event logging.

## Troubleshooting

### Common Issues

1. **"KMS_KEY_ID not configured"**
   - Ensure `KMS_KEY_ID` environment variable is set
   - Verify the ARN format is correct

2. **"Access Denied" errors**
   - Check IAM role permissions
   - Verify KMS key policy allows your role
   - Check S3 bucket policy

3. **"PDF password incorrect"**
   - Verify password is being passed correctly
   - Check password hash verification logic

4. **Migration errors**
   - Ensure database connection is working
   - Check Prisma schema syntax
   - Verify all required fields are present

## Production Deployment

Before deploying to production:

1. Use AWS Secrets Manager or Parameter Store for sensitive credentials
2. Enable CloudTrail for audit logging
3. Set up CloudWatch alarms for failed processing
4. Configure backup and disaster recovery
5. Review and test all security measures
6. Perform penetration testing
7. Document incident response procedures

## Compliance Notes

- **Australian Notifiable Data Breaches (NDB) Scheme:** Ensure breach notification procedures are documented
- **GDPR:** If serving EU users, ensure data processing consent is properly obtained
- **HIPAA:** If processing US health data, additional safeguards may be required

## Support

For issues or questions, contact: support@helfi.ai

