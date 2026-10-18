/** Exercise pptx_render through the bundle against the mock host. */
import { resolve, dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mockHost } from '../tests/host-harness.ts'
const pptx = resolve(process.argv[2]!)
const plugin = await import(pathToFileURL(resolve('lib/index.js')).href)
const host = mockHost(dirname(pptx))
// Outside Desktop, point at the installed kit explicitly (inside Desktop it is found automatically).
await plugin.apply(host.ctx, plugin.Config(process.env.PPTX_RENDER_CLI === undefined ? {} : { renderCli: process.env.PPTX_RENDER_CLI }))
const r = await host.registered.find(t => t.name === 'pptx_render')!.execute({ pptx: relative(dirname(pptx), pptx), pages: [1, 3] }, host.exec) as { images: { page: number; path: string }[]; outputDir: string; missingFonts: string[] }
console.log(JSON.stringify(r))
