/** Contact sheets: lay rendered slide thumbnails out on one image for previews. */
import jpeg from 'jpeg-js'
import { downscale, type Rgba } from './raster.ts'

/** Layout of one contact sheet. */
export interface ContactSheetOptions {
  /** Columns in the grid; rows follow from the image count. */
  cols: number
  /** Width of each cell in pixels; images are scaled to fit it. */
  cellWidth: number
  /** Gap between cells and around the sheet, in pixels. */
  gap: number
  /** Sheet background as RGB. */
  background: readonly [number, number, number]
}

/**
 * Columns that keep a sheet close to 16:9 for a slide count.
 * @param count - number of slides.
 * @returns column count.
 */
export function sheetColumns(count: number): number {
  if (count <= 1) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
}

/**
 * Compose images into a grid, each scaled to the cell width and centred in its cell.
 * @param images - decoded images, in reading order.
 * @param options - grid layout.
 * @returns the composed RGBA sheet.
 */
export function contactSheet(images: readonly Rgba[], options: ContactSheetOptions): Rgba {
  if (images.length === 0) throw new Error('contact sheet needs at least one image')
  const cols = Math.max(1, Math.min(options.cols, images.length))
  const cells = images.map(image => image.width > options.cellWidth ? downscale(image, Math.max(1, Math.round(options.cellWidth * Math.max(image.width, image.height) / image.width))) : image)
  const cellHeight = Math.max(...cells.map(cell => cell.height))
  const rows = Math.ceil(cells.length / cols)
  const width = options.gap + cols * (options.cellWidth + options.gap)
  const height = options.gap + rows * (cellHeight + options.gap)
  const data = new Uint8Array(width * height * 4)
  const [r, g, b] = options.background
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255 }
  cells.forEach((cell, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const left = options.gap + col * (options.cellWidth + options.gap) + Math.floor((options.cellWidth - cell.width) / 2)
    const top = options.gap + row * (cellHeight + options.gap) + Math.floor((cellHeight - cell.height) / 2)
    for (let y = 0; y < cell.height; y++) {
      for (let x = 0; x < cell.width; x++) {
        const s = (y * cell.width + x) * 4
        const d = ((top + y) * width + left + x) * 4
        const a = cell.data[s + 3]! / 255
        data[d] = Math.round(cell.data[s]! * a + data[d]! * (1 - a))
        data[d + 1] = Math.round(cell.data[s + 1]! * a + data[d + 1]! * (1 - a))
        data[d + 2] = Math.round(cell.data[s + 2]! * a + data[d + 2]! * (1 - a))
      }
    }
  })
  return { width, height, data }
}

/**
 * Encode an opaque RGBA image as JPEG.
 * @param image - image to encode.
 * @param quality - JPEG quality 1–100.
 * @returns JPEG bytes.
 */
export function encodeJpeg(image: Rgba, quality = 82): Uint8Array {
  return jpeg.encode({ width: image.width, height: image.height, data: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength) }, quality).data
}
