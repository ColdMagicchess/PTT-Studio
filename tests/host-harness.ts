/**
 * Minimal stand-in for the DSH host services the plugin calls, used to load
 * the built bundle (lib/index.js) outside the Harness. Real DSH packages are
 * linked from the Desktop install by scripts/link-host.ps1.
 */
import { tmpdir } from 'node:os'

export interface RegisteredTool { name: string; description: string; execute(args: unknown, exec: unknown): Promise<unknown>; output: { render(a: unknown, v: unknown): unknown } }

export function mockHost(cwd: string, mode: 'read-only' | 'workspace-write' | 'danger-full-access' = 'workspace-write', creds: Record<string, string> = {}) {
  const registered: RegisteredTool[] = []
  const providers: unknown[] = []
  const session = { id: 'session-test', header: { cwd } }
  const services: Record<string, unknown> = {
    tools: { register(def: RegisteredTool) { registered.push(def); return () => {} } },
    skills: { registerProvider(create: () => unknown) { providers.push(create()); return () => {} } },
    workingDirectory: { get: () => cwd },
    sandboxPolicy: { resolve: () => ({ mode, workspaceRoot: cwd }) },
    credentials: { resolve: async (ref: string) => creds[ref] === undefined ? undefined : { value: creds[ref], source: 'test' } },
  }
  const ctx = { ...services, get: (name: string) => services[name], effect: () => {}, on: () => {} }
  const exec = { callId: 'call-1', name: 'x', arguments: {}, agent: { id: 'agent-1', session }, signal: new AbortController().signal, deferContext() {}, concludeTurn() {} }
  return { ctx, registered, providers, exec, tmp: tmpdir() }
}
