/**
 * pptx_render: render chosen slides of a built .pptx to PNG with LibreOffice
 * Kit so the model can inspect them with read_image.
 *
 * Desktop ships a standalone Node and the kit CLI; their paths are found from
 * the running Harness when not configured (see config.renderNode/renderCli).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { callWorkspace } from './context.ts'

interface RenderArgs { pptx: string; pages?: number[]; dpi?: number }
export interface RenderValue { images: { page: number; path: string; width: number; height: number }[]; missingFonts: string[]; outputDir: string }

/** Resolved renderer paths, or a reason they are unavailable. */
export type RendererPaths = { node: string; cli: string } | { error: string }

/**
 * Locate a standalone Node and the LibreOffice Kit CLI.
 * @param config - explicit overrides.
 * @param env - environment (DSH sets DSH_* facts in tool shells; the Host process sees its own).
 */
export function locateRenderer(config: Config, env: NodeJS.ProcessEnv = process.env): RendererPaths {
  const tried: string[] = []
  const firstFile = (cands: (string | undefined)[]) => {
    for (const c of cands) { if (c === undefined) continue; tried.push(c); if (existsSync(c)) return c }
    return undefined
  }
  const home = env.DSH_HOME ?? (env.USERPROFILE ?? env.HOME ?? '') + (process.platform === 'win32' ? '\\.dsh' : '/.dsh')
  const exe = process.platform === 'win32' ? 'node.exe' : 'node'
  const node = firstFile([
    config.renderNode,
    join(home, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', exe),
    process.versions.electron === undefined ? process.execPath : undefined,
  ])
  let kitCli: string | undefined
  try {
    const req = createRequire(join(process.cwd(), 'noop.js'))
    kitCli = join(dirname(req.resolve('@deepseek-ai/libreoffice-kit/package.json')), 'lib', 'cli.js')
  } catch {
    // Not resolvable from the Host's cwd; fall through to the resources path below.
  }
  const resources = (process as unknown as { resourcesPath?: string }).resourcesPath
  // The Desktop Host imports this plugin from the profile, while @deepseek-ai packages
  // live in <install>/resources/app.asar/dsh/node_modules; the kit's lib/ is unpacked.
  const fromHostPackage = (() => {
    try {
      const url = import.meta.resolve('@deepseek-ai/dsh-tools')
      const m = /^(.*[\\/]resources)[\\/]app\.asar[\\/]/.exec(decodeURIComponent(new URL(url).pathname).replace(/^\/([A-Za-z]:)/, '$1'))
      return m?.[1]
    } catch {
      // import.meta.resolve is unavailable or the host package is not inside an Electron install.
      return undefined
    }
  })()
  const unpacked = (base: string | undefined) => base === undefined ? undefined : join(base, 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js')
  // Electron exposes the install's resources directory directly.
  const cli = firstFile([
    config.renderCli,
    unpacked(resources),
    unpacked(fromHostPackage),
    kitCli?.replace(`app.asar${process.platform === 'win32' ? '\\' : '/'}`, `app.asar.unpacked${process.platform === 'win32' ? '\\' : '/'}`),
    kitCli,
  ])
  if (node === undefined || cli === undefined) return { error: `LibreOffice Kit renderer not found (set renderNode/renderCli in the pptx-studio config). Tried: ${tried.join(', ')}` }
  return { node, cli }
}

export function run(node: string, args: string[], signal: AbortSignal, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(node, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    let stdout = '', stderr = ''
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); if (stdout.length > 4_000_000) child.kill() })
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8').slice(0, 20_000) })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    const onAbort = () => child.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    child.on('error', err => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(err) })
    child.on('close', code => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolvePromise({ code, stdout, stderr }) })
  })
}

/**
 * Render one built .pptx to PNG images. Callers must resolve the workspace and
 * check write access to the output directory first.
 * @param config - plugin config (renderer paths and timeout).
 * @param pptx - absolute .pptx path.
 * @param pages - 1-based slide numbers; all slides when empty.
 * @param dpi - requested resolution per inch.
 * @param signal - cancellation signal.
 * @returns rendered image paths and missing-font facts.
 */
