import Dexie, { type Table } from 'dexie'
import type { Basket, BasketStatus, Item, Project, StoredImage } from './types'
import { DEFAULT_BASKETS, LEGACY_COLORS, defaultFor } from './lib/defaults'
import { slugify } from './lib/slug'
import { parseInput } from './lib/parse'
import { compressImage } from './lib/images'
import type { Suggestion } from './lib/suggest'

export class BasketDB extends Dexie {
  projects!: Table<Project, string>
  baskets!: Table<Basket, string>
  items!: Table<Item, string>
  images!: Table<StoredImage, string>
  constructor(name = 'design-basket') {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt',
      baskets: 'id, projectId, order',
      items: 'id, basketId, projectId, order',
      images: 'id',
    })
    this.version(2).stores({
      projects: 'id, createdAt, updatedAt',
      baskets: 'id, projectId, order',
      items: 'id, basketId, projectId, order',
      images: 'id',
    })
    // v3: folder redesign. Recolor untouched default baskets to the new palette.
    this.version(3).upgrade((tx) =>
      tx.table('baskets').toCollection().modify((b: Basket) => {
        if (!b.isCustom && LEGACY_COLORS[b.slug] === b.color) b.color = defaultFor(b.slug)?.color ?? b.color
        if (b.isCustom && b.color === '#8A8170') b.color = '#C9ADA7'
      }),
    )
  }
}

export const db = new BasketDB()
export const uid = () => crypto.randomUUID()

function makeBaskets(projectId: string): Basket[] {
  return DEFAULT_BASKETS.map((d, order) => ({
    id: uid(), slug: d.slug, projectId, label: d.label, color: d.color, order,
    summary: '', isCustom: false, hidden: false,
  }))
}

export async function createProject(name = 'Untitled project'): Promise<Project> {
  const now = Date.now()
  const p: Project = { id: uid(), name, description: '', audience: '', platform: 'web', createdAt: now, updatedAt: now }
  await db.transaction('rw', db.projects, db.baskets, async () => {
    await db.projects.add(p)
    await db.baskets.bulkAdd(makeBaskets(p.id))
  })
  return p
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
}

const touch = (id: string) => db.projects.update(id, { updatedAt: Date.now() })

export async function duplicateProject(id: string, name?: string): Promise<string> {
  const p = await db.projects.get(id)
  if (!p) throw new Error('Project not found')
  const [baskets, items] = await Promise.all([
    db.baskets.where('projectId').equals(id).toArray(),
    db.items.where('projectId').equals(id).toArray(),
  ])
  const now = Date.now()
  const np: Project = { ...p, id: uid(), name: name ?? `${p.name} copy`, createdAt: now, updatedAt: now }
  const bmap = new Map(baskets.map((b) => [b.id, uid()]))
  const imgMap = new Map<string, string>()
  await db.transaction('rw', db.projects, db.baskets, db.items, db.images, async () => {
    await db.projects.add(np)
    await db.baskets.bulkAdd(baskets.map((b) => ({ ...b, id: bmap.get(b.id)!, projectId: np.id })))
    const newItems: Item[] = []
    for (const i of items) {
      let imageBlobId = i.imageBlobId
      if (imageBlobId) {
        if (!imgMap.has(imageBlobId)) {
          const img = await db.images.get(imageBlobId)
          const nid = uid()
          if (img) await db.images.add({ ...img, id: nid })
          imgMap.set(imageBlobId, nid)
        }
        imageBlobId = imgMap.get(imageBlobId)
      }
      newItems.push({ ...i, id: uid(), projectId: np.id, basketId: bmap.get(i.basketId)!, imageBlobId })
    }
    await db.items.bulkAdd(newItems)
  })
  return np.id
}

async function removeImages(ids: (string | undefined)[]) {
  for (const id of new Set(ids.filter(Boolean) as string[])) {
    const still = await db.items.filter((i) => i.imageBlobId === id).count()
    if (!still) await db.images.delete(id)
  }
}

