/**
 * Lightweight image metadata extractor (PNG + JPEG) for server-side uploads.
 * Falls back to nulls if the format is unknown.
 */
export type ImageMeta = {
  width: number | null
  height: number | null
  format: 'png' | 'jpeg' | 'unknown'
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function getImageMetadata(input: ArrayBuffer | Buffer): ImageMeta {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)

  // PNG: width/height are big-endian at offset 16
  if (buf.length >= 24 && buf.slice(0, 8).equals(PNG_SIGNATURE)) {
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    return { width, height, format: 'png' }
  }

  // JPEG: scan markers until SOF0/1/2
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buf[offset + 1]
      const blockLength = buf.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = buf.readUInt16BE(offset + 5)
        const width = buf.readUInt16BE(offset + 7)
        return { width, height, format: 'jpeg' }
      }
      // Prevent infinite loop on malformed data
      if (blockLength < 2) break
      offset += 2 + blockLength
    }
  }

  return { width: null, height: null, format: 'unknown' }
}
