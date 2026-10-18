/**
 * Pure view models for the pptx_* tool cards. No React here, so the rules are
 * unit-tested directly; cards.ts only renders what these functions return.
 */

/** Tool names that get a dedicated card. */
export const CARD_TOOLS = ['pptx_build', 'pptx_check', 'pptx_review', 'pptx_generate_assets', 'pptx_style_board', 'pptx_render'] as const
export type CardTool = typeof CARD_TOOLS[number]

/** One finding line shown on a card. */
export interface CardFinding { slide: string; check: string; severity: 'error' | 'warning'; message: string }

/** Build card model. */
export interface BuildCard {
  kind: 'pptx-build'
  path: string
  fileName: string
  slides: number
  size: string
  errors: number
  warnings: number
  sheet: string | null
  thumbnails: string[]
  findings: CardFinding[]
}

/** Review card model. */
export interface ReviewCard {
  kind: 'pptx-review'
  model: string
  summary: { errors: number; warnings: number; passed: number }
  pages: { page: number; verdict: 'pass' | 'warn' | 'fail'; score: number | null; issues: { severity: string; area: string; issue: string; fix: string }[] }[]
  files: string[]
}

/** Image-gallery card model shared by assets, style boards and renders. */
export interface GalleryCard {
  kind: 'pptx-assets' | 'pptx-style-board' | 'pptx-render'
  images: { label: string; path: string }[]
  failed: { id: string; error: string | null }[]
  job: { id: string; label: string } | null
  note: string | null
}

/** Check card model. */
export interface CheckCard { kind: 'pptx-check'; errors: number; warnings: number; findings: CardFinding[] }

export type CardModel = BuildCard | ReviewCard | GalleryCard | CheckCard

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function str(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function num(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }

/**
 * Human-readable byte size.
 * @param bytes - byte count.
 * @returns e.g. "650 KB" or "2.9 MB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

/**
 * Last path segment, for either separator.
 * @param path - file path.
 * @returns the file name.
 */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

/**
 * MIME type for an image path, or undefined when it is not a previewable image.
 * @param path - file path.
 * @returns image MIME type.
 */
export function imageMime(path: string): string | undefined {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return undefined
}

function findings(value: unknown): CardFinding[] {
  return list(value).flatMap((entry) => {
    const item = record(entry)
    const message = str(item?.message)
    if (item === undefined || message === undefined) return []
    return [{ slide: str(item.slide) ?? '*', check: str(item.check) ?? '', severity: item.severity === 'error' ? 'error' as const : 'warning' as const, message }]
  })
}

/**
 * Turn a tool result's presentation meta into a card model.
 * @param tool - wire tool name.
 * @param meta - the recorded presentationMeta value.
 * @returns the card model, or undefined when the meta is absent or from an older plugin version.
 */
export function cardModel(tool: string, meta: unknown): CardModel | undefined {
  const m = record(meta)
  if (m === undefined) return undefined
  switch (tool) {
    case 'pptx_build': {
      const path = str(m.path)
      if (path === undefined) return undefined
      return {
        kind: 'pptx-build', path, fileName: fileName(path), slides: num(m.slides), size: formatBytes(num(m.bytes)),
        errors: num(m.errors), warnings: num(m.warnings), sheet: str(m.sheet) ?? null,
        thumbnails: list(m.thumbnails).flatMap(t => typeof t === 'string' ? [t] : []), findings: findings(m.findings),
      }
    }
    case 'pptx_check':
      return { kind: 'pptx-check', errors: num(m.errors), warnings: num(m.warnings), findings: findings(m.findings) }
    case 'pptx_review': {
      const summary = record(m.summary)
      return {
        kind: 'pptx-review', model: str(m.model) ?? '',
        summary: { errors: num(summary?.errors), warnings: num(summary?.warnings), passed: num(summary?.passed) },
        pages: list(m.pages).flatMap((entry) => {
          const page = record(entry)
          if (page === undefined) return []
          const verdict = page.verdict === 'pass' || page.verdict === 'fail' ? page.verdict : 'warn' as const
          return [{
            page: num(page.page), verdict, score: typeof page.score === 'number' ? page.score : null,
            issues: list(page.issues).flatMap((raw) => {
              const issue = record(raw)
              const text = str(issue?.issue)
              return issue === undefined || text === undefined ? [] : [{ severity: str(issue.severity) ?? 'warning', area: str(issue.area) ?? '', issue: text, fix: str(issue.fix) ?? '' }]
            }),
          }]
        }),
        files: list(m.files).flatMap(f => typeof f === 'string' ? [f] : []),
      }
    }
    case 'pptx_generate_assets': {
      const job = record(m.job)
      const images = list(m.files).flatMap((entry) => {
        const item = record(entry)
        const path = str(item?.file)
        return path === undefined || imageMime(path) === undefined ? [] : [{ label: str(item?.id) ?? fileName(path), path }]
      })
      for (const raw of list(m.kits)) {
        const kit = record(raw)
        const sheet = str(kit?.sheet)
        if (sheet !== undefined && imageMime(sheet) !== undefined) images.push({ label: (str(kit?.id) ?? 'kit') + ' · ' + num(kit?.pieces), path: sheet })
      }
      return {
        kind: 'pptx-assets', images,
        failed: list(m.failed).flatMap((entry) => {
          const item = record(entry)
          return item === undefined ? [] : [{ id: str(item.id) ?? '?', error: str(item.error) ?? null }]
        }),
        job: job !== undefined && str(job.id) !== undefined ? { id: str(job.id)!, label: str(job.label) ?? '' } : null,
        note: str(m.backend) ?? null,
      }
    }
    case 'pptx_style_board':
      return {
        kind: 'pptx-style-board',
        images: list(m.files).flatMap((f, index) => typeof f === 'string' && imageMime(f) !== undefined ? [{ label: 'board-' + (index + 1), path: f }] : []),
        failed: [], job: null, note: null,
      }
    case 'pptx_render': {
      const pages = list(m.pages)
      return {
        kind: 'pptx-render',
        images: list(m.files).flatMap((f, index) => typeof f === 'string' ? [{ label: 'P' + String(pages[index] ?? index + 1), path: f }] : []),
        failed: [], job: null,
        note: list(m.missingFonts).length > 0 ? list(m.missingFonts).join(', ') : null,
      }
    }
    default:
      return undefined
  }
}

/**
 * Tag tone for an error/warning pair.
 * @param errors - error count.
 * @param warnings - warning count.
 * @returns Tag tone name.
 */
export function healthTone(errors: number, warnings: number): 'danger' | 'warning' | 'success' {
  return errors > 0 ? 'danger' : warnings > 0 ? 'warning' : 'success'
}
