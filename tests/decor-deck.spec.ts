/**
 * Deck-level decoration coverage: kit/decor validation, the geometry checks
 * (piece counts per complexity tier, decorations over text) and the placement
 * function that fits a piece into its element box.
 */
import { describe, expect, it } from 'vitest'
import { DECOR_PER_SLIDE, checkDeck } from '../src/check/geometry.ts'
import { DeckValidationError, validateDeck } from '../src/deck/validate.ts'
import type { Box, DeckElement } from '../src/deck/types.ts'
import { decorPlacement } from '../src/build/decor.ts'
import { deckJson, kitJson } from './decor-fixtures.ts'

const ISSUES = (run: () => void): string[] => {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(DeckValidationError)
    return (e as DeckValidationError).issues.map(i => i.message)
  }
  throw new Error('expected deck validation to fail')
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

const checks = (complexity: 'balanced' | 'ornate', elements: DeckElement[]) => {
  const json = deckJson(complexity)
  json.slides[0].elements = elements
  return checkDeck(validateDeck(json), [], [], [])
}

const decorElement = (piece: string, box: Box): DeckElement => ({ type: 'decor', piece, box })

describe('validateDeck decorations', () => {
  it('accepts a valid kit and a decor element that references it', () => {
    const json = deckJson()
    json.slides[0].elements = [{ type: 'decor', id: 'corner', piece: 'gold-kit/corner-spray', box: { x: 2, y: 2, w: 18, h: 18 }, flipH: true, rotate: 12, opacity: 0.8 }]
    const deck = validateDeck(json)
    const el = deck.slides[0]!.elements[0]!
    expect(el.type).toBe('decor')
    if (el.type === 'decor') expect(el.piece).toBe('gold-kit/corner-spray')
  })

  it('accepts both kit modes and a kit-level style anchor', () => {
    for (const mode of ['sheet', 'single'] as const) {
      const json = deckJson()
      json.decorations[0].mode = mode
      json.decorations[0].styleAnchor = 'refined flat vector ornaments'
      const deck = validateDeck(json)
      expect(deck.decorations![0]!.mode).toBe(mode)
      expect(deck.decorations![0]!.styleAnchor).toBe('refined flat vector ornaments')
    }
  })

  it('rejects an unknown kit mode', () => {
    const json = deckJson()
    json.decorations[0].mode = 'sprite'
    expect(ISSUE_PATHS(() => validateDeck(json))).toContain('/decorations/0/mode')
  })

  it('rejects a kit style anchor shorter than three characters', () => {
    const json = deckJson()
    json.decorations[0].styleAnchor = 'ab'
    expect(ISSUE_PATHS(() => validateDeck(json))).toContain('/decorations/0/styleAnchor')
  })

  it('rejects duplicate piece ids inside a kit', () => {
    const json = deckJson()
    json.decorations[0].pieces.push({ ...json.decorations[0].pieces[1] })
    expect(ISSUES(() => validateDeck(json))).toContain('duplicate piece id "divider-wave" in kit "gold-kit"')
  })

  it('rejects duplicate kit ids', () => {
    const json = deckJson()
    json.decorations.push(kitJson('gold-kit', 'black', [['other-piece', 'another ornamental piece', 'accent']]))
    expect(ISSUES(() => validateDeck(json))).toContain('duplicate decoration kit id "gold-kit"')
  })

  it('rejects a decor element that references a missing piece', () => {
    const json = deckJson()
    json.slides[0].elements = [{ type: 'decor', piece: 'gold-kit/missing-piece', box: { x: 2, y: 2, w: 10, h: 10 } }]
    expect(ISSUES(() => validateDeck(json))).toContain('unknown decoration piece "gold-kit/missing-piece"')
  })
})

describe('checkDeck decoration counts', () => {
  it('uses the complexity table from references/complexity.md', () => {
    expect(DECOR_PER_SLIDE.minimal).toEqual({ min: 0, max: 0 })
    expect(DECOR_PER_SLIDE.balanced).toEqual({ min: 1, max: 4 })
    expect(DECOR_PER_SLIDE.ornate).toEqual({ min: 6, max: 16 })
  })

  it('warns when a balanced slide has no decoration pieces', () => {
    const found = checks('balanced', [{ type: 'text', role: 'title', text: '标题', box: { x: 8, y: 10, w: 40, h: 12 } }])
    const decor = found.filter(f => f.check === 'decor')
    expect(decor).toHaveLength(1)
    expect(decor[0]!.severity).toBe('warning')
    expect(decor[0]!.message).toContain('0 decoration pieces')
    expect(decor[0]!.message).toContain('balanced expects at least 1')
  })

  it('accepts a balanced slide inside its band', () => {
    const corners: Box[] = [{ x: 2, y: 2, w: 18, h: 18 }, { x: 78, y: 2, w: 18, h: 18 }, { x: 2, y: 78, w: 18, h: 18 }, { x: 78, y: 78, w: 18, h: 18 }]
    expect(checks('balanced', corners.map(b => decorElement('gold-kit/corner-spray', b))).filter(f => f.check === 'decor')).toEqual([])
  })

  it('warns when an ornate slide has too many pieces (20 > 16)', () => {
    const elements = Array.from({ length: 20 }, (_, i) => decorElement('gold-kit/corner-spray', { x: 2 + (i % 5) * 18, y: 2 + Math.floor(i / 5) * 18, w: 16, h: 16 }))
    const decor = checks('ornate', elements).filter(f => f.check === 'decor')
    expect(decor).toHaveLength(1)
    expect(decor[0]!.severity).toBe('warning')
    expect(decor[0]!.message).toContain('20 decoration pieces')
    expect(decor[0]!.message).toContain('ornate allows at most 16')
  })

  it('warns when an ornate slide has too few pieces (3 < 6)', () => {
    const decor = checks('ornate', [{ x: 2, y: 2, w: 16, h: 16 }, { x: 78, y: 2, w: 16, h: 16 }, { x: 2, y: 78, w: 16, h: 16 }].map(b => decorElement('gold-kit/corner-spray', b))).filter(f => f.check === 'decor')
    expect(decor).toHaveLength(1)
    expect(decor[0]!.message).toContain('3 decoration pieces')
    expect(decor[0]!.message).toContain('ornate expects at least 6')
  })
})

