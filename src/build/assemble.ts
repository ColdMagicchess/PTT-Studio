/**
 * Deterministic deck.json -> .pptx assembly with pptxgenjs.
 *
 * Coordinates are slide percentages; the slide is 13.333 x 7.5 in (16:9).
 * Every text element is fitted before writing: the size starts at the role
 * default for the deck's density and shrinks to the role minimum; anything
 * still too long is reported as overflow rather than silently clipped.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import PptxGenJSModule from 'pptxgenjs'
import type { Box, BulletsElement, ColorRef, Deck, DeckElement, PanelElement, Run, ShapeElement, Slide, TextElement, TextRole } from '../deck/types.ts'
import { decorPlacement } from './decor.ts'
import { imageSize } from './image-size.ts'
import { fitText, type FitParagraph, type TextMeasurer } from './metrics.ts'
import { ROLE_MIN, ROLE_SIZE, lineSpacing } from './typography.ts'
import { cornerOrnament, iconDataUri } from './icons.ts'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'

// pptxgenjs ships CJS typed as `export default class`; under NodeNext the default
// import is the module namespace, so the class is reached through `.default`.
type PptxClass = (typeof PptxGenJSModule)['default']
/** pptxgenjs presentation instance. */
type PptxGenJS = InstanceType<PptxClass>
/** pptxgenjs slide handle. */
type Slide_ = ReturnType<PptxGenJS['addSlide']>

/** Page number plaque position (percent), inside the footer band. */
export const PAGE_NUMBER_BOX: Box = { x: 90.5, y: 92, w: 3.5, h: 4.4 }
const NO_PAGE_NUMBER = new Set(['cover', 'section', 'closing'])

/** Slide size in inches. */
export const SLIDE_W = 13.333
export const SLIDE_H = 7.5
const PT_PER_IN = 72
/** Text box inner padding in points (pptxgenjs default inset). */
const INSET_PT = 3.6

/** A text element that was shrunk or did not fit. */
export interface FitReport {
  slide: string
  element: string
  role: TextRole
  requestedPt: number
  chosenPt: number
  overflow: boolean
}

/** Assembly result. */
export interface BuildResult {
  bytes: Uint8Array
  slideCount: number
  fits: FitReport[]
  missingAssets: string[]
  unknownIcons: string[]
}

/** Assembly inputs besides the deck. */
export interface BuildOptions {
  /** Directory that relative asset files and image paths resolve against (the deck directory). */
  baseDir: string
  measurer: TextMeasurer
  /** Feather mask applied to illustrations placed on image backgrounds; returns replacement bytes. */
  feather?: (bytes: Uint8Array) => Uint8Array
  /** Whether an image's border already matches a backing color (hex without #); such images are not feathered. */
  bordersMatch?: (bytes: Uint8Array, hex: string) => boolean
  /** Re-encode raster images before embedding (downscale, JPEG when opaque). */
  optimize?: (bytes: Uint8Array, role: 'background' | 'image', boxMaxInches: number) => { mime: string; bytes: Uint8Array }
}

const pct = (v: number, total: number) => v / 100 * total

function boxIn(b: Box) {
  return { x: pct(b.x, SLIDE_W), y: pct(b.y, SLIDE_H), w: pct(b.w, SLIDE_W), h: pct(b.h, SLIDE_H) }
}

function hexOf(deck: Deck, ref: ColorRef | undefined, fallback: keyof Deck['theme']['colors']): string {
  const c = deck.theme.colors
  const v = ref === undefined ? c[fallback]
    : ref === 'highlight' ? (deck.theme.highlight ?? c.accent)
      : ref.startsWith('#') ? ref : c[ref as keyof typeof c]
  return v.replace('#', '').toUpperCase()
}

function fontFor(deck: Deck, role: TextRole): string {
  return role === 'display' || role === 'title' || role === 'number' || role === 'heading' ? deck.theme.fonts.heading : deck.theme.fonts.body
}

function runsOf(text: string | Run[]): Run[] {
  return typeof text === 'string' ? [{ text }] : text
}

