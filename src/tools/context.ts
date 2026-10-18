/**
 * Per-call workspace resolution and write authorization.
 *
 * The plugin writes binary files (.pptx, images) with node:fs because the DSH
 * filesystem service only writes text. To keep the Session's sandbox
 * contract, every write target is checked against the Session's resolved
 * sandbox policy first: read-only refuses, workspace-write requires the target
 * inside the workspace root, danger-full-access allows any path.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** Minimal views of the host services this plugin reads. */
export interface HostServices {
  workingDirectory: { get(session: unknown): string }
  sandboxPolicy?: { resolve(request: { session?: unknown }): { mode: 'read-only' | 'workspace-write' | 'danger-full-access'; workspaceRoot: string } }
}

/** Execution identity subset used here. */
export interface ExecLike { agent?: { session: { id: string } & Record<string, unknown> }; signal: AbortSignal }

/** Resolved per-call workspace facts. */
export interface CallWorkspace {
  cwd: string
  mode: 'read-only' | 'workspace-write' | 'danger-full-access'
  root: string
  /** Resolve a model-supplied path against cwd. */
  path(p: string): string
  /** Throw unless writing `target` is allowed by the sandbox policy. */
  assertWritable(target: string): void
}

/** Thrown when the sandbox policy forbids a write. */
export class SandboxDeniedError extends Error {
  constructor(message: string) { super(message); this.name = 'SandboxDeniedError' }
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..'))
}

/**
 * Resolve the calling Session's working directory and sandbox policy.
 * @param ctx - plugin context.
 * @param exec - tool execution.
 */
export function callWorkspace(ctx: Context, exec: ExecLike): CallWorkspace {
  if (exec.agent === undefined) throw new Error('this tool requires an agent Session')
  const host = ctx as unknown as HostServices
  const session = exec.agent.session
  const cwd = host.workingDirectory.get(session)
  // sandboxPolicy is optional: without it the plugin confines writes to the working directory.
  const sandboxPolicy = (ctx as unknown as { get(name: string): unknown }).get('sandboxPolicy') as HostServices['sandboxPolicy']
  const policy = sandboxPolicy?.resolve({ session }) ?? { mode: 'workspace-write' as const, workspaceRoot: cwd }
  const root = resolve(policy.workspaceRoot)
  return {
    cwd, mode: policy.mode, root,
    path: (p: string) => resolve(cwd, p),
    assertWritable(target: string) {
      if (policy.mode === 'danger-full-access') return
      if (policy.mode === 'read-only') throw new SandboxDeniedError(`[sandbox: file access denied under read-only mode] cannot write ${target}`)
      if (!inside(root, resolve(target))) throw new SandboxDeniedError(`[sandbox: file access denied under workspace-write mode] ${target} is outside the workspace ${root}`)
    },
  }
}

/**
 * Read and parse a JSON file with a size cap.
 * @param path - absolute file path.
 * @param maxBytes - largest accepted size.
 */
export function readJsonFile(path: string, maxBytes: number): unknown {
  if (!existsSync(path)) throw new Error(`file not found: ${path}`)
  const size = statSync(path).size
  if (size > maxBytes) throw new Error(`${path} is ${size} bytes; the limit is ${maxBytes}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** @returns the deck directory of a deck.json path. */
export function deckDirOf(deckPath: string): string {
  return dirname(deckPath)
}
