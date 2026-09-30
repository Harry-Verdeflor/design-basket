import type Anthropic from '@anthropic-ai/sdk'
import { COLOR_ROLES, FONT_ROLES, type Basket, type ColorRole, type FontRole, type Item, type Project } from '../types'
import { normalizeHex } from './color'
import { matchGoogleFont } from './fonts'
import { keyOfItem, type Suggestion } from './suggest'

// ---- settings (this device only) ----

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (stronger, costs 2×)' },
] as const
export type AiModel = (typeof AI_MODELS)[number]['id']

export interface AiSettings {
  apiKey: string
  model: AiModel
  sendImages: boolean
}

const KEY = 'db-ai'
const DEFAULTS: AiSettings = { apiKey: '', model: 'claude-sonnet-5-5', sendImages: true }

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const v = JSON.parse(raw)
    return {
      apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
      model: AI_MODELS.some((m) => m.id === v.model) ? v.model : DEFAULTS.model,
      sendImages: v.sendImages !== false,
    }
  } catch {
    return DEFAULTS
  }
}

export function saveAiSettings(s: AiSettings): void {
  try {
    if (!s.apiKey && s.model === DEFAULTS.model && s.sendImages) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage blocked: key lives for this session only */
  }
}

// ---- request building (pure) ----

export const MAX_IMAGES = 6

export const SYSTEM_PROMPT = `You help a designer fill a "design brief" for a website or app. The brief is split into baskets (Brand, Typography, Color, Layout, Components, Motion, and so on). Each basket holds references: notes, colors, fonts, and images. An AI coding agent later builds the product from this brief, so every suggestion must be concrete enough to implement.

You will get the project description, notes from every basket, and the items (and possibly images) already in the basket the designer is working on. Suggest what that basket is still missing.

Rules:
- Stay consistent with the Overall Direction and with what the designer already chose. Look closely at any images and take cues from them.
- Never repeat something already in the basket.
- Be specific: numbers, sizes, hex codes, font names, exact wording. "12px radius on cards" beats "rounded corners".
- Notes are one line, under 90 characters, written as an instruction.
- Colors: kind "color", a #RRGGBB hex and a role. Only in the Color basket.
- Fonts: kind "font", an exact Google Fonts family name and a role. Only in the Typography basket.
- Everything else: kind "note".
- For fields that do not apply, use an empty string.
- Give 4 to 8 suggestions.`

export interface AiContext {
  project: Project
  basket: Basket
  baskets: Basket[]
  items: Item[]
}

const line = (s: string) => s.replace(/\s+/g, ' ').trim()

function describeItem(i: Item): string {
  switch (i.kind) {
    case 'color':
      return `color ${i.hex}${i.colorRole ? ` (${i.colorRole})` : ''}${i.note ? `: ${line(i.note)}` : ''}`
    case 'font':
      return `font ${i.fontFamily}${i.fontRole ? ` (${i.fontRole})` : ''}${i.note ? `: ${line(i.note)}` : ''}`
    case 'link':
      return `link ${i.url}${i.note ? `: ${line(i.note)}` : ''}`
    case 'image':
      return `image${i.note ? `: ${line(i.note)}` : ' (no note)'}`
    default:
      return `note: ${line(i.note)}`
  }
}

/** The text part of the request: brief, other baskets, and this basket's current items. */
export function buildContextText({ project, basket, baskets, items }: AiContext, imageCount: number): string {
  const L: string[] = []
  L.push(`Project: ${project.name}`)
  if (project.description.trim()) L.push(`What they are building: ${line(project.description)}`)
  if (project.audience.trim()) L.push(`Audience: ${line(project.audience)}`)
  L.push(`Platform: ${project.platform}`)
  L.push('', 'Other baskets:')
  for (const b of [...baskets].sort((a, z) => a.order - z.order)) {
    if (b.id === basket.id) continue
    const its = items.filter((i) => i.basketId === b.id)
    if (!its.length && !b.summary.trim()) continue
    L.push(`## ${b.label}${b.summary.trim() ? ` (rule: ${line(b.summary)})` : ''}`)
    for (const i of its.slice(0, 12)) L.push(`- ${i.priority.toUpperCase()}: ${describeItem(i)}`)
  }
  const mine = items.filter((i) => i.basketId === basket.id)
  L.push('', `Basket to fill: ${basket.label}${basket.summary.trim() ? ` (rule: ${line(basket.summary)})` : ''}`)
  if (mine.length) for (const i of mine) L.push(`- ${i.priority.toUpperCase()}: ${describeItem(i)}`)
  else L.push('- (empty)')
  if (imageCount) L.push('', `The ${imageCount} image(s) above are references already in the ${basket.label} basket.`)
  L.push('', `Suggest what the ${basket.label} basket is missing.`)
  return L.join('\n')
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'note', 'hex', 'colorRole', 'fontFamily', 'fontRole'],
        properties: {
          kind: { type: 'string', enum: ['note', 'color', 'font'] },
          note: { type: 'string' },
          hex: { type: 'string' },
          colorRole: { type: 'string', enum: [...COLOR_ROLES, ''] },
          fontFamily: { type: 'string' },
          fontRole: { type: 'string', enum: [...FONT_ROLES, ''] },
        },
      },
    },
  },
} as const

