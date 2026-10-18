/** Pixel size of a PNG or JPEG from its header. */

/**
 * Read width and height without decoding pixels.
 * @param bytes - PNG or JPEG.
 * @returns pixel size.
 * @throws when the format is not PNG or JPEG.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2
    while (i < b.length) {
      if (b[i] !== 0xFF) { i++; continue }
      const marker = b[i + 1]!
      const len = b.readUInt16BE(i + 2)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
      i += 2 + len
    }
  }
  throw new Error('unsupported image format (expected PNG or JPEG)')
}
