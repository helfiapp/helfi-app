import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  del as vercelDel,
  head as vercelHead,
  list as vercelList,
  put as vercelPut,
} from '@vercel/blob'
import { randomUUID } from 'crypto'

type StorageProviderName = 'aws-s3' | 'vercel-blob' | 'none'

type ObjectStorageRequestOptions = { abortSignal?: AbortSignal }

type PutOptions = {
  access: 'public'
  contentType?: string
  addRandomSuffix?: boolean
}

type ListOptions = {
  prefix?: string
  limit?: number
  cursor?: string
}

const awsRegion = () => (
  process.env.HELFI_AWS_S3_REGION
  || process.env.AWS_S3_REGION
  || process.env.AWS_REGION
  || ''
).trim()
const awsBucket = () => (
  process.env.HELFI_AWS_S3_BUCKET
  || process.env.AWS_S3_BUCKET
  || ''
).trim()

export function getObjectStorageProviderName(): StorageProviderName {
  const requested = (process.env.OBJECT_STORAGE_PROVIDER || '').trim().toLowerCase()

  if (requested === 'aws' || requested === 's3' || requested === 'aws-s3') {
    return awsBucket() && awsRegion() ? 'aws-s3' : 'none'
  }

  if (requested === 'vercel' || requested === 'vercel-blob') {
    return process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN
      ? 'vercel-blob'
      : 'none'
  }

  if (awsBucket() && awsRegion()) return 'aws-s3'
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN) {
    return 'vercel-blob'
  }
  return 'none'
}

export function isObjectStorageConfigured() {
  return getObjectStorageProviderName() !== 'none'
}

const s3Client = () => new S3Client({ region: awsRegion() })

const encodePath = (pathname: string) =>
  pathname
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

const publicPrefixes = [
  'food-photos/',
  'profile-images/',
  'supplement-images/',
  'medication-images/',
]
const isPublicPath = (pathname: string) => publicPrefixes.some((prefix) => pathname.startsWith(prefix))

const publicS3Url = (pathname: string) =>
  `https://${awsBucket()}.s3.${awsRegion()}.amazonaws.com/${encodePath(pathname)}`

const normalizeS3Path = (value: string) => {
  const trimmed = String(value || '').trim().replace(/^\/+/, '')
  if (!/^https?:\/\//i.test(trimmed)) return decodeURIComponent(trimmed)

  try {
    const url = new URL(trimmed)
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  } catch {
    return decodeURIComponent(trimmed)
  }
}

const addSuffix = (pathname: string) => {
  const slash = pathname.lastIndexOf('/')
  const dot = pathname.lastIndexOf('.')
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  if (dot > slash) return `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`
  return `${pathname}-${suffix}`
}

export async function put(pathname: string, body: any, options: PutOptions) {
  const provider = getObjectStorageProviderName()
  if (provider === 'vercel-blob') {
    return vercelPut(pathname, body, options as any)
  }
  if (provider !== 'aws-s3') throw new Error('Object storage is not configured.')

  const key = options.addRandomSuffix ? addSuffix(pathname) : pathname
  await s3Client().send(new PutObjectCommand({
    Bucket: awsBucket(),
    Key: key,
    Body: body,
    ContentType: options.contentType || 'application/octet-stream',
  }))

  return {
    url: publicS3Url(key),
    downloadUrl: publicS3Url(key),
    pathname: key,
    contentType: options.contentType || 'application/octet-stream',
    contentDisposition: 'inline',
  }
}

// SDK retry waits can outlive cancellation; HTTP still receives the same real signal.
function abortableStorageRequest<T>(signal: AbortSignal | undefined, request: () => Promise<T>): Promise<T> {
  if (!signal) return request()
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      request().then(
        (value) => { cleanup(); resolve(value) },
        (error) => { cleanup(); reject(error) },
      )
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

export async function head(pathnameOrUrl: string, options: ObjectStorageRequestOptions = {}) {
  options.abortSignal?.throwIfAborted()
  const provider = getObjectStorageProviderName()
  if (provider === 'vercel-blob') return abortableStorageRequest(options.abortSignal, () => vercelHead(pathnameOrUrl, options))
  if (provider !== 'aws-s3') throw new Error('Object storage is not configured.')

  const pathname = normalizeS3Path(pathnameOrUrl)
  const client = options.abortSignal ? new S3Client({ region: awsRegion(), maxAttempts: 1 }) : s3Client()
  const result = await abortableStorageRequest(options.abortSignal, () => client.send(new HeadObjectCommand({
    Bucket: awsBucket(),
    Key: pathname,
  }), { abortSignal: options.abortSignal }))
  options.abortSignal?.throwIfAborted()
  const url = isPublicPath(pathname)
    ? publicS3Url(pathname)
    : await abortableStorageRequest(options.abortSignal, () => getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: awsBucket(), Key: pathname }),
        { expiresIn: 300 },
      ))
  options.abortSignal?.throwIfAborted()

  return {
    url,
    downloadUrl: url,
    pathname,
    size: result.ContentLength || 0,
    uploadedAt: result.LastModified || new Date(0),
    contentType: result.ContentType || 'application/octet-stream',
    contentDisposition: result.ContentDisposition || 'inline',
    cacheControl: result.CacheControl || 'private, max-age=300',
  }
}

export async function del(pathnameOrUrls: string | string[], options: ObjectStorageRequestOptions = {}) {
  options.abortSignal?.throwIfAborted()
  const provider = getObjectStorageProviderName()
  if (provider === 'vercel-blob') return abortableStorageRequest(options.abortSignal, () => vercelDel(pathnameOrUrls, options))
  if (provider !== 'aws-s3') throw new Error('Object storage is not configured.')

  const values = Array.isArray(pathnameOrUrls) ? pathnameOrUrls : [pathnameOrUrls]
  const keys = Array.from(new Set(values.map(normalizeS3Path).filter(Boolean)))
  if (keys.length === 0) return
  const client = options.abortSignal ? new S3Client({ region: awsRegion(), maxAttempts: 1 }) : s3Client()

  for (let index = 0; index < keys.length; index += 1000) {
    options.abortSignal?.throwIfAborted()
    const batch = keys.slice(index, index + 1000)
    const result = await abortableStorageRequest(options.abortSignal, () => client.send(new DeleteObjectsCommand({
      Bucket: awsBucket(),
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }), { abortSignal: options.abortSignal }))
    options.abortSignal?.throwIfAborted()
    if (result.Errors?.length) throw new Error('Object storage could not delete every requested file.')
  }
}

export async function list(options: ListOptions = {}) {
  const provider = getObjectStorageProviderName()
  if (provider === 'vercel-blob') return vercelList(options)
  if (provider !== 'aws-s3') throw new Error('Object storage is not configured.')

  const result = await s3Client().send(new ListObjectsV2Command({
    Bucket: awsBucket(),
    Prefix: options.prefix,
    MaxKeys: Math.min(Math.max(options.limit || 1000, 1), 1000),
    ContinuationToken: options.cursor,
  }))

  return {
    blobs: (result.Contents || []).map((item) => ({
      url: publicS3Url(item.Key || ''),
      downloadUrl: publicS3Url(item.Key || ''),
      pathname: item.Key || '',
      size: item.Size || 0,
      uploadedAt: item.LastModified || new Date(0),
    })),
    cursor: result.NextContinuationToken,
    hasMore: Boolean(result.IsTruncated),
  }
}
