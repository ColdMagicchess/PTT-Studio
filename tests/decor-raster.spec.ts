/**
 * Decoration raster pipeline: backdrop keying, alpha cropping and sheet
 * splitting. Every image is synthesized here (a few dozen pixels), so no
 * generated sheets or .samples files are needed.
 */
import { describe, expect, it } from 'vitest'
import { cropToAlpha, cutSheet, decode, encodePng, keyBlack, keyWhite, splitSheet } from '../src/images/raster.ts'
import { blank, fillBlock, fillRect, pixel, roundTrip, transparent } from './decor-fixtures.ts'

/** Count pixels that would read as a washed-out white fringe. */
function washedFringe(img: ReturnType<typeof roundTrip>): number {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! > 0 && img.data[i]! > 250 && img.data[i + 1]! > 250 && img.data[i + 2]! > 250) n++
  }
  return n
}

describe('keyWhite', () => {
  it('removes the border-connected white backdrop and keeps the solid color untouched', () => {
    const img = blank(40, 40)
    fillRect(img, 10, 10, 29, 29, [200, 40, 40])
    const keyed = roundTrip(keyWhite(decode(encodePng(img))))
    expect(pixel(keyed, 0, 0)[3]).toBe(0)
    expect(pixel(keyed, 39, 0)[3]).toBe(0)
    expect(pixel(keyed, 0, 39)[3]).toBe(0)
    expect(pixel(keyed, 39, 39)[3]).toBe(0)
    expect(pixel(keyed, 19, 19)).toEqual([200, 40, 40, 255])
  })

  it('keeps enclosed white holes below minHoleFraction and removes larger ones', () => {
    const img = blank(40, 40)
    fillRect(img, 10, 10, 29, 29, [200, 40, 40])
    fillRect(img, 18, 18, 20, 20, [255, 255, 255]) // 3x3 = 9 px, below the 16 px floor
    fillRect(img, 12, 24, 15, 27, [255, 255, 255]) // 4x4 = 16 px, a real lattice opening
    const keyed = roundTrip(keyWhite(decode(encodePng(img))))
    expect(pixel(keyed, 19, 19)).toEqual([255, 255, 255, 255])
    expect(pixel(keyed, 13, 25)[3]).toBe(0)
    // The square itself stays opaque.
    expect(pixel(keyed, 11, 11)[3]).toBe(255)
  })

  it('decontaminates anti-aliased rims instead of leaving a white fringe', () => {
    const img = blank(40, 40)
    fillRect(img, 10, 10, 29, 29, [200, 40, 40])
    for (let x = 10; x <= 29; x++) {
      fillRect(img, x, 10, x, 10, [240, 215, 215])
      fillRect(img, x, 29, x, 29, [240, 215, 215])
    }
    for (let y = 10; y <= 29; y++) {
      fillRect(img, 10, y, 10, y, [240, 215, 215])
      fillRect(img, 29, y, 29, y, [240, 215, 215])
    }
    const keyed = roundTrip(keyWhite(decode(encodePng(img))))
    const rim = pixel(keyed, 10, 10)
    expect(rim[3]).toBeGreaterThan(0)
    expect(rim[3]).toBeLessThan(255)
    // The white spill is subtracted: the rim turns into the square's red family.
    expect(rim[0]).toBeLessThan(250)
    expect(rim[1]).toBeLessThan(150)
    expect(rim[0]).toBeGreaterThan(rim[1]!)
    expect(rim[0]).toBeGreaterThan(rim[2]!)
    expect(washedFringe(keyed)).toBe(0)
  })
})

describe('keyBlack', () => {
  it('makes a black backdrop transparent and un-premultiplies a bright glow', () => {
    const img = blank(40, 40, [0, 0, 0])
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      if (Math.hypot(x - 20, y - 20) < 10) img.data.set([200, 100, 50, 255], (y * 40 + x) * 4)
    }
    const keyed = roundTrip(keyBlack(decode(encodePng(img))))
    expect(pixel(keyed, 0, 0)[3]).toBe(0)
    const [r, g, b, a] = pixel(keyed, 20, 20)
    expect(a).toBeGreaterThan(190)
    // The brightest channel is normalized to 255 so alpha can carry brightness.
    expect(r).toBe(255)
    expect(g).toBeGreaterThan(b)
    expect(g / b).toBeCloseTo(2, 1)
    // Composited back over black the glow matches the source color.
    expect(Math.abs((r * a) / 255 - 200)).toBeLessThanOrEqual(8)
    expect(Math.abs((g * a) / 255 - 100)).toBeLessThanOrEqual(8)
    expect(Math.abs((b * a) / 255 - 50)).toBeLessThanOrEqual(8)
  })

  it('makes pixels at or below the brightness floor fully transparent', () => {
    const img = blank(3, 1, [0, 0, 0])
    fillRect(img, 0, 0, 0, 0, [5, 8, 10])
    fillRect(img, 1, 0, 1, 0, [12, 12, 12])
    fillRect(img, 2, 0, 2, 0, [13, 13, 13])
    const keyed = keyBlack(decode(encodePng(img)))
    expect(pixel(keyed, 0, 0)[3]).toBe(0)
    expect(pixel(keyed, 1, 0)[3]).toBe(0)
    expect(pixel(keyed, 2, 0)[3]).toBeGreaterThan(0)
    // An explicit floor moves the cutoff.
    const high = keyBlack(decode(encodePng(img)), 100)
    expect(pixel(high, 2, 0)[3]).toBe(0)
  })
})

