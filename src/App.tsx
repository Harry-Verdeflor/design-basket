import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { addImages, createProject, db, moveItem } from './db'
import { AppProvider, useLive, useSaveIndicator, type Toast } from './ctx'
import { buildBackup, buildBriefText, buildClaudePack, copyText, download, importBackup } from './lib/zip'
import { BasketTray } from './components/BasketTray'
import { ItemPanel } from './components/ItemPanel'
import { ItemBody } from './components/ItemView'
import { BriefModal, ConfirmModal, PasteModal, SettingsModal } from './components/Dialogs'
import { Toasts } from './components/ui'
import type { Item } from './types'
import { detectMood, type Mood } from './lib/suggest'
import { loadAiSettings, saveAiSettings, type AiSettings } from './lib/ai'
import { StackView } from './components/StackView'

type Theme = 'system' | 'light' | 'dark'

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  if (within.length) {
    const item = within.find((c) => !/^(basket|tab):/.test(String(c.id)))
    return item ? [item] : within
  }
  return closestCenter(args)
}

let bootstrapping: Promise<unknown> | null = null

export default function App() {
  const projects = useLive(() => db.projects.orderBy('createdAt').toArray(), [])
  const [projectId, setProjectId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('db-project') ?? undefined
    } catch {
      return undefined
    }
  })

  // first run: make a project
  useEffect(() => {
    if (projects && !projects.length) {
      bootstrapping ??= createProject('My first project').then((p) => setProjectId(p.id))
    }
  }, [projects])

  const project = projects?.find((p) => p.id === projectId) ?? projects?.[0]
  useEffect(() => {
    if (project) {
      try {
        localStorage.setItem('db-project', project.id)
      } catch {
        /* storage unavailable */
      }
    }
  }, [project?.id])

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  if (!projects || !project) return <div className="p-8 text-muted">Opening your baskets…</div>
  return <Board key={project.id} project={project} projects={projects} setProjectId={setProjectId} />
}

