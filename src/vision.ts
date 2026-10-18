/** Independent vision-model review of rendered slides. */
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { readLive, type Config } from './config.ts'

/** One OpenAI-compatible model declared in customModelsJson. */
export interface CustomModel { name: string; baseUrl: string; model: string; apiKeyRef: string; api: string }
/** Resolved vision route. */
export interface VisionTarget {
  mode: 'session' | 'route' | 'custom'
  label: string
  provider?: string
  model: string
  custom?: CustomModel
}
/** One review finding. */
export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info'
  area: string
  issue: string
  fix: string
}
/** One page's review. */
export interface PageReview {
  page: number
  verdict: 'pass' | 'warn' | 'fail'
  score?: number
  issues: ReviewIssue[]
  raw?: string
}
/** Cross-page totals. */
export interface ReviewSummary { errors: number; warnings: number; passed: number }
/** Full review payload returned by the tool. */
export interface ReviewResult {
  model: string
  target: VisionTarget['mode']
  pages: PageReview[]
  summary: ReviewSummary
}

const SYSTEM_PROMPT = [
  'You are a senior presentation design reviewer. You review rendered slides at projection size.',
  'Judge only what is visible in the image. Be strict but practical.',
  'Check: text overflow or clipping, overlapping elements, contrast and readability, hierarchy,',
  'alignment and margins, decoration crossing text, image quality and consistency, density and emptiness.',
  'Return ONLY JSON with this shape:',
  '{"verdict":"pass|warn|fail","score":0-100,"issues":[{"severity":"error|warning|info","area":"layout|typography|contrast|imagery|content","issue":"what is wrong","fix":"what to change"}]}',
  'Use error only when a viewer cannot read or see the content; warning for polish; info for suggestions.',
].join(' ')

/**
 * Build the per-page user prompt.
 * @param page - 1-based slide number.
 * @param total - number of pages sent for review.
 * @returns review instructions naming the page.
 */
function pagePrompt(page: number, total: number): string {
  return 'Review slide ' + page + ' of ' + total + ' (16:9, rendered from a .pptx). Return only the JSON object described in the system prompt.'
}

/**
 * Parse the customModelsJson config string.
 * @param json - JSON array text.
 * @returns validated custom models.
 * @throws when the JSON or an entry is invalid.
 */
export function parseCustomModels(json: string): CustomModel[] {
  const text = json.trim()
  if (text === '') return []
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (error) { throw new Error('customModelsJson is not valid JSON: ' + (error instanceof Error ? error.message : String(error))) }
  if (!Array.isArray(parsed)) throw new Error('customModelsJson must be a JSON array')
  return parsed.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') throw new Error('customModelsJson[' + index + '] must be an object')
    const item = entry as Record<string, unknown>
    for (const key of ['name', 'baseUrl', 'model', 'apiKeyRef'] as const) {
      if (typeof item[key] !== 'string' || item[key].length === 0) throw new Error('customModelsJson[' + index + '].' + key + ' must be a non-empty string')
    }
    const api = typeof item.api === 'string' && item.api.length > 0 ? item.api : 'openai-chat'
    if (api !== 'openai-chat') throw new Error('customModelsJson[' + index + '].api must be openai-chat')
    return { name: item.name as string, baseUrl: item.baseUrl as string, model: item.model as string, apiKeyRef: item.apiKeyRef as string, api }
  })
}

/**
 * Resolve which vision model a review uses.
 * @param config - plugin config.
 * @param sessionRoute - current conversation route, when known.
 * @returns the target route, custom model or session model.
 */
