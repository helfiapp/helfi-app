/**
 * Encryption utilities for PDF lab report data
 * Uses AES-256-GCM for field-level encryption
 * Encryption keys are derived from a master key stored in environment variables
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32;
const TAG_LENGTH = 16; // 128 bits for GCM authentication tag
const KEY_LENGTH = 32; // 256 bits

// Get or generate master encryption key from environment
function getMasterKey(): Buffer {
  const masterKeyEnv = process.env.ENCRYPTION_MASTER_KEY;
  
  if (!masterKeyEnv) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is required. Generate one with: openssl rand -base64 32');
  }
  
  // If it's base64 encoded, decode it; otherwise use it directly
  try {
    return Buffer.from(masterKeyEnv, 'base64');
  } catch {
    // If not base64, hash it to get consistent 32-byte key
    return createHash('sha256').update(masterKeyEnv).digest();
  }
}

/**
 * Derive a data encryption key (DEK) from master key with a salt
 * This ensures each record can have a unique key while using the master key
 */
async function deriveDataKey(salt: Buffer): Promise<Buffer> {
  const masterKey = getMasterKey();
  const key = (await scryptAsync(masterKey, salt, KEY_LENGTH)) as Buffer;
  return key;
}

/**
 * Generate a random data encryption key (DEK)
 * For per-record encryption, we generate a unique key and encrypt it with the master key
 */
function generateDataKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Encrypt a data encryption key using the master key
 * This is our "envelope encryption" - encrypting keys with keys
 */
async function encryptDataKey(dataKey: Buffer, salt: Buffer): Promise<string> {
  const masterKey = getMasterKey();
  const key = (await scryptAsync(masterKey, salt, KEY_LENGTH)) as Buffer;
  
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(dataKey, undefined, 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Return base64 encoded: salt:iv:encrypted:tag
  return Buffer.from(`${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`).toString('base64');
}

/**
 * Decrypt a data encryption key using the master key
 */
async function decryptDataKey(encryptedKeyBase64: string): Promise<Buffer> {
  const parts = Buffer.from(encryptedKeyBase64, 'base64').toString('utf8').split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted key format');
  }
  
  const [saltHex, ivHex, encrypted, tagHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  
  const masterKey = getMasterKey();
  const key = (await scryptAsync(masterKey, salt, KEY_LENGTH)) as Buffer;
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, 'hex');
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted;
}

/**
 * Derive encryption key from password using scrypt
 * Used for password-protected PDFs (ephemeral, not stored)
 */
async function deriveKeyFromPassword(password: string, salt: Buffer): Promise<Buffer> {
  const key = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return key;
}

/**
 * Encrypt data using AES-256-GCM
 */
function encryptWithAES(data: string, key: Buffer): { encrypted: string; iv: string; tag: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
function decryptWithAES(
  encrypted: string,
  key: Buffer,
  iv: string,
  tag: string
): string {
  const ivBuffer = Buffer.from(iv, 'hex');
  const tagBuffer = Buffer.from(tag, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt a field value with AES-256-GCM and wrap the key
 * Returns a JSON string containing encrypted data, IV, tag, and wrapped key
 */
export async function encryptField(value: string): Promise<string> {
  if (!value) {
    return '';
  }

  // Generate a data encryption key for this field
  const dataKey = generateDataKey();
  const salt = randomBytes(SALT_LENGTH);
  
  // Encrypt the value
  const { encrypted, iv, tag } = encryptWithAES(value, dataKey);
  
  // Wrap the data key with master key
  const wrappedKey = await encryptDataKey(dataKey, salt);
  
  // Return JSON string with all components
  return JSON.stringify({
    encrypted,
    iv,
    tag,
    wrappedKey,
  });
}

/**
 * Decrypt a field value that was encrypted with encryptField
 */
export async function decryptField(encryptedDataJson: string): Promise<string> {
  if (!encryptedDataJson) {
    return '';
  }

  try {
    const { encrypted, iv, tag, wrappedKey } = JSON.parse(encryptedDataJson);
    
    // Unwrap the data key
    const dataKey = await decryptDataKey(wrappedKey);
    
    // Decrypt the value
    return decryptWithAES(encrypted, dataKey, iv, tag);
  } catch (error) {
    console.error('❌ Field decryption failed:', error);
    throw new Error(`Failed to decrypt field: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypt multiple fields in batch (more efficient for multiple lab results)
 * Returns encrypted data with a single wrapped key for all fields
 */
export async function encryptFieldsBatch(fields: Record<string, string>): Promise<{
  encryptedFields: Record<string, string>;
  wrappedKey: string;
}> {
  // Generate a single data key for all fields
  const dataKey = generateDataKey();
  const salt = randomBytes(SALT_LENGTH);
  const wrappedKey = await encryptDataKey(dataKey, salt);
  
  const encryptedFields: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(fields)) {
    if (value) {
      const { encrypted, iv, tag } = encryptWithAES(value, dataKey);
      encryptedFields[key] = JSON.stringify({ encrypted, iv, tag });
    }
  }
  
  return {
    encryptedFields,
    wrappedKey,
  };
}

/**
 * Decrypt multiple fields that were encrypted with encryptFieldsBatch
 */
export async function decryptFieldsBatch(
  encryptedFields: Record<string, string>,
  wrappedKey: string
): Promise<Record<string, string>> {
  const dataKey = await decryptDataKey(wrappedKey);
  const decryptedFields: Record<string, string> = {};
  
  for (const [key, encryptedDataJson] of Object.entries(encryptedFields)) {
    try {
      const { encrypted, iv, tag } = JSON.parse(encryptedDataJson);
      decryptedFields[key] = decryptWithAES(encrypted, dataKey, iv, tag);
    } catch (error) {
      console.error(`❌ Failed to decrypt field ${key}:`, error);
      decryptedFields[key] = '';
    }
  }
  
  return decryptedFields;
}

/**
 * Hash password for verification (ephemeral - not stored)
 * Uses scrypt with random salt
 */
export async function hashPasswordForVerification(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return {
    hash: hash.toString('hex'),
    salt: salt.toString('hex'),
  };
}

/**
 * Verify password hash
 */
export async function verifyPasswordHash(
  password: string,
  hashHex: string,
  saltHex: string
): Promise<boolean> {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const hash = (await scryptAsync(password, salt, 64)) as Buffer;
    return hash.toString('hex') === hashHex;
  } catch (error) {
    return false;
  }
}
