import { defineConfig } from 'tsdown'

// Host bundle: ESM for the DSH Loader. Host-provided packages stay external so the
// plugin shares the running Harness instances; third-party libraries are bundled.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: false,
  clean: true,
  // Host-provided runtime: shared with the running Harness, never bundled.
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-credentials'],
  // Everything else (including schemastery, whose instance is not shared) is inlined so the
  // installed plugin needs no dependency install beyond the tarball.
  noExternal: [/^(?!@deepseek-ai\/(cordis|dsh-tools|dsh-credentials)$).*/],
})
