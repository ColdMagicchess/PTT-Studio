/** pptx_generate_assets and pptx_style_board tools. */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { validateDeck } from '../deck/validate.ts'
import type { Asset, Deck } from '../deck/types.ts'
import { generateAssets, type AssetOutcome } from '../images/generate.ts'
import { generateDecorations, type KitOutcome } from '../images/decorations.ts'
import type { ImageBackendConfig } from '../images/backends.ts'
import { atomicWrite } from '../fsutil.ts'
import { readLive, type Config } from '../config.ts'

interface GenerateArgs { deck: string; only?: string[]; force?: boolean; seed?: number; style_reference?: string; backend?: string; run_in_background?: boolean }
interface GenerateValue { deck: string; backend: string; outcomes: AssetOutcome[]; kits: KitOutcome[]; job?: { id: string; status: 'running'; label: string } }
interface BoardArgs { deck: string; subject: string; variants?: string[]; backend?: string }
interface BoardValue { boards: AssetOutcome[] }
import { callWorkspace, deckDirOf, readJsonFile } from './context.ts'

interface CredentialsLike { resolve(ref: string): Promise<{ value: string } | undefined> }

/** The subset of a background job's producer face this tool narrates to. */
interface JobHandleLike { append(text: string): void; updateProgress(line: string): void }
/** The subset of ctx.jobs used by \`pptx_generate_assets\`. */
interface JobsLike {
  start(spec: {
    kind: string; label: string; owner?: string; outputLimitBytes?: number
    run(job: JobHandleLike): { cancel(reason?: string): void; done: Promise<{ status: 'completed' | 'killed' | 'failed'; detail?: string; result?: string }> }
  }): string
}

/**
 * Resolve the active image backend and its API key. The key comes from the DSH
 * credentials store when available, else from the process environment.
 * @param ctx - plugin context.
 * @param config - plugin config.
 * @param override - backend name chosen for this call.
 */
export async function activeBackend(ctx: Context, config: Config, override: string | undefined): Promise<ImageBackendConfig> {
  const name = override ?? readLive(config.imageBackend)
  if (name === '') throw new Error('image generation is disabled: set imageBackend in the pptx-studio plugin config')
  const entry = config.imageBackends.find(b => b.name === name)
  if (entry === undefined) throw new Error(`unknown image backend "${name}"; configured: ${config.imageBackends.map(b => b.name).join(', ')}`)
  const creds = (ctx as unknown as { get(name: string): unknown }).get('credentials') as CredentialsLike | undefined
  let key: string | undefined
  if (creds !== undefined) {
    const { credentialRef } = await import('@deepseek-ai/dsh-credentials')
    key = (await creds.resolve(credentialRef(entry.apiKeyRef)))?.value
  }
  key ??= process.env[entry.apiKeyRef]
  if (key === undefined || key.length === 0) throw new Error(`image backend "${name}" has no API key: store credential ${entry.apiKeyRef} (Settings or dsh credentials) or set the environment variable`)
  return { kind: entry.kind, baseUrl: entry.baseUrl, model: entry.model, ...entry.editModel === undefined ? {} : { editModel: entry.editModel }, apiKey: key, sizeTier: entry.sizeTier, timeoutMs: entry.timeoutMs, pollIntervalMs: entry.pollIntervalMs }
}

const outcomeSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    status: { type: 'string', required: true, enum: ['generated', 'cached', 'supplied', 'skipped', 'failed', 'rejected'] },
    file: { type: 'string' },
    error: { type: 'string' },
    seconds: { type: 'integer' },
    lint: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { fragment: { type: 'string', required: true }, reason: { type: 'string', required: true } } } },
  },
} as const

function outcomeLine(o: AssetOutcome): string {
  const tail = o.status === 'rejected' ? `: ${o.lint?.map(l => `"${l.fragment}" (${l.reason})`).join('; ')}` : o.error === undefined ? '' : `: ${o.error}`
  return `- ${o.id}: ${o.status}${o.file === undefined ? '' : ` → ${o.file}`}${o.seconds === undefined ? '' : ` (${o.seconds}s)`}${tail}`
}

