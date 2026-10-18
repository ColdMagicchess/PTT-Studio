import { describe, expect, it } from 'vitest'
import { estimateMeasurer, fitText, wrapCount } from '../src/build/metrics.ts'

const m = estimateMeasurer

describe('wrapCount', () => {
  it('breaks CJK text between glyphs', () => {
    // 10 glyphs at 20pt = 200pt; a 100pt line holds 5.
    expect(wrapCount('一二三四五六七八九十', 100, 20, false, m)).toBe(2)
  })
  it('breaks Latin text at spaces and keeps short text on one line', () => {
    expect(wrapCount('hello world', 1000, 20, false, m)).toBe(1)
    expect(wrapCount('hello world again', 80, 20, false, m)).toBeGreaterThan(1)
  })
  it('counts hard line breaks', () => {
    expect(wrapCount('a\nb\nc', 1000, 12, false, m)).toBe(3)
  })
})

describe('fitText', () => {
  it('keeps the requested size when the text fits', () => {
    const r = fitText([{ text: '短标题', bold: true, indentPt: 0 }], 400, 60, 36, 24, 1.1, 0, m)
    expect(r).toMatchObject({ sizePt: 36, overflow: false })
  })
  it('shrinks toward the minimum, then reports overflow', () => {
    const long = '这是一段非常非常长的正文内容'.repeat(10)
    const r = fitText([{ text: long, bold: false, indentPt: 0 }], 200, 40, 24, 12, 1.3, 0, m)
    expect(r.overflow).toBe(true)
    expect(r.sizePt).toBe(12)
  })
  it('prefers one line for headings', () => {
    const r = fitText([{ text: '推理速度提升到上一代的三倍', bold: true, indentPt: 0 }], 360, 200, 36, 24, 1.1, 0, m, true)
    expect(r.lines).toBe(1)
  })
  it('avoids a single orphan glyph on the last line', () => {
    // At 54pt the 4-glyph title would wrap as 3 + 1; the fitter shrinks instead.
    const r = fitText([{ text: '月圆千年', bold: true, indentPt: 0 }], 170, 400, 54, 36, 1.1, 0, m)
    expect(r.lines === 1 || r.lines === 2 && r.sizePt * 2 * 1.06 <= 170).toBe(true)
  })
})
