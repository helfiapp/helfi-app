const inferContentTypeFromName = (name: string) => {
  const lower = String(name || '').toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp') || lower.endsWith('.web')) return 'image/webp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  return null
}

const detectContentTypeFromBuffer = (buffer: Buffer) => {
  if (buffer.length < 12) return null

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer.slice(0, 6).toString('ascii') === 'GIF87a' || buffer.slice(0, 6).toString('ascii') === 'GIF89a') {
    return 'image/gif'
  }
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  if (buffer.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase()
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'image/heic'
    if (brand === 'heif' || brand === 'heis' || brand === 'heim' || brand === 'hevm' || brand === 'mif1' || brand === 'msf1') {
      return 'image/heif'
    }
  }

  return null
}

export const resolveImageContentType = (type: string | null | undefined, name: string | null | undefined, buffer: Buffer) => {
  const detected = detectContentTypeFromBuffer(buffer)
  if (detected) return detected
  const trimmedType = String(type || '').trim().toLowerCase()
  if (trimmedType.startsWith('image/')) return trimmedType
  return inferContentTypeFromName(String(name || '')) || 'image/jpeg'
}

const shouldConvertForAi = (mimeType: string) => {
  return mimeType === 'image/avif' || mimeType === 'image/heic' || mimeType === 'image/heif'
}

export async function normalizeImageForAi(buffer: Buffer, mimeType: string) {
  if (!shouldConvertForAi(mimeType)) {
    return { buffer, mimeType, converted: false as const }
  }

  try {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default || sharpModule
    const convertedBuffer = await sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer()
    return { buffer: convertedBuffer, mimeType: 'image/jpeg', converted: true as const }
  } catch (error) {
    console.warn('[ai-image-normalize] failed to convert image for AI, using original format', error)
    return { buffer, mimeType, converted: false as const }
  }
}
