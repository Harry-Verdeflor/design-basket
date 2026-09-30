export function slugify(s: string, max = 40): string {
  const slug = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= max) return slug
  // cut at a word boundary so names never end mid-word
  const cut = slug.slice(0, max + 1)
  const at = cut.lastIndexOf('-')
  return (at > 0 ? cut.slice(0, at) : slug.slice(0, max)).replace(/-+$/g, '')
}

/** Short filename slug from a note: first few words. */
export function noteSlug(note: string, fallback = 'image'): string {
  const words = note.trim().split(/\s+/).slice(0, 5).join(' ')
  return slugify(words, 32) || fallback
}

export function extForMime(mime: string): string {
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/svg+xml') return 'svg'
  return 'bin'
}
