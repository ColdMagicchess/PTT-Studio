/**
 * Pure-JS raster helpers: decode PNG/JPEG, feather edges to transparency,
 * average color of a region. No native modules so the plugin installs
 * without build scripts.
 */
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

/** Decoded RGBA image. */
export interface Rgba { width: number; height: number; data: Uint8Array }

/**
 * Decode PNG or JPEG bytes.
 * @param bytes - encoded image.
 */
export function decode(bytes: Uint8Array): Rgba {
  const buf = Buffer.from(bytes)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
    return { width: img.width, height: img.height, data: img.data }
  }
  const png = PNG.sync.read(buf)
  return { width: png.width, height: png.height, data: png.data }
}

/**
 * Encode RGBA as PNG.
 * @param img - image.
 */
export function encodePng(img: Rgba, compact = false): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  return PNG.sync.write(png, compact ? { deflateLevel: 9, filterType: 4 } : {})
}

/**
 * Fade the outer `fraction` of each edge to transparent with a smooth curve.
 * @param bytes - PNG or JPEG.
 * @param fraction - band width as a fraction of the shorter side.
 * @returns PNG with alpha.
 */
export function feather(bytes: Uint8Array, fraction = 0.18): Uint8Array {
  const img = decode(bytes)
  const band = Math.max(1, Math.round(Math.min(img.width, img.height) * fraction))
  const { width, height, data } = img
  for (let y = 0; y < height; y++) {
    const dy = Math.min(y, height - 1 - y)
    for (let x = 0; x < width; x++) {
      const d = Math.min(dy, x, width - 1 - x)
      if (d >= band) continue
      const t = d / band
      const a = t * t * (3 - 2 * t)
      const i = (y * width + x) * 4 + 3
      data[i] = Math.round(data[i]! * a)
    }
  }
  return encodePng(img)
}

/**
 * Average RGB of a region given in fractions of the image.
 * @param bytes - PNG or JPEG.
 * @param region - [x0, y0, x1, y1] fractions.
 * @returns hex color without #.
 */
export function averageColor(bytes: Uint8Array, region: [number, number, number, number]): string {
  const img = decode(bytes)
  const [x0, y0, x1, y1] = region
  let r = 0, g = 0, b = 0, n = 0
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / 200))
  for (let y = Math.floor(y0 * img.height); y < Math.floor(y1 * img.height); y += step) {
    for (let x = Math.floor(x0 * img.width); x < Math.floor(x1 * img.width); x += step) {
      const i = (y * img.width + x) * 4
      r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; n++
    }
  }
  const hex = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')
  return (hex(r) + hex(g) + hex(b)).toUpperCase()
}

/**
 * Worst-case text contrast over a region: the contrast of `fgHex` against the
 * pixel at the given percentile of contrast (low contrast first), ignoring the
 * brightest/darkest outliers. Sampled on a grid for speed.
 * @param img - decoded image.
 * @param region - [x0, y0, x1, y1] fractions.
 * @param fgHex - text color without #.
 * @param percentile - 0..1; 0.1 means 10% of the area is worse than the result.
 */
export function regionContrast(img: Rgba, region: [number, number, number, number], fgHex: string, percentile = 0.1): number {
  const lum = (r: number, g: number, b: number) => {
    const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const fg = lum(parseInt(fgHex.slice(0, 2), 16), parseInt(fgHex.slice(2, 4), 16), parseInt(fgHex.slice(4, 6), 16))
  const [x0, y0, x1, y1] = region
  const ratios: number[] = []
  const sx = Math.max(1, Math.floor((x1 - x0) * img.width / 60)), sy = Math.max(1, Math.floor((y1 - y0) * img.height / 30))
  for (let y = Math.floor(y0 * img.height); y < Math.min(img.height, Math.ceil(y1 * img.height)); y += sy) {
    for (let x = Math.floor(x0 * img.width); x < Math.min(img.width, Math.ceil(x1 * img.width)); x += sx) {
      const i = (y * img.width + x) * 4
      const l = lum(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)
      const [a, b] = fg > l ? [fg, l] : [l, fg]
      ratios.push((a + 0.05) / (b + 0.05))
    }
  }
  if (ratios.length === 0) return 21
  ratios.sort((a, b) => a - b)
  return ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * percentile))]!
}

