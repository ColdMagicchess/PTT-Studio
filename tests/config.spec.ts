import { describe, expect, it } from 'vitest'
import { Config, readLive } from '../src/config.ts'

/** Fields the Plugins page edits; the settings service only serves volatile ones. */
const SETTINGS_FIELDS = [
  'textModelMode', 'textModelName', 'visionModelMode', 'visionModelName',
  'imageBackend', 'customModelsJson', 'customModelApiKeyRef',
] as const

describe('plugin config schema', () => {
  it('marks every settings-page field volatile so the config form is served', () => {
    const schema = Config as unknown as { dict: Record<string, { meta: { volatile?: boolean } }> }
    for (const field of SETTINGS_FIELDS) {
      expect(schema.dict[field]?.meta.volatile, field).toBe(true)
    }
  })

  it('returns live wrappers for volatile fields and readLive unwraps them', () => {
    const config = Config({})
    expect(readLive(config.imageBackend)).toBe('agnes')
    expect(readLive(config.textModelMode)).toBe('session')
    // Non-volatile fields stay plain.
    expect(config.imageConcurrency).toBe(3)
  })
})