export async function renderPptx(
  config: Config,
  pptx: string,
  pages: readonly number[],
  dpi: number,
  signal: AbortSignal,
): Promise<RenderValue> {
  if (!existsSync(pptx) || !pptx.toLowerCase().endsWith('.pptx')) throw new Error(`not a .pptx file: ${pptx}`)
  const paths = locateRenderer(config)
  if ('error' in paths) throw new Error(paths.error)
  const name = basename(pptx).replace(/\.pptx$/i, '')
  const outDir = join(dirname(pptx), 'review', name)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(dirname(outDir), { recursive: true })
  const selected = pages.filter(p => Number.isInteger(p) && p > 0).slice(0, 30)
  const resolution = Math.max(48, Math.min(200, dpi))
  const cliArgs = [paths.cli, 'render', '--input', pptx, '--output-dir', outDir, '--dpi', String(resolution), '--max-pages', '30', ...selected.length > 0 ? ['--pages', selected.join(',')] : []]
  const res = await run(paths.node, cliArgs, signal, config.renderTimeoutMs)
  signal.throwIfAborted()
  if (res.code !== 0) throw new Error(`LibreOffice Kit render failed (exit ${res.code}): ${res.stderr.slice(0, 600)}`)
  const manifestPath = join(outDir, 'manifest.json')
  const manifest = JSON.parse(existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : res.stdout) as { images: { page?: number; index: number; path: string; width: number; height: number }[]; missingFonts?: string[] }
  // The kit numbers files by output order; rename to the slide number so slide-N.png is slide N.
  const images = manifest.images.map(i => {
    const page = i.page ?? i.index
    const from = resolve(i.path)
    const to = join(outDir, `slide-${String(page).padStart(2, '0')}.png`)
    if (from !== to && existsSync(from)) renameSync(from, to)
    return { page, path: to, width: i.width, height: i.height }
  })
  return { images, missingFonts: manifest.missingFonts ?? [], outputDir: outDir }
}
/**
 * Register pptx_render.
 * @param ctx - plugin context.
 * @param config - plugin config.
 */
export function registerRenderTool(ctx: Context, config: Config): void {
  const tools = (ctx as unknown as { tools: { register(def: unknown): () => void } }).tools
  tools.register(defineTool<RenderArgs, RenderValue>({
    name: 'pptx_render',
    description: 'Render slides of a built .pptx to PNG images with the bundled LibreOffice Kit, for visual review. Then open the images with read_image and check clipping, overlap, contrast, decoration crossing text and image consistency (references/quality-checklist.md). Render only the slides you need; images go to <pptx dir>/review/<pptx name>/ and are replaced on each call.',
    parameters: {
      pptx: { type: 'string', required: true, description: 'Path of the .pptx; relative paths use the Session working directory.' },
      pages: { type: 'array', items: { type: 'integer' }, description: '1-based slide numbers; all slides when omitted (at most 30).' },
      dpi: { type: 'integer', description: 'Resolution, 48–200; default 96.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          images: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, path: { type: 'string', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true } } } },
          missingFonts: { type: 'array', items: { type: 'string' }, required: true },
          outputDir: { type: 'string', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: `Rendered ${v.images.length} slide(s) to ${v.outputDir}:\n${v.images.map(i => `- slide ${i.page}: ${i.path}`).join('\n')}${v.missingFonts.length > 0 ? `\nMissing fonts (substituted): ${v.missingFonts.join(', ')}` : ''}` }],
      presentationMeta: (_a, v) => ({ kind: 'pptx-render', outputDir: v.outputDir, files: v.images.map(i => i.path), pages: v.images.map(i => i.page), missingFonts: v.missingFonts }),
    },
    timeoutMs: 600_000,
    async execute(args, exec) {
      const ws = callWorkspace(ctx, exec)
      const pptx = ws.path(args.pptx)
      const outDir = join(dirname(pptx), 'review', basename(pptx).replace(/\.pptx$/i, ''))
      ws.assertWritable(join(outDir, 'x.png'))
      return renderPptx(config, pptx, args.pages ?? [], args.dpi ?? 96, exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `Render ${args.pptx}`, kind: 'read' }),
  }))
}