/**
 * Share of a region occupied by pixels far from the region's median color
 * (Euclidean RGB distance > `threshold`): decorations crossing a text area.
 * @param img - decoded image.
 * @param region - [x0, y0, x1, y1] fractions.
 * @param threshold - RGB distance, 0–441.
 */
export function regionClutter(img: Rgba, region: [number, number, number, number], threshold = 60): number {
  const [x0, y0, x1, y1] = region
  const px: [number, number, number][] = []
  const sx = Math.max(1, Math.floor((x1 - x0) * img.width / 80)), sy = Math.max(1, Math.floor((y1 - y0) * img.height / 40))
  for (let y = Math.floor(y0 * img.height); y < Math.min(img.height, Math.ceil(y1 * img.height)); y += sy) {
    for (let x = Math.floor(x0 * img.width); x < Math.min(img.width, Math.ceil(x1 * img.width)); x += sx) {
      const i = (y * img.width + x) * 4
      px.push([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!])
    }
  }
  if (px.length === 0) return 0
  const med = [0, 1, 2].map(c => px.map(p => p[c]!).sort((a, b) => a - b)[Math.floor(px.length / 2)]!)
  let far = 0
  for (const p of px) if (Math.hypot(p[0] - med[0]!, p[1] - med[1]!, p[2] - med[2]!) > threshold) far++
  return far / px.length
}

/**
 * Downscale to a thumbnail PNG (nearest-neighbor, fast and dependency-free).
 * @param bytes - encoded image.
 * @param maxSide - longest side in pixels.
 */
export function thumbnail(bytes: Uint8Array, maxSide = 512): Uint8Array {
  const src = decode(bytes)
  const s = Math.min(1, maxSide / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor(x / s)), sy = Math.min(src.height - 1, Math.floor(y / s))
    out.set(src.data.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4), (y * w + x) * 4)
  }
  return encodePng({ width: w, height: h, data: out })
}

/**
 * Area-average downscale (box filter) so the longest side is at most `maxSide`.
 * @param img - decoded image.
 * @param maxSide - target longest side in pixels.
 */
export function downscale(img: Rgba, maxSide: number): Rgba {
  const s = maxSide / Math.max(img.width, img.height)
  if (s >= 1) return img
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / s), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) / s)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / s), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) / s)))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.width + xx) * 4
        r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; a += img.data[i + 3]!; n++
      }
      const o = (y * w + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n
    }
  }
  return { width: w, height: h, data: out }
}

/** Encoded image ready to embed. */
export interface EncodedImage { mime: 'image/jpeg' | 'image/png'; bytes: Uint8Array }

/**
 * Prepare an image for embedding: downscale to `maxSide`, then JPEG when it is
 * fully opaque (smaller), PNG when it has transparency.
 * @param bytes - PNG or JPEG.
 * @param maxSide - longest side in pixels.
 * @param quality - JPEG quality 1–100.
 */
export function optimizeForSlide(bytes: Uint8Array, maxSide: number, quality: number): EncodedImage {
  const img = downscale(decode(bytes), maxSide)
  let opaque = true
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 255) { opaque = false; break }
  if (!opaque) return { mime: 'image/png', bytes: encodePng(img, true) }
  const enc = jpeg.encode({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, quality)
  return { mime: 'image/jpeg', bytes: enc.data }
}

/**
 * Average color of the outer `fraction` border band of an image, as RGB.
 * @param bytes - PNG or JPEG.
 * @param fraction - band width as a fraction of each side.
 */
