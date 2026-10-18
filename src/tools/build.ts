/** pptx_build and pptx_check tools. */
import { existsSync, readdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { validateDeck } from '../deck/validate.ts'
import { buildDeck } from '../build/assemble.ts'
import type { TextMeasurer } from '../build/metrics.ts'
import { borderColor, decode, feather, optimizeForSlide, regionClutter, regionContrast, type Rgba } from '../images/raster.ts'
import { checkDeck, type BackgroundSampler, type Finding } from '../check/geometry.ts'
import type { Deck } from '../deck/types.ts'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { atomicWrite } from '../fsutil.ts'
import type { Config } from '../config.ts'

interface BuildArgs { deck: string; output?: string }
interface BuildValue { path: string; version?: number; slides: number; bytes: number; errors: number; warnings: number; findings: Finding[] }
interface CheckArgs { deck: string }
interface CheckValue { errors: number; warnings: number; findings: Finding[] }
import { callWorkspace, deckDirOf, readJsonFile } from './context.ts'

const findingSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    slide: { type: 'string', required: true },
    element: { type: 'string' },
    check: { type: 'string', required: true },
    severity: { type: 'string', enum: ['error', 'warning'], required: true },
    message: { type: 'string', required: true },
  },
} as const

/**
 * Contrast sampler over each slide's background image, decoding each image once.
 * @param deck - validated deck.
 * @param dir - deck directory for relative asset files.
 */
function backgroundSampler(deck: Deck, dir: string): BackgroundSampler {
  const cache = new Map<string, Rgba | null>()
  const files = new Map((deck.assets ?? []).map(a => [a.id, a.file]))
  return (slide, box, fg) => {
    const bg = slide.background
    if (bg === undefined || !('asset' in bg)) return undefined
    let img = cache.get(bg.asset)
    if (img === undefined) {
      const file = files.get(bg.asset)
      try {
        img = file === undefined ? null : decode(readFileSync(isAbsolute(file) ? file : resolvePath(dir, file)))
      } catch {
        // A missing or corrupt image is reported as missing-asset by the build; skip sampling.
        img = null
      }
      cache.set(bg.asset, img)
    }
    if (img === null) return undefined
    // Background images are placed with cover sizing on a 16:9 slide; generated images are 16:9 too.
    const region: [number, number, number, number] = [box.x / 100, box.y / 100, (box.x + box.w) / 100, (box.y + box.h) / 100]
    // Left-aligned text starts at the box's left edge, where decorations creeping in
    // from the slide edge cross the first glyphs. Score that strip, scaled by its
    // share of the box so a thin edge crossing reads proportionally.
    const [x0, y0, x1, y1] = region
    const lead = regionClutter(img, [x0, y0, x0 + Math.min(0.05, (x1 - x0) * 0.15), y1])
    return { contrast: regionContrast(img, region, fg), clutter: Math.max(regionClutter(img, region), lead * 0.5) }
  }
}

function nextVersion(dir: string): number {
  if (!existsSync(dir)) return 1
  let max = 0
  for (const f of readdirSync(dir)) { const m = /^deck\.v(\d+)\.pptx$/.exec(f); if (m) max = Math.max(max, Number(m[1])) }
  return max + 1
}

function summarize(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No problems found.'
  return findings.slice(0, 40).map(f => `- [${f.severity}] ${f.slide}${f.element === undefined ? '' : ' ' + f.element} (${f.check}): ${f.message}`).join('\n')
    + (findings.length > 40 ? `\n… ${findings.length - 40} more` : '')
}

/**
 * Register pptx_build and pptx_check.
 * @param ctx - plugin context with `tools`, `workingDirectory`, `sandboxPolicy`.
 * @param config - plugin config.
 * @param measurer - text measurer chosen at activation.
 */
