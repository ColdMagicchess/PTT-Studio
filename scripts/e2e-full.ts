/** Full pipeline against the mock host: style board → assets (with reference) → build. */
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mockHost } from '../tests/host-harness.ts'

const deckSrc = resolve(process.argv[2]!)
const work = resolve(process.argv[3]!)
const subject = process.argv[4]!
const fresh = process.argv.includes('--fresh')
if (fresh) rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
if (!existsSync(join(work, 'deck.json'))) cpSync(deckSrc, join(work, 'deck.json'))
const plugin = await import(pathToFileURL(resolve('lib/index.js')).href)
const host = mockHost(work, 'workspace-write', { AGNES_API_KEY: process.env.AGNES_API_KEY ?? '', MODELSCOPE_API_KEY: process.env.MODELSCOPE_API_KEY ?? '' })
await plugin.apply(host.ctx, plugin.Config({ imageConcurrency: 3 }))
const tool = (n: string) => host.registered.find(t => t.name === n)!
const t0 = Date.now()
const existing = existsSync(join(work, 'style')) ? readdirSync(join(work, 'style')).find(f => f.startsWith('board-1.')) : undefined
let board = existing === undefined ? '' : 'style/' + existing
if (board === '') {
  const b = await tool('pptx_style_board').execute({ deck: 'deck.json', subject, variants: [''] }, host.exec) as { boards: { id: string; status: string; file?: string; error?: string }[] }
  console.log('board:', JSON.stringify(b.boards))
  board = b.boards[0]!.file ?? board
}
const g = await tool('pptx_generate_assets').execute({ deck: 'deck.json', style_reference: board }, host.exec) as { outcomes: { id: string; status: string; file?: string; error?: string; seconds?: number }[] }
for (const o of g.outcomes) console.log('asset', o.id, o.status, o.file ?? '', o.seconds ?? '', o.error?.slice(0, 160) ?? '')
const built = await tool('pptx_build').execute({ deck: 'deck.json' }, host.exec) as { path: string; errors: number; warnings: number; findings: { severity: string; slide: string; check: string; message: string }[] }
console.log('build', built.path, 'errors', built.errors, 'warnings', built.warnings)
for (const f of built.findings.slice(0, 15)) console.log('  ', f.severity, f.slide, f.check, f.message.slice(0, 120))
console.log('seconds', Math.round((Date.now() - t0) / 1000))
