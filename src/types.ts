export type ItemKind = 'image' | 'note' | 'color' | 'font' | 'link'
export type Priority = 'rule' | 'inspiration' | 'avoid'
export type ColorRole =
  | 'primary' | 'secondary' | 'accent' | 'neutral' | 'background' | 'surface'
  | 'text' | 'success' | 'warning' | 'error' | 'info'
export type FontRole = 'display' | 'heading' | 'body' | 'mono'
export type Platform = 'web' | 'mobile' | 'both'
export type BasketStatus = 'todo' | 'done' | 'skipped'

export const COLOR_ROLES: ColorRole[] = [
  'primary', 'secondary', 'accent', 'neutral', 'background', 'surface',
  'text', 'success', 'warning', 'error', 'info',
]
export const FONT_ROLES: FontRole[] = ['display', 'heading', 'body', 'mono']

export interface Project {
  id: string
  name: string
  description: string
  audience: string
  platform: Platform
  /** '' or missing = detect from Overall Direction + description */
  mood?: string
  createdAt: number
  updatedAt: number
}

export interface Basket {
  id: string
  slug: string
  projectId: string
  label: string
  color: string
  order: number
  summary: string
  isCustom: boolean
  hidden: boolean
  /** progress through the folder stack; missing = todo */
  status?: BasketStatus
}

export interface Item {
  id: string
  basketId: string
  projectId: string
  kind: ItemKind
  priority: Priority
  note: string
  imageBlobId?: string
  width?: number
  height?: number
  hex?: string
  colorRole?: ColorRole
  fontFamily?: string
  fontRole?: FontRole
  url?: string
  order: number
  createdAt: number
}

export interface StoredImage {
  id: string
  blob: Blob
  mime: string
}
