/**
 * Image prompt assembly and lint, following references/image-prompts.md:
 * [subject+composition] , [styleAnchor] , [palette] , [complexity modifier] , [quality].
 */
import type { Asset, Complexity, Deck } from '../deck/types.ts'

/** Fixed quality suffix; contains no digits so the model cannot render them. */
export const QUALITY = 'high quality, sharp details, professional presentation design'
/** Negative prompt for backends that accept one. */
export const NEGATIVE = 'text, letters, words, numbers, calligraphy, watermark, logo, signature, caption, title, UI elements, buttons, charts, blurry, low quality, distorted, cropped subject'
/** Positive-prompt suffix for backends without a negative prompt field. */
export const NO_TEXT = 'absolutely no text, letters, numbers, watermark or logo anywhere'

/**
 * Rich and ornate backgrounds draw only the base surface: texture, palette and
 * atmosphere. Decoration pieces are generated separately as kits and placed by
 * the assembler, so the background prompt must not bake ornaments in.
 * Keep in sync with references/image-prompts.md.
 */
const RICH_BACKGROUND = 'richly layered atmospheric background, soft depth of field and gentle lighting gradients, a subtle tone-on-tone texture of {background} spread across the whole frame, softly blurred ambient color shapes fading in at the very edges, the middle of the frame stays calm and clean, no separate ornaments, no corner sprays, no props or foreground objects, only surface texture and light'

/** Ornate backdrop modifier: a richly worked surface, still with no standalone ornaments. */
const ORNATE_BACKGROUND = [
  'lavish ornate backdrop design, even where this style is usually clean or minimal the whole surface is richly worked',
  'the backdrop is not plain but a tone-on-tone patterned surface like damask wallpaper in shades close to the base background color, a tight seamless repeat of hundreds of tiny {background} covering the whole frame edge to edge including the middle',
  'low-contrast woven midground texture of {midground} dissolved into the surface',
  'every texture finely drawn with engraved and filigree detail, a soft vignette at the edges',
  'the middle of the frame is a softer low-contrast zone with no scenery, no separate ornaments, no corner sprays, no medallions, no props and no foreground objects inside it',
  'one small vivid accent in the highlight color',
].join(', ')

/** Extra negative terms for the ornate tier (backends with a negative prompt only). */
export const ORNATE_NEGATIVE = 'plain empty background, solid flat background, large blank areas, minimalist, sparse decoration, bright object in the middle, oversaturated, standalone ornaments, sticker outlines'

const BACKGROUND_MODIFIER: Record<Exclude<Complexity, 'minimal' | 'rich' | 'ornate'>, string> = {
  simple: 'nearly flat calm background, one or two faint decorative accents near a single edge, mostly empty negative space',
  balanced: 'subtle decorations only along the edges, calm uniform center',
}
const ILLUSTRATION_MODIFIER: Record<Complexity, string> = {
  minimal: 'single simple subject, minimal details, flat clean shapes',
  simple: 'single simple subject, few details, clean shapes',
  balanced: 'clear subject with a few supporting elements',
  rich: 'detailed scene with multiple supporting elements, layered depth and rich lighting',
  ornate: 'extremely intricate and ornate subject, fine outlines, engraved and filigree details, layered decorative elements, sparkling highlights',
}

/**
 * Complexity modifier for one asset.
 * @param deck - deck supplying design tier and motifs.
 * @param kind - background or illustration.
 */
export function complexityModifier(deck: Deck, kind: Asset['kind']): string {
  const tier = deck.design.complexity
  if (kind === 'illustration') return ILLUSTRATION_MODIFIER[tier]
  const m = deck.theme.motifs
  switch (tier) {
    case 'minimal': return ''
    case 'simple':
    case 'balanced': return BACKGROUND_MODIFIER[tier]
    case 'rich':
      return RICH_BACKGROUND.replace('{background}', m?.background ?? 'small repeating motifs')
    case 'ornate':
      return ORNATE_BACKGROUND
        .replace('{background}', m?.background ?? 'small repeating motifs')
        .replace('{midground}', m?.midground ?? 'ornamental woven bands')
  }
}

/**
 * Hex colors converted to approximate color names so the prompt carries no hex.
 * @param hex - 6-digit color with or without #.
 */
