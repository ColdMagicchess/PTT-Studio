import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assetPrompt, colorName, lintSubject, negativeFor, ornateComposition } from '../src/images/prompt.ts'
import { validateDeck } from '../src/deck/validate.ts'

const deck = (name: string) => validateDeck(JSON.parse(readFileSync(`assets/pptx-studio/examples/${name}`, 'utf8')))

describe('lintSubject', () => {
  it('flags fragments image models render as literal text', () => {
    const found = lintSubject('glowing AI core, #3B82F6 rim, left 58% empty for the title').map(i => i.fragment)
    expect(found).toEqual(expect.arrayContaining(['AI', '#3B82F6', '58%', 'title']))
  })
  it('passes the shipped example subjects', () => {
    for (const name of ['aurora-launch.deck.json', 'mid-autumn-ornate.deck.json']) {
      for (const a of deck(name).assets ?? []) expect(lintSubject(a.prompt ?? '')).toEqual([])
    }
  })
})

describe('assetPrompt', () => {
  it('carries no hex colors or digits after assembly', () => {
    for (const name of ['aurora-launch.deck.json', 'mid-autumn-ornate.deck.json']) {
      const d = deck(name)
      for (const a of d.assets ?? []) {
        const p = assetPrompt(d, a, true)
        expect(p).not.toMatch(/#[0-9a-f]{6}/i)
        expect(p).not.toMatch(/\d/)
        expect(p).toContain(d.theme.styleAnchor)
      }
    }
  })
  it('uses the tuned ornate template, highlight color and softer middle zone', () => {
    const d = deck('mid-autumn-ornate.deck.json')
    const bg = d.assets!.find(a => a.kind === 'background')!
    const p = assetPrompt(d, { ...bg, prompt: 'a scene with a calm empty area in the middle' }, false)
    expect(p).toContain('damask wallpaper')
    expect(p).toContain(d.theme.motifs!.midground!)
    expect(p).toContain('as the highlight')
    expect(p).not.toMatch(/calm empty area/)
    expect(negativeFor(d, bg)).toContain('large blank areas')
  })
})

describe('colorName / ornateComposition', () => {
  it('names theme colors without hex', () => {
    expect(colorName('#0B1020')).toMatch(/navy|blue|black/)
    expect(colorName('#FFFFFF')).toBe('white')
    expect(colorName('#C8372D')).toMatch(/red/)
  })
  it('rewrites empty-space phrases', () => {
    expect(ornateComposition('the left half of the frame is a calm empty area')).toContain('a softer low-contrast zone')
  })
})
