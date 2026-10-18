/** Run pptx_check on an existing deck.json with the current bundle and print findings. */
import { resolve, dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mockHost } from '../tests/host-harness.ts'
const deckPath = resolve(process.argv[2]!)
const plugin = await import(pathToFileURL(resolve('lib/index.js')).href)
const host = mockHost(dirname(deckPath))
await plugin.apply(host.ctx, plugin.Config({}))
const r = await host.registered.find(t => t.name === 'pptx_check')!.execute({ deck: relative(dirname(deckPath), deckPath) }, host.exec) as { errors: number; warnings: number; findings: { severity: string; slide: string; element?: string; check: string; message: string }[] }
console.log('errors', r.errors, 'warnings', r.warnings)
for (const f of r.findings) console.log(' ', f.severity, f.slide, f.element ?? '', f.check, f.message.slice(0, 130))
