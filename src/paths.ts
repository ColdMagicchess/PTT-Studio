/** Package-relative paths that work both from source (src/...) and from the bundle (lib/index.js). */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let cached: string | undefined

/**
 * Locate this package's root: the nearest ancestor of the running module whose
 * package.json declares the dsh-pptx-studio name.
 * @returns absolute package root directory.
 */
export function packageRoot(): string {
  if (cached !== undefined) return cached
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'assets', 'pptx-studio', 'SKILL.md'))) return cached = dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error('dsh-pptx-studio: cannot locate package root (assets/pptx-studio/SKILL.md)')
    dir = parent
  }
}

/** @returns absolute path of the bundled skill directory. */
export function skillDir(): string {
  return join(packageRoot(), 'assets', 'pptx-studio')
}