describe('cropToAlpha', () => {
  it('crops to the opaque bounding box and pads by a fraction of the larger side', () => {
    const img = transparent(40, 40)
    fillRect(img, 12, 8, 20, 16, [10, 20, 30]) // 9x9 at (12, 8)
    const tight = cropToAlpha(img, 16, 0)!
    expect([tight.width, tight.height]).toEqual([9, 9])
    expect(pixel(tight, 0, 0)).toEqual([10, 20, 30, 255])
    const padded = cropToAlpha(img, 16, 0.1)!
    expect([padded.width, padded.height]).toEqual([11, 11])
  })

  it('returns undefined for a fully transparent image', () => {
    expect(cropToAlpha(transparent(8, 8))).toBeUndefined()
  })

  it('ignores pixels at or below the alpha threshold', () => {
    const img = transparent(10, 10)
    fillRect(img, 3, 3, 3, 3, [1, 2, 3], 10)
    fillRect(img, 5, 5, 5, 5, [4, 5, 6], 32)
    const cropped = cropToAlpha(img, 16, 0)!
    expect([cropped.width, cropped.height]).toEqual([1, 1])
    expect(pixel(cropped, 0, 0)).toEqual([4, 5, 6, 32])
  })
})

describe('splitSheet', () => {
  it('splits a two by three sheet into six pieces in reading order', () => {
    const sheet = transparent(120, 80)
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) fillBlock(sheet, 8 + col * 38, 8 + row * 38, 16, 16, [200, 50, 50])
    const pieces = splitSheet(sheet)
    expect(pieces).toHaveLength(6)
    expect(pieces.every(p => p.width === 16 && p.height === 16)).toBe(true)
    expect(pieces.every(p => p.area === 16 * 16)).toBe(true)
    const top = pieces.slice(0, 3)
    const bottom = pieces.slice(3)
    // Reading order: the first row comes first, left to right, then the second row.
    expect(top.every(p => p.y < bottom[0]!.y)).toBe(true)
    expect(top.map(p => p.x)).toEqual([...top.map(p => p.x)].sort((a, b) => a - b))
    expect(bottom.map(p => p.x)).toEqual([...bottom.map(p => p.x)].sort((a, b) => a - b))
    for (const piece of pieces) {
      const decoded = decode(piece.png)
      expect([decoded.width, decoded.height]).toEqual([piece.width, piece.height])
      expect(pixel(decoded, 1, 1)[3]).toBe(255)
    }
  })

  it('filters noise pieces smaller than minAreaFraction', () => {
    const sheet = transparent(120, 80)
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) fillBlock(sheet, 8 + col * 38, 8 + row * 38, 16, 16, [200, 50, 50])
    fillBlock(sheet, 100, 70, 2, 2, [10, 200, 10])
    expect(splitSheet(sheet)).toHaveLength(6)
  })

  it('merges two nearby pieces because of gapFraction', () => {
    const near = transparent(120, 80)
    fillBlock(near, 20, 30, 10, 10, [200, 50, 50])
    fillBlock(near, 31, 30, 10, 10, [200, 50, 50]) // one transparent column apart
    expect(splitSheet(near)).toHaveLength(1)

    const apart = transparent(120, 80)
    fillBlock(apart, 20, 30, 10, 10, [200, 50, 50])
    fillBlock(apart, 50, 30, 10, 10, [200, 50, 50])
    expect(splitSheet(apart)).toHaveLength(2)

    const sixApart = transparent(120, 80)
    fillBlock(sixApart, 20, 30, 10, 10, [200, 50, 50])
    fillBlock(sixApart, 36, 30, 10, 10, [200, 50, 50]) // six transparent columns apart
    expect(splitSheet(sixApart)).toHaveLength(2)
    expect(splitSheet(sixApart, 0.004, 0.03)).toHaveLength(1)
  })
})

describe('cutSheet', () => {
  it('drops a full-width letterbox band that splitSheet still reports as a piece', () => {
    const sheet = blank(200, 100)
    fillRect(sheet, 20, 10, 49, 39, [180, 40, 40]) // a normal 30x30 piece
    fillRect(sheet, 0, 46, 199, 51, [30, 60, 120]) // a narrow band spanning the whole width
    const keyed = keyWhite(decode(encodePng(sheet)))
    expect(splitSheet(keyed)).toHaveLength(2) // the band is a piece before the letterbox filter
    const cut = cutSheet(encodePng(sheet), 'white')
    expect(cut).toHaveLength(1)
    expect([cut[0]!.width, cut[0]!.height]).toEqual([30, 30])
  })

  it('keys a black sheet too', () => {
    const sheet = blank(100, 100, [0, 0, 0])
    fillRect(sheet, 30, 30, 59, 59, [200, 100, 50])
    const cut = cutSheet(encodePng(sheet), 'black')
    expect(cut).toHaveLength(1)
    expect([cut[0]!.width, cut[0]!.height]).toEqual([30, 30])
  })
})
