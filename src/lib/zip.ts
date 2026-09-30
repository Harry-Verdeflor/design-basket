import JSZip from 'jszip'
import { db, uid } from '../db'
import type { Basket, Item, Project } from '../types'
import { generateBrief, generatePasteText, generateTokens, generateTokensCss, planImages, type PackInput } from './brief'
import { extForMime, slugify } from './slug'

export interface ProjectData {
  project: Project
  baskets: Basket[]
  items: Item[]
}

export async function loadProject(projectId: string): Promise<ProjectData> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Project not found')
  const [baskets, items] = await Promise.all([
    db.baskets.where('projectId').equals(projectId).toArray(),
    db.items.where('projectId').equals(projectId).toArray(),
  ])
  return { project, baskets, items }
}

const bytes = (b: Blob) => b.arrayBuffer()

async function mimesFor(items: Item[]): Promise<Record<string, string>> {
  const ids = items.map((i) => i.imageBlobId).filter(Boolean) as string[]
  const imgs = await db.images.bulkGet(ids)
  const m: Record<string, string> = {}
  imgs.forEach((img) => {
    if (img) m[img.id] = img.mime
  })
  return m
}

export async function buildBriefText(projectId: string): Promise<string> {
  const d = await loadProject(projectId)
  return generateBrief({ ...d, mimes: await mimesFor(d.items) })
}

export async function buildPasteText(projectId: string): Promise<string> {
  return generatePasteText((await loadProject(projectId)).project)
}

/** The Claude Code pack: DESIGN.md, tokens, references/<basket>/*, paste text, all under design-pack/. */
export async function buildClaudePack(projectId: string): Promise<{ blob: Blob; filename: string; pasteText: string }> {
  const d = await loadProject(projectId)
  const input: PackInput = { ...d, mimes: await mimesFor(d.items) }
  const tokens = generateTokens(input)
  const pasteText = generatePasteText(d.project)
  const zip = new JSZip()
  const root = zip.folder('design-pack')!
  root.file('DESIGN.md', generateBrief(input))
  root.file('design-tokens.json', JSON.stringify(tokens, null, 2) + '\n')
  root.file('tokens.css', generateTokensCss(tokens))
  root.file('PASTE_INTO_CLAUDE_CODE.txt', pasteText)
  for (const p of planImages(input)) {
    const img = await db.images.get(p.blobId)
    if (img) root.file(p.path, await bytes(img.blob))
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, filename: `design-pack-${slugify(d.project.name) || 'project'}.zip`, pasteText }
}

const BACKUP_VERSION = 1

export async function buildBackup(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const d = await loadProject(projectId)
  const zip = new JSZip()
  const imgs = new Set(d.items.map((i) => i.imageBlobId).filter(Boolean) as string[])
  const files: Record<string, string> = {}
  for (const id of imgs) {
    const img = await db.images.get(id)
    if (!img) continue
    const path = `images/${id}.${extForMime(img.mime)}`
    files[id] = path
    zip.file(path, await bytes(img.blob))
  }
  zip.file('manifest.json', JSON.stringify({ app: 'design-basket', version: BACKUP_VERSION, ...d, images: files }, null, 2))
  return { blob: await zip.generateAsync({ type: 'blob' }), filename: `${slugify(d.project.name) || 'project'}.basket.zip` }
}

const MIME_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml' }

/** Restore a .basket.zip as a NEW project (fresh ids; never touches existing data). */
export async function importBackup(file: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(file)
  const mf = zip.file('manifest.json')
  if (!mf) throw new Error('Not a Design Basket backup (manifest.json missing).')
  const m = JSON.parse(await mf.async('string'))
  if (m.app !== 'design-basket' || m.version !== BACKUP_VERSION || !m.project || !Array.isArray(m.baskets) || !Array.isArray(m.items)) {
    throw new Error('Unsupported or corrupt backup file.')
  }
  const now = Date.now()
  const project: Project = { ...m.project, id: uid(), name: `${m.project.name} (imported)`, updatedAt: now }
  const bmap = new Map<string, string>(m.baskets.map((b: Basket) => [b.id, uid()]))
  const imap = new Map<string, string>()
  const images: { id: string; blob: Blob; mime: string }[] = []
  for (const [oldId, path] of Object.entries(m.images ?? {}) as [string, string][]) {
    const f = zip.file(path)
    if (!f) continue
    const ext = path.split('.').pop() ?? ''
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    const nid = uid()
    imap.set(oldId, nid)
    images.push({ id: nid, blob: new Blob([(await f.async('uint8array')) as BlobPart], { type: mime }), mime })
  }
  const baskets: Basket[] = m.baskets.map((b: Basket) => ({ ...b, id: bmap.get(b.id)!, projectId: project.id }))
  const items: Item[] = m.items
    .filter((i: Item) => bmap.has(i.basketId))
    .map((i: Item) => ({
      ...i,
      id: uid(),
      projectId: project.id,
      basketId: bmap.get(i.basketId)!,
      imageBlobId: i.imageBlobId ? imap.get(i.imageBlobId) : undefined,
    }))
  await db.transaction('rw', db.projects, db.baskets, db.items, db.images, async () => {
    await db.projects.add(project)
    await db.baskets.bulkAdd(baskets)
    await db.images.bulkAdd(images)
    await db.items.bulkAdd(items)
  })
  return project.id
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
