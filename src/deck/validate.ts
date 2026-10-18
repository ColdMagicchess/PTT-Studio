/** deck.json loading and validation: JSON Schema plus cross-reference checks. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import type { Deck } from './types.ts'
import { skillDir } from '../paths.ts'

/** One problem found while validating a deck. */
export interface DeckIssue {
  /** JSON pointer-like location, for example `/slides/2/elements/0`. */
  readonly path: string
  readonly message: string
}

/** Thrown when a deck fails validation; carries every issue found. */
export class DeckValidationError extends Error {
  constructor(readonly issues: readonly DeckIssue[]) {
    super(`deck.json is invalid (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` + issues.slice(0, 20).map(i => `- ${i.path || '/'}: ${i.message}`).join('\n'))
    this.name = 'DeckValidationError'
  }
}

type Validator = ((value: unknown) => boolean) & { errors?: { instancePath: string; message?: string; params?: unknown }[] | null }
let compiled: Validator | undefined

function validator(): Validator {
  if (compiled !== undefined) return compiled
  const schema: unknown = JSON.parse(readFileSync(join(skillDir(), 'deck.schema.json'), 'utf8'))
  // ajv ships CJS; under NodeNext the default import may be the module namespace.
  type AjvCtor = new (options: object) => { compile(schema: object): Validator }
  const mod = Ajv2020 as unknown as { default?: AjvCtor } & AjvCtor
  const Ajv = mod.default ?? mod
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false })
  compiled = ajv.compile(schema as object)
  return compiled
}

/**
 * Validate a parsed deck against the schema and its internal references.
 * @param value - parsed deck.json content.
 * @returns the typed deck.
 * @throws {DeckValidationError} listing every schema and reference problem.
 */
export function validateDeck(value: unknown): Deck {
  const check = validator()
  if (!check(value)) {
    const issues = (check.errors ?? []).map(e => ({ path: e.instancePath, message: `${e.message ?? 'invalid'}${e.params === undefined ? '' : ' ' + JSON.stringify(e.params)}` }))
    throw new DeckValidationError(dedupe(issues))
  }
  const deck = value as Deck
  const issues: DeckIssue[] = []
  const assetIds = new Set<string>()
  for (const [i, asset] of (deck.assets ?? []).entries()) {
    if (assetIds.has(asset.id)) issues.push({ path: `/assets/${i}/id`, message: `duplicate asset id "${asset.id}"` })
    assetIds.add(asset.id)
  }
  const pieceIds = new Set<string>()
  const kitIds = new Set<string>()
  for (const [k, kit] of (deck.decorations ?? []).entries()) {
    if (kitIds.has(kit.id)) issues.push({ path: `/decorations/${k}/id`, message: `duplicate decoration kit id "${kit.id}"` })
    kitIds.add(kit.id)
    const local = new Set<string>()
    for (const [p, piece] of kit.pieces.entries()) {
      if (local.has(piece.id)) issues.push({ path: `/decorations/${k}/pieces/${p}/id`, message: `duplicate piece id "${piece.id}" in kit "${kit.id}"` })
      local.add(piece.id)
      pieceIds.add(`${kit.id}/${piece.id}`)
    }
  }
  const slideIds = new Set<string>()
  for (const [s, slide] of deck.slides.entries()) {
    if (slideIds.has(slide.id)) issues.push({ path: `/slides/${s}/id`, message: `duplicate slide id "${slide.id}"` })
    slideIds.add(slide.id)
    if (slide.background !== undefined && 'asset' in slide.background && !assetIds.has(slide.background.asset)) {
      issues.push({ path: `/slides/${s}/background/asset`, message: `unknown asset "${slide.background.asset}"` })
    }
    for (const [e, el] of slide.elements.entries()) {
      const at = `/slides/${s}/elements/${e}`
      if (el.box.x + el.box.w > 100.5 || el.box.y + el.box.h > 100.5) issues.push({ path: at + '/box', message: 'box extends past the slide edge' })
      if (el.type === 'image' && el.asset !== undefined && !assetIds.has(el.asset)) issues.push({ path: at + '/asset', message: `unknown asset "${el.asset}"` })
      if (el.type === 'decor' && !pieceIds.has(el.piece)) issues.push({ path: at + '/piece', message: `unknown decoration piece "${el.piece}"` })
      if (el.type === 'chart') {
        for (const [k, series] of el.series.entries()) {
          if (series.values.length !== el.categories.length) issues.push({ path: `${at}/series/${k}`, message: `has ${series.values.length} values for ${el.categories.length} categories` })
        }
      }
      if (el.type === 'table') {
        for (const [r, row] of el.rows.entries()) if (row.length !== el.header.length) issues.push({ path: `${at}/rows/${r}`, message: `has ${row.length} cells for ${el.header.length} columns` })
        if (el.colWidths !== undefined && el.colWidths.length !== el.header.length) issues.push({ path: at + '/colWidths', message: 'must have one width per column' })
      }
      if (deck.theme.highlight === undefined && usesHighlight(el)) issues.push({ path: at, message: 'uses the highlight color but theme.highlight is not set' })
    }
  }
  if (issues.length > 0) throw new DeckValidationError(issues)
  return deck
}

function usesHighlight(el: unknown): boolean {
  return JSON.stringify(el).includes('"highlight"')
}

function dedupe(issues: DeckIssue[]): DeckIssue[] {
  const seen = new Set<string>()
  return issues.filter(i => { const k = i.path + '|' + i.message; if (seen.has(k)) return false; seen.add(k); return true })
}
