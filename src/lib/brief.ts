import type { Basket, ColorRole, FontRole, Item, Priority, Project } from '../types'
import { defaultFor } from './defaults'
import { googleFontsUrl, matchGoogleFont } from './fonts'
import { extForMime, noteSlug } from './slug'

export interface PackInput {
  project: Project
  baskets: Basket[]
  items: Item[]
  /** mime per image blob id, used for filename extensions */
  mimes: Record<string, string>
  exportedAt?: Date
}

const PRIORITY_RANK: Record<Priority, number> = { rule: 0, inspiration: 1, avoid: 2 }
const label = (p: Priority) => p.toUpperCase()
const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

export interface PackImage {
  itemId: string
  blobId: string
  /** path relative to pack root, e.g. references/brand/01-logo-rule.webp */
  path: string
}

/** Filenames for every image item: `NN-<slug>-<priority>.<ext>`, numbered per basket in display order. */
export function planImages({ baskets, items, mimes }: Pick<PackInput, 'baskets' | 'items' | 'mimes'>): PackImage[] {
  const out: PackImage[] = []
  for (const b of [...baskets].sort(byOrder)) {
    let n = 0
    for (const it of items.filter((i) => i.basketId === b.id && i.kind === 'image' && i.imageBlobId).sort(byOrder)) {
      n += 1
      const ext = extForMime(mimes[it.imageBlobId!] ?? 'image/webp')
      const name = `${String(n).padStart(2, '0')}-${noteSlug(it.note)}-${it.priority}.${ext}`
      out.push({ itemId: it.id, blobId: it.imageBlobId!, path: `references/${b.slug}/${name}` })
    }
  }
  return out
}