function elementLabel(slide: Slide, el: DeckElement, index: number): string {
  return el.id ?? `${slide.id}#${index}:${el.type}`
}

/** Build a .pptx from a validated deck. */
export async function buildDeck(deck: Deck, options: BuildOptions): Promise<BuildResult> {
  const mod = PptxGenJSModule as unknown as { default?: new () => PptxGenJS } & (new () => PptxGenJS)
  const PptxCtor = mod.default ?? mod
  const pptx = new PptxCtor()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deck.title
  pptx.theme = { headFontFace: deck.theme.fonts.heading, bodyFontFace: deck.theme.fonts.body }
  const fits: FitReport[] = []
  const missing = new Set<string>()
  const unknownIcons = new Set<string>()
  const assets = new Map((deck.assets ?? []).map(a => [a.id, a]))
  const pieceFiles = new Map<string, string>()
  for (const kit of deck.decorations ?? []) for (const [id, file] of Object.entries(kit.files ?? {})) pieceFiles.set(`${kit.id}/${id}`, file)
  const density = deck.design.textDensity

  const assetData = (id: string, role: 'background' | 'image', boxIn: number, transform?: (b: Uint8Array) => Uint8Array): string | undefined => {
    const asset = assets.get(id)
    const file = asset?.file
    if (file === undefined) { missing.add(id); return undefined }
    return fileData(file, role, boxIn, transform)
  }
  const fileData = (file: string, role: 'background' | 'image', boxIn: number, transform?: (b: Uint8Array) => Uint8Array): string | undefined => {
    const path = isAbsolute(file) ? file : resolve(options.baseDir, file)
    if (!existsSync(path)) return undefined
    let bytes: Uint8Array = readFileSync(path)
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    if (options.optimize !== undefined && (isJpeg || isPng)) {
      // Downscale first so feathering and PNG encoding work on the embedded size.
      let o = options.optimize(bytes, role, boxIn)
      if (transform !== undefined) o = options.optimize(transform(o.bytes), role, boxIn)
      return `data:${o.mime};base64,${Buffer.from(o.bytes).toString('base64')}`
    }
    if (transform !== undefined) bytes = transform(bytes)
    const mime = isJpeg ? 'image/jpeg' : bytes[0] === 0x52 && bytes[8] === 0x57 ? 'image/webp' : 'image/png'
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
  }

  for (const slideDef of deck.slides) {
    const slide = pptx.addSlide()
    const bg = slideDef.background
    const hasImageBg = bg !== undefined && 'asset' in bg
    if (bg === undefined) slide.background = { color: hexOf(deck, 'background', 'background') }
    else if ('color' in bg) slide.background = { color: hexOf(deck, bg.color, 'background') }
    else if ('gradient' in bg) {
      slide.background = { color: hexOf(deck, bg.gradient[0], 'background') }
      slide.addImage({ data: gradientSvg(hexOf(deck, bg.gradient[0], 'background'), hexOf(deck, bg.gradient[1], 'background'), bg.angle ?? 135), x: 0, y: 0, w: SLIDE_W, h: SLIDE_H })
    } else {
      const data = assetData(bg.asset, 'background', SLIDE_W)
      if (data === undefined) { missing.add(bg.asset); slide.background = { color: hexOf(deck, 'background', 'background') } }
      else slide.addImage({ data, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, sizing: { type: 'cover', w: SLIDE_W, h: SLIDE_H } })
    }

    for (const [i, el] of slideDef.elements.entries()) {
      const label = elementLabel(slideDef, el, i)
      const pos = boxIn(el.box)
      switch (el.type) {
        case 'text': addText(slide, deck, el, pos, label, slideDef.id); break
        case 'bullets': addBullets(slide, deck, el, pos, label, slideDef.id); break
        case 'shape': addShape(pptx, slide, deck, el, pos); break
        case 'panel': addPanel(pptx, slide, deck, el, pos); break
        case 'image': {
          const asset = el.asset === undefined ? undefined : assets.get(el.asset)
          // Feather only when the illustration sits directly on the background image; an
          // illustration on an opaque card or panel already matches that solid color.
          const backing = [...slideDef.elements.slice(0, i)].reverse().find(o =>
            (o.type === 'panel' || (o.type === 'shape' && o.fill !== undefined && (o.opacity ?? 1) >= 0.9))
            && o.box.x <= el.box.x + 0.5 && o.box.y <= el.box.y + 0.5
            && o.box.x + o.box.w >= el.box.x + el.box.w - 0.5 && o.box.y + o.box.h >= el.box.y + el.box.h - 0.5)
          const backingHex = backing === undefined ? undefined
            : hexOf(deck, backing.type === 'panel' ? backing.fill ?? 'background' : (backing as ShapeElement).fill, 'surface')
          const matches = (bytes: Uint8Array) => backingHex !== undefined && options.bordersMatch?.(bytes, backingHex) === true
          const feather = (hasImageBg || backing !== undefined) && asset?.kind === 'illustration' && asset.cutout === undefined && options.feather !== undefined
            ? (bytes: Uint8Array) => matches(bytes) ? bytes : options.feather!(bytes)
            : undefined
          const boxMax = Math.max(pos.w, pos.h)
          const data = el.asset !== undefined ? assetData(el.asset, 'image', boxMax, feather) : el.path !== undefined ? fileData(el.path, 'image', boxMax, feather) : undefined
          if (data === undefined) { missing.add(el.asset ?? el.path ?? label); break }
          slide.addImage({ data, ...pos, sizing: { type: el.fit ?? 'contain', w: pos.w, h: pos.h } })
          break
        }
        case 'decor': {
          const file = pieceFiles.get(el.piece)
          const path = file === undefined ? undefined : isAbsolute(file) ? file : resolve(options.baseDir, file)
          if (path === undefined || !existsSync(path)) { missing.add(el.piece); break }
          const raw = readFileSync(path)
          const size = imageSize(raw)
          const fitted = boxIn(decorPlacement(el.box, size.width, size.height))
          const o = options.optimize?.(raw, 'image', Math.max(fitted.w, fitted.h))
          const data = `data:${o?.mime ?? 'image/png'};base64,${Buffer.from(o?.bytes ?? raw).toString('base64')}`
          slide.addImage({ data, ...fitted,
            ...el.flipH === true ? { flipH: true } : {}, ...el.flipV === true ? { flipV: true } : {},
            ...el.rotate === undefined ? {} : { rotate: el.rotate },
            ...el.opacity === undefined ? {} : { transparency: Math.round((1 - el.opacity) * 100) } })
          break
        }
        case 'icon': {
          const color = hexOf(deck, el.color, 'primary')
          if (el.badge !== undefined) slide.addShape(pptx.ShapeType.ellipse, { ...pos, fill: { color: hexOf(deck, el.badge, 'surface') }, line: { color: hexOf(deck, el.badge, 'surface'), width: 0 } })
          const data = iconDataUri(el.name, color)
          if (data === undefined) { unknownIcons.add(el.name); break }
          const s = Math.min(pos.w, pos.h) * (el.badge === undefined ? 1 : 0.56)
          slide.addImage({ data, x: pos.x + (pos.w - s) / 2, y: pos.y + (pos.h - s) / 2, w: s, h: s })
          break
        }
        case 'chart': addChart(pptx, slide, deck, el, pos); break
        case 'table': addTable(slide, deck, el, pos); break
      }
    }
    if (deck.pageNumbers !== false && !NO_PAGE_NUMBER.has(slideDef.layout)) {
      const n = deck.slides.indexOf(slideDef) + 1
      const pos = boxIn(PAGE_NUMBER_BOX)
      slide.addShape(pptx.ShapeType.roundRect, { ...pos, fill: { color: hexOf(deck, 'surface', 'surface'), transparency: 15 }, line: { color: hexOf(deck, 'accent', 'accent'), width: 0.5 }, rectRadius: 0.08 })
      slide.addText(String(n), { ...pos, fontFace: deck.theme.fonts.body, fontSize: 11, color: hexOf(deck, 'text', 'text'), align: 'center', valign: 'middle', margin: 0 })
    }
    if (slideDef.notes !== undefined) slide.addNotes(slideDef.notes)
  }

  const raw = await pptx.write({ outputType: 'uint8array', compression: true }) as Uint8Array
  const colored = await colorBullets(raw, hexOf(deck, 'secondary', 'secondary'))
  const out = await dedupeMedia(colored)
  return { bytes: out, slideCount: deck.slides.length, fits, missingAssets: [...missing], unknownIcons: [...unknownIcons] }

  function fit(paragraphs: FitParagraph[], role: TextRole, size: number | undefined, autoFit: boolean, pos: { w: number; h: number }, slide: string, label: string) {
    const requested = size ?? ROLE_SIZE[role][density]
    const min = Math.min(ROLE_MIN[role], requested)
    const ls = lineSpacing(role, density)
    const wPt = pos.w * PT_PER_IN - 2 * INSET_PT
    const hPt = pos.h * PT_PER_IN - 2 * INSET_PT
    const single = role === 'display' || role === 'title' || role === 'number' || role === 'heading' || role === 'subtitle'
    const r = fitText(paragraphs, wPt, hPt, requested, autoFit ? min : requested, ls, role === 'body' ? 0.5 : 0, options.measurer, single)
    if (r.sizePt !== requested || r.overflow) fits.push({ slide, element: label, role, requestedPt: requested, chosenPt: r.sizePt, overflow: r.overflow })
    return { size: r.sizePt, ls }
  }

  function addText(s: Slide_, d: Deck, el: TextElement, pos: ReturnType<typeof boxIn>, label: string, slideId: string) {
    const runs = runsOf(el.text)
    const bold = el.bold ?? (el.role === 'display' || el.role === 'title' || el.role === 'number')
    const paragraphs = el.vertical === true
      ? [{ text: runs.map(r => r.text).join(''), bold, indentPt: 0 }]
      : runs.map(r => r.text).join('').split('\n').map(t => ({ text: t, bold, indentPt: 0 }))
    const box = el.vertical === true ? { w: pos.h, h: pos.w } : pos
    const { size, ls } = fit(paragraphs, el.role, el.size, el.autoFit ?? true, box, slideId, label)
    const color = hexOf(d, el.color, el.role === 'caption' ? 'textMuted' : 'text')
    s.addText(runs.map(r => ({ text: r.text, options: { color: r.color === undefined ? color : hexOf(d, r.color, 'text'), bold: r.bold ?? bold, italic: r.italic ?? el.italic } })), {
      ...pos, fontFace: fontFor(d, el.role), fontSize: size, align: el.align ?? 'left', valign: el.valign ?? 'top',
      lineSpacingMultiple: ls, margin: INSET_PT, fit: 'none', wrap: true, lang: d.language,
      ...el.vertical === true ? { vert: 'eaVert' as const } : {},
    })
  }

  function addBullets(s: Slide_, d: Deck, el: BulletsElement, pos: ReturnType<typeof boxIn>, label: string, slideId: string) {
    const role = el.role ?? 'body'
    const items = el.items.map(it => typeof it === 'string' ? { text: it, level: 0 as const } : { level: 0 as const, ...it })
    const markerIndent = el.marker === 'none' ? 0 : 30
    const paragraphs = items.map(it => ({ text: it.text, bold: false, indentPt: markerIndent + (it.level ?? 0) * 18 }))
    const { size, ls } = fit(paragraphs, role, el.size, el.autoFit ?? true, pos, slideId, label)
    const color = hexOf(d, el.color, 'text')
    const accent = hexOf(d, 'secondary', 'secondary')
    s.addText(items.map((it, idx) => ({
      text: it.text,
      options: {
        color, breakLine: idx < items.length - 1, indentLevel: it.level ?? 0,
        bullet: el.marker === 'none' ? false : el.marker === 'number' ? { type: 'number' as const, indent: Math.round(size * 1.3) } : { characterCode: '25CF', indent: Math.round(size * 1.1) },
        paraSpaceAfter: role === 'body' ? size * 0.5 : 0,
      },
    })), { ...pos, fontFace: fontFor(d, role), fontSize: size, valign: 'top', lineSpacingMultiple: ls, margin: INSET_PT, fit: 'none', wrap: true, lang: d.language })
  }
}

