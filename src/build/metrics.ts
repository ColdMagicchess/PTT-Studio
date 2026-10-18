/**
 * Text measurement used to fit text into a box before PowerPoint ever sees it.
 *
 * Widths come from the real font file when one is configured and readable
 * (opentype.js). Otherwise a conservative width table is used: full-width
 * CJK glyphs measure 1.0 em, Latin letters and digits about 0.56 em, spaces
 * 0.28 em. The estimate errs wide so fitted text does not overflow in Office.
 */
import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'

/** Measures one line of text in points. */
export interface TextMeasurer {
  /** @returns width in points of `text` set at `sizePt`. */
  width(text: string, sizePt: number, bold: boolean): number
}

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u3000-\u303F]/u

function estimateEm(ch: string): number {
  if (WIDE.test(ch)) return 1.0
  if (ch === ' ') return 0.28
  if (/[ilI.,:;'!|]/.test(ch)) return 0.3
  if (/[mwMW@%]/.test(ch)) return 0.85
  if (/[A-Z0-9]/.test(ch)) return 0.64
  return 0.56
}

/** Width-table measurer; bold adds 6%. */
export const estimateMeasurer: TextMeasurer = {
  width(text, sizePt, bold) {
    let em = 0
    for (const ch of text) em += estimateEm(ch)
    return em * sizePt * (bold ? 1.06 : 1)
  },
}

/**
 * Build a measurer from font files, falling back to the estimate per glyph
 * the font lacks.
 * @param regular - absolute path of a TrueType/OpenType file, or undefined.
 * @param bold - absolute path of the bold face, or undefined.
 * @returns a measurer; the estimate when no file loads.
 */
export function fontMeasurer(regular: string | undefined, bold: string | undefined): TextMeasurer {
  const load = (path: string | undefined) => {
    if (path === undefined) return undefined
    try {
      const buf = readFileSync(path)
      return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    } catch {
      // Unreadable or unsupported font (for example a .ttc collection): the
      // width table below still produces a conservative fit.
      return undefined
    }
  }
  const faces = { regular: load(regular), bold: load(bold) }
  if (faces.regular === undefined && faces.bold === undefined) return estimateMeasurer
  return {
    width(text, sizePt, isBold) {
      const font = (isBold ? faces.bold : faces.regular) ?? faces.regular ?? faces.bold
      if (font === undefined) return estimateMeasurer.width(text, sizePt, isBold)
      let total = 0
      for (const ch of text) {
        const glyph = font.charToGlyph(ch)
        total += glyph.index === 0 || glyph.advanceWidth === undefined
          ? estimateEm(ch) * sizePt
          : glyph.advanceWidth / font.unitsPerEm * sizePt
      }
      return total * (isBold && faces.bold === undefined ? 1.06 : 1)
    },
  }
}

/** One paragraph to fit: its text, indent level, and whether it is bold. */
export interface FitParagraph { text: string; bold: boolean; indentPt: number }

/** Result of fitting paragraphs into a box. */
export interface FitResult {
  /** Font size chosen, in points. */
  sizePt: number
  /** Wrapped line count at that size. */
  lines: number
  /** True when even `minPt` does not fit. */
  overflow: boolean
  /** Text height at the chosen size, in points. */
  heightPt: number
}

/**
 * Count wrapped lines of one paragraph. CJK breaks between any two glyphs;
 * Latin breaks at spaces, and a single over-long word breaks by glyph.
 */
export function wrapCount(text: string, maxWidthPt: number, sizePt: number, bold: boolean, m: TextMeasurer): number {
  if (text.length === 0) return 1
  let lines = 0
  for (const hard of text.split('\n')) {
    const tokens = hard.match(/[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]|[^\s\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]+|\s+/gu) ?? ['']
    let line = 0
    let count = 1
    for (const token of tokens) {
      const w = m.width(token, sizePt, bold)
      if (line + w <= maxWidthPt || line === 0 && /^\s+$/.test(token)) { line += w; continue }
      if (/^\s+$/.test(token)) { count++; line = 0; continue }
      if (w > maxWidthPt) {
        for (const ch of token) {
          const cw = m.width(ch, sizePt, bold)
          if (line + cw > maxWidthPt && line > 0) { count++; line = 0 }
          line += cw
        }
        continue
      }
      count++
      line = w
    }
    lines += count
  }
  return lines
}

/**
 * Pick the largest size from `startPt` down to `minPt` (1pt steps) at which
 * every paragraph fits the box.
 * @param paragraphs - text to fit.
 * @param boxWPt - inner box width in points (insets already removed).
 * @param boxHPt - inner box height in points.
 * @param startPt - preferred size.
 * @param minPt - smallest acceptable size.
 * @param lineSpacing - line height multiple.
 * @param paraSpaceEm - space after each paragraph, in ems of the font size.
 * @param m - text measurer.
 */
export function fitText(paragraphs: readonly FitParagraph[], boxWPt: number, boxHPt: number, startPt: number, minPt: number, lineSpacing: number, paraSpaceEm: number, m: TextMeasurer, preferSingleLine = false): FitResult {
  const measure = (size: number) => {
    let lines = 0
    let orphan = false
    for (const p of paragraphs) {
      const width = Math.max(1, boxWPt - p.indentPt)
      const n = wrapCount(p.text, width, size, p.bold, m)
      lines += n
      if (n > 1 && orphanTail(p.text, width, size, p.bold, m)) orphan = true
    }
    const gaps = Math.max(0, paragraphs.length - 1) * paraSpaceEm * size
    return { lines, height: lines * size * lineSpacing + gaps, orphan }
  }
  // Headings first try to stay on one line per paragraph, shrinking to the minimum.
  if (preferSingleLine) {
    for (let size = Math.floor(startPt); size >= minPt; size--) {
      const r = measure(size)
      if (r.lines === paragraphs.length && r.height <= boxHPt) return { sizePt: size, lines: r.lines, overflow: false, heightPt: r.height }
    }
  }
  // Otherwise wrap, but never leave a single glyph alone on the last line.
  for (let size = Math.floor(startPt); size >= minPt; size--) {
    const r = measure(size)
    if (r.height <= boxHPt && !r.orphan) return { sizePt: size, lines: r.lines, overflow: false, heightPt: r.height }
  }
  for (let size = Math.floor(startPt); size >= minPt; size--) {
    const r = measure(size)
    if (r.height <= boxHPt) return { sizePt: size, lines: r.lines, overflow: false, heightPt: r.height }
  }
  const { lines, height } = measure(minPt)
  return { sizePt: minPt, lines, overflow: true, heightPt: height }
}

/**
 * Whether the last wrapped line of a paragraph holds a single CJK glyph or a
 * single short Latin word (an orphan).
 */
function orphanTail(text: string, maxWidthPt: number, sizePt: number, bold: boolean, m: TextMeasurer): boolean {
  const last = text.split('\n').at(-1) ?? ''
  const chars = [...last]
  for (let k = 1; k <= Math.min(3, chars.length - 1); k++) {
    const head = chars.slice(0, chars.length - k).join('')
    if (wrapCount(head, maxWidthPt, sizePt, bold, m) === wrapCount(last, maxWidthPt, sizePt, bold, m) - 1) {
      const tail = chars.slice(chars.length - k).join('').trim()
      return tail.length > 0 && ([...tail].length === 1 || /^[A-Za-z0-9]{1,3}[.,!?。，！？]?$/.test(tail))
    }
  }
  return false
}
