/**
 * Decoration kits. Two modes:
 *
 * - 'sheet' (default): every piece of the kit is drawn on one image, the flat
 *   backdrop is removed, the sheet is split into connected pieces and pieces are
 *   matched to the requested items in reading order. Fast and style-consistent,
 *   but the model sometimes adds or merges items, so ids can drift.
 * - 'single': one image per piece, keyed and cropped on its own. Slower, but
 *   every piece maps to its subject exactly. Use it when placement matters.
 *
 * Each piece is stored as a tight transparent PNG under the deck's decor/.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Deck, DecorationKit, DecorationPiece } from '../deck/types.ts'
import { decorationPiecePrompt, decorationSheetPrompt, lintKit } from './prompt.ts'
import { generateWithRetry, type ImageBackendConfig } from './backends.ts'
import { cutDecoration, cutSheet } from './raster.ts'
import { atomicWrite } from '../fsutil.ts'
import type { GenerateLimits } from './generate.ts'

/** Outcome for one kit. */
export interface KitOutcome {
  id: string
  status: 'generated' | 'cached' | 'failed' | 'rejected' | 'partial'
  /** Mode used for this kit. */
  mode: 'sheet' | 'single'
  /** Generated sheet (sheet mode only). */
  sheet?: string
  /** piece id -> file. */
  files?: Record<string, string>
  /** Requested pieces that got no image. */
  missing?: string[]
  /** Extra separable pieces beyond the request (sheet mode), saved as <kit>-extra-N. */
  extras?: string[]
  error?: string
  seconds?: number
}

function rel(deckDir: string, p: string): string {
  return relative(deckDir, p).split('\\').join('/')
}

/** Inputs for one decoration generation run. */
export interface GenerateDecorationsInput {
  deck: Deck
  deckDir: string
  backend: ImageBackendConfig
  limits: GenerateLimits
  only?: string[]
  force?: boolean
  seed?: number
  signal: AbortSignal
}

/**
 * Generate, key and split decoration kits.
 * @returns per-kit outcomes and the deck with kit files recorded.
 */
