/** pptx_review: independent vision-model review of rendered slides. */
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveVisionTarget, reviewPages, type PageReview, type ReviewResult } from '../vision.ts'
import { callWorkspace } from './context.ts'
import { renderPptx, type RenderValue } from './render.ts'

interface ReviewArgs { pptx: string; pages?: number[]; dpi?: number }
interface ReviewValue extends ReviewResult { rendered: RenderValue['images']; missingFonts: string[] }

/** The session route a vision review can reuse in session mode. */
interface SessionLike {
  requestHeader?(): { config?: { provider?: string; model?: string } }
}

function sessionRoute(exec: unknown): { provider?: string; model?: string } | undefined {
  const session = (exec as { agent?: { session?: SessionLike } }).agent?.session
  return session?.requestHeader?.()?.config
}

function pageLine(review: PageReview): string {
  const head = '- P' + review.page + ' ' + review.verdict + (review.score === undefined ? '' : ' (' + review.score + ')')
  const issues = review.issues.map(issue => '  - [' + issue.severity + '/' + issue.area + '] ' + issue.issue + (issue.fix === '' ? '' : ' -> ' + issue.fix))
  const raw = review.raw === undefined ? [] : ['  - raw model output: ' + review.raw.slice(0, 240)]
  return [head, ...issues, ...raw].join('\n')
}

const issueSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    severity: { type: 'string', required: true, enum: ['error', 'warning', 'info'] },
    area: { type: 'string', required: true },
    issue: { type: 'string', required: true },
    fix: { type: 'string', required: true },
  },
} as const

/**
 * Register pptx_review.
 * @param ctx - plugin context.
 * @param config - plugin config.
 */
export function registerReviewTool(ctx: Context, config: Config): void {
  const tools = (ctx as unknown as { tools: { register(def: unknown): () => void } }).tools
  tools.register(defineTool<ReviewArgs, ReviewValue>({
    name: 'pptx_review',
    description: 'Review a built .pptx with the independent vision model configured in the plugin settings (visionModelMode: route / custom / session). Renders every requested slide with LibreOffice Kit, sends each page image to that model, and returns structured layout / typography / contrast / imagery findings with fixes. Use this after pptx_build when a vision model is configured; when visionModelMode is session and the conversation cannot see images, use pptx_render + read_image instead.',
    parameters: {
      pptx: { type: 'string', required: true, description: 'Path of the built .pptx; relative paths use the Session working directory.' },
      pages: { type: 'array', items: { type: 'integer' }, description: '1-based slide numbers; all slides when omitted (at most 30).' },
      dpi: { type: 'integer', description: 'Review resolution, 48–200; default 96.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          model: { type: 'string', required: true },
          target: { type: 'string', required: true, enum: ['session', 'route', 'custom'] },
          pages: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                page: { type: 'integer', required: true },
                verdict: { type: 'string', required: true, enum: ['pass', 'warn', 'fail'] },
                score: { type: 'integer' },
                issues: { type: 'array', required: true, items: issueSchema },
                raw: { type: 'string' },
              },
            },
          },
          summary: {
            type: 'object', additionalProperties: false, required: true,
            properties: {
              errors: { type: 'integer', required: true },
              warnings: { type: 'integer', required: true },
              passed: { type: 'integer', required: true },
            },
          },
          rendered: {
            type: 'array', required: true,
            items: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', required: true }, path: { type: 'string', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true } } },
          },
          missingFonts: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_a, v) => [{
        type: 'text',
        text: 'Vision review via ' + v.model + ' (' + v.target + '): ' + v.summary.errors + ' error(s), ' + v.summary.warnings + ' warning(s), ' + v.summary.passed + ' passed page(s).\n' + v.pages.map(pageLine).join('\n') + (v.missingFonts.length > 0 ? '\nMissing fonts (substituted): ' + v.missingFonts.join(', ') : ''),
      }],
      presentationMeta: (_a, v) => ({ model: v.model, pages: v.pages.map(page => ({ page: page.page, verdict: page.verdict, issues: page.issues.length })), files: v.rendered.map(image => image.path) }),
    },
    timeoutMs: 900_000,
    async execute(args, exec) {
      const ws = callWorkspace(ctx, exec)
      const pptx = ws.path(args.pptx)
      const outDir = join(dirname(pptx), 'review', pptx.replace(/^.*[\\/]/, '').replace(/\.pptx$/i, ''))
      ws.assertWritable(join(outDir, 'x.png'))
      const rendered = await renderPptx(config, pptx, args.pages ?? [], args.dpi ?? 96, exec.signal)
      const target = resolveVisionTarget(config, sessionRoute(exec))
      const result = await reviewPages(ctx, target, rendered.images, exec.signal)
      return { ...result, rendered: rendered.images, missingFonts: rendered.missingFonts }
    },
    presentCall: args => ({ card: 'generic', title: 'Review ' + args.pptx, kind: 'read' }),
  }))
}
