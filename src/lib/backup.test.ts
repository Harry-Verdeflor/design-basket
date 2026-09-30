// @vitest-environment node
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { addFromText, createProject, db, deleteItem, moveItem, restoreItem, updateItem, uid } from '../db'
import { buildBackup, buildClaudePack, importBackup } from './zip'
import { fitWithin } from './images'

describe('db + backup', () => {
  it('round-trips a project through .basket.zip without touching the original', async () => {
    const p = await createProject('Round trip')
    const baskets = await db.baskets.where('projectId').equals(p.id).toArray()
    expect(baskets).toHaveLength(12)
    const color = baskets.find((b) => b.slug === 'color')!
    const brand = baskets.find((b) => b.slug === 'brand')!

    const [a] = await addFromText(color, '#1E3A5F main buttons')
    await updateItem(a.id, { colorRole: 'primary', priority: 'rule' })
    const imgId = uid()
    await db.images.add({ id: imgId, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), mime: 'image/webp' })
    await db.items.add({ id: uid(), basketId: brand.id, projectId: p.id, kind: 'image', priority: 'avoid', note: 'no gradients', imageBlobId: imgId, order: 0, createdAt: 0 })

    const { blob } = await buildBackup(p.id)
    const before = await db.projects.count()
    const newId = await importBackup(blob)
    expect(await db.projects.count()).toBe(before + 1)
    expect(newId).not.toBe(p.id)

    const items = await db.items.where('projectId').equals(newId).toArray()
    expect(items).toHaveLength(2)
    expect(items.find((i) => i.kind === 'color')).toMatchObject({ hex: '#1E3A5F', colorRole: 'primary', priority: 'rule', note: 'main buttons' })
    const img = items.find((i) => i.kind === 'image')!
    expect(img).toMatchObject({ priority: 'avoid', note: 'no gradients' })
    expect(img.imageBlobId).not.toBe(imgId)
    expect((await db.images.get(img.imageBlobId!))!.mime).toBe('image/webp')
    expect(await db.items.where('projectId').equals(p.id).count()).toBe(2)
  })

  it('rejects files that are not backups', async () => {
    const z = new JSZip()
    z.file('hello.txt', 'hi')
    await expect(importBackup(await z.generateAsync({ type: 'blob' }))).rejects.toThrow(/backup/i)
  })

  it('exports the pack folder structure', async () => {
    const p = await createProject('Pack test')
    const b = (await db.baskets.where('projectId').equals(p.id).toArray()).find((x) => x.slug === 'brand')!
    const imgId = uid()
    await db.images.add({ id: imgId, blob: new Blob([new Uint8Array([9])], { type: 'image/webp' }), mime: 'image/webp' })
    await db.items.add({ id: uid(), basketId: b.id, projectId: p.id, kind: 'image', priority: 'rule', note: 'Logo', imageBlobId: imgId, order: 0, createdAt: 0 })
    const { blob, filename } = await buildClaudePack(p.id)
    expect(filename).toBe('design-pack-pack-test.zip')
    const names = Object.keys((await JSZip.loadAsync(blob)).files).filter((n) => !n.endsWith('/')).sort()
    expect(names).toEqual([
      'design-pack/DESIGN.md',
      'design-pack/PASTE_INTO_CLAUDE_CODE.txt',
      'design-pack/design-tokens.json',
      'design-pack/references/brand/01-logo-rule.webp',
      'design-pack/tokens.css',
    ])
  })

  it('moves items between and within baskets, renumbering orders; delete is undoable', async () => {
    const p = await createProject('Move')
    const [b1, b2] = await db.baskets.where('projectId').equals(p.id).sortBy('order')
    const [x, y, z] = [...(await addFromText(b1, 'one')), ...(await addFromText(b1, 'two')), ...(await addFromText(b1, 'three'))]
    await moveItem(z.id, b1.id, 0)
    expect((await db.items.where('basketId').equals(b1.id).sortBy('order')).map((i) => i.note)).toEqual(['three', 'one', 'two'])
    await moveItem(x.id, b2.id, 0)
    expect((await db.items.where('basketId').equals(b1.id).sortBy('order')).map((i) => [i.note, i.order])).toEqual([['three', 0], ['two', 1]])
    expect((await db.items.where('basketId').equals(b2.id).toArray()).map((i) => i.note)).toEqual(['one'])
    const gone = await deleteItem(y.id)
    expect(await db.items.get(y.id)).toBeUndefined()
    await restoreItem(gone)
    expect((await db.items.get(y.id))?.note).toBe('two')
  })

  it('fits images to 1600px longest side', () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1000, 4000)).toEqual({ width: 400, height: 1600 })
  })
})

describe('folder redesign', () => {
  it('starts new projects with Overall Direction first in the new colors', async () => {
    const p = await createProject('Order')
    const bs = await db.baskets.where('projectId').equals(p.id).sortBy('order')
    expect(bs[0]).toMatchObject({ slug: 'direction', color: '#F9C74F' })
  })
  it('recolors untouched default baskets when upgrading an old database', async () => {
    const { default: Dexie } = await import('dexie')
    const name = 'legacy-' + Math.random()
    const old = new Dexie(name)
    old.version(2).stores({ projects: 'id, createdAt, updatedAt', baskets: 'id, projectId, order', items: 'id, basketId, projectId, order', images: 'id' })
    await old.table('baskets').bulkAdd([
      { id: 'b1', slug: 'brand', projectId: 'p', label: 'Brand', color: '#B5533C', order: 0, summary: '', isCustom: false, hidden: false },
      { id: 'b2', slug: 'color', projectId: 'p', label: 'Color', color: '#123456', order: 1, summary: '', isCustom: false, hidden: false },
    ])
    old.close()
    const { BasketDB } = await import('../db')
    const fresh = new BasketDB(name)
    expect((await fresh.baskets.get('b1'))!.color).toBe('#F25F5C')
    expect((await fresh.baskets.get('b2'))!.color).toBe('#123456')
    fresh.close()
  })
})
