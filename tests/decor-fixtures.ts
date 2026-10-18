/**
 * Shared fixtures for the decoration tests: tiny synthetic RGBA images (a few
 * dozen pixels) and a minimal schema-valid deck. No real generated sheets are
 * read, so every test runs in milliseconds.
 */
import { decode, encodePng, type Rgba } from '../src/images/raster.ts'
import type { Complexity, DecorationKit, DecorationPiece } from '../src/deck/types.ts'

/** Opaque solid image. */
export function blank(width: number, height: number, rgb: [number, number, number] = [255, 255, 255]): Rgba {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4)
  return { width, height, data }
}

/** Fully transparent image. */
export function transparent(width: number, height: number): Rgba {
  return { width, height, data: new Uint8Array(width * height * 4) }
}

/** Fill an inclusive pixel rectangle. */
export function fillRect(img: Rgba, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number], alpha = 255): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) img.data.set([rgb[0], rgb[1], rgb[2], alpha], (y * img.width + x) * 4)
}

/** Fill a width by height block whose top-left corner is (x0, y0). */
export function fillBlock(img: Rgba, x0: number, y0: number, w: number, h: number, rgb: [number, number, number], alpha = 255): void {
  fillRect(img, x0, y0, x0 + w - 1, y0 + h - 1, rgb, alpha)
}

/** One pixel as [r, g, b, a]. */
export function pixel(img: Rgba, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!]
}

/** Encode and decode again, matching the PNG round-trip used in production. */
export function roundTrip(img: Rgba): Rgba {
  return decode(encodePng(img))
}

/** One piece of {@link kitJson}. */
export type PieceSpec = [id: string, subject: string, role: DecorationPiece['role']]

/**
 * A minimal, schema-valid deck that satisfies whichever complexity tier is
 * asked for (rich/ornate also require theme.motifs). Mutate it and pass it to
 * validateDeck; never modify the shipped examples.
 */
export function deckJson(complexity: Complexity = 'balanced'): any {
  return {
    version: 1,
    id: 'decor-test',
    title: '装饰件测试',
    language: 'zh-CN',
    design: { style: 'test-style', complexity, textDensity: 'light' },
    theme: {
      style: 'test-style',
      colors: {
        background: '#101418', surface: '#1A2026', primary: '#C9A227',
        secondary: '#2F4F4F', accent: '#B87333', text: '#F2F2F2', textMuted: '#A0A0A0',
      },
      fonts: { heading: 'Arial', body: 'Arial' },
      styleAnchor: 'a calm layered decoration style with warm gold and deep teal accents',
      motifs: { foreground: 'gold sprays', midground: 'lattice frames', background: 'tiny dots' },
      seed: 7,
      highlight: '#FF8844',
    },
    decorations: [
      kitJson('gold-kit', 'white', [
        ['corner-spray', 'corner spray of golden osmanthus', 'corner'],
        ['divider-wave', 'horizontal divider of thin gold waves', 'divider'],
      ]),
    ],
    slides: [{ id: 's1', layout: 'cover', visual: 'title on a calm background', background: { color: 'background' }, elements: [] }],
  }
}

/** Optional extra fields for a kit fixture. */
export interface KitOptions {
  /** 'sheet' (default) generates all pieces on one image; 'single' generates one image per piece. */
  mode?: 'sheet' | 'single'
  /** Kit-level style words that override theme.styleAnchor. */
  styleAnchor?: string
}

/** A decoration kit as plain JSON. */
export function kitJson(id: string, backdrop: 'white' | 'black', pieces: PieceSpec[], options: KitOptions = {}): any {
  return { id, backdrop, pieces: pieces.map(([pieceId, subject, role]) => ({ id: pieceId, subject, role })), ...options }
}

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** A kit requesting n pieces, each with a unique clean subject (no digits). */
export function kitOf(n: number, backdrop: 'white' | 'black' = 'white', options: KitOptions = {}): DecorationKit {
  const pieces: PieceSpec[] = Array.from({ length: n }, (_, i) => [
    `piece-${i + 1}`,
    `ornamental motif number ${COUNT_WORDS[i]}`,
    i % 2 === 0 ? 'corner' : 'accent',
  ]) as PieceSpec[]
  return kitJson('test-kit', backdrop, pieces, options) as DecorationKit
}
