import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Config } from '../src/config.ts'
import { registerImageTools } from '../src/tools/images.ts'

interface FakeSpec {
  kind: string
  label: string
  owner?: string
  outputLimitBytes?: number
  run(job: { append(text: string): void; updateProgress(line: string): void }): {
    cancel(reason?: string): void
    done: Promise<{ status: string; detail?: string; result?: string }>
  }
}

function fakeJobs() {
  const lines: string[] = []
  const progress: string[] = []
  const calls: FakeSpec[] = []
  let hooks: ReturnType<FakeSpec['run']> | undefined
  return {
    lines,
    progress,
    calls,
    get hooks() { return hooks },
    start(spec: FakeSpec) {
      calls.push(spec)
      hooks = spec.run({
        append: (text) => { lines.push(text) },
        updateProgress: (line) => { progress.push(line) },
      })
      return 'job-test-1'
    },
  }
}

function minimalDeck() {
  return {
    version: 1, id: 'bg-test', title: 'background job test', language: 'zh-CN',
    design: { style: 'swiss-modern', complexity: 'minimal', textDensity: 'medium' },
    theme: {
      style: 'swiss-modern',
      colors: { background: '#FFFFFF', surface: '#F2F2EF', primary: '#111111', secondary: '#E2231A', accent: '#9A9A9A', text: '#111111', textMuted: '#6E6E6E' },
      fonts: { heading: 'Arial', body: '微软雅黑' },
      styleAnchor: 'Swiss International Style editorial design, strict modular grid',
      seed: 1,
    },
    slides: [{ id: 's01', layout: 'cover', visual: 'test cover', elements: [] }],
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.AGNES_API_KEY
})

function harness(withJobs: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-bg-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'deck.json'), JSON.stringify(minimalDeck(), null, 2), 'utf8')
  process.env.AGNES_API_KEY = 'test-key'
  const jobs = fakeJobs()
  const registered: { name: string; execute(args: unknown, exec: unknown): Promise<unknown> }[] = []
  const services: Record<string, unknown> = {
    tools: { register: (def: { name: string; execute(args: unknown, exec: unknown): Promise<unknown> }) => { registered.push(def); return () => {} } },
    workingDirectory: { get: () => dir },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access', workspaceRoot: dir }) },
    credentials: { resolve: async () => undefined },
    ...withJobs ? { jobs } : {},
  }
  const ctx = { ...services, get: (name: string) => services[name], on: () => {}, effect: () => {} }
  registerImageTools(ctx as never, Config({} as never))
  const tool = registered.find(t => t.name === 'pptx_generate_assets')
  if (tool === undefined) throw new Error('pptx_generate_assets was not registered')
  const exec = {
    callId: 'call-1', name: 'pptx_generate_assets', arguments: {},
    agent: { id: 'agent-1', session: { id: 'session-1' } },
    signal: new AbortController().signal,
  }
  return { dir, tool, exec, jobs }
}

describe('pptx_generate_assets background jobs', () => {
  it('registers the work with ctx.jobs and returns a job id immediately', async () => {
    const { dir, tool, exec, jobs } = harness(true)
    const value = await tool.execute({ deck: 'deck.json', run_in_background: true }, exec) as {
      deck: string; outcomes: unknown[]; kits: unknown[]
      job?: { id: string; status: string; label: string }
    }
    expect(value.job).toMatchObject({ id: 'job-test-1', status: 'running' })
    expect(value.outcomes).toEqual([])
    expect(value.kits).toEqual([])
    expect(jobs.calls).toHaveLength(1)
    expect(jobs.calls[0]).toMatchObject({ kind: 'pptx-generate-images', owner: 'agent-1' })
    expect(jobs.calls[0]!.label).toContain('deck.json')

    const outcome = await jobs.hooks!.done
    expect(outcome).toMatchObject({ status: 'completed' })
    expect(outcome.result).toContain('deck.json updated')
    // The job wrote the deck back atomically; the empty deck is still valid JSON.
    expect(JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8'))).toMatchObject({ id: 'bg-test' })
  })

  it('fails clearly when the host has no jobs service', async () => {
    const { tool, exec } = harness(false)
    await expect(tool.execute({ deck: 'deck.json', run_in_background: true }, exec)).rejects.toThrow(/dsh-tool-jobs/)
  })
})