export async function generateDecorations(input: GenerateDecorationsInput): Promise<{ outcomes: KitOutcome[]; deck: Deck }> {
  const { deck, deckDir, backend, limits, signal } = input
  const kits = (deck.decorations ?? []).filter(k => input.only === undefined || input.only.includes(k.id))
  const outDir = join(deckDir, 'decor')
  mkdirSync(outDir, { recursive: true })
  // Decoration pieces are prompted from styleAnchor + palette only. Passing the
  // illustration style board here made the model copy its subjects (characters,
  // robots) into every piece; the flat palette keeps the set coherent instead.
  const seed = input.seed ?? deck.theme.seed
  const outcomes = new Map<string, KitOutcome>()
  const updated = new Map<string, DecorationKit>()

  const linted: DecorationKit[] = []
  for (const kit of kits) {
    const lint = lintKit(kit)
    if (lint.length > 0) {
      outcomes.set(kit.id, { id: kit.id, mode: kit.mode ?? 'sheet', status: 'rejected', error: lint.map(l => `${l.piece}: ${l.issues.map(i => `"${i.fragment}" (${i.reason})`).join('; ')}`).join(' | ') })
      continue
    }
    linted.push(kit)
  }
  const sheetKits = linted.filter(k => (k.mode ?? 'sheet') === 'sheet')
  const singleKits = linted.filter(k => k.mode === 'single')

  // --- sheet mode: one image per kit, split by connected opaque regions. ---
  const sheetQueue = [...sheetKits]
  // A sheet sometimes splits into fewer pieces than requested (items merge).
  // One retry with a fresh seed usually fixes it.
  const attempts = 2
  const sheetWorker = async () => {
    for (;;) {
      const kit = sheetQueue.shift()
      if (kit === undefined) return
      signal.throwIfAborted()
      const prompt = decorationSheetPrompt(deck, kit)
      const t0 = Date.now()
      let generatedAny = false
      let best: KitOutcome | undefined
      let bestKit: DecorationKit | undefined
      try {
        for (let attempt = 0; attempt < attempts; attempt++) {
          const sheetSeed = attempt === 0 ? seed : seed + attempt * 7919
          const key = createHash('sha256').update([prompt, String(sheetSeed), '', backend.model].join('\u0000')).digest('hex').slice(0, 16)
          const sheetPath = join(outDir, `${kit.id}.${key}.sheet.png`)
          let status: 'generated' | 'cached' = 'cached'
          if ((input.force === true && attempt === 0) || !existsSync(sheetPath)) {
            const bytes = await generateWithRetry(backend, { prompt, aspect: '1:1', seed: sheetSeed, signal }, limits.attempts, limits.backoffMs)
            atomicWrite(sheetPath, bytes)
            status = 'generated'
            generatedAny = true
          }
          const pieces = cutSheet(readFileSync(sheetPath), kit.backdrop)
          const files: Record<string, string> = {}
          const missing: string[] = []
          kit.pieces.forEach((piece, i) => {
            const found = pieces[i]
            if (found === undefined) { missing.push(piece.id); return }
            const file = join(outDir, `${kit.id}.${key}.${piece.id}.png`)
            atomicWrite(file, found.png)
            files[piece.id] = rel(deckDir, file)
          })
          const extras: string[] = []
          pieces.slice(kit.pieces.length).forEach((p, j) => { const f = join(outDir, `${kit.id}.${key}.extra-${j + 1}.png`); atomicWrite(f, p.png); extras.push(rel(deckDir, f)) })
          bestKit = { ...kit, files, sheet: rel(deckDir, sheetPath) }
          best = { id: kit.id, mode: 'sheet', status: missing.length > 0 ? 'partial' : status, sheet: rel(deckDir, sheetPath), files, ...missing.length > 0 ? { missing } : {}, ...extras.length > 0 ? { extras } : {} }
          if (missing.length === 0) break
        }
        if (bestKit !== undefined && best !== undefined) {
          updated.set(kit.id, bestKit)
          outcomes.set(kit.id, { ...best, ...generatedAny ? { seconds: Math.round((Date.now() - t0) / 1000) } : {} })
        }
      } catch (error) {
        if (signal.aborted) throw error
        outcomes.set(kit.id, { id: kit.id, mode: 'sheet', status: 'failed', error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limits.concurrency, sheetKits.length)) }, sheetWorker))

  // --- single mode: one image per piece, so ids cannot drift. ---
  interface SingleTask { kit: DecorationKit; piece: DecorationPiece; prompt: string }
  const singleTasks: SingleTask[] = singleKits.flatMap(kit => kit.pieces.map(piece => ({ kit, piece, prompt: decorationPiecePrompt(deck, kit, piece) })))
  const filesByKit = new Map<string, Record<string, string>>()
  const missingByKit = new Map<string, string[]>()
  const errorsByKit = new Map<string, string[]>()
  const secondsByKit = new Map<string, number>()
  const startedByKit = new Map<string, number>()
  const generatedByKit = new Map<string, boolean>()
  for (const kit of singleKits) { filesByKit.set(kit.id, {}); startedByKit.set(kit.id, Date.now()) }
  const singleWorker = async () => {
    for (;;) {
      const task = singleTasks.shift()
      if (task === undefined) return
      signal.throwIfAborted()
      const { kit, piece, prompt } = task
      const key = createHash('sha256').update([prompt, String(seed), '', backend.model].join('\u0000')).digest('hex').slice(0, 16)
      const file = join(outDir, `${kit.id}.${key}.${piece.id}.png`)
      try {
        if (!(input.force === true) && existsSync(file)) {
          filesByKit.get(kit.id)![piece.id] = rel(deckDir, file)
          continue
        }
        const bytes = await generateWithRetry(backend, { prompt, aspect: '1:1', seed, signal }, limits.attempts, limits.backoffMs)
        const cut = cutDecoration(bytes, kit.backdrop)
        if (cut === undefined) throw new Error('the backdrop was removed and nothing was left; try another seed or a simpler subject')
        atomicWrite(file, cut.png)
        filesByKit.get(kit.id)![piece.id] = rel(deckDir, file)
        generatedByKit.set(kit.id, true)
        secondsByKit.set(kit.id, Math.round((Date.now() - (startedByKit.get(kit.id) ?? Date.now())) / 1000))
      } catch (error) {
        if (signal.aborted) throw error
        const message = error instanceof Error ? error.message : String(error)
        errorsByKit.set(kit.id, [...errorsByKit.get(kit.id) ?? [], `${piece.id}: ${message}`])
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limits.concurrency, singleTasks.length)) }, singleWorker))
  for (const kit of singleKits) {
    const files = filesByKit.get(kit.id) ?? {}
    const missing = kit.pieces.filter(p => files[p.id] === undefined).map(p => p.id)
    const errors = errorsByKit.get(kit.id)
    const found = Object.keys(files).length
    const status: KitOutcome['status'] = errors !== undefined ? (found > 0 ? 'partial' : 'failed') : generatedByKit.get(kit.id) === true ? 'generated' : 'cached'
    updated.set(kit.id, { ...kit, files })
    outcomes.set(kit.id, {
      id: kit.id, mode: 'single', status, files,
      ...missing.length > 0 ? { missing } : {},
      ...errors === undefined ? {} : { error: errors.join(' | ') },
      ...secondsByKit.has(kit.id) ? { seconds: secondsByKit.get(kit.id) } : {},
    })
  }

  const ordered = kits.map(k => outcomes.get(k.id)).filter((o): o is KitOutcome => o !== undefined)
  const next: Deck = { ...deck, decorations: (deck.decorations ?? []).map(k => updated.get(k.id) ?? k) }
  return { outcomes: ordered, deck: next }
}

/** @returns stale piece files in the decor directory (not referenced by the deck), for cleanup reporting. */
export function staleDecorFiles(deck: Deck, deckDir: string): string[] {
  const dir = join(deckDir, 'decor')
  if (!existsSync(dir)) return []
  const used = new Set((deck.decorations ?? []).flatMap(k => [...Object.values(k.files ?? {}), k.sheet ?? '']))
  return readdirSync(dir).map(f => `decor/${f}`).filter(f => !used.has(f))
}