function shapeType(pptx: PptxGenJS, shape: ShapeElement['shape']) {
  const T = pptx.ShapeType
  switch (shape) {
    case 'rect': return T.rect
    case 'roundRect': return T.roundRect
    case 'ellipse': return T.ellipse
    case 'line': return T.line
    case 'arrow': return T.rightArrow
    case 'triangle': return T.triangle
    case 'chevron': return T.chevron
    case 'diamond': return T.diamond
  }
}

function addShape(pptx: PptxGenJS, s: Slide_, d: Deck, el: ShapeElement, pos: ReturnType<typeof boxIn>) {
  const lineColor = el.line?.color === undefined ? undefined : hexOf(d, el.line.color, 'primary')
  const line = el.line === undefined ? undefined : { color: lineColor ?? hexOf(d, 'primary', 'primary'), width: el.line.width ?? 1, dashType: el.line.dash === 'dash' ? 'dash' as const : el.line.dash === 'dot' ? 'sysDot' as const : 'solid' as const }
  const radius = Math.min(0.5, (d.theme.radius ?? 8) / 72 / Math.max(0.01, Math.min(pos.w, pos.h)))
  s.addShape(shapeType(pptx, el.shape), {
    ...pos,
    ...el.shape === 'line' ? {} : { fill: el.fill === undefined ? { type: 'none' as const } : { color: hexOf(d, el.fill, 'surface'), transparency: Math.round((1 - (el.opacity ?? 1)) * 100) } },
    line: line ?? (el.shape === 'line' ? { color: hexOf(d, 'primary', 'primary'), width: 1 } : { type: 'none' as const }),
    ...el.shape === 'roundRect' ? { rectRadius: radius } : {},
    ...el.rotate === undefined ? {} : { rotate: el.rotate },
    ...el.shadow === true ? { shadow: { type: 'outer' as const, blur: 8, offset: 3, angle: 90, color: '000000', opacity: 0.25 } } : {},
  })
  if (el.line?.double === true && el.shape !== 'line') {
    const inset = 4 / 72
    s.addShape(shapeType(pptx, el.shape), { x: pos.x + inset, y: pos.y + inset, w: pos.w - 2 * inset, h: pos.h - 2 * inset, fill: { type: 'none' }, line: { color: lineColor ?? hexOf(d, 'primary', 'primary'), width: Math.max(0.5, (el.line.width ?? 1) / 2) }, ...el.shape === 'roundRect' ? { rectRadius: radius } : {} })
  }
}