export function borderColor(bytes: Uint8Array, fraction = 0.04): [number, number, number] {
  const img = decode(bytes)
  const bw = Math.max(1, Math.round(img.width * fraction)), bh = Math.max(1, Math.round(img.height * fraction))
  let r = 0, g = 0, b = 0, n = 0
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / 300))
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) {
    if (x >= bw && x < img.width - bw && y >= bh && y < img.height - bh) continue
    const i = (y * img.width + x) * 4
    r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; n++
  }
  return [r / n, g / n, b / n]
}

/** How a decoration's solid backdrop is removed. */
export type KeyMode = 'white' | 'black'

/**
 * Remove a flat white backdrop: every near-white region connected to the image
 * border becomes transparent, plus enclosed near-white holes larger than
 * `minHoleFraction` of the image (lattice openings). Edge pixels between the
 * two thresholds get partial alpha with the white spill removed.
 * @param img - decoded RGBA image (modified in place and returned).
 * @param hard - RGB distance to white treated as backdrop.
 * @param soft - RGB distance up to which edge pixels fade.
 * @param minHoleFraction - smallest enclosed hole removed, as a fraction of the image area.
 */
export function keyWhite(img: Rgba, hard = 48, soft = 96, minHoleFraction = 0.0015): Rgba {
  const { width: w, height: h, data } = img
  const dist = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) dist[p] = Math.hypot(255 - data[p * 4]!, 255 - data[p * 4 + 1]!, 255 - data[p * 4 + 2]!)
  const label = new Int32Array(w * h).fill(-1)
  const stack: number[] = []
  const fill = (start: number, id: number): number => {
    let n = 0
    stack.push(start); label[start] = id
    while (stack.length > 0) {
      const p = stack.pop()!; n++
      const x = p % w, y = (p - x) / w
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && label[q] === -1 && dist[q]! < hard) { label[q] = id; stack.push(q) }
      }
    }
    return n
  }
  // id 0: backdrop connected to the border
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const p = y * w + x; if (label[p] === -1 && dist[p]! < hard) fill(p, 0) }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const p = y * w + x; if (label[p] === -1 && dist[p]! < hard) fill(p, 0) }
  // enclosed near-white regions: remove the large ones (holes), keep small highlights
  const minHole = Math.max(16, Math.round(w * h * minHoleFraction))
  const holeIds = new Set<number>()
  let next = 1
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== -1 || dist[p]! >= hard) continue
    const id = next++
    if (fill(p, id) >= minHole) holeIds.add(id)
  }
  const isBackdrop = (p: number) => label[p] === 0 || holeIds.has(label[p]!)
  for (let p = 0; p < w * h; p++) {
    if (isBackdrop(p)) { data[p * 4 + 3] = 0; continue }
    const d = dist[p]!
    if (d >= soft) continue
    // Only fade pixels that touch the backdrop (anti-aliased rims), not interior light areas.
    const x = p % w, y = (p - x) / w
    let edge = false
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && isBackdrop(yy * w + xx)) edge = true
    }
    if (!edge) continue
    const a = Math.max(0.05, Math.min(1, (d - hard) / (soft - hard)))
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.max(0, Math.min(255, Math.round((data[p * 4 + c]! - 255 * (1 - a)) / a)))
    data[p * 4 + 3] = Math.round(a * data[p * 4 + 3]!)
  }
  return img
}

/**
 * Remove a flat black backdrop from glowing artwork: alpha follows brightness
 * (like a screen blend), colors are un-premultiplied so glows keep their hue.
 * @param img - decoded RGBA image (modified in place and returned).
 * @param floor - brightness (0–255) at or below which a pixel is fully transparent.
 */
