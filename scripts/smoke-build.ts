import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { validateDeck } from '../src/deck/validate.ts'
import { buildDeck } from '../src/build/assemble.ts'
import { fontMeasurer } from '../src/build/metrics.ts'

const deckPath = resolve(process.argv[2]!)
const out = resolve(process.argv[3]!)
const deck = validateDeck(JSON.parse(readFileSync(deckPath, 'utf8')))
const measurer = fontMeasurer(process.env.PPTX_FONT, process.env.PPTX_FONT_BOLD)
const r = await buildDeck(deck, { baseDir: dirname(deckPath), measurer })
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, r.bytes)
console.log(JSON.stringify({ out, bytes: r.bytes.length, slides: r.slideCount, fits: r.fits, missing: r.missingAssets, unknownIcons: r.unknownIcons }, null, 2))
