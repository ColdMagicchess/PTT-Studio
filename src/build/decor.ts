/**
 * Decoration-piece placement: fit a transparent PNG inside its element box,
 * keep the physical aspect ratio and anchor it to the box corner nearest the
 * matching slide corner, so a corner spray hugs its corner.
 *
 * Box coordinates are percentages, but one percent of slide width (0.133 in)
 * is wider than one percent of height (0.075 in); the fit must be computed in
 * physical units, otherwise a round piece is stretched horizontally.
 */
import type { Box } from '../deck/types.ts'

/** Slide width / height (13.333 x 7.5 in). */
const SLIDE_ASPECT = 13.333 / 7.5
/** One percent of slide height expressed in percent-of-width units. */
const H_IN_W = 1 / SLIDE_ASPECT

/**
 * Fit an image inside a percentage box.
 * @param box - element box in percent of the slide.
 * @param imgW - piece width in pixels.
 * @param imgH - piece height in pixels.
 * @returns box in percent, contained and anchored to the nearest slide corner.
 */
export function decorPlacement(box: Box, imgW: number, imgH: number): Box {
  const w = Math.min(box.w, box.h * H_IN_W * (Math.max(1, imgW) / Math.max(1, imgH)))
  const h = w * (Math.max(1, imgH) / Math.max(1, imgW)) / H_IN_W
  const left = box.x + box.w / 2 < 50
  const top = box.y + box.h / 2 < 50
  return { x: left ? box.x : box.x + box.w - w, y: top ? box.y : box.y + box.h - h, w, h }
}