function kitLine(k: KitOutcome): string {
  const pieces = k.files === undefined ? '' : ` (${Object.keys(k.files).length} piece(s): ${Object.entries(k.files).map(([id, f]) => `${id} → ${f}`).join(', ')})`
  const extra = k.missing === undefined ? '' : `; missing: ${k.missing.join(', ')} — the sheet split into fewer pieces than requested; regenerate with a new seed or fewer pieces`
  return `- ${k.id}: ${k.status}${pieces}${extra}${k.error === undefined ? '' : ': ' + k.error}${k.seconds === undefined ? '' : ` (${k.seconds}s)`}`
}

function plainOutcome(o: AssetOutcome) {
  return { id: o.id, status: o.status, ...o.file === undefined ? {} : { file: o.file }, ...o.error === undefined ? {} : { error: o.error }, ...o.seconds === undefined ? {} : { seconds: o.seconds }, ...o.lint === undefined ? {} : { lint: o.lint.map(l => ({ ...l })) } }
}

/**
 * Register the image tools.
 * @param ctx - plugin context.
 * @param config - plugin config.
 */
export function registerImageTools(ctx: Context, config: Config): void {
  const tools = (ctx as unknown as { tools: { register(def: unknown): () => void } }).tools
  const limits = { concurrency: config.imageConcurrency, attempts: config.imageAttempts, backoffMs: config.imageBackoffMs, maxAssets: config.maxImagesPerCall }

  tools.register(defineTool<GenerateArgs, GenerateValue>({
    name: 'pptx_generate_assets',
    description: 'Generate the images of a pptx-studio deck.json with the configured image model and record the files back into deck.json: "assets" (backgrounds and illustrations) and "decorations" (decoration kits — each kit is drawn as one sheet on a flat white or black backdrop, the backdrop is removed and the sheet is split into separate transparent pieces). Prompts are assembled from each subject plus the theme styleAnchor, palette and complexity; subjects containing hex colors, digits, acronyms or text-like words are rejected (rewrite them). Pass style_reference (the chosen style board) so everything matches. Results are cached by prompt; "only" takes asset ids and kit ids. Inspect the returned files with read_image before building.',
    parameters: {
      deck: { type: 'string', required: true, description: 'Path of deck.json; relative paths use the Session working directory.' },
      only: { type: 'array', items: { type: 'string' }, description: 'Asset ids and/or decoration kit ids to generate; everything pending when omitted.' },
      force: { type: 'boolean', description: 'Regenerate even when a cached file exists.' },
      seed: { type: 'integer', description: 'Seed override, for regenerating a rejected image.' },
      style_reference: { type: 'string', description: 'Style reference image path relative to the deck directory (for example style/board-2.png).' },
      backend: { type: 'string', description: 'Image backend name from the plugin config; the configured default when omitted.' },
      run_in_background: { type: 'boolean', description: 'Start the generation as a background job and return its id immediately, so you can keep designing while images render. Collect it later with job_output (or job_list); deck.json is written when the job finishes. Requires dsh-tool-jobs in the Host.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          deck: { type: 'string', required: true }, backend: { type: 'string', required: true }, outcomes: { type: 'array', items: outcomeSchema, required: true },
          kits: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true }, status: { type: 'string', required: true }, sheet: { type: 'string' }, error: { type: 'string' }, seconds: { type: 'integer' },
            files: { type: 'object', additionalProperties: true }, missing: { type: 'array', items: { type: 'string' } }, extras: { type: 'array', items: { type: 'string' } },
          } } },
          job: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, status: { type: 'string', required: true }, label: { type: 'string', required: true } } },
        },
      },
      render: (_a, v) => v.job === undefined
        ? [{ type: 'text', text: `Images for ${v.deck} via ${v.backend}:\n${v.outcomes.map(outcomeLine).join('\n')}${v.kits.length === 0 ? '' : '\nDecoration kits:\n' + v.kits.map(kitLine).join('\n')}` }]
        : [{ type: 'text', text: `Started background job ${v.job.id} (${v.job.label}). Images are rendering in the background; the deck.json is written when it finishes. Keep working on the deck, then collect the result with job_output (wait:true, job_id) or list it with job_list.` }],
      presentationMeta: (_a, v) => ({
        kind: 'pptx-assets', deck: v.deck, backend: v.backend,
        files: v.outcomes.filter(o => o.file !== undefined).map(o => ({ id: o.id, status: o.status, file: join(dirname(v.deck), o.file!) })),
        failed: v.outcomes.filter(o => o.status === 'failed' || o.status === 'rejected').map(o => ({ id: o.id, status: o.status, error: o.error ?? null })),
        kits: v.kits.map(k => ({ id: k.id, status: k.status, sheet: k.sheet === undefined ? null : join(dirname(v.deck), k.sheet), pieces: k.files === undefined ? 0 : Object.keys(k.files).length })),
        job: v.job ?? null,
      }),
    },
    timeoutMs: 3_600_000,
    async execute(args, exec) {
      const ws = callWorkspace(ctx, exec)
      const deckPath = ws.path(args.deck)
      const deck = validateDeck(readJsonFile(deckPath, config.maxDeckBytes))
      const dir = deckDirOf(deckPath)
      ws.assertWritable(join(dir, 'assets', 'x.png'))
      ws.assertWritable(deckPath)
      const backend = await activeBackend(ctx, config, args.backend)
      const backendName = args.backend ?? readLive(config.imageBackend)
      const assetIds = new Set((deck.assets ?? []).map(a => a.id))
      const kitIds = new Set((deck.decorations ?? []).map(k => k.id))
      const unknown = (args.only ?? []).filter(id => !assetIds.has(id) && !kitIds.has(id))
      if (unknown.length > 0) throw new Error(`unknown asset or decoration kit id(s): ${unknown.join(', ')}`)
      const onlyAssets = args.only?.filter(id => assetIds.has(id))
      const onlyKits = args.only?.filter(id => kitIds.has(id))
      const runAssets = onlyAssets === undefined || onlyAssets.length > 0
      const runKits = onlyKits === undefined || onlyKits.length > 0
      const base = {
        deckDir: dir, backend, limits,
        ...args.force === undefined ? {} : { force: args.force },
        ...args.seed === undefined ? {} : { seed: args.seed },
        ...args.style_reference === undefined ? {} : { styleReference: args.style_reference },
      }

      // Background path: register with ctx.jobs, narrate progress, and let the
      // model keep writing slides while images and decoration pieces render.
      if (args.run_in_background === true) {
        const jobs = (ctx as unknown as { get(name: string): unknown }).get('jobs') as JobsLike | undefined
        if (jobs === undefined) throw new Error('run_in_background needs dsh-tool-jobs in the Host; retry without it')
        const label = `generate images for ${basename(deckPath)}`
        const owner = exec.agent?.id
        const controller = new AbortController()
        let cancelReason: string | undefined
        const jobId = jobs.start({
          kind: 'pptx-generate-images',
          label,
          ...owner === undefined ? {} : { owner },
          outputLimitBytes: 64 * 1024,
          run: handle => {
            const work = (async (): Promise<{ status: 'completed' | 'killed' | 'failed'; detail?: string; result?: string }> => {
              try {
                const a = runAssets
                  ? await generateAssets({ ...base, deck, signal: controller.signal, ...onlyAssets === undefined ? {} : { only: onlyAssets }, onProgress: (done, total, outcome) => { handle.append(`${outcomeLine(outcome)}\n`); handle.updateProgress(`${done}/${total} images`) } })
                  : { outcomes: [], deck }
                atomicWrite(deckPath, JSON.stringify(a.deck, null, 2) + '\n')
                const k = runKits
                  ? await generateDecorations({ ...base, deck: a.deck, signal: controller.signal, ...onlyKits === undefined ? {} : { only: onlyKits } })
                  : { outcomes: [], deck: a.deck }
                atomicWrite(deckPath, JSON.stringify(k.deck, null, 2) + '\n')
                for (const kit of k.outcomes) handle.append(`${kitLine(kit)}\n`)
                const failed = [...a.outcomes, ...k.outcomes].filter(o => o.status === 'failed' || o.status === 'rejected').length
                return { status: controller.signal.aborted ? 'killed' : 'completed', detail: `${a.outcomes.length} image(s), ${k.outcomes.length} kit(s), ${failed} failed`, result: `deck.json updated: ${deckPath}` }
              } catch (error) {
                if (controller.signal.aborted) return { status: 'killed', detail: cancelReason ?? 'cancelled' }
                return { status: 'failed', detail: error instanceof Error ? error.message : String(error) }
              }
            })()
            return { cancel: reason => { cancelReason = reason; controller.abort() }, done: work }
          },
        })
        return { deck: deckPath, backend: backendName, outcomes: [], kits: [], job: { id: jobId, status: 'running' as const, label } }
      }

      const common = { ...base, signal: exec.signal }
      const a = runAssets ? await generateAssets({ ...common, deck, ...onlyAssets === undefined ? {} : { only: onlyAssets } }) : { outcomes: [], deck }
      const k = runKits ? await generateDecorations({ ...common, deck: a.deck, ...onlyKits === undefined ? {} : { only: onlyKits } }) : { outcomes: [], deck: a.deck }
      atomicWrite(deckPath, JSON.stringify(k.deck, null, 2) + '\n')
      return { deck: deckPath, backend: backendName, outcomes: a.outcomes.map(plainOutcome), kits: k.outcomes.map(o => ({ ...o, ...o.files === undefined ? {} : { files: { ...o.files } } })) }
    },
    presentCall: args => ({ card: 'generic', title: `Generate images for ${basename(args.deck)}`, kind: 'edit' }),
  }))

  tools.register(defineTool<BoardArgs, BoardValue>({
    name: 'pptx_style_board',
    description: 'Generate 2–3 candidate style boards (cover-composition backgrounds) for a pptx-studio deck so the user can pick one. Each variant uses the deck theme and complexity with a different seed; an optional extra phrase per variant nudges it. Files land in <deck dir>/style/board-N.png. Show them with read_image, ask the user to choose, then pass the chosen file as style_reference to pptx_generate_assets.',
    parameters: {
      deck: { type: 'string', required: true, description: 'Path of deck.json.' },
      subject: { type: 'string', required: true, description: 'Cover subject and composition, English, no text-like words (see image-prompts.md).' },
      variants: { type: 'array', items: { type: 'string' }, description: 'Optional extra phrase per variant (2–3 entries); three seed variants when omitted.' },
      backend: { type: 'string', description: 'Image backend name; the configured default when omitted.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { boards: { type: 'array', items: outcomeSchema, required: true } } },
      render: (_a, v) => [{ type: 'text', text: `Style boards:\n${v.boards.map(outcomeLine).join('\n')}` }],
      presentationMeta: (a, v) => ({ kind: 'pptx-style-board', files: v.boards.filter(o => o.file !== undefined).map(o => o.file!), deck: a.deck }),
    },
    timeoutMs: 1_800_000,
    async execute(args, exec) {
      const ws = callWorkspace(ctx, exec)
      const deckPath = ws.path(args.deck)
      const deck = validateDeck(readJsonFile(deckPath, config.maxDeckBytes))
      const dir = deckDirOf(deckPath)
      ws.assertWritable(join(dir, 'style', 'x.png'))
      const backend = await activeBackend(ctx, config, args.backend)
      const extras = args.variants === undefined || args.variants.length === 0 ? ['', '', ''] : args.variants.slice(0, 3)
      const assets: Asset[] = extras.map((extra, i) => ({ id: `board-${i + 1}`, kind: 'background', aspect: '16:9', prompt: extra === '' ? args.subject : `${args.subject}, ${extra}` }))
      const boardDeck: Deck = { ...deck, assets }
      const results: AssetOutcome[] = []
      // One seed per variant, so boards differ even with identical phrases.
      for (const [i, asset] of assets.entries()) {
        const { outcomes } = await generateAssets({ deck: boardDeck, deckDir: dir, outSubdir: 'style', backend, limits: { ...limits, concurrency: 1 }, only: [asset.id], seed: deck.theme.seed + i * 7919, force: true, signal: exec.signal })
        results.push(...outcomes)
      }
      return { boards: results.map(plainOutcome) }
    },
    presentCall: args => ({ card: 'generic', title: `Style boards for ${basename(args.deck)}`, kind: 'edit' }),
  }))
}

/** @returns true when a style reference file exists relative to the deck dir. */
export function hasReference(deckDir: string, ref: string): boolean {
  return existsSync(join(deckDir, ref))
}
