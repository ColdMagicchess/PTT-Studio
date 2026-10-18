import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DeckValidationError, validateDeck } from '../src/deck/validate.ts'

const example = (name: string) => JSON.parse(readFileSync(`assets/pptx-studio/examples/${name}`, 'utf8'))

describe('validateDeck', () => {
  it('accepts both shipped examples', () => {
    expect(validateDeck(example('aurora-launch.deck.json')).slides).toHaveLength(8)
    expect(validateDeck(example('mid-autumn-ornate.deck.json')).design.complexity).toBe('ornate')
  })

  it('rejects an unknown complexity tier', () => {
    const d = example('aurora-launch.deck.json'); d.design.complexity = '精美'
    expect(() => validateDeck(d)).toThrow(DeckValidationError)
  })

  it('requires all three motifs on ornate decks', () => {
    const d = example('mid-autumn-ornate.deck.json'); delete d.theme.motifs.midground
    expect(() => validateDeck(d)).toThrow(DeckValidationError)
  })

  it('reports dangling asset references and mismatched chart series', () => {
    const d = example('aurora-launch.deck.json')
    d.slides[0].background = { asset: 'nope' }
    const chart = d.slides.find((s: { id: string }) => s.id === 's06').elements.find((e: { type: string }) => e.type === 'chart')
    chart.series[0].values.push(1)
    try { validateDeck(d); expect.unreachable() } catch (e) {
      const issues = (e as DeckValidationError).issues.map(i => i.message).join('\n')
      expect(issues).toContain('unknown asset "nope"')
      expect(issues).toContain('4 values for 3 categories')
    }
  })

  it('rejects highlight use without theme.highlight', () => {
    const d = example('aurora-launch.deck.json'); d.slides[2].elements[2].color = 'highlight'
    expect(() => validateDeck(d)).toThrow(/highlight/)
  })
})
