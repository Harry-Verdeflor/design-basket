const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase()
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = clamp(s, 0, 100) / 100
  const ll = clamp(l, 0, 100) / 100
  const k = (n: number) => (n + hh / 30) % 12
  const a = ss * Math.min(ll, 1 - ll)
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return `#${h.toUpperCase()}`
}

export interface ColorMatch {
  hex: string
  start: number
  end: number
}

const NUM = String.raw`-?\d*\.?\d+`
const COLOR_RE = new RegExp(
  [
    String.raw`#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])`,
    String.raw`rgba?\(\s*(${NUM})%?\s*[, ]\s*(${NUM})%?\s*[, ]\s*(${NUM})%?\s*(?:[,/]\s*${NUM}%?\s*)?\)`,
    String.raw`hsla?\(\s*(${NUM})(?:deg)?\s*[, ]\s*(${NUM})%?\s*[, ]\s*(${NUM})%?\s*(?:[,/]\s*${NUM}%?\s*)?\)`,
  ].join('|'),
  'gi',
)

/** Find every hex / rgb() / hsl() colour in a string, in order. */
export function findColors(text: string): ColorMatch[] {
  const out: ColorMatch[] = []
  for (const m of text.matchAll(COLOR_RE)) {
    const s = m[0]
    let hex: string | null = null
    if (s[0] === '#') hex = normalizeHex(s)
    else if (/^rgb/i.test(s)) hex = rgbToHex(+m[1], +m[2], +m[3])
    else hex = hslToHex(+m[4], +m[5], +m[6])
    if (hex) out.push({ hex, start: m.index, end: m.index + s.length })
  }
  return out
}

/** Readable text colour (black/white) for a swatch background. */
export function contrastText(hex: string): '#000000' | '#FFFFFF' {
  const h = normalizeHex(hex) ?? '#000000'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.4 ? '#000000' : '#FFFFFF'
}
