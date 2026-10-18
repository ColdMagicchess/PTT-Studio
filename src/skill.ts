/** Registers the bundled pptx-studio skill with the DSH skill registry. */
import { readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { skillDir } from './paths.ts'

const NAME = 'pptx-studio'
/** Bundled skills rank 600; lower wins. 590 keeps user project skills (100–500) in front. */
const RANK = 590

function parseFrontmatter(raw: string): { description: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (m?.[1] === undefined) throw new Error('pptx-studio: SKILL.md has no YAML frontmatter')
  const d = /^description:\s*(.+)$/mu.exec(m[1])
  if (d?.[1] === undefined) throw new Error('pptx-studio: SKILL.md frontmatter has no description')
  return { description: d[1].trim(), body: raw.slice(m[0].length).trim() }
}

/**
 * Register the skill provider.
 * @param ctx - plugin context with the `skills` service.
 * @param description - skill catalog description (read once at activation).
 */
export function registerSkill(ctx: Context, description: string): void {
  const dir = skillDir()
  const locator = join(dir, 'SKILL.md')
  const resourceBase = { kind: 'directory' as const, path: dir.split(sep).join('/') }
  const candidate = {
    name: NAME, description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'dsh-pptx-studio', source: 'bundled' as const, rank: RANK, resourceBase, locator,
  }
  const skills = (ctx as unknown as { skills: { registerProvider(create: () => unknown): () => void } }).skills
  skills.registerProvider(() => ({
    name: 'dsh-pptx-studio',
    list: () => Promise.resolve([candidate]),
    async get(_c: unknown, options: { signal?: AbortSignal }) {
      const raw = await readFile(locator, { encoding: 'utf8', signal: options.signal })
      const { rank: _rank, locator: _locator, ...summary } = candidate
      return { ...summary, content: parseFrontmatter(raw).body }
    },
  }))
}

/** @returns the SKILL.md description, validated at activation so a broken asset fails loud. */
export async function readSkillDescription(): Promise<string> {
  return parseFrontmatter(await readFile(join(skillDir(), 'SKILL.md'), 'utf8')).description
}
