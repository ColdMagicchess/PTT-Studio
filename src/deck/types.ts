/**
 * Typed view of a validated deck.json. The JSON Schema in
 * assets/pptx-studio/deck.schema.json is the authority; these types mirror it.
 */

/** Theme color role names usable wherever a color is accepted. */
export type ColorRole = 'background' | 'surface' | 'primary' | 'secondary' | 'accent' | 'text' | 'textMuted' | 'highlight'
/** A theme role or a 6-digit hex color. */
export type ColorRef = ColorRole | `#${string}`

/** Five visual complexity tiers. */
export type Complexity = 'minimal' | 'simple' | 'balanced' | 'rich' | 'ornate'
/** Three text density tiers. */
export type TextDensity = 'light' | 'medium' | 'dense'
/** Text roles that select default and minimum font sizes. */
export type TextRole = 'display' | 'title' | 'subtitle' | 'heading' | 'body' | 'number' | 'caption'

/** Element box in percent of slide width and height. */
export interface Box { x: number; y: number; w: number; h: number }

/** Inline styled text run. */
export interface Run { text: string; color?: ColorRef; bold?: boolean; italic?: boolean }

interface ElementBase { id?: string; box: Box }

/** Text element. */
export interface TextElement extends ElementBase {
  type: 'text'; role: TextRole; text: string | Run[]
  align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'
  color?: ColorRef; bold?: boolean; italic?: boolean; size?: number; autoFit?: boolean; vertical?: boolean
}
/** One bullet item. */
export type BulletItem = string | { text: string; level?: 0 | 1; icon?: string }
/** Bullet list element. */
export interface BulletsElement extends ElementBase {
  type: 'bullets'; role?: TextRole; items: BulletItem[]
  marker?: 'dot' | 'number' | 'none' | 'icon'; color?: ColorRef; size?: number; autoFit?: boolean
}
/** Native shape element. */
export interface ShapeElement extends ElementBase {
  type: 'shape'; shape: 'rect' | 'roundRect' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'chevron' | 'diamond'
  fill?: ColorRef; opacity?: number; line?: { color?: ColorRef; width?: number; dash?: 'solid' | 'dash' | 'dot'; double?: boolean }
  shadow?: boolean; rotate?: number; decor?: boolean
}
/** Ornate text-backing panel. */
export interface PanelElement extends ElementBase {
  type: 'panel'; panel: 'panel' | 'banner' | 'medallion' | 'plaque'
  fill?: ColorRef; opacity?: number; accent?: ColorRef; corners?: boolean
}
/** Raster image element. */
export interface ImageElement extends ElementBase { type: 'image'; asset?: string; path?: string; fit?: 'contain' | 'cover'; decor?: boolean }
/** A generated, background-removed decoration piece placed on the slide. */
export interface DecorElement extends ElementBase {
  type: 'decor'
  /** Decoration piece id from deck.decorations[].pieces[].id, written as "<kit>/<piece>". */
  piece: string
  /** Mirror horizontally (place one corner spray in the opposite corner). */
  flipH?: boolean
  flipV?: boolean
  rotate?: number
  /** 0–1. */
  opacity?: number
}

/** Vector icon element. */
export interface IconElement extends ElementBase { type: 'icon'; name: string; color?: ColorRef; badge?: ColorRef }
/** Native chart element. */
export interface ChartElement extends ElementBase {
  type: 'chart'; chart: 'bar' | 'barH' | 'line' | 'pie' | 'doughnut' | 'area'
  categories: string[]; series: { name: string; values: number[] }[]; legend?: boolean; dataLabels?: boolean
}
/** Native table element. */
export interface TableElement extends ElementBase { type: 'table'; header: string[]; rows: string[][]; colWidths?: number[] }

/** Any slide element. */
export type DeckElement = TextElement | BulletsElement | ShapeElement | PanelElement | ImageElement | DecorElement | IconElement | ChartElement | TableElement

/** Slide background. */
export type Background = { asset: string } | { color: ColorRef } | { gradient: [ColorRef, ColorRef]; angle?: number }

/** One slide. */
export interface Slide { id: string; layout: string; visual: string; background?: Background; elements: DeckElement[]; notes?: string }

/** One image the deck needs generated or supplied. */
export interface Asset {
  id: string; kind: 'background' | 'illustration'; prompt?: string
  aspect: '16:9' | '4:3' | '3:4' | '1:1'; onColor?: 'background' | 'surface'; file?: string
  /** Generate on a flat white/black backdrop and key it out, so the illustration sits directly on the page with no white box. */
  cutout?: 'white' | 'black'
}

/** One decoration piece requested from a kit. */
export interface DecorationPiece {
  /** Piece id, unique in its kit. */
  id: string
  /** English subject of the piece, e.g. "corner spray of plum blossoms". */
  subject: string
  /** Placement family; drives defaults and checks. */
  role: 'corner' | 'border' | 'divider' | 'accent' | 'scatter' | 'frame' | 'badge'
}

/**
 * A decoration kit: several pieces generated together on one sheet (so they
 * share style), then keyed and split into separate transparent images.
 */
export interface DecorationKit {
  id: string
  /** Backdrop the piece is generated on, removed afterwards: white for most styles, black for glowing styles. */
  backdrop: 'white' | 'black'
  /** 'sheet' (default): several pieces on one image, split by connected regions. 'single': one image per piece — slower but each piece maps to its subject reliably. */
  mode?: 'sheet' | 'single'
  /** Style words for these pieces; overrides theme.styleAnchor. Use it when the deck anchor talks about characters or scenes. */
  styleAnchor?: string
  pieces: DecorationPiece[]
  /** Written by pptx_generate_assets: piece id -> transparent PNG path relative to the deck directory. */
  files?: Record<string, string>
  /** Written by pptx_generate_assets: the generated sheet. */
  sheet?: string
}

/** Theme colors by role. */
export interface ThemeColors {
  background: string; surface: string; primary: string; secondary: string; accent: string; text: string; textMuted: string
}

/** Deck theme. */
export interface Theme {
  style: string; colors: ThemeColors; fonts: { heading: string; body: string; latin?: string }
  styleAnchor: string; motifs?: { foreground: string; midground?: string; background: string }
  seed: number; radius?: number; highlight?: string
}

/** A validated deck. */
export interface Deck {
  version: 1; id: string; title: string; language: string
  /** Page numbers drawn by the assembler on a small plaque in the bottom-right corner. Default true; cover, section and closing slides are skipped. */
  pageNumbers?: boolean
  design: { style: string; complexity: Complexity; textDensity: TextDensity }
  theme: Theme; assets?: Asset[]; decorations?: DecorationKit[]; slides: Slide[]
}
