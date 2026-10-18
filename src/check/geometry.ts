/**
 * Deterministic deck checks that need no renderer: text fit, overlaps,
 * safe area, minimum sizes, text density limits and color contrast against
 * the declared backing color. Mirrors references/quality-checklist.md
 * (items marked "自动") and references/layouts.md (safe area).
 */
import type { Box, Deck, DeckElement, Slide, TextDensity, TextRole } from '../deck/types.ts'
import type { FitReport } from '../build/assemble.ts'

/** Severity of a finding. */
export type Severity = 'error' | 'warning'

/** One check finding. */
export interface Finding {
  slide: string
  element?: string
  check: 'overflow' | 'shrunk' | 'overlap' | 'safe-area' | 'density' | 'contrast' | 'missing-asset' | 'unknown-icon' | 'panel' | 'decor' | 'fill'
  severity: Severity
  message: string
}

const SAFE = { x0: 6, y0: 8, x1: 94, y1: 98 }

/** Generated decoration pieces placed per content slide, by complexity (references/complexity.md). */
export const DECOR_PER_SLIDE: Record<Deck['design']['complexity'], { min: number; max: number }> = {
  minimal: { min: 0, max: 0 },
  simple: { min: 0, max: 2 },
  balanced: { min: 1, max: 4 },
  rich: { min: 3, max: 8 },
  ornate: { min: 6, max: 16 },
}

/** Minimum share of the safe area covered by content, by complexity (a full page, not an empty one). */
export const FILL_MIN: Record<Deck['design']['complexity'], number> = {
  minimal: 0.25,
  simple: 0.35,
  balanced: 0.45,
  rich: 0.55,
  ornate: 0.6,
}

/** Layouts where a large calm area is intentional. */
const FILL_SKIP = new Set(['cover', 'section', 'closing', 'quote', 'image-full'])

const DENSITY: Record<TextDensity, { titleChars: number; bullets: number; bulletChars: number; bodyChars: number }> = {
  light: { titleChars: 16, bullets: 3, bulletChars: 15, bodyChars: 50 },
  medium: { titleChars: 20, bullets: 5, bulletChars: 30, bodyChars: 150 },
  dense: { titleChars: 24, bullets: 8, bulletChars: 60, bodyChars: 300 },
}

/** Count text the way text-density.md does: CJK glyphs 1, Latin words 2. */
export function textUnits(text: string): number {
  const cjk = (text.match(/[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/gu) ?? []).length
  const words = (text.replace(/[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/gu, ' ').match(/[A-Za-z0-9]+/g) ?? []).length
  return cjk + words * 2
}

function plain(el: DeckElement): string {
  if (el.type === 'text') return typeof el.text === 'string' ? el.text : el.text.map(r => r.text).join('')
  if (el.type === 'bullets') return el.items.map(i => typeof i === 'string' ? i : i.text).join('\n')
  return ''
}

function label(slide: Slide, el: DeckElement, i: number): string {
  return el.id ?? `${slide.id}#${i}:${el.type}`
}

function intersect(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function contains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5
}

function isContent(el: DeckElement): boolean {
  if (el.type === 'shape' || el.type === 'panel' || el.type === 'decor') return false
  if (el.type === 'image') return el.decor !== true
  return true
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}

/**
 * WCAG contrast ratio of two hex colors.
 * @param a - hex color.
 * @param b - hex color.
 */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1! + 0.05) / (l2! + 0.05)
}

function resolveColor(deck: Deck, ref: string | undefined, fallback: keyof Deck['theme']['colors']): string {
  const c = deck.theme.colors
  if (ref === undefined) return c[fallback]
  if (ref === 'highlight') return deck.theme.highlight ?? c.accent
  if (ref.startsWith('#')) return ref
  return c[ref as keyof typeof c]
}

/**
 * Share of the safe area covered by content elements (sampled on a grid).
 * Decoration pieces and decorative images are excluded so corners cannot hide
 * an empty page.
 * @param elements - slide elements.
 */
export function contentCoverage(elements: readonly DeckElement[]): number {
  const cols = 120, rows = 80
  const boxes = elements.filter(el => el.type !== 'decor' && !(el.type === 'image' && el.decor === true)).map(el => el.box)
  let hits = 0
  for (let r = 0; r < rows; r++) {
    const y = SAFE.y0 + (r + 0.5) / rows * (SAFE.y1 - SAFE.y0)
    for (let c = 0; c < cols; c++) {
      const x = SAFE.x0 + (c + 0.5) / cols * (SAFE.x1 - SAFE.x0)
      for (const b of boxes) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hits++; break }
    }
  }
  return hits / (cols * rows)
}

