/** Plugin configuration (cordis.patch.yml `config`), validated at activation. */
import z from '@deepseek-ai/schemastery'

/** One image backend entry. */
export interface ImageBackendEntry {
  /** Display and selection name. */
  name: string
  kind: 'openai-compatible' | 'modelscope'
  baseUrl: string
  model: string
  editModel?: string
  /** Name of the credential holding the API key (DSH credentials store or environment). */
  apiKeyRef: string
  sizeTier: string
  timeoutMs: number
  pollIntervalMs: number
}

/** How a text or vision model is selected. */
export type ModelChoiceMode = 'session' | 'route' | 'custom'

/** Plugin configuration. */
export interface Config {
  /** Text-model choice: `session` follows the conversation, `route` names a Host provider/model, `custom` names an entry in customModelsJson. */
  textModelMode: ModelChoiceMode
  /** Route as "provider/model", or the name of a custom model; empty for session mode. */
  textModelName: string
  /** Vision-model choice, same modes as the text model. */
  visionModelMode: ModelChoiceMode
  /** Route as "provider/model", or a custom model name. */
  visionModelName: string
  /** JSON array of {name, baseUrl, model, apiKeyRef, api}; OpenAI-compatible chat models. */
  customModelsJson: string
  /** Credential reference used by the settings page when storing a custom model key. */
  customModelApiKeyRef: string
  /** Ordered image backends; `imageBackend` selects one by name. */
  imageBackends: ImageBackendEntry[]
  /** Name of the active image backend; empty disables image generation. */
  imageBackend: string
  /** Parallel image requests per tool call. */
  imageConcurrency: number
  /** Attempts per image on retryable failures. */
  imageAttempts: number
  /** First retry backoff in milliseconds; doubles per retry. */
  imageBackoffMs: number
  /** Maximum images one pptx_generate_assets call may request. */
  maxImagesPerCall: number
  /** Font files used to measure text; .ttf/.otf (collections fall back to the estimate). */
  measureFont?: string
  measureFontBold?: string
  /** Fraction of the shorter side feathered on illustrations over image backgrounds. */
  featherFraction: number
  /** Maximum deck.json size accepted, in bytes. */
  maxDeckBytes: number
  /** Longest side of embedded background images, in pixels. */
  backgroundMaxPx: number
  /** Longest side of embedded illustrations and other images, in pixels. Lower keeps the file small; cutout PNGs dominate size. */
  imageMaxPx: number
  /** JPEG quality for opaque embedded images (1–100). */
  jpegQuality: number
  /** Embedded pixels per inch of the image's on-slide box (192 = sharp on 2x displays). */
  imagePpi: number
  /** Standalone Node executable for the renderer; found automatically in Desktop. */
  renderNode?: string
  /** LibreOffice Kit lib/cli.js; found automatically in Desktop. */
  renderCli?: string
  /** Render timeout in milliseconds. */
  renderTimeoutMs: number
}

const backend: z<ImageBackendEntry> = z.object({
  name: z.string().min(1).required(),
  kind: z.union(['openai-compatible', 'modelscope'] as const).required(),
  baseUrl: z.string().pattern(/^https:\/\/[^\s]+$/).required(),
  model: z.string().min(1).required(),
  editModel: z.string().min(1),
  apiKeyRef: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).required(),
  sizeTier: z.string().default('2K'),
  timeoutMs: z.natural().min(10_000).default(300_000),
  pollIntervalMs: z.natural().min(1000).default(5000),
})

/** Validated configuration schema. */
const configSchema = z.object({
  textModelMode: z.union(['session', 'route', 'custom'] as const).default('session').volatile(),
  textModelName: z.string().default('').volatile(),
  visionModelMode: z.union(['session', 'route', 'custom'] as const).default('session').volatile(),
  visionModelName: z.string().default('').volatile(),
  customModelsJson: z.string().default('[]').volatile(),
  customModelApiKeyRef: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).default('CUSTOM_API_KEY').volatile(),
  imageBackends: z.array(backend).default([
    { name: 'agnes', kind: 'openai-compatible', baseUrl: 'https://api.agnes-ai.cn/v1', model: 'agnes-image-2.5-flash', apiKeyRef: 'AGNES_API_KEY', sizeTier: '2K', timeoutMs: 300_000, pollIntervalMs: 5000 },
    { name: 'modelscope', kind: 'modelscope', baseUrl: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen-Image', editModel: 'Qwen/Qwen-Image-Edit-2509', apiKeyRef: 'MODELSCOPE_API_KEY', sizeTier: '2K', timeoutMs: 600_000, pollIntervalMs: 5000 },
  ]),
  imageBackend: z.string().default('agnes').volatile(),
  imageConcurrency: z.natural().min(1).max(8).default(3),
  imageAttempts: z.natural().min(1).max(6).default(3),
  imageBackoffMs: z.natural().min(500).default(15_000),
  maxImagesPerCall: z.natural().min(1).max(64).default(24),
  measureFont: z.string(),
  measureFontBold: z.string(),
  featherFraction: z.number().min(0).max(0.4).default(0.18),
  maxDeckBytes: z.natural().min(1024).default(4 * 1024 * 1024),
  backgroundMaxPx: z.natural().min(640).max(8192).default(1920),
  imageMaxPx: z.natural().min(256).max(8192).default(800),
  jpegQuality: z.natural().min(40).max(100).default(85),
  imagePpi: z.natural().min(72).max(400).default(192),
  renderNode: z.string(),
  renderCli: z.string(),
  renderTimeoutMs: z.natural().min(10_000).default(240_000),
})

/** Runtime schema for {@link Config}; the volatile marker is a runtime-only flag. */
export const Config = configSchema as unknown as z<Config>

/**
 * Read a config field that may be marked volatile. A live field arrives as a
 * wrapper with `get()` rather than the plain value; everything else passes
 * through unchanged.
 * @param value - plain config value or live wrapper.
 * @returns the current plain value.
 */
export function readLive<T>(value: T | { get(): T }): T {
  if (value !== null && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function') {
    return (value as { get(): T }).get()
  }
  return value as T
}
