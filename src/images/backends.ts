/**
 * Image generation backends. Each adapter turns one request into image bytes.
 *
 * - `openai-compatible`: synchronous `POST {baseUrl}/images/generations`.
 *   Agnes AI (https://api.agnes-ai.cn/v1) uses this with tier sizes plus ratio,
 *   Base64 output and `extra_body.image` for reference images.
 * - `modelscope`: ModelScope API-Inference async task API
 *   (https://api-inference.modelscope.cn/v1), polling `/tasks/{id}`; reference
 *   images switch the model to its Edit variant.
 *
 * Requests use node:https with IPv4 forced: on the reference Windows host the
 * IPv6 route to both providers times out while IPv4 works.
 */
import { request } from 'node:https'
import type { Asset } from '../deck/types.ts'
import { NEGATIVE } from './prompt.ts'

/** One generation request. */
export interface ImageRequest {
  prompt: string
  aspect: Asset['aspect']
  seed: number
  /** Optional style reference images as data URIs. */
  references?: string[]
  /** Negative prompt for backends that accept one; defaults to the fixed list. */
  negative?: string
  signal: AbortSignal
}

/** Backend configuration, validated by the plugin Config schema. */
export interface ImageBackendConfig {
  kind: 'openai-compatible' | 'modelscope'
  baseUrl: string
  model: string
  /** Model used when reference images are supplied; defaults to `model`. */
  editModel?: string
  apiKey: string
  /** Size tier for openai-compatible backends (1K/2K/3K/4K). */
  sizeTier: string
  timeoutMs: number
  pollIntervalMs: number
}

/** Classified backend failure. */
export class ImageBackendError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message)
    this.name = 'ImageBackendError'
  }
}

interface HttpResult { status: number; body: Buffer }

function http(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body: string | undefined, timeoutMs: number, signal: AbortSignal): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = body === undefined ? undefined : Buffer.from(body, 'utf8')
    const req = request({
      protocol: u.protocol, host: u.hostname, port: u.port === '' ? undefined : Number(u.port), path: u.pathname + u.search,
      method, family: 4, timeout: timeoutMs, signal,
      headers: { ...headers, ...payload === undefined ? {} : { 'Content-Length': String(payload.length) } },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new ImageBackendError(`request to ${u.host} timed out after ${timeoutMs} ms`, 0, true)))
    req.on('error', err => reject(err instanceof ImageBackendError ? err : new ImageBackendError(`request to ${u.host} failed: ${err.message}`, 0, !signal.aborted)))
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

function fail(status: number, body: Buffer, what: string): never {
  const text = body.toString('utf8').slice(0, 400)
  throw new ImageBackendError(`${what} returned HTTP ${status}: ${text}`, status, status === 429 || status >= 500)
}

const RATIO_SIZE: Record<Asset['aspect'], string> = { '16:9': '1664x928', '4:3': '1472x1104', '3:4': '1104x1472', '1:1': '1328x1328' }

/**
 * Generate one image.
 * @param config - backend selection and credentials.
 * @param req - prompt, aspect, seed, references and cancellation.
 * @returns raw image bytes (PNG or JPEG).
 */
export async function generateImage(config: ImageBackendConfig, req: ImageRequest): Promise<Uint8Array> {
  const base = config.baseUrl.replace(/\/+$/, '')
  const auth = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }
  const refs = req.references ?? []
  if (config.kind === 'openai-compatible') {
    const body: Record<string, unknown> = { model: refs.length > 0 ? config.editModel ?? config.model : config.model, prompt: req.prompt, size: config.sizeTier, ratio: req.aspect }
    if (refs.length > 0) body.extra_body = { image: refs, response_format: 'b64_json' }
    else body.return_base64 = true
    const res = await http('POST', `${base}/images/generations`, auth, JSON.stringify(body), config.timeoutMs, req.signal)
    if (res.status !== 200) fail(res.status, res.body, 'image generation')
    const parsed = JSON.parse(res.body.toString('utf8')) as { data?: { b64_json?: string | null; url?: string | null }[] }
    const item = parsed.data?.[0]
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
    if (item?.url) return download(item.url, config.timeoutMs, req.signal)
    throw new ImageBackendError('image generation returned no image', 200, true)
  }
  const body: Record<string, unknown> = { model: refs.length > 0 ? config.editModel ?? config.model : config.model, prompt: req.prompt, negative_prompt: req.negative ?? NEGATIVE, seed: req.seed }
  if (refs.length > 0) body.image_url = refs
  else body.size = RATIO_SIZE[req.aspect]
  const submit = await http('POST', `${base}/images/generations`, { ...auth, 'X-ModelScope-Async-Mode': 'true' }, JSON.stringify(body), 60_000, req.signal)
  if (submit.status !== 200) fail(submit.status, submit.body, 'image task submission')
  const taskId = (JSON.parse(submit.body.toString('utf8')) as { task_id?: string }).task_id
  if (taskId === undefined) throw new ImageBackendError('image task submission returned no task id', 200, true)
  const deadline = Date.now() + config.timeoutMs
  while (Date.now() < deadline) {
    await sleep(config.pollIntervalMs, req.signal)
    const poll = await http('GET', `${base}/tasks/${taskId}`, { ...auth, 'X-ModelScope-Task-Type': 'image_generation' }, undefined, 60_000, req.signal)
    if (poll.status !== 200) { if (poll.status === 429 || poll.status >= 500) continue; fail(poll.status, poll.body, 'image task poll') }
    const state = JSON.parse(poll.body.toString('utf8')) as { task_status?: string; output_images?: string[] }
    if (state.task_status === 'SUCCEED' && state.output_images?.[0] !== undefined) return download(state.output_images[0], 120_000, req.signal)
    if (state.task_status === 'FAILED') throw new ImageBackendError(`image task ${taskId} failed`, 200, true)
  }
  throw new ImageBackendError(`image task ${taskId} did not finish within ${config.timeoutMs} ms`, 0, true)
}

async function download(url: string, timeoutMs: number, signal: AbortSignal): Promise<Uint8Array> {
  const res = await http('GET', url, {}, undefined, timeoutMs, signal)
  if (res.status !== 200) fail(res.status, res.body, 'image download')
  return res.body
}

/**
 * Abortable sleep.
 * @param ms - delay.
 * @param signal - cancels the wait.
 */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(t); reject(signal.reason) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Generate with retries on retryable failures (HTTP 429, 5xx, network).
 * @param config - backend.
 * @param req - request.
 * @param attempts - total attempts, at least 1.
 * @param backoffMs - first backoff; doubles each retry.
 */
export async function generateWithRetry(config: ImageBackendConfig, req: ImageRequest, attempts: number, backoffMs: number): Promise<Uint8Array> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await generateImage(config, req)
    } catch (error) {
      last = error
      if (req.signal.aborted || !(error instanceof ImageBackendError) || !error.retryable || i === attempts - 1) throw error
      await sleep(backoffMs * 2 ** i, req.signal)
    }
  }
  throw last
}
