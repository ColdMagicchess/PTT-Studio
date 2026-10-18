/**
 * Generate every pending asset of a deck: assemble prompts, lint subjects,
 * use a style reference when one is locked, cache by prompt hash, write files
 * under <deckDir>/assets/, and record `file` back into deck.json.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Asset, Deck } from '../deck/types.ts'
import { assetPrompt, lintSubject, negativeFor, type LintIssue } from './prompt.ts'
import { generateWithRetry, type ImageBackendConfig } from './backends.ts'
import { cutoutImage } from './raster.ts'
import { atomicWrite } from '../fsutil.ts'

/** Generation limits. */
export interface GenerateLimits {
  concurrency: number
  attempts: number
  backoffMs: number
  maxAssets: number
}

/** Per-asset outcome. */
export interface AssetOutcome {
  id: string
  status: 'generated' | 'cached' | 'supplied' | 'skipped' | 'failed' | 'rejected'
  file?: string
  prompt?: string
  error?: string
  lint?: LintIssue[]
  seconds?: number
}

/** Inputs for one generation run. */
export interface GenerateInput {
  deck: Deck
  deckDir: string
  backend: ImageBackendConfig
  limits: GenerateLimits
  /** Generate only these asset ids; all pending assets when omitted. */
  only?: string[]
  /** Regenerate even when a cached file exists. */
  force?: boolean
  /** Workspace-relative or absolute path of a locked style reference image. */
  styleReference?: string
  /** Seed override for regeneration. */
  seed?: number
  /** Output directory relative to deckDir; defaults to "assets". */
  outSubdir?: string
  signal: AbortSignal
  onProgress?: (done: number, total: number, outcome: AssetOutcome) => void
}

/**
 * Hash identifying one asset's generated content.
 * @param prompt - full prompt.
 * @param aspect - aspect ratio.
 * @param seed - seed.
 * @param reference - reference image hash, if any.
 * @param model - backend model id.
 */
export function promptKey(prompt: string, aspect: string, seed: number, reference: string | undefined, model: string): string {
  return createHash('sha256').update([prompt, aspect, String(seed), reference ?? '', model].join('\u0000')).digest('hex').slice(0, 16)
}

/**
 * Generate pending assets. Never throws for a single asset failure; the
 * outcome list carries it.
 * @returns per-asset outcomes and the deck with `file` fields updated.
 */
export async function generateAssets(input: GenerateInput): Promise<{ outcomes: AssetOutcome[]; deck: Deck }> {
  const { deck, deckDir, backend, limits, signal } = input
  const assets = (deck.assets ?? []).filter(a => input.only === undefined || input.only.includes(a.id))
  if (input.only !== undefined) {
    const unknown = input.only.filter(id => !(deck.assets ?? []).some(a => a.id === id))
    if (unknown.length > 0) throw new Error(`unknown asset id(s): ${unknown.join(', ')}`)
  }
  if (assets.length > limits.maxAssets) throw new Error(`deck requests ${assets.length} images; the configured limit is ${limits.maxAssets}`)
  const outDir = join(deckDir, input.outSubdir ?? 'assets')
  mkdirSync(outDir, { recursive: true })
  let reference: string | undefined
  let referenceHash: string | undefined
  if (input.styleReference !== undefined) {
    const refPath = resolve(deckDir, input.styleReference)
    if (!existsSync(refPath)) throw new Error(`style reference not found: ${input.styleReference}`)
    const bytes = readFileSync(refPath)
    const mime = bytes[0] === 0xFF && bytes[1] === 0xD8 ? 'image/jpeg' : 'image/png'
    reference = `data:${mime};base64,${bytes.toString('base64')}`
    referenceHash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  }
  const seed = input.seed ?? deck.theme.seed
  const noTextSuffix = backend.kind === 'openai-compatible'
  const outcomes: AssetOutcome[] = []
  const updated = new Map<string, string>()
  const queue: Asset[] = []
  for (const asset of assets) {
    if (asset.prompt === undefined) { outcomes.push({ id: asset.id, status: 'supplied', ...asset.file === undefined ? {} : { file: asset.file } }); continue }
    const lint = lintSubject(asset.prompt)
    if (lint.length > 0) { outcomes.push({ id: asset.id, status: 'rejected', lint, error: 'subject prompt contains text-like fragments; rewrite it before generating' }); continue }
    queue.push(asset)
  }
  if (deck.design.complexity === 'minimal') {
    for (const a of queue.filter(a => a.kind === 'background')) outcomes.push({ id: a.id, status: 'skipped', error: 'minimal complexity uses native colors instead of background images' })
    queue.splice(0, queue.length, ...queue.filter(a => a.kind !== 'background'))
  }
  let done = 0
  const total = queue.length
  const worker = async () => {
    for (;;) {
      const asset = queue.shift()
      if (asset === undefined) return
      signal.throwIfAborted()
      const prompt = assetPrompt(deck, asset, noTextSuffix)
      const key = promptKey(prompt, asset.aspect, seed, referenceHash, backend.model)
      const file = join(outDir, `${asset.id}.${key}.png`)
      const rel = relative(deckDir, file).split('\\').join('/')
      let outcome: AssetOutcome
      if (!input.force && existsSync(file)) outcome = { id: asset.id, status: 'cached', file: rel, prompt }
      else {
        const t0 = Date.now()
        try {
          let bytes = await generateWithRetry(backend, { prompt, negative: negativeFor(deck, asset), aspect: asset.aspect, seed, ...reference === undefined ? {} : { references: [reference] }, signal }, limits.attempts, limits.backoffMs)
          if (asset.cutout !== undefined) {
            const cut = cutoutImage(bytes, asset.cutout)
            if (cut === undefined) throw new Error('cutout removed the whole illustration; regenerate with another seed or without cutout')
            bytes = cut.png
          }
          atomicWrite(file, bytes)
          outcome = { id: asset.id, status: 'generated', file: rel, prompt, seconds: Math.round((Date.now() - t0) / 1000) }
        } catch (error) {
          if (signal.aborted) throw error
          outcome = { id: asset.id, status: 'failed', prompt, error: error instanceof Error ? error.message : String(error) }
        }
      }
      if (outcome.file !== undefined) updated.set(asset.id, outcome.file)
      outcomes.push(outcome)
      done++
      input.onProgress?.(done, total, outcome)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limits.concurrency, total)) }, worker))
  const next: Deck = { ...deck, assets: (deck.assets ?? []).map(a => updated.has(a.id) ? { ...a, file: updated.get(a.id)! } : a) }
  return { outcomes, deck: next }
}