interface RawSuggestion {
  kind?: string
  note?: string
  hex?: string
  colorRole?: string
  fontFamily?: string
  fontRole?: string
}

/** Turn Claude's JSON into safe suggestions: fix hex/font names, drop invalid or duplicate ones. */
export function parseSuggestions(json: string, basketSlug: string, existing: Item[]): Suggestion[] {
  let data: { suggestions?: RawSuggestion[] }
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  const have = new Set(existing.map(keyOfItem))
  const out: Suggestion[] = []
  for (const r of Array.isArray(data?.suggestions) ? data.suggestions : []) {
    const note = line(String(r.note ?? '')).slice(0, 200)
    let s: Suggestion | null = null
    if (r.kind === 'color') {
      const hex = normalizeHex(String(r.hex ?? ''))
      const role = COLOR_ROLES.includes(r.colorRole as ColorRole) ? (r.colorRole as ColorRole) : undefined
      if (hex) s = { key: `c:${hex}:${role ?? ''}`, kind: 'color', hex, colorRole: role, note }
    } else if (r.kind === 'font' && basketSlug === 'typography') {
      const fam = line(String(r.fontFamily ?? ''))
      const role = FONT_ROLES.includes(r.fontRole as FontRole) ? (r.fontRole as FontRole) : undefined
      if (fam) s = { key: `f:${matchGoogleFont(fam) ?? fam}:${role ?? ''}`, kind: 'font', fontFamily: matchGoogleFont(fam) ?? fam, fontRole: role, note }
    } else if (note) {
      s = { key: `n:${note.toLowerCase()}`, kind: 'note', note }
    }
    if (s && !have.has(s.key) && !out.some((o) => o.key === s.key)) out.push(s)
  }
  return out.slice(0, 10)
}

// ---- the call ----

export type AiErrorKind = 'aborted' | 'no-key' | 'bad-key' | 'no-access' | 'rate-limit' | 'overloaded' | 'offline' | 'refused' | 'empty' | 'unknown'

export class AiError extends Error {
  kind: AiErrorKind
  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export const AI_ERROR_TEXT: Record<AiErrorKind, string> = {
  aborted: 'Cancelled.',
  'no-key': 'Add your Anthropic API key in Settings to ask Claude.',
  'bad-key': 'Claude rejected this API key. Check it in Settings.',
  'no-access': 'This API key has no access to that model. Pick another model in Settings.',
  'rate-limit': 'Too many requests right now. Wait a minute and try again.',
  overloaded: 'Claude is busy right now. Try again in a moment.',
  offline: "Can't reach Claude. Check your connection.",
  refused: 'Claude declined to answer this one. Try different notes.',
  empty: 'Claude had nothing new to add for this basket.',
  unknown: 'Something went wrong asking Claude. Try again.',
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const OK_MIME: ImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function askClaude(
  ctx: AiContext,
  settings: AiSettings,
  loadImage: (id: string) => Promise<{ blob: Blob; mime: string } | undefined>,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  if (!settings.apiKey.trim()) throw new AiError('no-key', AI_ERROR_TEXT['no-key'])

  const images: Anthropic.Beta.BetaImageBlockParam[] = []
  if (settings.sendImages) {
    const mine = ctx.items.filter((i) => i.basketId === ctx.basket.id && i.kind === 'image' && i.imageBlobId)
    for (const it of mine.slice(0, MAX_IMAGES)) {
      const img = await loadImage(it.imageBlobId!)
      if (!img || !OK_MIME.includes(img.mime as ImageMime)) continue
      images.push({ type: 'image', source: { type: 'base64', media_type: img.mime as ImageMime, data: await blobToBase64(img.blob) } })
    }
  }

  // loaded on first use so the SDK stays out of the main bundle
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 })
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await client.beta.messages.create(
      {
        model: settings.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> } },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [...images, { type: 'text', text: buildContextText(ctx, images.length) }] }],
      },
      { signal },
    )
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError || signal?.aborted) throw new AiError('aborted', 'Cancelled')
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('bad-key', AI_ERROR_TEXT['bad-key'])
    if (e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.NotFoundError) throw new AiError('no-access', AI_ERROR_TEXT['no-access'])
    if (e instanceof Anthropic.RateLimitError) throw new AiError('rate-limit', AI_ERROR_TEXT['rate-limit'])
    if (e instanceof Anthropic.InternalServerError) throw new AiError('overloaded', AI_ERROR_TEXT.overloaded)
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('offline', AI_ERROR_TEXT.offline)
    console.error(e)
    throw new AiError('unknown', AI_ERROR_TEXT.unknown)
  }
  if (res.stop_reason === 'refusal') throw new AiError('refused', AI_ERROR_TEXT.refused)
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const list = parseSuggestions(text, ctx.basket.slug, ctx.items.filter((i) => i.basketId === ctx.basket.id))
  if (!list.length) throw new AiError('empty', AI_ERROR_TEXT.empty)
  return list
}
