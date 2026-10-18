import { describe, expect, it } from 'vitest'
import { cardModel, fileName, formatBytes, healthTone, imageMime } from '../src/client/card-model.ts'
import { contactSheet, encodeJpeg, sheetColumns } from '../src/images/contact-sheet.ts'
import { decode } from '../src/images/raster.ts'

function solid(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255 }
  return { width, height, data }
}

describe('card models', () => {
  it('formats sizes, names and tones', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(650_000)).toBe('635 KB')
    expect(formatBytes(3_040_000)).toBe('2.9 MB')
    expect(fileName('E:\\deck\\builds\\deck.v3.pptx')).toBe('deck.v3.pptx')
    expect(imageMime('a/b.JPG')).toBe('image/jpeg')
    expect(imageMime('a/b.pptx')).toBeUndefined()
    expect(healthTone(1, 0)).toBe('danger')
    expect(healthTone(0, 2)).toBe('warning')
    expect(healthTone(0, 0)).toBe('success')
  })

  it('builds the pptx_build card from presentation meta', () => {
    const card = cardModel('pptx_build', {
      kind: 'pptx-build', path: '/w/builds/deck.v2.pptx', slides: 7, bytes: 2_900_000, errors: 0, warnings: 3,
      sheet: '/w/builds/deck.v2.preview.jpg', thumbnails: ['/w/builds/review/deck.v2/slide-01.png'],
      findings: [{ slide: 's02', check: 'fill', severity: 'warning', message: 'too empty' }],
    })
    expect(card).toMatchObject({ kind: 'pptx-build', fileName: 'deck.v2.pptx', slides: 7, size: '2.8 MB', sheet: '/w/builds/deck.v2.preview.jpg' })
    expect(card?.kind === 'pptx-build' && card.findings[0]?.severity).toBe('warning')
  })

  it('keeps older results without meta on the generic fallback', () => {
    expect(cardModel('pptx_build', undefined)).toBeUndefined()
    expect(cardModel('pptx_build', { slides: 3 })).toBeUndefined()
    expect(cardModel('unknown_tool', { path: 'x' })).toBeUndefined()
  })

  it('maps review, asset, board and render metas', () => {
    const review = cardModel('pptx_review', { model: 'route p/m', summary: { errors: 1, warnings: 2, passed: 3 }, pages: [{ page: 1, verdict: 'fail', score: 40, issues: [{ severity: 'error', area: 'contrast', issue: 'unreadable', fix: 'darken' }] }], files: ['/r/slide-01.png'] })
    expect(review).toMatchObject({ kind: 'pptx-review', summary: { errors: 1, warnings: 2, passed: 3 } })
    const assets = cardModel('pptx_generate_assets', { files: [{ id: 'bg', file: '/d/assets/bg.png' }, { id: 'x', file: '/d/assets/x.svg' }], failed: [{ id: 'il', error: 'timeout' }], kits: [{ id: 'k', sheet: '/d/decor/k.png', pieces: 4 }], job: null, backend: 'agnes' })
    expect(assets).toMatchObject({ kind: 'pptx-assets', failed: [{ id: 'il', error: 'timeout' }], note: 'agnes' })
    expect(assets?.kind === 'pptx-assets' && assets.images.map(i => i.label)).toEqual(['bg', 'k · 4'])
    const job = cardModel('pptx_generate_assets', { files: [], failed: [], kits: [], job: { id: 'pptx-generate-images-1', label: 'generate' } })
    expect(job?.kind === 'pptx-assets' && job.job?.id).toBe('pptx-generate-images-1')
    expect(cardModel('pptx_style_board', { files: ['/d/style/board-1.png'] })).toMatchObject({ kind: 'pptx-style-board', images: [{ label: 'board-1' }] })
    expect(cardModel('pptx_render', { files: ['/r/slide-03.png'], pages: [3], missingFonts: [] })).toMatchObject({ kind: 'pptx-render', images: [{ label: 'P3' }], note: null })
  })
})

describe('contact sheet', () => {
  it('picks near-16:9 grids', () => {
    expect([1, 2, 4, 5, 7, 9, 12].map(sheetColumns)).toEqual([1, 2, 2, 3, 3, 3, 4])
  })

  it('lays slides out in a grid and encodes JPEG', () => {
    const sheet = contactSheet([solid(160, 90, [255, 0, 0]), solid(160, 90, [0, 0, 255]), solid(160, 90, [0, 255, 0])], { cols: 2, cellWidth: 80, gap: 4, background: [255, 255, 255] })
    expect(sheet.width).toBe(4 + 2 * (80 + 4))
    expect(sheet.height).toBe(4 + 2 * (45 + 4))
    const at = (x: number, y: number) => Array.from(sheet.data.subarray((y * sheet.width + x) * 4, (y * sheet.width + x) * 4 + 3))
    expect(at(10, 10)).toEqual([255, 0, 0])
    expect(at(100, 10)).toEqual([0, 0, 255])
    expect(at(10, 60)).toEqual([0, 255, 0])
    expect(at(100, 60)).toEqual([255, 255, 255])
    const jpeg = encodeJpeg(sheet)
    expect(decode(jpeg).width).toBe(sheet.width)
  })
})
