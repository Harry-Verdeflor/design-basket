import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { liveQuery } from 'dexie'
import type { Basket, Item, Project } from './types'
import { db } from './db'
import type { Mood } from './lib/suggest'
import type { AiSettings } from './lib/ai'

export function useLive<T>(query: () => Promise<T> | T, deps: unknown[]): T | undefined {
  const [v, setV] = useState<T>()
  useEffect(() => {
    const s = liveQuery(query).subscribe({ next: setV, error: (e) => console.error(e) })
    return () => s.unsubscribe()
    // eslint-disable-next-line
  }, deps)
  return v
}

export function useObjectUrl(blobId?: string): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blobId) return
    let made: string | undefined
    let dead = false
    db.images.get(blobId).then((img) => {
      if (img && !dead) {
        made = URL.createObjectURL(img.blob)
        setUrl(made)
      }
    })
    return () => {
      dead = true
      if (made) URL.revokeObjectURL(made)
      setUrl(undefined)
    }
  }, [blobId])
  return url
}

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void | Promise<void> }
  error?: boolean
}

interface Ctx {
  project: Project
  projects: Project[]
  baskets: Basket[]
  items: Item[]
  selectedId?: string
  select: (id?: string) => void
  setProjectId: (id: string) => void
  toast: (message: string, opts?: { action?: Toast['action']; error?: boolean }) => void
  /** Run a write with the "Saving… / Saved" indicator and error toast. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  confirm: (message: string, okLabel?: string) => Promise<boolean>
  focusedBasket?: string
  /** chosen mood, or detected from the user's words */
  mood: Mood | null
  moodDetected: boolean
  /** folder open in the stack view (basket id or 'finish') */
  activeFolder?: string
  openFolder: (id: string) => void
  openSettings: () => void
  ai: AiSettings
  setFocusedBasket: (id: string) => void
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

export function AppProvider({
  value,
  children,
}: {
  value: Omit<Ctx, never>
  children: ReactNode
}) {
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useSaveIndicator() {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<number>(0)
  const pending = useRef(0)
  const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => {
    pending.current++
    setState('saving')
    try {
      return await fn()
    } finally {
      pending.current--
      if (!pending.current) {
        setState('saved')
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setState('idle'), 2000)
      }
    }
  }
  return { state, wrap }
}