export interface DeletedProject {
  project: Project
  baskets: Basket[]
  items: Item[]
  images: StoredImage[]
}

export async function deleteProject(id: string): Promise<DeletedProject> {
  const project = (await db.projects.get(id))!
  const baskets = await db.baskets.where('projectId').equals(id).toArray()
  const items = await db.items.where('projectId').equals(id).toArray()
  const images = (await db.images.bulkGet(items.map((i) => i.imageBlobId).filter(Boolean) as string[])).filter(Boolean) as StoredImage[]
  await db.transaction('rw', db.projects, db.baskets, db.items, db.images, async () => {
    await db.items.where('projectId').equals(id).delete()
    await db.baskets.where('projectId').equals(id).delete()
    await db.images.bulkDelete(images.map((i) => i.id))
    await db.projects.delete(id)
  })
  return { project, baskets, items, images }
}

export async function restoreProject(d: DeletedProject) {
  await db.transaction('rw', db.projects, db.baskets, db.items, db.images, async () => {
    await db.projects.put(d.project)
    await db.baskets.bulkPut(d.baskets)
    await db.images.bulkPut(d.images)
    await db.items.bulkPut(d.items)
  })
}

// ---- baskets ----

export async function updateBasket(id: string, patch: Partial<Basket>) {
  await db.baskets.update(id, patch)
}

export async function setBasketStatus(id: string, status: BasketStatus) {
  await db.baskets.update(id, { status })
}

export async function addCustomBasket(projectId: string, label: string): Promise<Basket> {
  const all = await db.baskets.where('projectId').equals(projectId).toArray()
  const base = slugify(label) || 'custom'
  let slug = base
  for (let n = 2; all.some((b) => b.slug === slug); n++) slug = `${base}-${n}`
  const b: Basket = {
    id: uid(), slug, projectId, label, color: '#C9ADA7',
    order: Math.max(-1, ...all.map((x) => x.order)) + 1, summary: '', isCustom: true, hidden: false,
  }
  await db.baskets.add(b)
  await touch(projectId)
  return b
}

