import { del, getObjectStorageProviderName, head, list, put } from '../lib/object-storage'

async function main() {

const provider = getObjectStorageProviderName()
if (provider === 'none') throw new Error('Object storage is not configured.')

const pathname = `migration-check/${Date.now()}-storage-check.txt`
const body = Buffer.from('helfi-storage-check', 'utf8')

try {
  const stored = await put(pathname, body, {
    access: 'public',
    contentType: 'text/plain',
  })
  const info = await head(stored.pathname)
  const response = await fetch(info.url, {
    headers: provider === 'vercel-blob' && process.env.BLOB_READ_WRITE_TOKEN
      ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
      : undefined,
  })
  if (!response.ok || Buffer.from(await response.arrayBuffer()).toString('utf8') !== body.toString('utf8')) {
    throw new Error('Stored file could not be read back correctly.')
  }

  const page = await list({ prefix: 'migration-check/', limit: 100 })
  if (!page.blobs.some((blob) => blob.pathname === stored.pathname)) {
    throw new Error('Stored file did not appear in the object list.')
  }

  console.log(`✅ ${provider} object storage read/write/list check passed.`)
} finally {
  await del(pathname).catch(() => {})
}
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
