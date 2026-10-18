/**
 * Fill check: contentCoverage() and the per-complexity minimum share of the
 * safe area that content should occupy. Uses the synthetic deck fixture, so
 * no example deck or generated image is needed.
 */
import { describe, expect, it } from 'vitest'
import { FILL_MIN, checkDeck, contentCoverage } from '../src/check/geometry.ts'
import { validateDeck } from '../src/deck/validate.ts'
import type { Box, Complexity, DeckElement } from '../src/deck/types.ts'
import { deckJson } from './decor-fixtures.ts'

const SAFE: Box = { x: 6, y: 8, w: 88, h: 90 }

const shape = (box: Box): DeckElement => ({ type: 'shape', shape: 'rect', box })

/** A deck with one slide on the given layout and elements. */
function deckWith(complexity: Complexity, layout: string, elements: DeckElement[]) {
  const json = deckJson(complexity)
  json.slides[0].layout = layout
  json.slides[0].elements = elements
  return validateDeck(json)
}

const fills = (complexity: Complexity, layout: string, elements: DeckElement[]) =>
  checkDeck(deckWith(complexity, layout, elements), [], [], []).filter(f => f.check === 'fill')

describe('contentCoverage', () => {
  it('is zero for no elements', () => {
    expect(contentCoverage([])).toBe(0)
  })

  it('is about one when a shape covers the whole safe area', () => {
    expect(contentCoverage([shape(SAFE)])).toBeCloseTo(1, 5)
  })

  it('is about half for a shape covering half the safe area', () => {
    expect(contentCoverage([shape({ x: 6, y: 8, w: 44, h: 90 })])).toBeCloseTo(0.5, 3)
  })

  it('ignores decoration pieces and decorative images', () => {
    expect(contentCoverage([{ type: 'decor', piece: 'gold-kit/corner-spray', box: SAFE }])).toBe(0)
    expect(contentCoverage([{ type: 'image', asset: 'bg', decor: true, box: SAFE }])).toBe(0)
    // A normal image is content and does count.
    expect(contentCoverage([{ type: 'image', asset: 'bg', box: SAFE }])).toBe(1)
    // Decorations cannot hide an empty page behind a content element either.
    expect(contentCoverage([
      shape({ x: 6, y: 8, w: 44, h: 90 }),
      { type: 'decor', piece: 'gold-kit/corner-spray', box: SAFE },
      { type: 'image', asset: 'bg', decor: true, box: SAFE },
    ])).toBeCloseTo(0.5, 3)
  })
})

describe('FILL_MIN', () => {
  it('locks the minimum share per complexity tier', () => {
    expect(FILL_MIN).toEqual({ minimal: 0.25, simple: 0.35, balanced: 0.45, rich: 0.55, ornate: 0.6 })
  })
})

describe('checkDeck fill', () => {
  it('warns on a content slide below the balanced minimum', () => {
    // 20x20 of the 88x90 safe area is about 5%.
    const found = fills('balanced', 'bullets', [shape({ x: 6, y: 8, w: 20, h: 20 })])
    expect(found).toHaveLength(1)
    expect(found[0]!.severity).toBe('warning')
    expect(found[0]!.message).toContain('content covers only')
    expect(found[0]!.message).toContain('balanced aims for at least 45%')
    expect(found[0]!.message).toContain('fill the empty band')
  })

  it('does not warn when coverage reaches the balanced minimum', () => {
    expect(fills('balanced', 'cards', [shape({ x: 6, y: 8, w: 88, h: 60 })])).toHaveLength(0)
  })

  it('does not warn at exactly the threshold (coverage 45%)', () => {
    expect(fills('balanced', 'two-column', [shape({ x: 6, y: 8, w: 88, h: 40.5 })])).toHaveLength(0)
  })

  it('uses the tier threshold in the message', () => {
    const found = fills('ornate', 'timeline', [shape({ x: 6, y: 8, w: 88, h: 40 })])
    expect(found).toHaveLength(1)
    expect(found[0]!.message).toContain('ornate aims for at least 60%')
  })

  it.each(['cover', 'section', 'closing', 'quote', 'image-full'])('never warns on a %s layout', layout => {
    expect(fills('balanced', layout, [])).toHaveLength(0)
  })
})