export function registerBuildTools(ctx: Context, config: Config, measurer: TextMeasurer): void {
  const tools = (ctx as unknown as { tools: { register(def: unknown): () => void } }).tools
  tools.register(defineTool<BuildArgs, BuildValue>({
    name: 'pptx_build',
    description: 'Assemble an editable .pptx from a pptx-studio deck.json (see the pptx-studio skill). Validates the deck, fits every text box (shrinking to the role minimum, reporting overflow), places native shapes, panels, icons, charts and tables, and writes builds/deck.vN.pptx next to deck.json without overwriting earlier versions. Run pptx_generate_assets first when the deck lists images. Returns the output path plus layout findings; deliver the final file with present.',
    parameters: {
      deck: { type: 'string', required: true, description: 'Path of deck.json; relative paths use the Session working directory.' },
      output: { type: 'string', description: 'Optional output .pptx path. Defaults to builds/deck.vN.pptx beside deck.json.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          version: { type: 'integer' },
          slides: { type: 'integer', required: true },
          bytes: { type: 'integer', required: true },
          errors: { type: 'integer', required: true },
          warnings: { type: 'integer', required: true },
          findings: { type: 'array', items: findingSchema, required: true },
        },
      },
      render: (_args, v) => [{ type: 'text', text: `Built ${v.path} (${v.slides} slides, ${Math.round(v.bytes / 1024)} KiB). ${v.errors} error(s), ${v.warnings} warning(s).\n${summarize(v.findings)}` }],
      presentationMeta: (_args, v) => ({ path: v.path, slides: v.slides, version: v.version ?? null, errors: v.errors, warnings: v.warnings }),
    },
    async execute(args, exec) {
      const ws = callWorkspace(ctx, exec)
      const deckPath = ws.path(args.deck)
      const deck = validateDeck(readJsonFile(deckPath, config.maxDeckBytes))
      const dir = deckDirOf(deckPath)
      const version = args.output === undefined ? nextVersion(join(dir, 'builds')) : undefined
      const out = args.output === undefined ? join(dir, 'builds', `deck.v${version}.pptx`) : ws.path(args.output)
      if (!out.toLowerCase().endsWith('.pptx')) throw new Error('output must end with .pptx')
      ws.assertWritable(out)
      exec.signal.throwIfAborted()
      const result = await buildDeck(deck, {
        baseDir: dir, measurer,
        feather: bytes => feather(bytes, config.featherFraction),
        bordersMatch: (bytes, hex) => {
          const [r, g, bl] = borderColor(bytes)
          const t = [0, 2, 4].map(k => parseInt(hex.slice(k, k + 2), 16))
          return Math.hypot(r - t[0]!, g - t[1]!, bl - t[2]!) < 18
        },
        optimize: (bytes, role, boxIn) => optimizeForSlide(bytes, Math.min(role === 'background' ? config.backgroundMaxPx : config.imageMaxPx, Math.max(256, Math.round(boxIn * config.imagePpi))), config.jpegQuality),
      })
      exec.signal.throwIfAborted()
      atomicWrite(out, result.bytes)
      const findings = checkDeck(deck, result.fits, result.missingAssets, result.unknownIcons, backgroundSampler(deck, dir))
      return {
        path: out, ...version === undefined ? {} : { version }, slides: result.slideCount, bytes: result.bytes.length,
        errors: findings.filter(f => f.severity === 'error').length, warnings: findings.filter(f => f.severity === 'warning').length,
        findings,
      }
    },
    presentCall: args => ({ card: 'generic', title: `Build ${basename(args.deck)}`, kind: 'edit' }),
  }))

  tools.register(defineTool<CheckArgs, CheckValue>({
    name: 'pptx_check',
    description: 'Check a pptx-studio deck.json without writing a file: text overflow and shrinking, overlapping content, safe-area violations, text-density limits, color contrast and missing images or icons. Fix errors in deck.json and run again; run pptx_build when it is clean.',
    parameters: {
      deck: { type: 'string', required: true, description: 'Path of deck.json; relative paths use the Session working directory.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { errors: { type: 'integer', required: true }, warnings: { type: 'integer', required: true }, findings: { type: 'array', items: findingSchema, required: true } },
      },
      render: (_args, v) => [{ type: 'text', text: `${v.errors} error(s), ${v.warnings} warning(s).\n${summarize(v.findings)}` }],
      presentationMeta: (_args, v) => ({ errors: v.errors, warnings: v.warnings }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const ws = callWorkspace(ctx, exec)
      const deckPath = ws.path(args.deck)
      const deck = validateDeck(readJsonFile(deckPath, config.maxDeckBytes))
      const dir = deckDirOf(deckPath)
      const result = await buildDeck(deck, { baseDir: dir, measurer })
      const findings = checkDeck(deck, result.fits, result.missingAssets, result.unknownIcons, backgroundSampler(deck, dir))
      return { errors: findings.filter(f => f.severity === 'error').length, warnings: findings.filter(f => f.severity === 'warning').length, findings }
    },
    presentCall: args => ({ card: 'generic', title: `Check ${basename(args.deck)}`, kind: 'read' }),
  }))
}

/** @returns the path relative to cwd when it is inside, else absolute. */
export function displayPath(cwd: string, path: string): string {
  const rel = relative(cwd, path)
  return rel.startsWith('..') ? path : rel
}
