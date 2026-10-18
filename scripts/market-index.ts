/**
 * Plugin-market index (format 1) for dsh-pptx-studio.
 *
 *   tsx scripts/market-index.ts add <version> <commit>   append a release pinned to a commit
 *   tsx scripts/market-index.ts check                     validate market/index.json
 *
 * The rules mirror @deepseek-ai/dsh-plugin-market-index (DSH 0.2.1-rc.2):
 * format 1, LocalizedText with en, npm package name, exact SemVer versions,
 * Unix-second timestamps, git sources with a canonical https URL and a
 * 40-hex commit, SemVer engines.dsh, and relative/https icons.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import semver from 'semver'

const INDEX = resolve('market/index.json')
const REPO = 'https://github.com/ColdMagicchess/PTT-Studio'
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const COMMIT = /^[0-9a-f]{40}$/
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

type Json = Record<string, unknown>

function fail(where: string, reason: string): never { throw new Error(where + ' ' + reason) }
function obj(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(where, 'must be an object')
  return value as Json
}
function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(where, 'must be a non-empty string')
  return value
}
function localized(value: unknown, where: string): void {
  if (typeof value === 'string') { str(value, where); return }
  const text = obj(value, where)
  for (const [lang, member] of Object.entries(text)) {
    if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(lang)) fail(where + '.' + lang, 'must be keyed by a lowercase language id')
    str(member, where + '.' + lang)
  }
  if (!Object.hasOwn(text, 'en')) fail(where, 'must contain en')
}

/**
 * Validate a parsed index document.
 * @param doc - parsed JSON.
 * @param indexUrl - URL the index is served from (relative icons resolve against it).
 */
export function validateIndex(doc: unknown, indexUrl: string): void {
  const root = obj(doc, '$')
  if (root.format !== 1) fail('$.format', 'must be 1')
  localized(root.title, '$.title')
  if (root.description !== undefined) localized(root.description, '$.description')
  if (!Array.isArray(root.plugins)) fail('$.plugins', 'must be an array')
  const names = new Set<string>()
  root.plugins.forEach((raw, i) => {
    const at = '$.plugins[' + i + ']'
    const plugin = obj(raw, at)
    const name = str(plugin.name, at + '.name')
    if (!PACKAGE_NAME.test(name) || name.length > 214) fail(at + '.name', 'must be a valid npm package name')
    if (names.has(name)) fail(at + '.name', 'duplicates ' + name)
    names.add(name)
    for (const key of ['title', 'description'] as const) if (plugin[key] !== undefined) localized(plugin[key], at + '.' + key)
    if (plugin.icon !== undefined) {
      const icon = new URL(str(plugin.icon, at + '.icon'), indexUrl)
      const base = new URL(indexUrl)
      if (icon.protocol !== 'https:' && icon.origin !== base.origin) fail(at + '.icon', 'must resolve to https or the index origin')
    }
    if (plugin.homepage !== undefined && !/^https?:\/\//.test(str(plugin.homepage, at + '.homepage'))) fail(at + '.homepage', 'must be http(s)')
    if (plugin.repository !== undefined) str(obj(plugin.repository, at + '.repository').url, at + '.repository.url')
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) fail(at + '.versions', 'must be a non-empty array')
    const seen = new Set<string>()
    plugin.versions.forEach((rawVersion, j) => {
      const vat = at + '.versions[' + j + ']'
      const version = obj(rawVersion, vat)
      const v = str(version.version, vat + '.version')
      if (!SEMVER.test(v)) fail(vat + '.version', 'must be an exact SemVer version')
      if (seen.has(v)) fail(vat + '.version', 'duplicates ' + v)
      seen.add(v)
      const ts = version.publishTimestamp
      if (typeof ts !== 'number' || !Number.isInteger(ts) || ts < 0 || ts >= 1e11) fail(vat + '.publishTimestamp', 'must be Unix seconds')
      const source = obj(version.source, vat + '.source')
      if (source.type === 'git') {
        const url = str(source.url, vat + '.source.url')
        if (new URL(url).href !== url || !url.startsWith('https://')) fail(vat + '.source.url', 'must be a canonical https URL')
        if (!COMMIT.test(str(source.commit, vat + '.source.commit'))) fail(vat + '.source.commit', 'must be a 40-hex commit')
      } else if (source.type !== 'npm') fail(vat + '.source.type', 'must be npm or git')
      if (version.engines !== undefined) {
        const dsh = obj(version.engines, vat + '.engines').dsh
        if (dsh !== undefined && semver.validRange(str(dsh, vat + '.engines.dsh')) === null) fail(vat + '.engines.dsh', 'must be a SemVer range')
      }
    })
  })
}

function readIndex(): Json { return JSON.parse(readFileSync(INDEX, 'utf8')) as Json }

const [command, version, commit] = process.argv.slice(2)
if (command === 'check') {
  validateIndex(readIndex(), REPO.replace('github.com', 'raw.githubusercontent.com') + '/main/market/index.json')
  console.log('market/index.json is a valid format-1 index')
} else if (command === 'add') {
  if (version === undefined || commit === undefined || !SEMVER.test(version) || !COMMIT.test(commit)) {
    throw new Error('usage: market-index.ts add <semver> <40-hex commit>')
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { engines?: { dsh?: string } }
  const index = readIndex()
  const plugin = (index.plugins as Json[])[0]!
  const versions = (plugin.versions as Json[]).filter(entry => entry.version !== version)
  versions.unshift({
    version, publishTimestamp: Math.floor(Date.now() / 1000),
    source: { type: 'git', url: REPO, commit },
    ...pkg.engines?.dsh === undefined ? {} : { engines: { dsh: pkg.engines.dsh } },
  })
  plugin.versions = versions
  validateIndex(index, REPO.replace('github.com', 'raw.githubusercontent.com') + '/main/market/index.json')
  writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log('added ' + version + ' @ ' + commit)
} else {
  throw new Error('usage: market-index.ts <check|add>')
}
