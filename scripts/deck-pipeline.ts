/**
 * Development pipeline for one deck: generate images, assemble, check and render
 * previews without going through the Host. Mirrors what pptx_generate_assets,
 * pptx_build and pptx_render do, so an end-to-end run can be reproduced from a
 * shell:
 *
 *   tsx scripts/deck-pipeline.ts style    <deck.json> "<cover subject>" [--variants "a|b"]
 *   tsx scripts/deck-pipeline.ts generate <deck.json> [--style-ref style/board-1.png] [--only a,b] [--force]
 *   tsx scripts/deck-pipeline.ts check    <deck.json>
 *   tsx scripts/deck-pipeline.ts build    <deck.json> [--out some.pptx]
 *   tsx scripts/deck-pipeline.ts render   <some.pptx> [--pages 1,3]
 *
 * generate needs the backend key in the environment (AGNES_API_KEY by default).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { validateDeck } from '../src/deck/validate.ts'
import { buildDeck } from '../src/build/assemble.ts'
import { fontMeasurer } from '../src/build/metrics.ts'
import { generateAssets } from '../src/images/generate.ts'
import { generateDecorations } from '../src/images/decorations.ts'
import { checkDeck, type BackgroundSampler } from '../src/check/geometry.ts'
import { borderColor, decode, feather, optimizeForSlide, regionClutter, regionContrast, type Rgba } from '../src/images/raster.ts'
import { Config } from '../src/config.ts'
import { atomicWrite } from '../src/fsutil.ts'
import type { Asset, Deck } from '../src/deck/types.ts'

const [command, pathArg, extra] = process.argv.slice(2)
if (command === undefined || pathArg === undefined) {
  console.error('usage: tsx scripts/deck-pipeline.ts <style|generate|check|build|render> <file> [options]')
  process.exit(2)
}

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name)
  return i < 0 ? undefined : process.argv[i + 1]
}
const has = (name: string): boolean => process.argv.includes(name)

const target = resolve(pathArg)
const deckDir = dirname(target)
const config = Config({})
const limits = { concurrency: config.imageConcurrency, attempts: config.imageAttempts, backoffMs: config.imageBackoffMs, maxAssets: config.maxImagesPerCall }

function loadDeck(): Deck {
  return validateDeck(JSON.parse(readFileSync(target, 'utf8')))
}
function saveDeck(deck: Deck): void {
  atomicWrite(target, JSON.stringify(deck, null, 2) + '\n')
}

function samplerFor(deck: Deck): BackgroundSampler {
  const cache = new Map<string, Rgba | null>()
  const files = new Map((deck.assets ?? []).map(a => [a.id, a.file]))
  return (slide, box, fg) => {
    const bg = slide.background
    if (bg === undefined || !('asset' in bg)) return undefined
    let img = cache.get(bg.asset)
    if (img === undefined) {
      const file = files.get(bg.asset)
      try { img = file === undefined ? null : decode(readFileSync(isAbsolute(file) ? file : resolve(deckDir, file))) } catch { img = null }
      cache.set(bg.asset, img)
    }
    if (img === null) return undefined
    const region: [number, number, number, number] = [box.x / 100, box.y / 100, (box.x + box.w) / 100, (box.y + box.h) / 100]
    const [x0, y0, x1, y1] = region
    const lead = regionClutter(img, [x0, y0, x0 + Math.min(0.05, (x1 - x0) * 0.15), y1])
    return { contrast: regionContrast(img, region, fg), clutter: Math.max(regionClutter(img, region), lead * 0.5) }
  }
}

function backendConfig() {
  const name = flag('--backend') ?? config.imageBackend
  const entry = config.imageBackends.find(b => b.name === name)
  if (entry === undefined) throw new Error('unknown backend ' + name)
  const key = process.env[entry.apiKeyRef]
  if (key === undefined || key === '') throw new Error('missing API key in environment: ' + entry.apiKeyRef)
  return { kind: entry.kind, baseUrl: entry.baseUrl, model: entry.model, ...entry.editModel === undefined ? {} : { editModel: entry.editModel }, apiKey: key, sizeTier: entry.sizeTier, timeoutMs: entry.timeoutMs, pollIntervalMs: entry.pollIntervalMs }
}

function report(label: string, outcomes: { id: string; status: string; file?: string; error?: string; seconds?: number }[]): void {
  for (const o of outcomes) console.log(' ' + label + ' ' + o.id + ': ' + o.status + (o.file === undefined ? '' : ' -> ' + o.file) + (o.seconds === undefined ? '' : ' (' + o.seconds + 's)') + (o.error === undefined ? '' : ': ' + o.error))
}

async function main(): Promise<void> {
  if (command === 'style') {
    if (extra === undefined) throw new Error('style needs the cover subject as the third argument')
    const deck = loadDeck()
    const variants = flag('--variants')?.split('|') ?? ['', '', '']
    const boards: Asset[] = variants.slice(0, 3).map((v, i) => ({ id: 'board-' + (i + 1), kind: 'background', aspect: '16:9', prompt: v === '' ? extra : extra + ', ' + v }))
    const boardDeck: Deck = { ...deck, assets: boards }
    for (const [i, asset] of boards.entries()) {
      const r = await generateAssets({ deck: boardDeck, deckDir, outSubdir: 'style', backend: backendConfig(), limits: { ...limits, concurrency: 1 }, only: [asset.id], seed: deck.theme.seed + i * 7919, force: true, signal: AbortSignal.timeout(600_000) })
      report('style', r.outcomes)
    }
    return
  }
  if (command === 'generate') {
    const backend = backendConfig()
    const styleReference = flag('--style-ref')
    const only = flag('--only')?.split(',') ?? undefined
    const force = has('--force')
    const deck = loadDeck()
    const a = await generateAssets({ deck, deckDir, backend, limits, ...only === undefined ? {} : { only: only.filter(id => (deck.assets ?? []).some(x => x.id === id)) }, ...force ? { force: true } : {}, ...styleReference === undefined ? {} : { styleReference }, signal: AbortSignal.timeout(3_600_000) })
    saveDeck(a.deck)
    report('asset', a.outcomes)
    const kitOnly = only === undefined ? undefined : only.filter(id => (deck.decorations ?? []).some(k => k.id === id))
    if (only === undefined || (kitOnly !== undefined && kitOnly.length > 0)) {
      const k = await generateDecorations({ deck: a.deck, deckDir, backend, limits, ...kitOnly === undefined ? {} : { only: kitOnly }, ...force ? { force: true } : {}, ...styleReference === undefined ? {} : { styleReference }, signal: AbortSignal.timeout(3_600_000) })
      saveDeck(k.deck)
      for (const o of k.outcomes) console.log(' kit ' + o.id + ': ' + o.status + (o.files === undefined ? '' : ' (' + Object.keys(o.files).length + ' pieces)') + (o.missing === undefined ? '' : ' missing ' + o.missing.join(',')) + (o.error === undefined ? '' : ': ' + o.error) + (o.seconds === undefined ? '' : ' (' + o.seconds + 's)'))
    }
    return
  }
  if (command === 'render') {
    const cli = process.env.PPTX_RENDER_CLI ?? 'E:\\Deepseek harness Desktop\\resources\\app.asar.unpacked\\dsh\\node_modules\\@deepseek-ai\\libreoffice-kit\\lib\\cli.js'
    // The kit creates the directory itself and fails when it already exists.
    let outDir = join(dirname(target), 'review', target.replace(/\.pptx$/i, '').split(/[\\/]/).pop()!)
    while (existsSync(outDir)) outDir = outDir.replace(/-[a-z0-9]+$/, '') + '-' + Date.now().toString(36)
    mkdirSync(dirname(outDir), { recursive: true })
    const args = [cli, 'render', '--input', target, '--output-dir', outDir, '--dpi', '96']
    const pages = flag('--pages')
    if (pages !== undefined) args.push('--pages', pages)
    const r = spawnSync(process.execPath, args, { stdio: 'inherit' })
    console.log('render exit', r.status, '->', outDir)
    return
  }
  const deck = loadDeck()
  const result = await buildDeck(deck, {
    baseDir: deckDir, measurer: fontMeasurer(config.measureFont, config.measureFontBold),
    feather: bytes => feather(bytes, config.featherFraction),
    bordersMatch: (bytes, hex) => {
      const [r, g, b] = borderColor(bytes)
      const t = [0, 2, 4].map(k => parseInt(hex.slice(k, k + 2), 16))
      return Math.hypot(r - t[0]!, g - t[1]!, b - t[2]!) < 18
    },
    optimize: (bytes, role, boxIn) => optimizeForSlide(bytes, Math.min(role === 'background' ? config.backgroundMaxPx : config.imageMaxPx, Math.max(256, Math.round(boxIn * config.imagePpi))), config.jpegQuality),
  })
  const findings = checkDeck(deck, result.fits, result.missingAssets, result.unknownIcons, samplerFor(deck))
  console.log('slides', result.slideCount, 'missing', JSON.stringify(result.missingAssets), 'unknown icons', JSON.stringify(result.unknownIcons))
  console.log('errors', findings.filter(f => f.severity === 'error').length, 'warnings', findings.filter(f => f.severity === 'warning').length)
  for (const f of findings) console.log(' ', f.severity, f.slide, f.element ?? '', f.check, f.message.slice(0, 150))
  if (command === 'check') return
  if (command === 'build') {
    const out = flag('--out')
    let outPath: string
    if (out === undefined) {
      const dir = join(deckDir, 'builds')
      mkdirSync(dir, { recursive: true })
      let version = 1
      if (existsSync(dir)) for (const f of readdirSync(dir)) { const m = /^deck\.v(\d+)\.pptx$/.exec(f); if (m) version = Math.max(version, Number(m[1]) + 1) }
      outPath = join(dir, 'deck.v' + version + '.pptx')
    } else outPath = isAbsolute(out) ? out : resolve(out)
    atomicWrite(outPath, result.bytes)
    console.log('wrote', outPath, Math.round(result.bytes.length / 1024) + ' KiB')
    return
  }
  throw new Error('unknown command ' + command)
}

await main();
