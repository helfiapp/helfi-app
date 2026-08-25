import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { head, list } from '@vercel/blob'

async function main() {

const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN
const bucket = process.env.AWS_S3_BUCKET
const region = process.env.AWS_S3_REGION || process.env.AWS_REGION

if (!token || !bucket || !region) {
  throw new Error('BLOB_READ_WRITE_TOKEN, AWS_S3_BUCKET, and AWS_S3_REGION are required.')
}

const s3 = new S3Client({ region })

const prefixTotals = new Map<string, { count: number; bytes: number }>()
let copied = 0
let skipped = 0
let totalBytes = 0
let cursor: string | undefined

const record = (pathname: string, size: number) => {
  const prefix = pathname.includes('/') ? pathname.split('/')[0] : '(root)'
  const current = prefixTotals.get(prefix) || { count: 0, bytes: 0 }
  current.count += 1
  current.bytes += size
  prefixTotals.set(prefix, current)
}

do {
  const page = await list({ token, cursor, limit: 1000 })
  cursor = page.cursor

  for (const blob of page.blobs) {
    record(blob.pathname, blob.size)
    totalBytes += blob.size

    try {
      const existing = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: blob.pathname }))
      if (existing.ContentLength === blob.size) {
        skipped += 1
        continue
      }
    } catch {
      // Missing objects are copied below.
    }

    const info = await head(blob.pathname, { token })
    let response = await fetch(info.url)
    if (!response.ok) {
      response = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } })
    }
    if (!response.ok) throw new Error(`Blob download failed with status ${response.status}.`)

    const body = Buffer.from(await response.arrayBuffer())
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: blob.pathname,
      Body: body,
      ContentType: info.contentType || response.headers.get('content-type') || 'application/octet-stream',
    }))
    copied += 1
  }
} while (cursor)

let s3Cursor: string | undefined
let s3Objects = 0
let s3Bytes = 0
do {
  const page = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    ContinuationToken: s3Cursor,
  }))
  s3Cursor = page.NextContinuationToken
  for (const object of page.Contents || []) {
    s3Objects += 1
    s3Bytes += object.Size || 0
  }
} while (s3Cursor)

if (s3Objects < copied + skipped || s3Bytes < totalBytes) {
  throw new Error('S3 verification totals are smaller than the Vercel Blob source totals.')
}

console.log(JSON.stringify({
  sourceObjects: copied + skipped,
  copied,
  skipped,
  totalBytes,
  prefixes: Array.from(prefixTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, totals]) => ({ prefix, ...totals })),
  s3Objects,
  s3Bytes,
  verified: s3Objects >= copied + skipped && s3Bytes >= totalBytes,
}, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