export function colorName(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let hue = 0
  if (d !== 0) hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  if (hue < 0) hue += 360
  const tone = l < 0.12 ? 'very dark ' : l < 0.3 ? 'deep ' : l > 0.88 ? 'very light ' : l > 0.7 ? 'light ' : ''
  if (s < 0.12) return l < 0.12 ? 'near black' : l > 0.93 ? 'white' : `${tone}gray`.trim()
  const names: [number, string][] = [[15, 'red'], [40, 'orange'], [55, 'gold'], [70, 'yellow'], [160, 'green'], [190, 'teal'], [205, 'cyan'], [245, 'blue'], [285, 'violet'], [330, 'magenta'], [360, 'red']]
  const base = names.find(([limit]) => hue < limit)![1]
  const named = base === 'blue' && l < 0.3 ? 'navy' : base
  return `${tone}${named}`.trim()
}

/** Palette phrase built from theme colors (names only). */
export function paletteOf(deck: Deck): string {
  const c = deck.theme.colors
  const names = [...new Set([c.background, c.primary, c.secondary, c.accent].map(colorName))]
  const base = `color palette of ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  const hl = deck.theme.highlight
  return hl !== undefined && (deck.design.complexity === 'ornate' || deck.design.complexity === 'rich')
    ? `${base}, with a small touch of ${colorName(hl)} as the highlight`
    : base
}

/**
 * Rewrite composition phrases for the ornate tier: the middle is a softer
 * low-contrast zone under a panel, never "empty".
 * @param subject - authored subject and composition.
 */
export function ornateComposition(subject: string): string {
  return subject
    .replace(/\b(?:a |the )?(?:calm |large |clean |uniform )*empty (?:negative space|area|space|center|centre)\b/gi, 'a softer low-contrast zone')
    .replace(/\bmostly empty\b/gi, 'softly patterned')
}

/** One forbidden fragment found in a positive prompt. */
export interface LintIssue { fragment: string; reason: string }

const FORBIDDEN_WORDS = ['text', 'title', 'letters', 'letter', 'words', 'word', 'label', 'caption', 'typography', 'font']

/**
 * Find fragments the image model tends to draw as literal text.
 * @param subject - the deck-authored subject and composition part.
 */
export function lintSubject(subject: string): LintIssue[] {
  const issues: LintIssue[] = []
  for (const m of subject.matchAll(/#[0-9a-f]{3,8}\b/gi)) issues.push({ fragment: m[0], reason: 'hex color: use a color name' })
  for (const m of subject.matchAll(/\d+(?:\.\d+)?%?/g)) issues.push({ fragment: m[0], reason: 'number or percentage: use position words such as "the left half"' })
  for (const m of subject.matchAll(/\b[A-Z]{2,}[0-9A-Z]*\b/g)) issues.push({ fragment: m[0], reason: 'acronym or brand: describe its shape instead' })
  for (const m of subject.matchAll(/["“”'‘’「」]/g)) issues.push({ fragment: m[0], reason: 'quotation mark: remove quotes' })
  for (const w of FORBIDDEN_WORDS) for (const m of subject.matchAll(new RegExp(`\\b${w}\\b`, 'gi'))) issues.push({ fragment: m[0], reason: 'text-like word: say "calm empty area" instead' })
  return issues
}

/**
 * Negative prompt for one asset.
 * @param deck - validated deck.
 * @param asset - asset being generated.
 */
export function negativeFor(deck: Deck, asset: Asset): string {
  return deck.design.complexity === 'ornate' && asset.kind === 'background' ? `${NEGATIVE}, ${ORNATE_NEGATIVE}` : NEGATIVE
}

/**
 * Full prompt for one asset.
 * @param deck - validated deck.
 * @param asset - asset with an authored subject prompt.
 * @param withNoTextSuffix - append the positive no-text suffix (backends without negative prompts).
 */
export function assetPrompt(deck: Deck, asset: Asset, withNoTextSuffix: boolean): string {
  const raw = asset.prompt ?? ''
  const subject = deck.design.complexity === 'ornate' && asset.kind === 'background' ? ornateComposition(raw) : raw
  const onColor = asset.kind !== 'illustration' ? ''
    : asset.cutout !== undefined
      ? `, isolated on a plain flat pure ${asset.cutout} background, nothing touching the edges, no scenery, no ground shadow`
      : asset.onColor !== undefined
        ? `, on a plain solid ${colorName(deck.theme.colors[asset.onColor])} background`
        : ''
  const parts = [subject + onColor, deck.theme.styleAnchor, paletteOf(deck), complexityModifier(deck, asset.kind), QUALITY]
  if (withNoTextSuffix) parts.push(NO_TEXT)
  return parts.filter(p => p.length > 0).join(', ')
}

/** How detailed each decoration piece is drawn, by tier. */
const DECOR_DETAIL: Record<Complexity, string> = {
  minimal: 'very simple flat shapes, a single color each, almost no detail',
  simple: 'simple clean shapes with few details and thin outlines',
  balanced: 'clear shapes with moderate detail and consistent outlines',
  rich: 'detailed pieces with layered parts, fine outlines and subtle shading',
  ornate: 'extremely intricate pieces, fine gilded or glowing outlines, filigree, openwork and engraved texture, many small parts in every piece',
}

/**
 * Prompt for one decoration sheet: every piece drawn separately on a flat
 * backdrop that is removed afterwards.
 * @param deck - validated deck.
 * @param kit - decoration kit.
 */
export function decorationSheetPrompt(deck: Deck, kit: import('../deck/types.ts').DecorationKit): string {
  const n = kit.pieces.length
  const grid = n <= 1 ? 'a single centered item' : n <= 4 ? 'a neat two by two grid' : n <= 6 ? 'a neat three by two grid' : n <= 9 ? 'a neat three by three grid' : 'a neat four by three grid'
  const list = kit.pieces.map(p => p.subject).join(', ')
  const backdrop = kit.backdrop === 'black'
    ? 'all on a plain flat pure black background, no grey halo or sticker outline around the items, no glow spill outside the shapes'
    : 'all on a plain flat pure white background, no sticker outlines, no white borders around the items, no drop shadow'
  const gridWords = n <= 1 ? 'one single item' : n <= 4 ? 'exactly two rows of two' : n <= 6 ? 'exactly two rows of three' : n <= 9 ? 'exactly three rows of three' : 'exactly three rows of four'
  return [
    `a decoration asset sheet of exactly ${n} separate small ornament pieces arranged in ${grid} (${gridWords}) with wide empty gaps between them, one piece per cell and nothing else in the image, each listed phrase is exactly one separate piece (do not split a phrase into several items and do not add unlisted items), each piece fully separated and not touching any other piece or the edges, every piece drawn at the same style and level of finish: ${list}`,
    backdrop, 'no shadows, no ground, no scenery, no text anywhere',
    'only the listed ornament pieces: no people, no characters, no animals, no mascots, no faces, no scenes, no main illustration, no extra items, no props',
    kit.styleAnchor ?? deck.theme.styleAnchor, paletteOf(deck), DECOR_DETAIL[deck.design.complexity], QUALITY, NO_TEXT,
  ].join(', ')
}

/**
 * Prompt for one decoration piece generated as its own image. Reliable mapping
 * trumps the sheet's shared-style shortcut when a kit's pieces must land on
 * exact subjects.
 * @param deck - validated deck.
 * @param kit - decoration kit the piece belongs to.
 * @param piece - piece to draw.
 */
export function decorationPiecePrompt(deck: Deck, kit: import('../deck/types.ts').DecorationKit, piece: import('../deck/types.ts').DecorationPiece): string {
  const backdrop = kit.backdrop === 'black'
    ? 'on a plain flat pure black background, no grey halo or sticker outline, no glow spill outside the shape'
    : 'on a plain flat pure white background, no sticker outline, no white border, no drop shadow'
  return [
    `one single small ornament piece drawn alone: ${piece.subject}, centered in the frame with wide plain empty margins, nothing touching the edges`,
    backdrop, 'no ground, no scenery, no text anywhere',
    'only this one ornament piece: no people, no characters, no animals, no faces, no scenes, no other items',
    kit.styleAnchor ?? deck.theme.styleAnchor, paletteOf(deck), DECOR_DETAIL[deck.design.complexity], QUALITY, NO_TEXT,
  ].join(', ')
}

/** Lint every piece subject of a kit. */
export function lintKit(kit: import('../deck/types.ts').DecorationKit): { piece: string; issues: LintIssue[] }[] {
  return kit.pieces.map(p => ({ piece: p.id, issues: lintSubject(p.subject) })).filter(x => x.issues.length > 0)
}
