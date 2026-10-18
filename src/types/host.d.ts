/**
 * Type declarations for the DeepSeek Harness host packages this plugin uses.
 *
 * Installed DSH packages ship JavaScript only (no .d.ts), so the plugin
 * declares the exact subset it calls. Signatures follow
 * deepseek-harness 0.2.1-rc.2 (packages/core/tools/src/schema.ts and
 * packages/credentials/credentials/src/index.ts). Keep them in sync when the
 * engines.dsh range moves.
 */
declare module '@deepseek-ai/dsh-tools' {
  type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
  interface ContentBlockText { type: 'text'; text: string }
  type ContentBlock = ContentBlockText | { type: string; [key: string]: unknown }
  interface ToolRunContext {
    readonly callId: string
    readonly name: string
    readonly arguments: JsonValue
    readonly agent?: { readonly id: string; readonly session: { readonly id: string; readonly header: { readonly cwd?: string } } & Record<string, unknown> }
    readonly signal: AbortSignal
    deferContext(context: unknown): void
    concludeTurn(): void
  }
  type ToolCallView = { card: 'generic'; title: string; kind?: string; rawInput?: unknown; content?: unknown; locations?: { path: string; line?: number }[] }
  interface DefineToolOptions<A, V> {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
    readonly output: {
      readonly schema: unknown
      render(args: A, value: V): ContentBlock[]
      presentationMeta?(args: A, value: V): JsonValue
    }
    readonly timeoutMs?: number
    isConcurrencySafe?(args: A): boolean
    execute(args: A, exec: ToolRunContext): Promise<V>
    presentCall?(args: A): ToolCallView | undefined
  }
  /** Opaque registered tool definition. */
  interface ToolDefinition { readonly name: string }
  function defineTool<A = any, V = any>(options: DefineToolOptions<A, V>): ToolDefinition
}

declare module '@deepseek-ai/dsh-credentials' {
  /** Branded credential reference; a POSIX shell identifier. */
  type CredentialRef = string & { readonly __brand: 'CredentialRef' }
  function credentialRef(value: string): CredentialRef
}
