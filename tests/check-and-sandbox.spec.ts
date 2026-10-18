import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDeck, contrast, textUnits } from '../src/check/geometry.ts'
import { validateDeck } from '../src/deck/validate.ts'
import { callWorkspace, SandboxDeniedError } from '../src/tools/context.ts'
import { mockHost } from './host-harness.ts'

const aurora = () => validateDeck(JSON.parse(readFileSync('assets/pptx-studio/examples/aurora-launch.deck.json', 'utf8')))

describe('checkDeck', () => {
  it('reports overlapping content and low contrast', () => {
    const d = aurora()
    const s = d.slides[2]!
    s.background = { color: 'background' }
    s.elements.push({ type: 'text', role: 'body', text: '重叠', box: { ...s.elements.find(e => e.type === 'bullets')!.box } })
    s.elements.push({ type: 'text', role: 'body', text: '看不清', color: '#0C1121', box: { x: 10, y: 80, w: 20, h: 6 } })
    const f = checkDeck(d, [], [], [])
    expect(f.some(x => x.check === 'overlap' && x.slide === s.id)).toBe(true)
    expect(f.some(x => x.check === 'contrast' && x.severity === 'error')).toBe(true)
  })
  it('enforces the light density limits', () => {
    const d = aurora()
    d.slides[4]!.elements.push({ type: 'bullets', box: { x: 6, y: 80, w: 40, h: 10 }, items: ['一', '二', '三', '四'] })
    expect(checkDeck(d, [], [], []).some(x => x.check === 'density' && x.slide === d.slides[4]!.id)).toBe(true)
  })
  it('counts text units like text-density.md', () => {
    expect(textUnits('中文 two words')).toBe(2 + 4)
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 0)
  })
})

describe('callWorkspace', () => {
  const ws = mkdtempSync(join(tmpdir(), 'pptx-ws-'))
  it('refuses writes under read-only', () => {
    const h = mockHost(ws, 'read-only')
    expect(() => callWorkspace(h.ctx as never, h.exec).assertWritable(join(ws, 'a.pptx'))).toThrow(SandboxDeniedError)
  })
  it('confines workspace-write to the workspace root', () => {
    const h = mockHost(ws, 'workspace-write')
    const c = callWorkspace(h.ctx as never, h.exec)
    expect(() => c.assertWritable(join(ws, 'sub', 'a.pptx'))).not.toThrow()
    expect(() => c.assertWritable(join(ws, '..', 'escape.pptx'))).toThrow(SandboxDeniedError)
  })
  it('allows any path under danger-full-access', () => {
    const h = mockHost(ws, 'danger-full-access')
    expect(() => callWorkspace(h.ctx as never, h.exec).assertWritable('C:/anywhere/a.pptx')).not.toThrow()
  })
})
