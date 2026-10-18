/**
 * Illustration cutouts: the prompt asks for a keyable flat backdrop, the
 * schema accepts the cutout field, and cutoutImage() removes only the
 * border-connected backdrop while keeping enclosed near-white details.
 */
import { describe, expect, it } from 'vitest'
import { validateDeck, DeckValidationError } from '../src/deck/validate.ts'
import type { Rgba } from '../src/images/raster.ts'
import { cutoutImage, decode, encodePng } from '../src/images/raster.ts'
import { assetPrompt } from '../src/images/prompt.ts'
import { blank, deckJson, fillRect, pixel, transparent } from './decor-fixtures.ts'

function assetDeck(asset: Record<string, unknown>) {
  const json = deckJson()
  json.assets = [{ id: 'il-one', kind: 'illustration', aspect: '4:3', prompt: 'a golden osmanthus branch', ...asset }]
  return validateDeck(json)
}

const promptFor = (asset: Record<string, unknown>, withNoTextSuffix = false) => {
  const deck = assetDeck(asset)
  return assetPrompt(deck, deck.assets![0]!, withNoTextSuffix)
}

const ISSUE_PATHS = (run: () => void): string[] => {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(DeckValidationError)
    return (e as DeckValidationError).issues.map(i => i.path)
  }
  throw new Error('expected deck validation to fail')
}

/** Fill a hard-edged circle (used so a tight crop keeps transparent corners). */
function fillCircle(img: Rgba, cx: number, cy: number, r: number, rgb: [number, number, number]): void {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.data.set([rgb[0], rgb[1], rgb[2], 255], (y * img.width + x) * 4)
  }
}

function requireCutout(bytes: Uint8Array, mode: 'white' | 'black') {
  const cut = cutoutImage(bytes, mode)
  expect(cut).toBeDefined()
  if (cut === undefined) throw new Error('expected a cutout PNG')
  return cut
}

describe('assetPrompt cutout', () => {
  it('asks for a keyable pure white backdrop and no scene elements', () => {
    const prompt = promptFor({ cutout: 'white' })
    expect(prompt).toContain('on a plain flat pure white background')
    expect(prompt).toContain('nothing touching the edges')
    expect(prompt).toContain('no scenery')
    expect(prompt).toContain('no ground shadow')
    expect(prompt).toContain('a golden osmanthus branch')
    expect(prompt).not.toContain('on a plain solid')
  })

  it('asks for a pure black backdrop in black mode', () => {
    const prompt = promptFor({ cutout: 'black' })
    expect(prompt).toContain('on a plain flat pure black background')
    expect(prompt).toContain('nothing touching the edges')
    expect(prompt).not.toContain('on a plain solid')
  })

  it('lets cutout win over onColor', () => {
    const prompt = promptFor({ cutout: 'white', onColor: 'surface' })
    expect(prompt).toContain('on a plain flat pure white background')
    expect(prompt).not.toContain('on a plain solid')
  })

  it('leaves the old onColor behaviour unchanged when there is no cutout', () => {
    const plain = promptFor({})
    expect(plain).not.toContain('on a plain solid')
    expect(plain).not.toContain('nothing touching the edges')
    const colored = promptFor({ onColor: 'surface' })
    expect(colored).toMatch(/on a plain solid [a-z ]+ background/)
    expect(colored).not.toContain('nothing touching the edges')
  })
})

describe('validateDeck asset cutout', () => {
  it('accepts both cutout modes and keeps them on the parsed asset', () => {
    for (const mode of ['white', 'black'] as const) {
      expect(assetDeck({ cutout: mode }).assets![0]!.cutout).toBe(mode)
    }
  })

  it('rejects an unknown cutout mode', () => {
    expect(ISSUE_PATHS(() => assetDeck({ cutout: 'green' }))).toContain('/assets/0/cutout')
  })

  it('allows cutout and onColor together (cutout only wins in the prompt)', () => {
    const deck = assetDeck({ cutout: 'black', onColor: 'background' })
    expect(deck.assets![0]!.cutout).toBe('black')
    expect(deck.assets![0]!.onColor).toBe('background')
  })
})

describe('cutoutImage', () => {
  it('removes the white backdrop but keeps an enclosed white detail opaque', () => {
    // 64x64 white canvas, a red circle, and a white square painted inside it.
    const img = blank(64, 64)
    fillCircle(img, 32, 32, 20, [200, 40, 40])
    fillRect(img, 28, 28, 35, 35, [255, 255, 255])
    const cut = requireCutout(encodePng(img), 'white')
    const png = decode(cut.png)
    expect([png.width, png.height]).toEqual([cut.width, cut.height])
    expect(cut.width).toBe(41) // tight crop of the 41x41 circle
    // The crop corners are outside the circle, so the backdrop is gone.
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]) {
      expect(pixel(png, x!, y!)[3]).toBe(0)
    }
    // The red body stays fully opaque and unwashed.
    expect(pixel(png, 8, 20)).toEqual([200, 40, 40, 255])
    // Regression: the enclosed white square must NOT be treated as backdrop.
    expect(pixel(png, 19, 19)).toEqual([255, 255, 255, 255])
  })

  it('returns undefined when the whole image is transparent', () => {
    const empty = encodePng(transparent(64, 64))
    expect(cutoutImage(empty, 'white')).toBeUndefined()
    expect(cutoutImage(empty, 'black')).toBeUndefined()
  })

  it('keys a black backdrop through keyBlack into a transparent PNG', () => {
    const img = blank(64, 64, [0, 0, 0])
    fillCircle(img, 32, 32, 18, [220, 120, 50])
    const cut = requireCutout(encodePng(img), 'black')
    const png = decode(cut.png)
    expect(png.width).toBeGreaterThan(30)
    expect(png.width).toBeLessThan(64)
    expect(pixel(png, 0, 0)[3]).toBe(0)
    expect(pixel(png, png.width - 1, png.height - 1)[3]).toBe(0)
    const centre = pixel(png, Math.floor(png.width / 2), Math.floor(png.height / 2))
    expect(centre[3]).toBeGreaterThan(0)
    expect(centre[0]).toBe(255) // keyBlack normalizes the brightest channel
  })
})
