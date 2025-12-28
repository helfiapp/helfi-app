import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const FILE_ALGORITHM = 'aes-256-gcm'
const FILE_IV_LENGTH = 12
const FILE_TAG_LENGTH = 16
const FILE_KEY_LENGTH = 32

function getFileKey(): Buffer {
  const masterKeyEnv = process.env.ENCRYPTION_MASTER_KEY
  if (!masterKeyEnv) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is required')
  }

  try {
    const decoded = Buffer.from(masterKeyEnv, 'base64')
    if (decoded.length >= FILE_KEY_LENGTH) {
      return decoded.subarray(0, FILE_KEY_LENGTH)
    }
  } catch {
    // Fall back to hash-based key derivation below.
  }

  return createHash('sha256').update(masterKeyEnv).digest()
}

export function encryptBuffer(input: Buffer): {
  encrypted: Buffer
  iv: string
  tag: string
} {
  const iv = randomBytes(FILE_IV_LENGTH)
  const key = getFileKey()
  const cipher = createCipheriv(FILE_ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(input), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  }
}

export function decryptBuffer(input: Buffer, ivHex: string, tagHex: string): Buffer {
  if (!ivHex || !tagHex) {
    throw new Error('Missing encryption metadata')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  if (iv.length !== FILE_IV_LENGTH || tag.length !== FILE_TAG_LENGTH) {
    throw new Error('Invalid encryption metadata')
  }

  const key = getFileKey()
  const decipher = createDecipheriv(FILE_ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(input), decipher.final()])
}