describe('checkDeck decoration overlaps', () => {
  const text: DeckElement = { type: 'text', role: 'title', text: '标题', box: { x: 20, y: 20, w: 40, h: 20 } }
  const cover: DeckElement = decorElement('gold-kit/corner-spray', { x: 22, y: 22, w: 30, h: 20 })

  it('errors when a decoration is drawn after (above) text and covers it', () => {
    const found = checks('balanced', [text, cover]).filter(f => f.check === 'decor')
    expect(found).toHaveLength(1)
    expect(found[0]!.severity).toBe('error')
    expect(found[0]!.message).toContain('is drawn above text')
    expect(found[0]!.message).toContain('gold-kit/corner-spray')
  })

  it('does not error when the same decoration is listed before the text', () => {
    const found = checks('balanced', [cover, text]).filter(f => f.check === 'decor')
    expect(found).toEqual([])
  })

  it('does not treat overlapping decor elements as content overlap', () => {
    const found = checks('balanced', [cover, decorElement('gold-kit/divider-wave', { ...cover.box })])
    expect(found.filter(f => f.check === 'overlap')).toEqual([])
  })
})

describe('decorPlacement', () => {
  it('hugs the top-left corner of a top-left box', () => {
    const box = { x: 2, y: 2, w: 20, h: 20 }
    const p = decorPlacement(box, 100, 50)
    expect(p.x).toBeCloseTo(2)
    expect(p.y).toBeCloseTo(2)
    // Physical aspect: 100x50 px fills the 20%-wide box, so the height is
    // (20 / 2) / (7.5 / 13.333) percent of the slide height.
    expect(p.w).toBeCloseTo(20)
    expect(p.h).toBeCloseTo(20 * 0.5 * (13.333 / 7.5))
  })

  it('hugs the bottom-right corner of a bottom-right box', () => {
    const box = { x: 78, y: 78, w: 20, h: 20 }
    const p = decorPlacement(box, 100, 50)
    expect(p.x + p.w).toBeCloseTo(box.x + box.w)
    expect(p.y + p.h).toBeCloseTo(box.y + box.h)
    expect(p.w).toBeCloseTo(20)
    expect(p.h).toBeCloseTo(20 * 0.5 * (13.333 / 7.5))
  })

  it('anchors the other two corners by the nearest page corner', () => {
    const tr = decorPlacement({ x: 76, y: 2, w: 20, h: 16 }, 60, 40)
    expect(tr.x + tr.w).toBeCloseTo(96)
    expect(tr.y).toBeCloseTo(2)
    const bl = decorPlacement({ x: 2, y: 80, w: 16, h: 18 }, 40, 60)
    expect(bl.x).toBeCloseTo(2)
    expect(bl.y + bl.h).toBeCloseTo(98)
  })

  const images: [number, number][] = [[100, 50], [50, 100], [400, 100], [120, 40], [40, 120]]
  const boxes: Box[] = [
    { x: 2, y: 2, w: 20, h: 20 },
    { x: 70, y: 74, w: 26, h: 22 },
    { x: 74, y: 3, w: 22, h: 15 },
    { x: 3, y: 70, w: 22, h: 26 },
  ]
  it.each(images.flatMap(([imgW, imgH]) => boxes.map(box => ({ box, imgW, imgH }))))(
    'keeps the aspect ratio and stays inside the box (img $imgWx$imgH, box $box.x,$box.y $box.wx$box.h)',
    ({ box, imgW, imgH }) => {
      const p = decorPlacement(box, imgW, imgH)
      expect(p.w).toBeGreaterThan(0)
      expect(p.h).toBeGreaterThan(0)
      // Physical aspect ratio: percentages of width and height are different units.
      expect((p.w * 13.333) / (p.h * 7.5)).toBeCloseTo(imgW / imgH, 6)
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(box.y - 1e-9)
      expect(p.x + p.w).toBeLessThanOrEqual(box.x + box.w + 1e-9)
      expect(p.y + p.h).toBeLessThanOrEqual(box.y + box.h + 1e-9)
      const left = box.x + box.w / 2 < 50
      const top = box.y + box.h / 2 < 50
      expect(p.x).toBeCloseTo(left ? box.x : box.x + box.w - p.w)
      expect(p.y).toBeCloseTo(top ? box.y : box.y + box.h - p.h)
    },
  )
})
