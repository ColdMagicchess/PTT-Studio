/** Rebuild an existing deck.json with the current bundle (no image generation). */
import { resolve, dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mockHost } from '../tests/host-harness.ts'
const deckPath = resolve(process.argv[2]!)
const plugin = await import(pathToFileURL(resolve('lib/index.js')).href)
const host = mockHost(dirname(deckPath))
await plugin.apply(host.ctx, plugin.Config({}))
const r = await host.registered.find(t => t.name === 'pptx_build')!.execute({ deck: relative(dirname(deckPath), deckPath) }, host.exec) as { path: string; bytes: number; errors: number; warnings: number }
console.log(JSON.stringify({ path: r.path, MB: (r.bytes / 1e6).toFixed(2), errors: r.errors, warnings: r.warnings }))