export function keyBlack(img: Rgba, floor = 12): Rgba {
  const { data } = img
  for (let i = 0; i < data.length; i += 4) {
    const m = Math.max(data[i]!, data[i + 1]!, data[i + 2]!)
    if (m <= floor) { data[i + 3] = 0; continue }
    const a = Math.min(1, (m - floor) / (255 - floor))
    const scale = 255 / m
    data[i] = Math.min(255, Math.round(data[i]! * scale)); data[i + 1] = Math.min(255, Math.round(data[i + 1]! * scale)); data[i + 2] = Math.min(255, Math.round(data[i + 2]! * scale))
    data[i + 3] = Math.round(255 * a ** 0.85)
  }
  return img
}

/**
 * Crop to the bounding box of pixels with alpha above `threshold`, keeping
 * `padFraction` of the larger side as margin.
 * @param img - RGBA image.
 * @returns the cropped image, or undefined when nothing is opaque.
 */
export function cropToAlpha(img: Rgba, threshold = 16, padFraction = 0.01): Rgba | undefined {
  const { width: w, height: h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]! > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return undefined
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * padFraction)
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad)
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const out = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * cw * 4)
  return { width: cw, height: ch, data: out }
}

/** Share of pixels that keep any opacity (0–1). */
export function opaqueShare(img: Rgba): number {
  let n = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 16) n++
  return n / (img.width * img.height)
}

/**
 * Turn a generated decoration into a transparent, tightly cropped PNG.
 * @param bytes - generated PNG/JPEG on a flat white or black backdrop.
 * @param mode - which backdrop to remove.
 * @param maxSide - longest side of the stored result.
 * @returns PNG bytes and pixel size, or undefined when keying removed everything.
 */
export function cutDecoration(bytes: Uint8Array, mode: KeyMode, maxSide = 1400): { png: Uint8Array; width: number; height: number; coverage: number } | undefined {
  let img = decode(bytes)
  img = mode === 'white' ? keyWhite(img) : keyBlack(img)
  const cropped = cropToAlpha(img)
  if (cropped === undefined) return undefined
  const small = downscale(cropped, maxSide)
  return { png: encodePng(small, true), width: small.width, height: small.height, coverage: opaqueShare(small) }
}

/**
 * Turn an illustration generated on a flat backdrop into a transparent,
 * tightly cropped PNG. Unlike decoration pieces, enclosed near-white areas
 * (a white shirt, a robot body, a screen) are kept: only the backdrop that
 * touches the border is removed.
 * @param bytes - generated PNG/JPEG on a flat white or black backdrop.
 * @param mode - which backdrop to remove.
 * @param maxSide - longest side of the stored result.
 */
export function cutoutImage(bytes: Uint8Array, mode: KeyMode, maxSide = 1400): { png: Uint8Array; width: number; height: number } | undefined {
  let img = decode(bytes)
  img = mode === 'white' ? keyWhite(img, 60, 110, 0.95) : keyBlack(img, 12)
  const cropped = cropToAlpha(img, 12, 0.005)
  if (cropped === undefined) return undefined
  const small = downscale(cropped, maxSide)
  return { png: encodePng(small, true), width: small.width, height: small.height }
}

/** One piece split out of a decoration sheet. */
export interface SheetPiece { png: Uint8Array; width: number; height: number; x: number; y: number; area: number }

/**
 * Split a keyed decoration sheet into separate pieces by connected opaque
 * regions on a downsampled alpha mask. Regions closer than `gapFraction` of
 * the sheet are merged (a flower and its detached petals stay one piece).
 * @param img - keyed RGBA sheet (backdrop already transparent).
 * @param minAreaFraction - smallest kept piece, as a fraction of the sheet area.
 * @param gapFraction - merge distance, as a fraction of the sheet's longer side.
 * @returns pieces sorted top-to-bottom, left-to-right.
 */
