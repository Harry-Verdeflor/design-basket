const MAX_SIDE = 1600

export interface Compressed {
  blob: Blob
  mime: string
  width: number
  height: number
}

export function fitWithin(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(w, h)
  if (longest <= max) return { width: w, height: h }
  const k = max / longest
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, mime, q))
}

/** Longest side <= 1600px, WebP q0.85 (JPEG fallback), aspect ratio preserved. */
export async function compressImage(file: Blob): Promise<Compressed> {
  const bmp = await createImageBitmap(file)
  const { width, height } = fitWithin(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  let blob = await toBlob(canvas, 'image/webp', 0.85)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85)
  if (!blob) throw new Error('could not encode image')
  return { blob, mime: blob.type, width, height }
}