/**
 * Run all deterministic checks.
 * @param deck - validated deck.
 * @param fits - fit reports from the last build.
 * @param missingAssets - asset ids the build could not load.
 * @param unknownIcons - icon names the build did not know.
 */
/** Measurement of a text box over a slide's background image. */
export interface BackgroundSample {
  /** Contrast of the text color against the busiest 10% of the area. */
  contrast: number
  /** Share (0–1) of the area whose pixels differ strongly from the area's median color: decorations crossing the text. */
  clutter: number
}

/** Measures a text box over a slide's background image; undefined when the image is unavailable. */
export type BackgroundSampler = (slide: Slide, box: Box, fgHex: string) => BackgroundSample | undefined

export function checkDeck(deck: Deck, fits: readonly FitReport[], missingAssets: readonly string[], unknownIcons: readonly string[], sampler?: BackgroundSampler): Finding[] {
  const out: Finding[] = []
  const limits = DENSITY[deck.design.textDensity]
  for (const f of fits) {
    out.push(f.overflow
      ? { slide: f.slide, element: f.element, check: 'overflow', severity: 'error', message: `${f.role} text does not fit even at the ${f.chosenPt}pt minimum: shorten it, split the slide, or enlarge the box` }
      : { slide: f.slide, element: f.element, check: 'shrunk', severity: 'warning', message: `${f.role} text shrunk from ${f.requestedPt}pt to ${f.chosenPt}pt to fit` })
  }
  for (const id of missingAssets) out.push({ slide: '*', check: 'missing-asset', severity: 'error', message: `image "${id}" has no file: generate it with pptx_generate_assets or set its file` })
  for (const name of unknownIcons) out.push({ slide: '*', check: 'unknown-icon', severity: 'error', message: `icon "${name}" is not in the built-in library` })

  for (const slide of deck.slides) {
    const els = slide.elements
    const imageBg = slide.background !== undefined && 'asset' in slide.background
    let bulletCount = 0
    let bodyUnits = 0
    let unbackedOnImage = 0
    let unpanelledOrnate = 0
    for (const [i, el] of els.entries()) {
      const name = label(slide, el, i)
      const b = el.box
      if (isContent(el) && (b.x < SAFE.x0 - 0.01 || b.y < SAFE.y0 - 0.01 || b.x + b.w > SAFE.x1 + 0.01 || b.y + b.h > SAFE.y1 + 0.01) && !(el.type === 'image' && b.w >= 99)) {
        out.push({ slide: slide.id, element: name, check: 'safe-area', severity: 'warning', message: `outside the safe area (x 6–94, y 8–98): ${JSON.stringify(b)}` })
      }
      if (el.type === 'text') {
        const units = textUnits(plain(el))
        if (el.role === 'title' && units > limits.titleChars) out.push({ slide: slide.id, element: name, check: 'density', severity: 'warning', message: `title has ${units} units; ${deck.design.textDensity} allows ${limits.titleChars}` })
        if (el.role === 'body') bodyUnits += units
      }
      if (el.type === 'bullets') {
        bulletCount += el.items.length
        for (const it of el.items) {
          const u = textUnits(typeof it === 'string' ? it : it.text)
          bodyUnits += u
          if (u > limits.bulletChars) out.push({ slide: slide.id, element: name, check: 'density', severity: 'warning', message: `bullet has ${u} units; ${deck.design.textDensity} allows ${limits.bulletChars}` })
        }
      }
      if (el.type === 'text' || el.type === 'bullets') {
        const role: TextRole = el.type === 'text' ? el.role : el.role ?? 'body'
        const fg = resolveColor(deck, el.color, role === 'caption' ? 'textMuted' : 'text')
        const backing = [...els.slice(0, i)].reverse().find(o => (o.type === 'panel' || (o.type === 'shape' && o.fill !== undefined && (o.opacity ?? 1) >= 0.6)) && contains(o.box, b))
        const bgRef = backing === undefined ? undefined : backing.type === 'panel' ? backing.fill ?? (backing.panel === 'banner' ? 'primary' : backing.panel === 'plaque' ? 'accent' : 'background') : (backing as Extract<DeckElement, { type: 'shape' }>).fill
        const bg = bgRef === undefined
          ? slide.background !== undefined && 'color' in slide.background ? resolveColor(deck, slide.background.color, 'background') : deck.theme.colors.background
          : resolveColor(deck, bgRef, 'background')
        const ratio = contrast(fg, bg)
        // Image backgrounds are measured by the sampler below; the theme color is only a proxy.
        const large = role === 'display' || role === 'title' || role === 'number'
        const need = large ? 3 : 4.5
        if (ratio < need && !(imageBg && backing === undefined)) out.push({ slide: slide.id, element: name, check: 'contrast', severity: 'error', message: `contrast ${ratio.toFixed(2)}:1 against ${bg}; needs ${need}:1` })
        if (imageBg && backing === undefined) {
          const measured = sampler?.(slide, b, fg.replace('#', ''))
          if (measured === undefined) { if (deck.design.complexity === 'ornate') unpanelledOrnate++; else unbackedOnImage++ }
          else {
            if (measured.contrast < need) out.push({ slide: slide.id, element: name, check: 'contrast', severity: deck.design.complexity === 'ornate' ? 'warning' : 'error', message: `${role} text over the background image reaches only ${measured.contrast.toFixed(2)}:1 on its busiest 10% (needs ${need}:1): add a panel or shape behind it, or move it to a calmer area` })
            else if (measured.clutter > (large ? 0.2 : 0.06)) out.push({ slide: slide.id, element: name, check: 'contrast', severity: 'warning', message: `background decorations cross ${Math.round(measured.clutter * 100)}% of this ${role} box: move the text inward, shrink the box, or add a panel` })
          }
        }
      }
    }
    if (unpanelledOrnate > 0) out.push({ slide: slide.id, check: 'panel', severity: 'warning', message: `${unpanelledOrnate} text element(s) have no panel; ornate slides need a panel under every text group` })
    if (unbackedOnImage > 0) out.push({ slide: slide.id, check: 'contrast', severity: 'warning', message: `${unbackedOnImage} text element(s) sit directly on the background image; confirm their area is calm in the visual check` })
    const decors = els.filter(e => e.type === 'decor')
    const band = DECOR_PER_SLIDE[deck.design.complexity]
    if (decors.length > band.max) out.push({ slide: slide.id, check: 'decor', severity: 'warning', message: `${decors.length} decoration pieces; ${deck.design.complexity} allows at most ${band.max} per slide` })
    else if (decors.length < band.min && slide.layout !== 'image-full') out.push({ slide: slide.id, check: 'decor', severity: 'warning', message: `${decors.length} decoration pieces; ${deck.design.complexity} expects at least ${band.min} per slide` })
    for (const d of decors) for (const [k, el] of els.entries()) {
      if (el.type !== 'text' && el.type !== 'bullets') continue
      if (els.indexOf(d) > k && intersect(d.box, el.box) / (el.box.w * el.box.h) > 0.04) {
        out.push({ slide: slide.id, element: label(slide, d, els.indexOf(d)), check: 'decor', severity: 'error', message: `decoration "${(d as Extract<DeckElement, { type: 'decor' }>).piece}" is drawn above text ${label(slide, el, k)} and covers part of it: move it, shrink it, or list it before the text` })
      }
    }
    const need = FILL_MIN[deck.design.complexity]
    if (!FILL_SKIP.has(slide.layout)) {
      const coverage = contentCoverage(els)
      if (coverage < need) out.push({ slide: slide.id, check: 'fill', severity: 'warning', message: `content covers only ${Math.round(coverage * 100)}% of the safe area; ${deck.design.complexity} aims for at least ${Math.round(need * 100)}% — fill the empty band with cards, figures, icons or denser text` })
    }
    if (bulletCount > limits.bullets) out.push({ slide: slide.id, check: 'density', severity: 'warning', message: `${bulletCount} bullets; ${deck.design.textDensity} allows ${limits.bullets}` })
    if (bodyUnits > limits.bodyChars) out.push({ slide: slide.id, check: 'density', severity: 'warning', message: `${bodyUnits} body units; ${deck.design.textDensity} allows ${limits.bodyChars}` })
    const content = els.map((el, i) => ({ el, i })).filter(({ el }) => isContent(el))
    for (let a = 0; a < content.length; a++) for (let c = a + 1; c < content.length; c++) {
      const A = content[a]!, C = content[c]!
      const area = intersect(A.el.box, C.el.box)
      const smaller = Math.min(A.el.box.w * A.el.box.h, C.el.box.w * C.el.box.h)
      if (area > 0 && area / smaller > 0.05) out.push({ slide: slide.id, element: `${label(slide, A.el, A.i)} × ${label(slide, C.el, C.i)}`, check: 'overlap', severity: 'error', message: `content elements overlap by ${Math.round(area / smaller * 100)}% of the smaller box` })
    }
  }
  return out
}
