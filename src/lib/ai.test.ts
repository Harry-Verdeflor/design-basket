// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildContextText, parseSuggestions, askClaude, AiError } from './ai'
import { nextOpen, FINISH } from './stack'
import type { Basket, Item, Project } from '../types'

const project: Project = { id: 'p', name: 'FinDorm', description: 'Shared expenses for dorms.', audience: 'students', platform: 'mobile', createdAt: 0, updatedAt: 0 }
const b = (slug: string, order: number, status?: Basket['status']): Basket => ({ id: slug, slug, projectId: 'p', label: slug, color: '#000', order, summary: '', isCustom: false, hidden: false, status })
const item = (o: Partial<Item> & Pick<Item, 'basketId' | 'kind'>): Item => ({ id: Math.random().toString(), projectId: 'p', priority: 'inspiration', note: '', order: 0, createdAt: 0, ...o })

describe('parseSuggestions', () => {
  it('keeps valid items and fixes hex and font names', () => {
    const json = JSON.stringify({
      suggestions: [
        { kind: 'color', note: 'buttons', hex: '1e3a5f', colorRole: 'primary', fontFamily: '', fontRole: '' },
        { kind: 'color', note: 'bad', hex: 'blue', colorRole: 'accent', fontFamily: '', fontRole: '' },
        { kind: 'font', note: '', hex: '', colorRole: '', fontFamily: 'fraunces', fontRole: 'display' },
        { kind: 'note', note: '  Cards use 12px radius  ', hex: '', colorRole: '', fontFamily: '', fontRole: '' },
        { kind: 'note', note: 'cards use 12px radius', hex: '', colorRole: '', fontFamily: '', fontRole: '' },
        { kind: 'note', note: '', hex: '', colorRole: '', fontFamily: '', fontRole: '' },
      ],
    })
    const out = parseSuggestions(json, 'typography', [])
    expect(out.map((s) => [s.kind, s.hex ?? s.fontFamily ?? s.note])).toEqual([
      ['color', '#1E3A5F'],
      ['font', 'Fraunces'],
      ['note', 'Cards use 12px radius'],
    ])
    expect(out[0].colorRole).toBe('primary')
  })
  it('drops fonts outside Typography, things already in the basket, and bad JSON', () => {
    const json = JSON.stringify({ suggestions: [{ kind: 'font', note: '', hex: '', colorRole: '', fontFamily: 'Inter', fontRole: 'body' }, { kind: 'note', note: 'Existing', hex: '', colorRole: '', fontFamily: '', fontRole: '' }] })
    expect(parseSuggestions(json, 'brand', [item({ basketId: 'brand', kind: 'note', note: 'existing' })])).toEqual([])
    expect(parseSuggestions('not json', 'brand', [])).toEqual([])
  })
})

describe('buildContextText', () => {
  it('includes the brief, other baskets, and the target basket', () => {
    const baskets = [b('direction', 0), b('color', 1), b('motion', 2)]
    baskets[0].summary = 'calm and editorial'
    const items = [item({ basketId: 'direction', kind: 'note', note: 'Lots of whitespace', priority: 'rule' }), item({ basketId: 'color', kind: 'color', hex: '#1E3A5F', colorRole: 'primary' })]
    const t = buildContextText({ project, basket: baskets[1], baskets, items }, 2)
    expect(t).toContain('What they are building: Shared expenses for dorms.')
    expect(t).toContain('## direction (rule: calm and editorial)')
    expect(t).toContain('- RULE: note: Lots of whitespace')
    expect(t).toContain('Basket to fill: color')
    expect(t).toContain('- INSPIRATION: color #1E3A5F (primary)')
    expect(t).toContain('The 2 image(s) above')
    expect(t).not.toContain('## motion')
  })
})

describe('askClaude', () => {
  it('refuses to call without a key', async () => {
    const baskets = [b('color', 0)]
    await expect(askClaude({ project, basket: baskets[0], baskets, items: [] }, { apiKey: ' ', model: 'claude-sonnet-5-5', sendImages: true }, async () => undefined)).rejects.toBeInstanceOf(AiError)
  })
})

describe('nextOpen', () => {
  const bs = [b('a', 0), b('b', 1), b('c', 2), b('d', 3)]
  it('goes to the next todo folder, wrapping around', () => {
    expect(nextOpen(bs, 'a', { a: 'done' })).toBe('b')
    expect(nextOpen(bs, 'b', { b: 'done', c: 'skipped' })).toBe('d')
    expect(nextOpen(bs, 'd', { d: 'done' })).toBe('a')
  })
  it('returns FINISH when every folder is sorted', () => {
    expect(nextOpen(bs, 'c', { a: 'done', b: 'skipped', c: 'done', d: 'done' })).toBe(FINISH)
  })
})