function addPanel(pptx: PptxGenJS, s: Slide_, d: Deck, el: PanelElement, pos: ReturnType<typeof boxIn>) {
  const accent = hexOf(d, el.accent, 'accent')
  const defaultFill: ColorRef = el.panel === 'banner' ? 'primary' : el.panel === 'plaque' ? 'accent' : 'background'
  const fill = { color: hexOf(d, el.fill ?? defaultFill, 'background'), transparency: Math.round((1 - (el.opacity ?? (el.panel === 'plaque' ? 1 : 0.88))) * 100) }
  const T = pptx.ShapeType
  if (el.panel === 'medallion') {
    s.addShape(T.ellipse, { ...pos, fill, line: { color: accent, width: 1.5 } })
    const i = 6 / 72
    s.addShape(T.ellipse, { x: pos.x + i, y: pos.y + i, w: pos.w - 2 * i, h: pos.h - 2 * i, fill: { type: 'none' }, line: { color: accent, width: 0.5 } })
    return
  }
  if (el.panel === 'plaque') {
    s.addShape(T.roundRect, { ...pos, fill, line: { color: accent, width: 0.75 }, rectRadius: 0.08 })
    return
  }
  const radius = el.panel === 'banner' ? 0 : Math.min(0.3, 10 / 72 / Math.max(0.01, Math.min(pos.w, pos.h)))
  s.addShape(el.panel === 'banner' ? T.rect : T.roundRect, { ...pos, fill, line: { color: accent, width: 1 }, ...radius > 0 ? { rectRadius: radius } : {} })
  const i = 5 / 72
  s.addShape(el.panel === 'banner' ? T.rect : T.roundRect, { x: pos.x + i, y: pos.y + i, w: pos.w - 2 * i, h: pos.h - 2 * i, fill: { type: 'none' }, line: { color: accent, width: 0.5 }, ...radius > 0 ? { rectRadius: radius } : {} })
  if (el.corners !== false) {
    const c = Math.min(0.42, Math.min(pos.w, pos.h) * 0.18)
    const data = cornerOrnament(accent)
    const at: [number, number, number][] = [[pos.x - c * 0.25, pos.y - c * 0.25, 0], [pos.x + pos.w - c * 0.75, pos.y - c * 0.25, 90], [pos.x + pos.w - c * 0.75, pos.y + pos.h - c * 0.75, 180], [pos.x - c * 0.25, pos.y + pos.h - c * 0.75, 270]]
    for (const [x, y, rotate] of at) s.addImage({ data, x, y, w: c, h: c, rotate })
  }
}