function Board({ project, projects, setProjectId }: { project: import('./types').Project; projects: import('./types').Project[]; setProjectId: (id: string) => void }) {
  const baskets = useLive(() => db.baskets.where('projectId').equals(project.id).sortBy('order'), [project.id]) ?? []
  const items = useLive(() => db.items.where('projectId').equals(project.id).toArray(), [project.id]) ?? []
  const [selectedId, select] = useState<string>()
  const [focusedBasket, setFocusedBasket] = useState<string>()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [modal, setModal] = useState<'brief' | 'settings' | null>(null)
  const [pasteText, setPasteText] = useState<string>()
  const [confirmState, setConfirmState] = useState<{ message: string; okLabel: string; resolve: (ok: boolean) => void }>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [view, setViewState] = useState<'stack' | 'overview'>(() => {
    try {
      return localStorage.getItem('db-view') === 'overview' ? 'overview' : 'stack'
    } catch {
      return 'stack'
    }
  })
  const setView = (v: 'stack' | 'overview') => {
    setViewState(v)
    try {
      localStorage.setItem('db-view', v)
    } catch {
      /* ignore */
    }
  }
  const [activeFolder, setActiveFolder] = useState<string>()
  const openFolder = useCallback((id: string) => {
    setActiveFolder(id)
    setViewState('stack')
    try {
      localStorage.setItem('db-view', 'stack')
    } catch {
      /* ignore */
    }
  }, [])
  const [ai, setAiState] = useState<AiSettings>(loadAiSettings)
  const setAi = (s: AiSettings) => {
    setAiState(s)
    saveAiSettings(s)
  }
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem('db-theme')
      return t === 'light' || t === 'dark' ? t : 'system'
    } catch {
      return 'system'
    }
  })
  const save = useSaveIndicator()
  const nextToast = useRef(1)
  const importRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setTheme = (t: Theme) => {
    setThemeState(t)
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
    try {
      if (t === 'system') localStorage.removeItem('db-theme')
      else localStorage.setItem('db-theme', t)
    } catch {
      /* ignore */
    }
  }

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (message: string, opts?: { action?: Toast['action']; error?: boolean }) => {
      const id = nextToast.current++
      setToasts((t) => [...t.slice(-3), { id, message, ...opts }])
      window.setTimeout(() => dismiss(id), opts?.action ? 10000 : 4500)
    },
    [dismiss],
  )
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await save.wrap(fn)
      } catch (e) {
        console.error(e)
        const quota = e instanceof Error && /quota/i.test(`${e.name} ${e.message}`)
        toast(quota ? 'Storage is full. Export a backup and delete unused images.' : 'Could not save that change. Please try again.', { error: true })
        return undefined
      }
    },
    // eslint-disable-next-line
    [toast],
  )
  const confirm = useCallback(
    (message: string, okLabel = 'Confirm') => new Promise<boolean>((resolve) => setConfirmState({ message, okLabel, resolve })),
    [],
  )

  // visible baskets and their items
  const visible = baskets.filter((b) => !b.hidden)
  const hiddenCount = baskets.length - visible.length
  const byBasket = new Map<string, Item[]>()
  for (const b of baskets) byBasket.set(b.id, [])
  for (const i of [...items].sort((a, b) => a.order - b.order)) byBasket.get(i.basketId)?.push(i)
  const selected = items.find((i) => i.id === selectedId)

  // mood for suggestions: the user's pick, else guessed from their own words
  const direction = baskets.find((b) => b.slug === 'direction')
  const moodText = [project.description, project.audience, direction?.summary ?? '', ...items.filter((i) => i.basketId === direction?.id).map((i) => i.note)].join(' ')
  const detected = detectMood(moodText)
  const mood = (project.mood as Mood) || detected
  const moodDetected = !project.mood && !!detected

  // paste images into the focused basket
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()!).filter(Boolean)
      if (!files.length) return
      const target = visible.find((b) => b.id === focusedBasket) ?? visible[0]
      if (!target) return
      e.preventDefault()
      void run(() => addImages(target, files)).then((r) => {
        if (r?.added.length) toast(`Pasted ${r.added.length} image${r.added.length > 1 ? 's' : ''} into ${target.label}`)
        if (r?.failed.length) toast(`Couldn't import: ${r.failed.join(', ')}`, { error: true })
      })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [visible, focusedBasket, run, toast])

  // stop the browser navigating to a file dropped outside a tray
  useEffect(() => {
    const stop = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const off = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false)
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [menuOpen])

  // ---- drag & drop between/within baskets ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )
  const [dragItem, setDragItem] = useState<Item>()
  const [overBasket, setOverBasket] = useState<string>()
  const basketOf = (id: unknown): string | undefined => {
    const s = String(id)
    if (s.startsWith('basket:')) return s.slice(7)
    if (s.startsWith('tab:')) return s.slice(4)
    return items.find((i) => i.id === s)?.basketId
  }
  const onDragStart = (e: DragStartEvent) => setDragItem(items.find((i) => i.id === e.active.id))
  const onDragOver = (e: DragOverEvent) => setOverBasket(e.over ? basketOf(e.over.id) : undefined)
  const onDragEnd = (e: DragEndEvent) => {
    setDragItem(undefined)
    setOverBasket(undefined)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const target = basketOf(over.id)
    if (!target) return
    const list = byBasket.get(target) ?? []
    const overIsBasket = /^(basket|tab):/.test(String(over.id))
    const index = overIsBasket ? list.length : list.findIndex((i) => i.id === over.id)
    void run(() => moveItem(String(active.id), target, index))
  }

  const exportPack = async () => {
    setMenuOpen(false)
    setBusy(true)
    try {
      const { blob, filename, pasteText } = await buildClaudePack(project.id)
      download(blob, filename)
      setPasteText(pasteText)
    } catch (e) {
      console.error(e)
      toast('Export failed. Please try again.', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const jumpTo = (id: string) => {
    setFocusedBasket(id)
    document.getElementById(`basket-${id}`)?.scrollIntoView({ block: 'start' })
  }

  const ctx = { project, projects, baskets, items, selectedId, select, setProjectId, toast, run, confirm, focusedBasket, setFocusedBasket, mood, moodDetected, activeFolder, openFolder, openSettings: () => setModal('settings'), ai }

  return (
    <AppProvider value={ctx}>
      <header className="bg-paper border-b-[3px] border-stroke">
        <div className="mx-auto max-w-[110rem] px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-2xl font-semibold mr-1 flex items-center gap-2">
            <img src="/favicon.svg" alt="" width={26} height={26} />
            <span className="hidden sm:inline">Design Basket</span>
          </h1>
          <label className="sr-only" htmlFor="proj">
            Project
          </label>
          <select
            id="proj"
            className="field !w-auto max-w-[14rem] font-display !text-base !font-semibold"
            value={project.id}
            onChange={(e) => {
              select(undefined)
              setProjectId(e.target.value)
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={async () => {
              const p = await run(() => createProject('Untitled project'))
              if (p) {
                select(undefined)
                setProjectId(p.id)
                setModal('brief')
              }
            }}
          >
            + New
          </button>
          <button className="btn" onClick={() => setModal('brief')}>
            Project brief
          </button>
          <div role="group" aria-label="View" className="flex rounded-[10px] border-2 border-stroke overflow-hidden text-sm font-semibold">
            {(['stack', 'overview'] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? 'bg-ink text-sheet' : 'bg-sheet'}`}>
                {v === 'stack' ? 'Folders' : 'Overview'}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="text-xs text-muted w-16 text-right" aria-live="polite">
            {save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved' : ''}
          </span>
          <div ref={menuRef} className="relative flex">
            <button className="btn btn-primary !rounded-r-none" onClick={exportPack} disabled={busy}>
              {busy ? 'Building…' : <>Export<span className="hidden sm:inline"> for Claude Code</span></>}
            </button>
            <button className="btn btn-primary !rounded-l-none !border-l-0" aria-label="More export options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              ▾
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-1 w-64 bg-sheet border-2 border-stroke rounded-xl py-1 z-40" style={{ boxShadow: '4px 4px 0 var(--stroke)' }}>
                {[
                  ['Copy brief only (DESIGN.md)', async () => toast((await copyText(await buildBriefText(project.id))) ? 'Brief copied to clipboard' : 'Copy failed', { error: false })],
                  ['Export backup (.basket.zip)', async () => {
                    const { blob, filename } = await buildBackup(project.id)
                    download(blob, filename)
                  }],
                  ['Import backup…', () => importRef.current?.click()],
                ].map(([label, fn]) => (
                  <button
                    key={label as string}
                    role="menuitem"
                    className="block w-full text-left px-3 py-1.5 text-sm hover:bg-paper"
                    onClick={async () => {
                      setMenuOpen(false)
                      try {
                        await (fn as () => unknown)()
                      } catch (e) {
                        console.error(e)
                        toast('That did not work. Please try again.', { error: true })
                      }
                    }}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={importRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              tabIndex={-1}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const id = await run(() => importBackup(f))
                  if (id) {
                    select(undefined)
                    setProjectId(id)
                    toast('Imported as a new project')
                  }
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Import failed', { error: true })
                }
              }}
            />
          </div>
          <button className="btn" onClick={() => setModal('settings')} aria-label="Settings">
            ⚙
          </button>
          <button
            className="btn"
            aria-label="Toggle light and dark mode"
            onClick={() => setTheme((theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme) === 'dark' ? 'light' : 'dark')}
          >
            ◐
          </button>
        </div>
      </header>
      {view === 'overview' && (
        <nav className="md:hidden sticky top-0 z-30 bg-paper border-b-2 border-stroke flex gap-1.5 overflow-x-auto px-3 py-2" aria-label="Jump to basket">
          {visible.map((b) => (
            <button key={b.id} className="btn !rounded-full whitespace-nowrap flex items-center gap-1.5 !py-1" onClick={() => jumpTo(b.id)}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
              {b.label}
              {(byBasket.get(b.id)?.length ?? 0) > 0 && <span className="text-muted text-xs">{byBasket.get(b.id)!.length}</span>}
            </button>
          ))}
        </nav>
      )}

      <main className={`mx-auto max-w-[110rem] px-4 py-5 ${selected ? 'md:pr-[25rem] pb-[80vh] md:pb-5' : ''}`}>
        {project.description && <p className="font-display text-lg max-w-3xl mb-4 text-muted">{project.description}</p>}
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragItem(undefined); setOverBasket(undefined) }}>
          {view === 'stack' ? (
            <StackView baskets={visible} byBasket={byBasket} overId={overBasket} onExport={exportPack} />
          ) : (
            <div className="grid gap-x-4 gap-y-6 grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] items-start">
              {visible.map((b) => (
                <BasketTray key={b.id} basket={b} items={byBasket.get(b.id) ?? []} overId={overBasket} />
              ))}
            </div>
          )}
          <DragOverlay>
            {dragItem && (
              <div className="item rotate-2 max-w-64" style={{ boxShadow: '6px 6px 0 var(--stroke)' }} data-priority={dragItem.priority}>
                <ItemBody item={dragItem} basketLabel="" />
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {hiddenCount > 0 && (
          <p className="text-sm text-muted mt-6">
            {hiddenCount} hidden basket{hiddenCount > 1 ? 's' : ''}.{' '}
            <button className="underline" onClick={() => setModal('settings')}>
              Manage baskets
            </button>
          </p>
        )}
      </main>

      {selected && <ItemPanel item={selected} />}
      {modal === 'brief' && <BriefModal project={project} onClose={() => setModal(null)} onSwitch={(id) => { select(undefined); setProjectId(id) }} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} theme={theme} setTheme={setTheme} ai={ai} setAi={setAi} onSwitch={(id) => { select(undefined); setProjectId(id) }} />}
      {pasteText && <PasteModal text={pasteText} onClose={() => setPasteText(undefined)} />}
      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          okLabel={confirmState.okLabel}
          onResult={(ok) => {
            confirmState.resolve(ok)
            setConfirmState(undefined)
          }}
        />
      )}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </AppProvider>
  )
}
