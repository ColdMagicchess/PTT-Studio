import { defineConfig } from 'tsdown'

// Browser half: a closure factory for the Host client loader. react and the UI
// primitives are module-table externals; everything else is bundled.
export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  sourcemap: false,
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  noExternal: [/^(?!react$|react\/jsx-runtime$|@deepseek-ai\/dsh-client-ui-primitives$).*/],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-pptx-studio", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