function itemLine(it: Item, images: Map<string, string>): string {
  const note = oneLine(it.note)
  let body: string
  switch (it.kind) {
    case 'image': {
      const p = images.get(it.id)
      body = `${note || 'Reference image'}${p ? ` — see \`${p}\`` : ''}`
      break
    }
    case 'color':
      body = `${it.hex}${it.colorRole ? ` (${it.colorRole})` : ''}${note ? ` — ${note}` : ''}`
      break
    case 'font':
      body = `Font "${it.fontFamily}"${it.fontRole ? ` (${it.fontRole})` : ''}${note ? ` — ${note}` : ''}`
      break
    case 'link':
      body = `${it.url}${note ? ` — ${note}` : ''}`
      break
    default:
      body = note
  }
  return `- ${label(it.priority)}: ${body}`
}

function colorTable(items: Item[]): string[] {
  if (!items.length) return []
  return [
    '| Role | Hex | Priority | Note |',
    '|---|---|---|---|',
    ...items.map((i) => `| ${i.colorRole ?? '—'} | ${i.hex} | ${label(i.priority)} | ${cell(i.note)} |`),
    '',
  ]
}

function fontTable(items: Item[]): string[] {
  if (!items.length) return []
  return [
    '| Role | Family | Priority | Note |',
    '|---|---|---|---|',
    ...items.map((i) => `| ${i.fontRole ?? '—'} | ${cell(i.fontFamily ?? '')} | ${label(i.priority)} | ${cell(i.note)} |`),
    '',
  ]
}

export function generateBrief(input: PackInput): string {
  const { project, baskets, items } = input
  const images = new Map(planImages(input).map((p) => [p.itemId, p.path]))
  const sorted = [...baskets].sort(byOrder)
  const itemsOf = (b: Basket) => items.filter((i) => i.basketId === b.id).sort(byOrder)
  const filled = sorted.filter((b) => itemsOf(b).length || b.summary.trim())
  const empty = sorted.filter((b) => !filled.includes(b) && !b.hidden)

  const L: string[] = []
  L.push(`# Design Brief: ${project.name}`, '')
  if (project.description.trim()) L.push(project.description.trim(), '')
  L.push(`Platform: ${project.platform}`)
  if (project.audience.trim()) L.push(`Audience: ${oneLine(project.audience)}`)
  L.push(
    '',
    '## How to use this brief',
    '- Items marked **RULE** must be followed exactly.',
    "- Items marked **INSPIRATION** show the intended feel. Adapt them; don't copy them pixel for pixel.",
    '- Items marked **AVOID** must not appear in the build.',
    '- Reference images are in `references/<basket>/`. Open and look at each image referenced below before building the matching part of the UI.',
    '- If a rule conflicts with an inspiration item, the rule wins.',
    '',
  )

  // Overall direction first, then colour and typography, then the rest in basket order.
  const rank = (b: Basket) => (b.slug === 'direction' ? 0 : b.slug === 'color' ? 1 : b.slug === 'typography' ? 2 : 3)
  const ordered = [...filled].sort((a, b) => rank(a) - rank(b) || a.order - b.order)

  for (const b of ordered) {
    const its = itemsOf(b)
    L.push(`## ${b.label}`)
    if (b.summary.trim()) L.push(oneLine(b.summary), '')
    else L.push('')
    let rest = its
    if (b.slug === 'color') {
      L.push(...colorTable(its.filter((i) => i.kind === 'color')))
      rest = its.filter((i) => i.kind !== 'color')
    } else if (b.slug === 'typography') {
      L.push(...fontTable(its.filter((i) => i.kind === 'font')))
      rest = its.filter((i) => i.kind !== 'font')
    }
    for (const i of rest) L.push(itemLine(i, images))
    if (rest.length) L.push('')
  }

  L.push('## Avoid list', '')
  const avoids = sorted.flatMap((b) => itemsOf(b).filter((i) => i.priority === 'avoid').map((i) => ({ b, i })))
  if (avoids.length) {
    for (const { b, i } of avoids) L.push(`${itemLine(i, images)} _(${b.label})_`)
  } else L.push('_Nothing marked AVOID._')
  L.push('')

  L.push('## Open questions', '')
  if (empty.length) {
    for (const b of empty) {
      const d = defaultFor(b.slug)?.motionDefault ?? 'choose something consistent with Overall Direction and say what you chose.'
      L.push(`- No references for ${b.label} — ${d.charAt(0).toLowerCase()}${d.slice(1)}`)
    }
  } else L.push('_Every basket has references._')
  L.push('')
  return L.join('\n')
}

export interface Tokens {
  color: Partial<Record<ColorRole, string>>
  font: Partial<Record<FontRole, string>>
  meta: { project: string; exportedAt: string; version: 1 }
}

/** Tokens only from items that have a role. Rule beats inspiration; avoid never becomes a token. */
export function generateTokens(input: PackInput): Tokens {
  const { project, baskets, items } = input
  const pos = new Map(baskets.map((b) => [b.id, b.order]))
  const cand = items
    .filter((i) => i.priority !== 'avoid')
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (pos.get(a.basketId) ?? 0) - (pos.get(b.basketId) ?? 0) ||
        a.order - b.order,
    )
  const color: Tokens['color'] = {}
  const font: Tokens['font'] = {}
  for (const i of cand) {
    if (i.kind === 'color' && i.colorRole && i.hex && !color[i.colorRole]) color[i.colorRole] = i.hex
    if (i.kind === 'font' && i.fontRole && i.fontFamily && !font[i.fontRole]) font[i.fontRole] = i.fontFamily
  }
  return { color, font, meta: { project: project.name, exportedAt: (input.exportedAt ?? new Date()).toISOString(), version: 1 } }
}

export function generateTokensCss(t: Tokens): string {
  const lines: string[] = []
  const gf = Object.values(t.font).map((f) => matchGoogleFont(f)).filter(Boolean) as string[]
  if (gf.length) lines.push(`@import url('${googleFontsUrl([...new Set(gf)])}');`, '')
  lines.push(`/* Design tokens for ${t.meta.project.replace(/\*\//g, '')} — generated by Design Basket */`, ':root {')
  for (const [k, v] of Object.entries(t.color)) lines.push(`  --color-${k}: ${v};`)
  for (const [k, v] of Object.entries(t.font)) {
    const fb = k === 'mono' ? 'monospace' : 'system-ui, sans-serif'
    lines.push(`  --font-${k}: "${v}", ${fb};`)
  }
  lines.push('}', '')
  return lines.join('\n')
}

export function generatePasteText(project: Project): string {
  return `I've added a design pack in ./design-pack/. Before writing any UI code:
1. Read design-pack/DESIGN.md fully.
2. Open every image in design-pack/references/ that DESIGN.md mentions.
3. Import design-pack/tokens.css (or map design-tokens.json into the project's theme config).
4. Summarize back to me in 5–8 bullets the design rules you will follow, then wait for my OK.

Follow every RULE exactly, treat INSPIRATION as the intended feel, and never use anything on the AVOID list. For anything under "Open questions", choose something consistent with Overall Direction and tell me what you chose.

What to build: ${project.description.trim() || project.name}
`
}