function addChart(pptx: PptxGenJS, s: Slide_, d: Deck, el: Extract<DeckElement, { type: 'chart' }>, pos: ReturnType<typeof boxIn>) {
  const T = pptx.ChartType
  const kind = el.chart === 'bar' || el.chart === 'barH' ? T.bar : el.chart === 'line' ? T.line : el.chart === 'pie' ? T.pie : el.chart === 'doughnut' ? T.doughnut : T.area
  const palette = [d.theme.colors.primary, d.theme.colors.secondary, d.theme.colors.accent, d.theme.colors.textMuted].map(c => c.replace('#', ''))
  const text = hexOf(d, 'text', 'text')
  const muted = hexOf(d, 'textMuted', 'textMuted')
  const pieLike = el.chart === 'pie' || el.chart === 'doughnut'
  s.addChart(kind, el.series.map(sr => ({ name: sr.name, labels: el.categories, values: sr.values })), {
    ...pos,
    barDir: el.chart === 'barH' ? 'bar' : 'col',
    chartColors: pieLike ? el.categories.map((_, i) => palette[i % palette.length]!) : palette,
    showLegend: el.legend ?? (el.series.length > 1 || pieLike), legendPos: 'b', legendColor: text, legendFontFace: d.theme.fonts.body, legendFontSize: 12,
    showValue: el.dataLabels ?? false, dataLabelColor: pieLike ? 'FFFFFF' : text, dataLabelFontSize: 12, dataLabelFontFace: d.theme.fonts.body,
    catAxisLabelColor: muted, valAxisLabelColor: muted, catAxisLabelFontFace: d.theme.fonts.body, valAxisLabelFontFace: d.theme.fonts.body,
    catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
    valGridLine: { color: muted, style: 'dash', size: 0.5 }, catGridLine: { style: 'none' },
    catAxisLineShow: false, valAxisLineShow: false,
    holeSize: 55,
  })
}

