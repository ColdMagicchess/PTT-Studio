/** Small filesystem helpers shared by the tools. */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Write a file through a sibling temporary file and rename, so readers never
 * see a partial file.
 * @param path - absolute destination.
 * @param data - bytes or UTF-8 text.
 */
export function atomicWrite(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(tmp, data)
    renameSync(tmp, path)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}
