import { describe, expect, it } from 'vitest'
import { findColors, hslToHex, normalizeHex } from './color'
import { parseInput } from './parse'
import { generateBrief, generatePasteText, generateTokens, generateTokensCss, planImages } from './brief'
import type { Basket, Item, Project } from '../types'
import { detectMood, suggestFor } from './suggest'

const project: Project = { id: 'p', name: 'FinDorm', description: 'A dorm finance app.', audience: '', platform: 'web', createdAt: 0, updatedAt: 0 }
const mk = (slug: string, label: string, order: number, summary = ''): Basket => ({ id: slug, slug, projectId: 'p', label, color: '#000', order, summary, isCustom: false, hidden: false })
const baskets = [mk('brand', 'Brand & Identity', 0), mk('typography', 'Typography', 1), mk('color', 'Color', 2), mk('motion', 'Motion', 3), mk('direction', 'Overall Direction', 4, 'Calm and editorial')]
let n = 0
const mkItem = (o: Partial<Item> & Pick<Item, 'basketId' | 'kind'>): Item => ({ id: `i${n++}`, projectId: 'p', priority: 'inspiration', note: '', order: n, createdAt: 0, ...o })

describe('colors', () => {
  it('normalizes hex', () => {
    expect(normalizeHex('#fff')).toBe('#FFFFFF')
    expect(normalizeHex('1e3a5f')).toBe('#1E3A5F')
    expect(normalizeHex('#ggg')).toBeNull()
  })
  it('parses hex, rgb, hsl', () => {
    expect(findColors('#FF5733 #1E3A5F').map((c) => c.hex)).toEqual(['#FF5733', '#1E3A5F'])
    expect(findColors('rgb(255, 0, 0)')[0].hex).toBe('#FF0000')
    expect(findColors('hsl(120, 100%, 50%)')[0].hex).toBe('#00FF00')
    expect(hslToHex(0, 0, 100)).toBe('#FFFFFF')
  })
})

describe('parseInput', () => {
  it('makes two swatches from one line', () => {
    const r = parseInput('#FF5733 #1E3A5F', 'color')
    expect(r.map((x) => [x.kind, x.hex])).toEqual([['color', '#FF5733'], ['color', '#1E3A5F']])
  })
  it('keeps leftover text as note for a single colour', () => {
    expect(parseInput('main buttons #1E3A5F', 'color')[0].note).toBe('main buttons')
  })
  it('detects known fonts only in typography', () => {
    expect(parseInput('fraunces', 'typography')[0]).toMatchObject({ kind: 'font', fontFamily: 'Fraunces' })
    expect(parseInput('Fraunces + IBM Plex Sans', 'typography').length).toBe(2)
    expect(parseInput('Fraunces', 'brand')[0].kind).toBe('note')
    expect(parseInput('Fraunces for headings', 'typography')[0].kind).toBe('note')
  })
  it('detects links', () => {
    expect(parseInput('https://linear.app', 'navigation')[0]).toMatchObject({ kind: 'link', url: 'https://linear.app' })
    expect(parseInput('www.stripe.com', 'x')[0].url).toBe('https://www.stripe.com')
  })
  it('ignores blanks', () => expect(parseInput('  ', 'x')).toEqual([]))
})

describe('export', () => {
  const items: Item[] = [
    mkItem({ basketId: 'color', kind: 'color', hex: '#1E3A5F', colorRole: 'primary', priority: 'rule', note: 'main buttons' }),
    mkItem({ basketId: 'color', kind: 'color', hex: '#111111', colorRole: 'primary', priority: 'inspiration' }),
    mkItem({ basketId: 'color', kind: 'color', hex: '#FF00FF', colorRole: 'accent', priority: 'avoid' }),
    mkItem({ basketId: 'typography', kind: 'font', fontFamily: 'Fraunces', fontRole: 'display', priority: 'rule' }),
    mkItem({ basketId: 'brand', kind: 'image', imageBlobId: 'b1', note: 'Thin wordmark logo', priority: 'rule' }),
    mkItem({ basketId: 'brand', kind: 'image', imageBlobId: 'b2', note: '', priority: 'avoid' }),
    mkItem({ basketId: 'direction', kind: 'note', note: 'Quiet, lots of whitespace', priority: 'rule' }),
  ]
  const input = { project, baskets, items, mimes: { b1: 'image/webp', b2: 'image/jpeg' }, exportedAt: new Date('2026-01-01T00:00:00Z') }

  it('names images NN-slug-priority.ext', () => {
    expect(planImages(input).map((p) => p.path)).toEqual([
      'references/brand/01-thin-wordmark-logo-rule.webp',
      'references/brand/02-image-avoid.jpg',
    ])
  })
  it('brief has the required shape', () => {
    const md = generateBrief(input)
    expect(md.startsWith('# Design Brief: FinDorm')).toBe(true)
    expect(md).toContain('## How to use this brief')
    expect(md.indexOf('## Overall Direction')).toBeLessThan(md.indexOf('## Color'))
    expect(md.indexOf('## Color')).toBeLessThan(md.indexOf('## Typography'))
    expect(md).toContain('| primary | #1E3A5F | RULE | main buttons |')
    expect(md).toContain('| Role | Family | Priority | Note |')
    expect(md).toContain('- RULE: Thin wordmark logo — see `references/brand/01-thin-wordmark-logo-rule.webp`')
    expect(md).toMatch(/## Avoid list[\s\S]*#FF00FF/)
    expect(md).toContain('- No references for Motion — use subtle, fast transitions (150–250ms) and respect prefers-reduced-motion.')
    expect(md).not.toContain('No references for Color')
  })
  it('tokens: rule wins, avoid excluded, only roles', () => {
    const t = generateTokens(input)
    expect(t.color).toEqual({ primary: '#1E3A5F' })
    expect(t.font).toEqual({ display: 'Fraunces' })
    expect(t.meta).toEqual({ project: 'FinDorm', exportedAt: '2026-01-01T00:00:00.000Z', version: 1 })
    const css = generateTokensCss(t)
    expect(css).toContain('--color-primary: #1E3A5F;')
    expect(css).toContain('--font-display: "Fraunces"')
  })
  it('paste text includes the description', () => {
    expect(generatePasteText(project)).toContain('What to build: A dorm finance app.')
  })
})

describe('suggestions', () => {
  it('detects mood from the user words', () => {
    expect(detectMood('Quiet, editorial, lots of whitespace, serif headlines')).toBe('editorial')
    expect(detectMood('A fintech dashboard for developers')).toBe('tech')
    expect(detectMood('hello')).toBeNull()
  })
  it('puts mood suggestions first and hides ones already added', () => {
    const s = suggestFor('color', 'editorial', [])
    expect(s[0]).toMatchObject({ kind: 'color', hex: '#1A1A1A', colorRole: 'text' })
    const added = mkItem({ basketId: 'color', kind: 'color', hex: '#1A1A1A', colorRole: 'text' })
    expect(suggestFor('color', 'editorial', [added]).some((x) => x.hex === '#1A1A1A')).toBe(false)
    expect(suggestFor('color', null, []).every((x) => x.kind === 'note')).toBe(true)
  })
  it('offers mood picks in Overall Direction and nothing for custom baskets', () => {
    expect(suggestFor('direction', null, []).length).toBe(7)
    expect(suggestFor('my-custom', 'playful', [])).toEqual([])
  })
})
