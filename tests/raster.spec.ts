import { describe, expect, it } from 'vitest'
import { decode, downscale, encodePng, feather, optimizeForSlide, regionClutter, regionContrast } from '../src/images/raster.ts'

function solid(w: number, h: number, rgb: [number, number, number], alpha = 255) {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([...rgb, alpha], i * 4)
  return { width: w, height: h, data }
}

describe('raster', () => {
  it('downscales an opaque image and re-encodes it as JPEG', () => {
    // Noise approximates a generated illustration; flat colors would favor PNG.
    const src = solid(3000, 1600, [200, 180, 150])
    let seed = 7
    for (let i = 0; i < src.data.length; i += 4) { seed = (seed * 1103515245 + 12345) >>> 0; src.data[i] = 120 + (seed % 120) }
    const png = encodePng(src)
    const out = optimizeForSlide(png, 1920, 85)
    expect(out.mime).toBe('image/jpeg')
    const img = decode(out.bytes)
    expect(Math.max(img.width, img.height)).toBe(1920)
    expect(out.bytes.length).toBeLessThan(png.length)
  })
  it('keeps transparency as PNG', () => {
    const out = optimizeForSlide(feather(encodePng(solid(400, 300, [10, 20, 30])), 0.2), 1400, 85)
    expect(out.mime).toBe('image/png')
  })
  it('feathers edges to transparent and keeps the center opaque', () => {
    const img = decode(feather(encodePng(solid(100, 100, [0, 0, 0])), 0.2))
    expect(img.data[3]).toBe(0)
    expect(img.data[(50 * 100 + 50) * 4 + 3]).toBe(255)
  })
  it('measures contrast and clutter over a region', () => {
    const img = solid(200, 100, [250, 250, 250])
    expect(regionContrast(img, [0, 0, 1, 1], '000000')).toBeGreaterThan(19)
    expect(regionClutter(img, [0, 0, 1, 1])).toBe(0)
    for (let y = 0; y < 100; y++) for (let x = 0; x < 40; x++) img.data.set([20, 20, 20, 255], (y * 200 + x) * 4)
    expect(regionClutter(img, [0, 0, 1, 1])).toBeGreaterThan(0.15)
  })
  it('does not upscale', () => {
    const img = solid(100, 50, [1, 2, 3])
    expect(downscale(img, 1000)).toBe(img)
  })
})
