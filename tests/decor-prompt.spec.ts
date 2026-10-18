/**
 * Decoration sheet prompt assembly and kit linting.
 */
import { describe, expect, it } from 'vitest'
import { validateDeck } from '../src/deck/validate.ts'
import type { DecorationKit } from '../src/deck/types.ts'
import { NO_TEXT, decorationPiecePrompt, decorationSheetPrompt, lintKit } from '../src/images/prompt.ts'
import { deckJson, kitOf } from './decor-fixtures.ts'

const deck = (complexity: 'minimal' | 'balanced' | 'ornate' = 'ornate') => validateDeck(deckJson(complexity))

describe('decorationSheetPrompt', () => {
  it.each([
    [1, 'a single centered item'],
    [4, 'a neat two by two grid'],
    [6, 'a neat three by two grid'],
    [9, 'a neat three by three grid'],
    [12, 'a neat four by three grid'],
  ])('asks for %i pieces as %s', (n, grid) => {
    const kit = kitOf(n)
    const prompt = decorationSheetPrompt(deck(), kit)
    expect(prompt).toContain(`of exactly ${n} separate small ornament pieces`)
    expect(prompt).toContain(grid)
    expect(prompt.endsWith(NO_TEXT)).toBe(true)
  })

  it('carries the style anchor, every subject, no hex colors and the tier detail', () => {
    const d = deck('ornate')
    const kit = kitOf(3)
    const prompt = decorationSheetPrompt(d, kit)
    expect(prompt).toContain(d.theme.styleAnchor)
    for (const piece of kit.pieces) expect(prompt).toContain(piece.subject)
    expect(prompt).not.toMatch(/#[0-9a-f]{6}/i)
    expect(prompt).toContain('extremely intricate pieces')
    expect(prompt.endsWith(NO_TEXT)).toBe(true)
  })

  it('tells a white sheet to avoid sticker outlines and a black sheet to be pure black', () => {
    const white = decorationSheetPrompt(deck(), kitOf(2, 'white'))
    expect(white).toContain('pure white background')
    expect(white).toContain('no sticker outlines')
    const black = decorationSheetPrompt(deck(), kitOf(2, 'black'))
    expect(black).toContain('pure black')
  })

  it('uses a simpler piece detail for the minimal tier', () => {
    expect(decorationSheetPrompt(deck('minimal'), kitOf(2))).toContain('very simple flat shapes')
  })

  it('asks for exactly one piece per listed phrase and bans people', () => {
    const prompt = decorationSheetPrompt(deck(), kitOf(4))
    expect(prompt).toContain('each listed phrase is exactly one separate piece')
    expect(prompt).toContain('no people, no characters')
  })

  it('prefers a kit style anchor over the theme anchor', () => {
    const d = deck()
    const kit = kitOf(2, 'white', { styleAnchor: 'refined flat vector ornaments with crisp edges' })
    const prompt = decorationSheetPrompt(d, kit)
    expect(prompt).toContain(kit.styleAnchor!)
    expect(prompt).not.toContain(d.theme.styleAnchor)
  })
})

describe('decorationPiecePrompt', () => {
  const piece = (subject: string): DecorationKit['pieces'][number] => ({ id: 'piece-one', subject, role: 'corner' })

  it('asks for one single piece and ends with the no-text suffix', () => {
    const d = deck()
    const subject = 'corner spray of golden osmanthus'
    const kit: DecorationKit = { id: 'single-kit', backdrop: 'white', pieces: [piece(subject)] }
    const prompt = decorationPiecePrompt(d, kit, kit.pieces[0]!)
    expect(prompt).toContain('one single small ornament piece')
    expect(prompt).toContain(subject)
    expect(prompt.endsWith(NO_TEXT)).toBe(true)
    expect(prompt).not.toMatch(/#[0-9a-f]{6}/i)
    expect(prompt).not.toMatch(/\d/)
  })

  it('keys a white piece with no sticker outline and a black piece on pure black', () => {
    const d = deck()
    const subject = 'corner spray of golden osmanthus'
    const white = decorationPiecePrompt(d, { id: 'white-kit', backdrop: 'white', pieces: [piece(subject)] }, piece(subject))
    expect(white).toContain('pure white background')
    expect(white).toContain('no sticker outline')
    expect(white).not.toContain('pure black')
    const black = decorationPiecePrompt(d, { id: 'black-kit', backdrop: 'black', pieces: [piece(subject)] }, piece(subject))
    expect(black).toContain('pure black')
    expect(black).toContain('sticker outline')
  })

  it('lets the kit style anchor override the theme anchor', () => {
    const d = deck()
    const kit: DecorationKit = {
      id: 'single-kit', backdrop: 'white', styleAnchor: 'refined flat vector ornaments with crisp edges',
      pieces: [piece('corner spray of golden osmanthus')],
    }
    const prompt = decorationPiecePrompt(d, kit, kit.pieces[0]!)
    expect(prompt).toContain(kit.styleAnchor!)
    expect(prompt).not.toContain(d.theme.styleAnchor)
  })

  it('falls back to the theme style anchor and carries the tier detail', () => {
    const d = deck('ornate')
    const kit: DecorationKit = { id: 'single-kit', backdrop: 'white', pieces: [piece('corner spray of golden osmanthus')] }
    const prompt = decorationPiecePrompt(d, kit, kit.pieces[0]!)
    expect(prompt).toContain(d.theme.styleAnchor)
    expect(prompt).toContain('filigree')
    expect(decorationPiecePrompt(deck('minimal'), kit, kit.pieces[0]!)).toContain('very simple flat shapes')
  })
})

describe('lintKit', () => {
  const piece = (id: string, subject: string): DecorationKit['pieces'][number] => ({ id, subject, role: 'corner' })

  it('flags hex colors, percentages, acronyms and text words in subjects', () => {
    const kit: DecorationKit = {
      id: 'lint-kit',
      backdrop: 'white',
      pieces: [piece('bad-piece', 'glowing AI core, #3B82F6 rim, left 58% empty for the title')],
    }
    const found = lintKit(kit)
    expect(found).toHaveLength(1)
    expect(found[0]!.piece).toBe('bad-piece')
    expect(found[0]!.issues.map(i => i.fragment)).toEqual(expect.arrayContaining(['#3B82F6', '58%', 'AI', 'title']))
  })

  it('reports only the offending pieces of a kit', () => {
    const kit: DecorationKit = {
      id: 'lint-kit',
      backdrop: 'black',
      pieces: [
        piece('clean-piece', 'corner spray of golden osmanthus'),
        piece('bad-piece', 'a glowing AI core'),
      ],
    }
    expect(lintKit(kit).map(x => x.piece)).toEqual(['bad-piece'])
  })

  it('passes a clean subject', () => {
    expect(lintKit({ id: 'clean-kit', backdrop: 'white', pieces: [piece('clean-piece', 'corner spray of golden osmanthus')] })).toEqual([])
  })
})
