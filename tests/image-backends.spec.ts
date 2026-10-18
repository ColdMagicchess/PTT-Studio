import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { allImageBackends, Config, parseCustomImageBackends } from '../src/config.ts'
import { generateImage, OPENAI_SIZES } from '../src/images/backends.ts'

const servers: { close(): void }[] = []
afterEach(() => { for (const s of servers.splice(0)) s.close() })

/** A local stand-in for the OpenAI Images API that records each request. */
async function fakeImagesApi(reply: (body: Record<string, unknown>) => unknown) {
  const seen: { path: string; auth: string | undefined; body: Record<string, unknown> }[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const body = JSON.parse(raw) as Record<string, unknown>
      seen.push({ path: req.url ?? '', auth: req.headers.authorization, body })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(reply(body)))
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', () => done()))
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { baseUrl: 'http://127.0.0.1:' + address.port + '/v1', seen }
}

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const request = { prompt: 'a calm ink landscape', aspect: '16:9' as const, seed: 7, signal: new AbortController().signal }
const base = { model: 'gpt-image-1', apiKey: 'sk-test', sizeTier: '2K', timeoutMs: 10_000, pollIntervalMs: 1000 }

describe('openai image backend', () => {
  it('sends a standard Images API request and decodes base64', async () => {
    const api = await fakeImagesApi(() => ({ data: [{ b64_json: PNG.toString('base64') }] }))
    const bytes = await generateImage({ ...base, kind: 'openai', baseUrl: api.baseUrl }, request)
    expect(Buffer.from(bytes).equals(PNG)).toBe(true)
    expect(api.seen[0]).toMatchObject({ path: '/v1/images/generations', auth: 'Bearer sk-test' })
    expect(api.seen[0]!.body).toEqual({ model: 'gpt-image-1', prompt: 'a calm ink landscape', n: 1, size: OPENAI_SIZES['16:9'] })
  })

  it('applies per-aspect sizes, response_format and extra body fields', async () => {
    const api = await fakeImagesApi(() => ({ data: [{ b64_json: PNG.toString('base64') }] }))
    await generateImage({ ...base, kind: 'openai', baseUrl: api.baseUrl, model: 'dall-e-3', sizes: { '16:9': '1792x1024' }, responseFormat: 'b64_json', extraBody: { quality: 'hd', style: 'natural' } }, request)
    expect(api.seen[0]!.body).toEqual({ model: 'dall-e-3', prompt: 'a calm ink landscape', n: 1, size: '1792x1024', response_format: 'b64_json', quality: 'hd', style: 'natural' })
    expect(api.seen[0]!.body).not.toHaveProperty('ratio')
  })

  it('downloads URL results', async () => {
    const files = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG) })
    await new Promise<void>(done => files.listen(0, '127.0.0.1', () => done()))
    servers.push(files)
    const port = (files.address() as { port: number }).port
    const api = await fakeImagesApi(() => ({ data: [{ url: 'http://127.0.0.1:' + port + '/img.png' }] }))
    const bytes = await generateImage({ ...base, kind: 'openai', baseUrl: api.baseUrl, responseFormat: 'url' }, request)
    expect(Buffer.from(bytes).equals(PNG)).toBe(true)
  })
})

describe('agnes (openai-compatible) backend', () => {
  it('keeps the Agnes body: tier size, ratio and return_base64', async () => {
    const api = await fakeImagesApi(() => ({ data: [{ b64_json: PNG.toString('base64') }] }))
    await generateImage({ ...base, kind: 'openai-compatible', baseUrl: api.baseUrl, model: 'agnes-image-2.5-flash' }, request)
    expect(api.seen[0]!.body).toEqual({ model: 'agnes-image-2.5-flash', prompt: 'a calm ink landscape', size: '2K', ratio: '16:9', return_base64: true })
  })
})

describe('custom image backends from settings', () => {
  it('validates entries and fills defaults', () => {
    const entries = parseCustomImageBackends(JSON.stringify([{ name: 'my-image', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', apiKeyRef: 'MY_IMAGE_KEY' }]))
    expect(entries[0]).toMatchObject({ name: 'my-image', kind: 'openai', sizeTier: '2K', timeoutMs: 300_000 })
    expect(() => parseCustomImageBackends('[{"name":"x","kind":"openai","baseUrl":"http://evil.example","model":"m","apiKeyRef":"K"}]')).toThrow(/customImageBackendsJson\[0\]/)
    expect(() => parseCustomImageBackends('{')).toThrow(/not valid JSON/)
  })

  it('merges with the built-in list and lets a settings entry replace a built-in name', () => {
    const config = Config({ customImageBackendsJson: JSON.stringify([
      { name: 'agnes', kind: 'openai', baseUrl: 'https://proxy.example/v1', model: 'agnes-image-2.5-flash', apiKeyRef: 'AGNES_API_KEY' },
      { name: 'my-image', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', apiKeyRef: 'MY_IMAGE_KEY' },
    ]) } as never)
    const names = allImageBackends(config).map(b => b.name + ':' + b.kind)
    expect(names).toEqual(['modelscope:modelscope', 'agnes:openai', 'my-image:openai'])
  })
})
