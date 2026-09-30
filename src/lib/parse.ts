import type { ItemKind } from '../types'
import { findColors } from './color'
import { matchGoogleFont } from './fonts'

export interface ItemDraft {
  kind: ItemKind
  note: string
  hex?: string
  fontFamily?: string
  url?: string
}

const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i

/** Turn one line of typed text into item drafts (colors, fonts, links or a plain note). */
export function parseInput(raw: string, basketSlug: string): ItemDraft[] {
  const text = raw.trim()
  if (!text) return []

  const colors = findColors(text)
  if (colors.length) {
    let rest = text
    for (const c of [...colors].reverse()) rest = rest.slice(0, c.start) + ' ' + rest.slice(c.end)
    rest = rest.replace(/\s+/g, ' ').replace(/^[\s,;:/|-]+|[\s,;:/|-]+$/g, '')
    const note = colors.length === 1 ? rest : ''
    return colors.map((c) => ({ kind: 'color' as const, note, hex: c.hex }))
  }

  if (URL_RE.test(text)) {
    return [{ kind: 'link', note: '', url: /^www\./i.test(text) ? `https://${text}` : text }]
  }

  if (basketSlug === 'typography') {
    const parts = text.split(/\s*(?:[,+/&|]|\band\b)\s*/i).filter(Boolean)
    const families = parts.map(matchGoogleFont)
    if (parts.length && families.every(Boolean)) {
      return [...new Set(families as string[])].map((f) => ({ kind: 'font' as const, note: '', fontFamily: f }))
    }
  }

  return [{ kind: 'note', note: text }]
}
