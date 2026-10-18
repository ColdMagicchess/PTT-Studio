/** Slide previews for built decks: per-slide thumbnails plus one contact sheet. */
import { readFileSync } from 'node:fs'
import type { Config } from '../config.ts'
import { atomicWrite } from '../fsutil.ts'
import { contactSheet, encodeJpeg, sheetColumns } from '../images/contact-sheet.ts'
import { decode } from '../images/raster.ts'
import { renderPptx } from './render.ts'

/** A built deck's preview files. */
export interface DeckPreview {
  /** Contact sheet with every slide, next to the .pptx as <name>.preview.jpg. */
  sheet: string
  /** One rendered thumbnail per slide. */
  slides: { page: number; path: string }[]
}

/**
 * Path of a deck's contact sheet.
 * @param pptx - absolute .pptx path.
 * @returns the sheet path beside it.
 */
export function previewSheetPath(pptx: string): string {
  return pptx.replace(/\.pptx$/i, '') + '.preview.jpg'
}

/**
 * Render every slide at thumbnail resolution and compose a contact sheet.
 * Callers check write access to the review directory and the sheet path first.
 * @param config - plugin config (renderer location and timeout).
 * @param pptx - absolute .pptx path.
 * @param signal - cancellation.
 * @returns the sheet and per-slide thumbnail paths.
 */
export async function buildPreview(config: Config, pptx: string, signal: AbortSignal): Promise<DeckPreview> {
  const rendered = await renderPptx(config, pptx, [], 48, signal)
  if (rendered.images.length === 0) throw new Error('the renderer produced no slide images')
  const images = rendered.images.map(image => decode(readFileSync(image.path)))
  const sheet = contactSheet(images, { cols: sheetColumns(images.length), cellWidth: 420, gap: 16, background: [236, 238, 242] })
  const sheetPath = previewSheetPath(pptx)
  atomicWrite(sheetPath, encodeJpeg(sheet, 82))
  return { sheet: sheetPath, slides: rendered.images.map(image => ({ page: image.page, path: image.path })) }
}
