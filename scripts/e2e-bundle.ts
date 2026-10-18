/** Load lib/index.js against the mock host and run pptx_check + pptx_build on a deck. */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mockHost } from '../tests/host-harness.ts'

const plugin = await import(pathToFileURL(resolve('lib/index.js')).href)
const work = resolve('.samples/e2e')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
cpSync(resolve(process.argv[2] ?? 'assets/pptx-studio/examples/aurora-launch.deck.json'), join(work, 'deck.json'))
const host = mockHost(work)
await plugin.apply(host.ctx, plugin.Config({}))
console.log('tools:', host.registered.map(t => t.name).join(', '))
const provider = host.providers[0] as { list(): Promise<{ name: string; description: string }[]>; get(c: unknown, o: object): Promise<{ content: string }> }
const [cand] = await provider.list()
const skill = await provider.get(cand, {})
console.log('skill:', cand!.name, '| content chars:', skill.content.length)
const tool = (n: string) => host.registered.find(t => t.name === n)!
const check = await tool('pptx_check').execute({ deck: 'deck.json' }, host.exec) as { errors: number; warnings: number; findings: { check: string; severity: string; message: string; slide: string }[] }
console.log('check:', check.errors, 'errors', check.warnings, 'warnings')
for (const f of check.findings.slice(0, 12)) console.log('  ', f.severity, f.slide, f.check, f.message.slice(0, 110))
const built = await tool('pptx_build').execute({ deck: 'deck.json' }, host.exec) as { path: string; slides: number; bytes: number }
console.log('build:', built.path, built.slides, built.bytes)
const ro = mockHost(work, 'read-only')
await plugin.apply(ro.ctx, plugin.Config({}))
try { await ro.registered.find(t => t.name === 'pptx_build')!.execute({ deck: 'deck.json' }, ro.exec); console.log('read-only build: ALLOWED (unexpected)') } catch (e) { console.log('read-only build refused:', (e as Error).message.slice(0, 90)) }
try { await tool('pptx_build').execute({ deck: 'deck.json', output: 'E:/outside-workspace.pptx' }, host.exec); console.log('outside write: ALLOWED (unexpected)') } catch (e) { console.log('outside write refused:', (e as Error).message.slice(0, 90)) }
