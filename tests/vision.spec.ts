import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Config } from '../src/config.ts'
import {
  callCustomReview, callRouteReview, parseCustomModels, parseReviewResponse, resolveVisionTarget, reviewPages,
} from '../src/vision.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.TEST_VISION_KEY
})

const custom = { name: 'vision-test', baseUrl: 'https://example.test/v1', model: 'vision-model', apiKeyRef: 'TEST_VISION_KEY', api: 'openai-chat' }

describe('vision review', () => {
  it('parses and validates custom models', () => {
    expect(parseCustomModels('[]')).toEqual([])
    expect(parseCustomModels(JSON.stringify([{ name: 'v', baseUrl: 'https://x/v1', model: 'm', apiKeyRef: 'KEY' }]))).toEqual([
      { name: 'v', baseUrl: 'https://x/v1', model: 'm', apiKeyRef: 'KEY', api: 'openai-chat' },
    ])
    expect(() => parseCustomModels('{')).toThrow(/not valid JSON/)
    expect(() => parseCustomModels(JSON.stringify([{ name: 'v' }]))).toThrow(/baseUrl/)
  })

  it('resolves route, custom and session targets', () => {
    const route = resolveVisionTarget(Config({ visionModelMode: 'route', visionModelName: 'deepseek-account/deepseek-flash' } as never))
    expect(route).toMatchObject({ mode: 'route', provider: 'deepseek-account', model: 'deepseek-flash' })
    const customTarget = resolveVisionTarget(Config({ visionModelMode: 'custom', visionModelName: 'vision-test', customModelsJson: JSON.stringify([custom]) } as never))
    expect(customTarget).toMatchObject({ mode: 'custom', model: 'vision-model' })
    const session = resolveVisionTarget(Config({} as never), { provider: 'deepseek-account', model: 'deepseek-flash' })
    expect(session).toMatchObject({ mode: 'session', provider: 'deepseek-account' })
    expect(() => resolveVisionTarget(Config({ visionModelMode: 'route', visionModelName: 'bad' } as never))).toThrow(/provider\/model/)
  })

  it('parses fenced JSON and falls back on invalid output', () => {
    expect(parseReviewResponse('```json\n{"verdict":"warn","score":82,"issues":[{"severity":"warning","area":"typography","issue":"too small","fix":"raise to 16pt"}]}\n```')).toMatchObject({
      verdict: 'warn', score: 82, issues: [{ severity: 'warning', area: 'typography', issue: 'too small', fix: 'raise to 16pt' }],
    })
    expect(parseReviewResponse('not json')).toMatchObject({ verdict: 'warn', issues: [], raw: 'not json' })
  })

  it('calls an OpenAI-compatible model with a data URL', async () => {
    let body: Record<string, unknown> | undefined
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"pass","score":95,"issues":[]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const text = await callCustomReview(custom, 'secret', 'review page 1', new Uint8Array([1, 2, 3]), new AbortController().signal, fakeFetch)
    expect(text).toContain('pass')
    const messages = body?.messages as { content: unknown }[]
    const user = messages[1]?.content as { type: string; image_url?: { url: string } }[]
    expect(user[1]?.image_url?.url).toBe('data:image/png;base64,AQID')
  })

  it('reviews pages and counts findings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pptx-vision-'))
    dirs.push(dir)
    const imagePath = join(dir, 'slide-01.png')
    writeFileSync(imagePath, new Uint8Array([137, 80, 78, 71]))
    process.env.TEST_VISION_KEY = 'secret'
    const fakeFetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"verdict":"warn","score":76,"issues":[{"severity":"warning","area":"contrast","issue":"muted text","fix":"darken"}]}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const config = Config({ visionModelMode: 'custom', visionModelName: 'vision-test', customModelsJson: JSON.stringify([custom]) } as never)
    const target = resolveVisionTarget(config)
    const result = await reviewPages({ get: () => undefined } as never, target, [{ page: 1, path: imagePath }], new AbortController().signal, undefined, fakeFetch)
    expect(result.target).toBe('custom')
    expect(result.pages[0]).toMatchObject({ page: 1, verdict: 'warn', score: 76 })
    expect(result.summary).toEqual({ errors: 0, warnings: 1, passed: 0 })
  })

  it('calls a Host-routed model with an image attachment', async () => {
    let options: Record<string, unknown> | undefined
    const ctx = {
      get: (name: string) => name === 'llm'
        ? { stream: (value: Record<string, unknown>) => { options = value; return (async function* () { yield { type: 'text-delta', text: '{"verdict":"pass","score":90,"issues":[]}' }; yield { type: 'finish', reason: { kind: 'stop' } } })() } }
        : name === 'attachments'
          ? { saveImage: async () => ({ attachment: 'a' }) }
          : undefined,
    }
    const text = await callRouteReview(ctx as never, { mode: 'route', label: 'route p/m', provider: 'p', model: 'm' }, 'review this page', new Uint8Array([1, 2]), new AbortController().signal)
    expect(text).toContain('pass')
    const messages = options?.messages as { content: { type: string }[] }[]
    expect(messages[0]?.content[1]?.type).toBe('image')
  })
})