export function resolveVisionTarget(config: Config, sessionRoute?: { provider?: string; model?: string }): VisionTarget {
  const mode = readLive(config.visionModelMode)
  const name = readLive(config.visionModelName).trim()
  if (mode === 'route') {
    const slash = name.indexOf('/')
    if (slash <= 0 || slash === name.length - 1) throw new Error('visionModelMode is route but visionModelName must be provider/model')
    return { mode, label: 'route ' + name, provider: name.slice(0, slash), model: name.slice(slash + 1) }
  }
  if (mode === 'custom') {
    const custom = parseCustomModels(readLive(config.customModelsJson)).find(item => item.name === name)
    if (custom === undefined) throw new Error('visionModelMode is custom but visionModelName "' + name + '" is not in customModelsJson')
    return { mode, label: 'custom ' + custom.name, model: custom.model, custom }
  }
  if (sessionRoute?.provider !== undefined && sessionRoute.model !== undefined) {
    return { mode: 'session', label: 'session ' + sessionRoute.provider + '/' + sessionRoute.model, provider: sessionRoute.provider, model: sessionRoute.model }
  }
  throw new Error('visionModelMode is session but the current session has no routed model; set visionModelMode to route or custom in the plugin settings')
}

/**
 * Parse a model's JSON review, tolerating a fenced code block and surrounding prose.
 * @param text - raw model output.
 * @returns verdict, optional score and normalized issues.
 */
export function parseReviewResponse(text: string): { verdict: PageReview['verdict']; score?: number; issues: ReviewIssue[]; raw?: string } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return { verdict: 'warn', issues: [], raw: text.trim() }
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { return { verdict: 'warn', issues: [], raw: text.trim() } }
  if (value === null || typeof value !== 'object') return { verdict: 'warn', issues: [], raw: text.trim() }
  const body = value as Record<string, unknown>
  const verdict = body.verdict === 'pass' || body.verdict === 'fail' || body.verdict === 'warn' ? body.verdict : 'warn'
  const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.max(0, Math.min(100, Math.round(body.score))) : undefined
  const issues: ReviewIssue[] = []
  if (Array.isArray(body.issues)) {
    for (const entry of body.issues.slice(0, 20)) {
      if (entry === null || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      const issue = typeof item.issue === 'string' ? item.issue.trim() : ''
      if (issue === '') continue
      const severity = item.severity === 'error' || item.severity === 'warning' || item.severity === 'info' ? item.severity : 'warning'
      issues.push({
        severity,
        area: typeof item.area === 'string' && item.area.length > 0 ? item.area : 'layout',
        issue,
        fix: typeof item.fix === 'string' ? item.fix.trim() : '',
      })
    }
  }
  return { verdict, ...score === undefined ? {} : { score }, issues }
}

/**
 * Resolve a credential reference through DSH credentials, then the environment.
 * @param ctx - plugin context.
 * @param ref - credential reference.
 * @returns the secret literal.
 */
async function resolveApiKey(ctx: Context, ref: string): Promise<string> {
  const creds = (ctx as unknown as { get(name: string): unknown }).get('credentials') as { resolve(name: unknown): Promise<{ value: string } | undefined> } | undefined
  let key: string | undefined
  if (creds !== undefined) {
    const { credentialRef } = await import('@deepseek-ai/dsh-credentials')
    key = (await creds.resolve(credentialRef(ref)))?.value
  }
  key ??= process.env[ref]
  if (key === undefined || key.length === 0) throw new Error('vision model credential ' + ref + ' is not configured (Settings or environment)')
  return key
}

interface CustomResponse { choices?: { message?: { content?: unknown } }[] }

/**
 * Extract text from an OpenAI-compatible response.
 * @param content - string or content-part array.
 * @returns concatenated text.
 */
function responseText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => part !== null && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '').join('')
  return ''
}

/**
 * Call one custom OpenAI-compatible vision model.
 * @param custom - model definition.
 * @param apiKey - resolved key.
 * @param prompt - review prompt.
 * @param image - PNG bytes.
 * @param signal - cancellation.
 * @param fetchImpl - injectable fetch for tests.
 * @returns raw model text.
 */