export async function moveBasket(projectId: string, id: string, dir: -1 | 1) {
  const all = (await db.baskets.where('projectId').equals(projectId).toArray()).sort((a, b) => a.order - b.order)
  const i = all.findIndex((b) => b.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return
  ;[all[i], all[j]] = [all[j], all[i]]
  await db.baskets.bulkPut(all.map((b, order) => ({ ...b, order })))
}

export async function deleteBasket(id: string): Promise<{ basket: Basket; items: Item[] }> {
  const basket = (await db.baskets.get(id))!
  const items = await db.items.where('basketId').equals(id).toArray()
  await db.transaction('rw', db.baskets, db.items, async () => {
    await db.items.bulkDelete(items.map((i) => i.id))
    await db.baskets.delete(id)
  })
  return { basket, items }
}

export async function restoreBasket(d: { basket: Basket; items: Item[] }) {
  await db.transaction('rw', db.baskets, db.items, async () => {
    await db.baskets.put(d.basket)
    await db.items.bulkPut(d.items)
  })
}

/** Remove every item in a basket. Returns them so the caller can offer undo. */
export async function clearBasket(id: string): Promise<Item[]> {
  const items = await db.items.where('basketId').equals(id).toArray()
  await db.items.bulkDelete(items.map((i) => i.id))
  return items
}

// ---- items ----

async function nextOrder(basketId: string): Promise<number> {
  const last = await db.items.where('basketId').equals(basketId).reverse().sortBy('order')
  return last.length ? last[0].order + 1 : 0
}

const baseItem = (basketId: string, projectId: string) => ({
  id: uid(), basketId, projectId, priority: 'inspiration' as const, createdAt: Date.now(),
})

/** Smart-parse typed text into notes / colours / fonts / links. Returns the created items. */
export async function addFromText(basket: Basket, text: string): Promise<Item[]> {
  const drafts = parseInput(text, basket.slug)
  if (!drafts.length) return []
  let order = await nextOrder(basket.id)
  const items: Item[] = drafts.map((d) => ({ ...baseItem(basket.id, basket.projectId), ...d, order: order++ }))
  await db.items.bulkAdd(items)
  await touch(basket.projectId)
  return items
}

export async function addSuggestion(basket: Basket, s: Suggestion): Promise<Item> {
  const { key: _key, ...fields } = s
  void _key
  const item: Item = { ...baseItem(basket.id, basket.projectId), ...fields, order: await nextOrder(basket.id) }
  await db.items.add(item)
  await touch(basket.projectId)
  return item
}

export interface ImportResult {
  added: Item[]
  failed: string[]
}

export async function addImages(basket: Basket, files: File[]): Promise<ImportResult> {
  const added: Item[] = []
  const failed: string[] = []
  let order = await nextOrder(basket.id)
  for (const f of files) {
    try {
      if (!f.type.startsWith('image/')) throw new Error('not an image')
      const c = await compressImage(f)
      const imgId = uid()
      const item: Item = {
        ...baseItem(basket.id, basket.projectId), kind: 'image', note: '',
        imageBlobId: imgId, width: c.width, height: c.height, order: order++,
      }
      await db.transaction('rw', db.images, db.items, async () => {
        await db.images.add({ id: imgId, blob: c.blob, mime: c.mime })
        await db.items.add(item)
      })
      added.push(item)
    } catch {
      failed.push(f.name || 'pasted image')
    }
  }
  if (added.length) await touch(basket.projectId)
  return { added, failed }
}

export async function updateItem(id: string, patch: Partial<Item>) {
  await db.items.update(id, patch)
}

export async function deleteItem(id: string): Promise<{ item: Item; image?: StoredImage }> {
  const item = (await db.items.get(id))!
  const image = item.imageBlobId ? await db.images.get(item.imageBlobId) : undefined
  await db.transaction('rw', db.items, db.images, async () => {
    await db.items.delete(id)
    await removeImages([item.imageBlobId])
  })
  return { item, image }
}

export async function restoreItem(d: { item: Item; image?: StoredImage }) {
  await db.transaction('rw', db.items, db.images, async () => {
    if (d.image) await db.images.put(d.image)
    await db.items.put(d.item)
  })
}

export async function restoreItems(items: Item[]) {
  await db.items.bulkPut(items)
}

export async function duplicateItem(id: string): Promise<Item> {
  const it = (await db.items.get(id))!
  let imageBlobId = it.imageBlobId
  if (imageBlobId) {
    const img = await db.images.get(imageBlobId)
    if (img) {
      imageBlobId = uid()
      await db.images.add({ ...img, id: imageBlobId })
    }
  }
  // insert right after the original: shift later items by one
  const later = (await db.items.where('basketId').equals(it.basketId).toArray()).filter((i) => i.order > it.order)
  const copy: Item = { ...it, id: uid(), imageBlobId, order: it.order + 1, createdAt: Date.now() }
  await db.transaction('rw', db.items, async () => {
    await db.items.bulkPut(later.map((i) => ({ ...i, order: i.order + 1 })))
    await db.items.add(copy)
  })
  return copy
}

/** Move an item to `basketId` at `index` (within that basket's current order) and renumber. */
export async function moveItem(itemId: string, basketId: string, index: number) {
  await db.transaction('rw', db.items, async () => {
    const it = await db.items.get(itemId)
    if (!it) return
    const target = (await db.items.where('basketId').equals(basketId).toArray())
      .filter((i) => i.id !== itemId)
      .sort((a, b) => a.order - b.order)
    target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...it, basketId })
    await db.items.bulkPut(target.map((i, order) => ({ ...i, order })))
    if (it.basketId !== basketId) {
      const src = (await db.items.where('basketId').equals(it.basketId).toArray()).sort((a, b) => a.order - b.order)
      await db.items.bulkPut(src.map((i, order) => ({ ...i, order })))
    }
  })
}