/** Blend two hex colors; t=0 returns a, t=1 returns b. */
function mixHex(a: string, b: string, t: number): string {
  const ca = [0, 2, 4].map(i => parseInt(a.slice(i, i + 2), 16))
  const cb = [0, 2, 4].map(i => parseInt(b.slice(i, i + 2), 16))
  return ca.map((v, i) => Math.round(v + (cb[i]! - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Tables are deliberately light: one header band, hairline rules in a tint of
 * the background, zebra rows, and numeric cells bolded so the data reads first.
 * Heavy black grids look like a word-processor table dropped into a designed
 * slide, so the default avoids them.
 */
function addTable(s: Slide_, d: Deck, el: Extract<DeckElement, { type: 'table' }>, pos: ReturnType<typeof boxIn>) {
  const headerFill = hexOf(d, 'primary', 'primary')
  const headerText = hexOf(d, 'background', 'background')
  const background = hexOf(d, 'background', 'background')
  const surface = hexOf(d, 'surface', 'surface')
  const text = hexOf(d, 'text', 'text')
  const rule = mixHex(hexOf(d, 'textMuted', 'textMuted'), background, 0.72)
  const zebra = mixHex(surface, background, 0.5)
  const border = { type: 'solid' as const, pt: 0.5, color: rule }
  const numeric = (cell: string) => /\d/.test(cell)
  const rows = [
    el.header.map(h => ({ text: h, options: { bold: true, color: headerText, fill: { color: headerFill }, border, align: 'center' as const } })),
    ...el.rows.map((row, r) => row.map((c, c2) => ({ text: c, options: {
      color: text, fill: { color: r % 2 === 1 ? zebra : background }, border,
      bold: numeric(c), align: c2 === 0 ? 'center' as const : 'left' as const,
    } }))),
  ]
  const fontSize = Math.max(10, Math.min(16, pos.h * 72 / (rows.length * 2.1)))
  s.addTable(rows, { ...pos, fontFace: d.theme.fonts.body, fontSize, valign: 'middle', colW: (el.colWidths ?? el.header.map(() => 100 / el.header.length)).map(p => p / 100 * pos.w), autoPage: false })
}

function gradientSvg(from: string, to: string, angle: number): string {
  const rad = (angle - 90) * Math.PI / 180
  const x = Math.cos(rad) / 2, y = Math.sin(rad) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}"><stop offset="0" stop-color="#${from}"/><stop offset="1" stop-color="#${to}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

/**
 * pptxgenjs embeds a fresh copy of an image for every slide that uses it, which
 * is costly for one shared background. Collapse byte-identical media files onto
 * the first copy and rewrite the slide relationships.
 * @param bytes - pptx from pptxgenjs.
 */
async function dedupeMedia(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const media = Object.keys(zip.files).filter(n => n.startsWith('ppt/media/') && zip.files[n]!.dir !== true)
  const first = new Map<string, string>()
  const duplicates = new Map<string, string>()
  for (const name of media) {
    const data = await zip.file(name)!.async('uint8array')
    const hash = createHash('sha256').update(data).digest('hex')
    const seen = first.get(hash)
    if (seen === undefined) first.set(hash, name)
    else duplicates.set(name, seen)
  }
  if (duplicates.size === 0) return bytes
  for (const rel of Object.keys(zip.files).filter(n => n.startsWith('ppt/slides/_rels/') && n.endsWith('.rels'))) {
    let xml = await zip.file(rel)!.async('string')
    let changed = false
    for (const [dup, keep] of duplicates) {
      const from = 'media/' + dup.slice('ppt/media/'.length)
      const to = 'media/' + keep.slice('ppt/media/'.length)
      if (xml.includes(from)) { xml = xml.split(from).join(to); changed = true }
    }
    if (changed) zip.file(rel, xml)
  }
  for (const dup of duplicates.keys()) zip.remove(dup)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/**
 * pptxgenjs cannot color bullet glyphs; insert <a:buClr> before each
 * <a:buSzPct> so bullets use the theme secondary color.
 * @param bytes - pptx from pptxgenjs.
 * @param hex - bullet color without #.
 */
async function colorBullets(bytes: Uint8Array, hex: string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  for (const name of slides) {
    const xml = await zip.file(name)!.async('string')
    if (!xml.includes('<a:buChar')) continue
    zip.file(name, xml.replaceAll('<a:buSzPct val="100000"/><a:buChar', `<a:buClr><a:srgbClr val="${hex}"/></a:buClr><a:buSzPct val="100000"/><a:buChar`))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