export async function callCustomReview(
  custom: CustomModel,
  apiKey: string,
  prompt: string,
  image: Uint8Array,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = custom.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body = {
    model: custom.model,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + Buffer.from(image).toString('base64') } },
      ] },
    ],
  }
  const timeout = AbortSignal.timeout(180_000)
  const combined = AbortSignal.any([signal, timeout])
  const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey }, body: JSON.stringify(body), signal: combined })
  if (!response.ok) throw new Error('vision model returned HTTP ' + response.status + ': ' + (await response.text()).slice(0, 400))
  const json = await response.json() as CustomResponse
  const text = responseText(json.choices?.[0]?.message?.content).trim()
  if (text === '') throw new Error('vision model returned no text')
  return text
}

interface LlmChunk { type: string; text?: string; reason?: { kind?: string; failure?: unknown } }
interface LlmLike { stream(options: Record<string, unknown>): AsyncIterable<LlmChunk> }

/**
 * Call a Host-routed vision model with one image attachment.
 * @param ctx - plugin context.
 * @param target - resolved route.
 * @param prompt - review prompt.
 * @param image - PNG bytes.
 * @param signal - cancellation.
 * @returns raw model text.
 */
export async function callRouteReview(ctx: Context, target: VisionTarget, prompt: string, image: Uint8Array, signal: AbortSignal): Promise<string> {
  const llm = (ctx as unknown as { get(name: string): unknown }).get('llm') as LlmLike | undefined
  if (llm === undefined) throw new Error('the Host has no llm service for route/session vision review')
  const attachments = (ctx as unknown as { get(name: string): unknown }).get('attachments') as { saveImage(input: { data: Uint8Array; mediaType: 'image/png'; name?: string }): Promise<unknown> } | undefined
  if (attachments === undefined) throw new Error('the Host has no attachments service for route/session vision review')
  const attachment = await attachments.saveImage({ data: image, mediaType: 'image/png', name: 'pptx-review.png' })
  const chunks = llm.stream({
    provider: target.provider,
    model: target.model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', attachment }] }],
    maxTokens: 1200,
    signal,
  })
  let text = ''
  for await (const chunk of chunks) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk.type === 'finish' && chunk.reason?.kind === 'error') throw new Error('vision model call failed: ' + JSON.stringify(chunk.reason.failure ?? {}).slice(0, 300))
  }
  if (text.trim() === '') throw new Error('vision model returned no text')
  return text
}

/**
 * Review rendered pages one by one and summarize the findings.
 * @param ctx - plugin context.
 * @param target - resolved vision target.
 * @param pages - rendered page images.
 * @param signal - cancellation.
 * @param onPage - progress callback.
 * @returns per-page reviews and totals.
 */
export async function reviewPages(
  ctx: Context,
  target: VisionTarget,
  pages: readonly { page: number; path: string }[],
  signal: AbortSignal,
  onPage?: (review: PageReview) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewResult> {
  let customKey: string | undefined
  if (target.mode === 'custom') {
    if (target.custom === undefined) throw new Error('custom vision target has no model definition')
    customKey = await resolveApiKey(ctx, target.custom.apiKeyRef)
  }
  const reviews: PageReview[] = []
  for (const image of pages) {
    signal.throwIfAborted()
    const prompt = pagePrompt(image.page, pages.length)
    const bytes = readFileSync(image.path)
    const raw = target.mode === 'custom'
      ? await callCustomReview(target.custom!, customKey!, prompt, bytes, signal, fetchImpl)
      : await callRouteReview(ctx, target, prompt, bytes, signal)
    const parsed = parseReviewResponse(raw)
    const review: PageReview = { page: image.page, verdict: parsed.verdict, ...parsed.score === undefined ? {} : { score: parsed.score }, issues: parsed.issues, ...parsed.raw === undefined ? {} : { raw: parsed.raw } }
    reviews.push(review)
    onPage?.(review)
  }
  const errors = reviews.reduce((n, review) => n + review.issues.filter(issue => issue.severity === 'error').length, 0)
  const warnings = reviews.reduce((n, review) => n + review.issues.filter(issue => issue.severity === 'warning').length, 0)
  const passed = reviews.filter(review => review.verdict === 'pass').length
  return { model: target.label, target: target.mode, pages: reviews, summary: { errors, warnings, passed } }
}