export function splitSheet(img: Rgba, minAreaFraction = 0.004, gapFraction = 0.0015): SheetPiece[] {
  const scale = Math.max(1, Math.floor(Math.max(img.width, img.height) / 512))
  const mw = Math.ceil(img.width / scale), mh = Math.ceil(img.height / scale)
  const mask = new Uint8Array(mw * mh)
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! > 24) mask[Math.floor(y / scale) * mw + Math.floor(x / scale)] = 1
  // Dilate by the merge gap so near pieces join, then label.
  const gap = Math.max(1, Math.round(Math.max(mw, mh) * gapFraction))
  const dil = new Uint8Array(mw * mh)
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    if (!mask[y * mw + x]) continue
    for (let dy = -gap; dy <= gap; dy++) { const yy = y + dy; if (yy < 0 || yy >= mh) continue
      for (let dx = -gap; dx <= gap; dx++) { const xx = x + dx; if (xx >= 0 && xx < mw) dil[yy * mw + xx] = 1 } }
  }
  const label = new Int32Array(mw * mh).fill(-1)
  const boxes: { x0: number; y0: number; x1: number; y1: number; area: number }[] = []
  for (let p = 0; p < mw * mh; p++) {
    if (!dil[p] || label[p] !== -1) continue
    const id = boxes.length
    const b = { x0: mw, y0: mh, x1: -1, y1: -1, area: 0 }
    const stack = [p]; label[p] = id
    while (stack.length > 0) {
      const q = stack.pop()!
      const x = q % mw, y = (q - x) / mw
      if (mask[q]) { b.area++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y }
      for (const n of [x > 0 ? q - 1 : -1, x < mw - 1 ? q + 1 : -1, y > 0 ? q - mw : -1, y < mh - 1 ? q + mw : -1]) if (n >= 0 && dil[n] && label[n] === -1) { label[n] = id; stack.push(n) }
    }
    boxes.push(b)
  }
  const minArea = mw * mh * minAreaFraction
  const pieces: SheetPiece[] = []
  for (const [id, b] of boxes.entries()) {
    if (b.area < minArea || b.x1 < 0) continue
    const x0 = Math.max(0, b.x0 * scale - scale), y0 = Math.max(0, b.y0 * scale - scale)
    const x1 = Math.min(img.width - 1, (b.x1 + 1) * scale + scale), y1 = Math.min(img.height - 1, (b.y1 + 1) * scale + scale)
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1
    const out = new Uint8Array(cw * ch * 4)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sx = x0 + x, sy = y0 + y
      // Keep only pixels belonging to this component so neighbors inside the box are dropped.
      if (label[Math.floor(sy / scale) * mw + Math.floor(sx / scale)] !== id) continue
      const si = (sy * img.width + sx) * 4
      out.set(img.data.subarray(si, si + 4), (y * cw + x) * 4)
    }
    const cropped = cropToAlpha({ width: cw, height: ch, data: out })
    if (cropped === undefined) continue
    pieces.push({ png: encodePng(cropped, true), width: cropped.width, height: cropped.height, x: x0, y: y0, area: b.area * scale * scale })
  }
  const row = Math.max(1, img.height / 6)
  return pieces.sort((a, b) => Math.floor(a.y / row) - Math.floor(b.y / row) || a.x - b.x)
}

/**
 * Key a decoration sheet and split it into pieces.
 * @param bytes - generated sheet image.
 * @param mode - backdrop to remove.
 * @param maxSide - longest side of each stored piece.
 */
export function cutSheet(bytes: Uint8Array, mode: KeyMode, maxSide = 900): SheetPiece[] {
  let img = decode(bytes)
  img = mode === 'white' ? keyWhite(img) : keyBlack(img)
  // Generators sometimes letterbox a sheet with a band of the other color; drop bands that touch two opposite edges.
  return splitSheet(img).filter(p => !(p.width > img.width * 0.95 && p.height < img.height * 0.12)).map(p => {
    const d = downscale(decode(p.png), maxSide)
    return { ...p, png: encodePng(d, true), width: d.width, height: d.height }
  })
}
