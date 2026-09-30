import { useEffect, useRef, useState } from 'react'
import { SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Basket, Item } from '../types'
import { addFromText, clearBasket, deleteBasket, deleteItem, moveBasket, restoreBasket, restoreItem, restoreItems, updateBasket } from '../db'
import { defaultFor } from '../lib/defaults'
import { useApp } from '../ctx'
import { ItemBody, PriorityBadge } from './ItemView'
import { useBasketDrop } from './useBasketDrop'
import { SuggestPanel } from './SuggestPanel'
import { hasSuggestions } from '../lib/suggest'

export function SortableItem({ item, basket }: { item: Item; basket: Basket }) {
  const { select, selectedId, run, toast } = useApp()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, data: { basketId: basket.id } })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="group relative"
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        aria-label={`Open ${item.kind} item${item.note ? `: ${item.note.slice(0, 60)}` : ''}`}
        aria-pressed={selectedId === item.id}
        className="item"
        data-priority={item.priority}
        style={selectedId === item.id ? { outline: '3px solid var(--accent)', outlineOffset: 2 } : undefined}
        onClick={() => select(item.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            select(item.id)
          } else listeners?.onKeyDown?.(e)
        }}
      >
        <div className="flex justify-end min-h-0 absolute top-1.5 left-1.5 z-10">
          <PriorityBadge priority={item.priority} />
        </div>
        <ItemBody item={item} basketLabel={basket.label} />
      </div>
      <button
        className="absolute top-1.5 right-1.5 z-10 btn !px-1.5 !py-0 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"
        aria-label="Delete item"
        onClick={async (e) => {
          e.stopPropagation()
          const d = await run(() => deleteItem(item.id))
          if (d) toast('Item deleted', { action: { label: 'Undo', run: () => run(() => restoreItem(d)) as Promise<void> } })
        }}
      >
        ✕
      </button>
    </div>
  )
}

export function BasketMenu({ basket, count, className = '' }: { basket: Basket; count: number; className?: string }) {
  const { run, toast, confirm, baskets, project } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visible = baskets.filter((b) => !b.hidden)
  const index = visible.findIndex((b) => b.id === basket.id)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const item = (label: string, fn: () => void | Promise<void>, danger = false, disabled = false) => (
    <button
      role="menuitem"
      disabled={disabled}
      className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-40 ${danger ? 'text-danger' : ''}`}
      onClick={async () => {
        setOpen(false)
        await fn()
      }}
    >
      {label}
    </button>
  )
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button className="btn !px-2 !py-0.5" aria-label={`${basket.label} options`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 z-30 w-48 bg-sheet border-2 border-stroke rounded-xl py-1" style={{ boxShadow: '4px 4px 0 var(--stroke)' }}>
          {item('Rename…', () => {
            const v = window.prompt('Basket name', basket.label)?.trim()
            if (v) return run(() => updateBasket(basket.id, { label: v })) as Promise<void>
          })}
          {item('Move earlier', () => run(() => moveBasket(project.id, basket.id, -1)) as Promise<void>, false, index <= 0)}
          {item('Move later', () => run(() => moveBasket(project.id, basket.id, 1)) as Promise<void>, false, index === visible.length - 1)}
          {item('Hide basket', () => run(() => updateBasket(basket.id, { hidden: true })) as Promise<void>)}
          {item(
            'Clear basket…',
            async () => {
              if (!count || !(await confirm(`Remove all ${count} items from "${basket.label}"?`, 'Clear basket'))) return
              const gone = await run(() => clearBasket(basket.id))
              if (gone) toast(`Cleared ${gone.length} items`, { action: { label: 'Undo', run: () => run(() => restoreItems(gone)) as Promise<void> } })
            },
            true,
            !count,
          )}
          {basket.isCustom &&
            item(
              'Delete basket…',
              async () => {
                if (!(await confirm(`Delete "${basket.label}" and its ${count} items?`, 'Delete basket'))) return
                const d = await run(() => deleteBasket(basket.id))
                if (d) toast('Basket deleted', { action: { label: 'Undo', run: () => run(() => restoreBasket(d)) as Promise<void> } })
              },
              true,
            )}
        </div>
      )}
    </div>
  )
}

/** Everything inside a basket: rule line, items, the add row and suggestions. Shared by tray and folder. */
export function BasketBody({ basket, items, ingest, grid }: { basket: Basket; items: Item[]; ingest: (f: File[]) => Promise<void>; grid?: boolean }) {
  const { run } = useApp()
  const [text, setText] = useState('')
  const [summary, setSummary] = useState(basket.summary)
  const [suggesting, setSuggesting] = useState(false)
  const [lastSummary, setLastSummary] = useState(basket.summary)
  const fileRef = useRef<HTMLInputElement>(null)
  if (basket.summary !== lastSummary) {
    setLastSummary(basket.summary)
    setSummary(basket.summary)
  }
  const hint = defaultFor(basket.slug)?.hint ?? 'Drop images or type notes, colors, links…'

  return (
    <>
      <input
        className={`w-full bg-transparent border-0 border-b-2 border-dashed border-line px-1 py-1 mb-3 italic placeholder:not-italic placeholder:text-muted focus:outline-none focus:border-stroke ${grid ? 'text-base' : 'text-sm'}`}
        placeholder="One-line rule for this basket (optional)"
        aria-label={`${basket.label} summary`}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => summary !== basket.summary && run(() => updateBasket(basket.id, { summary }))}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />

      <SortableContext items={items.map((i) => i.id)} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={grid ? 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,13.5rem),1fr))] items-start min-h-24' : 'flex flex-col gap-2 min-h-16'}>
          {items.map((it) => (
            <SortableItem key={it.id} item={it} basket={basket} />
          ))}
          {!items.length && (
            <p className={`text-muted border-2 border-dashed border-line rounded-xl text-center col-span-full ${grid ? 'p-8 text-base' : 'p-4 text-sm'}`}>
              {hint}
              <br />
              <span className="text-xs">Drop images, paste (Ctrl/Cmd+V), type below, or press ✦ for ideas.</span>
            </p>
          )}
        </div>
      </SortableContext>

      <form
        className="flex gap-2 mt-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const t = text
          if (!t.trim()) return
          setText('')
          await run(() => addFromText(basket, t))
        }}
      >
        <input
          className="field flex-1 min-w-0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={basket.slug === 'color' ? '#1E3A5F #E8A33D …' : basket.slug === 'typography' ? 'Fraunces, note, link…' : 'Type a note, #hex, link…'}
          aria-label={`Add to ${basket.label}`}
        />
        <button type="button" className="btn whitespace-nowrap" onClick={() => fileRef.current?.click()}>
          + image
        </button>
        {hasSuggestions(basket.slug) && (
          <button
            type="button"
            className={`btn whitespace-nowrap ${suggesting ? 'btn-primary' : ''}`}
            aria-expanded={suggesting}
            aria-label={`Suggestions for ${basket.label}`}
            title="Suggest"
            onClick={() => setSuggesting(!suggesting)}
          >
            ✦{grid && <span className="hidden sm:inline"> Suggest</span>}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = [...(e.target.files ?? [])]
            e.target.value = ''
            if (f.length) void ingest(f)
          }}
        />
      </form>
      {suggesting && <SuggestPanel basket={basket} items={items} />}
    </>
  )
}

export function StatusMark({ status }: { status?: Basket['status'] }) {
  if (status === 'done') return <span aria-label="done" title="Done">✓</span>
  if (status === 'skipped') return <span aria-label="skipped" title="Skipped">–</span>
  return null
}

/** Overview grid tile. */
export function BasketTray({ basket, items, overId }: { basket: Basket; items: Item[]; overId?: string }) {
  const { focusedBasket, setFocusedBasket, openFolder } = useApp()
  const { setNodeRef, over, handlers, ingest } = useBasketDrop(basket, overId)
  return (
    <section
      id={`basket-${basket.id}`}
      ref={setNodeRef}
      className="tray"
      data-over={over}
      style={{ ['--tab' as string]: basket.color, ...(focusedBasket === basket.id ? { boxShadow: '5px 5px 0 var(--stroke)' } : {}) }}
      aria-label={basket.label}
      onFocusCapture={() => setFocusedBasket(basket.id)}
      onMouseDownCapture={() => setFocusedBasket(basket.id)}
      {...handlers}
    >
      <div className="tray-band tabcolor" aria-hidden />
      <h2 className="contents">
        <button className="tray-tab tabcolor hover:underline" onClick={() => openFolder(basket.id)} title="Open this folder">
          {basket.label} <StatusMark status={basket.status} />
        </button>
      </h2>
      <span className="absolute top-1.5 right-12 text-xs font-semibold" style={{ color: 'var(--on-tab)' }}>
        {items.length || ''}
      </span>
      <BasketMenu basket={basket} count={items.length} className="!absolute top-0.5 right-1.5" />
      <BasketBody basket={basket} items={items} ingest={ingest} />
    </section>
  )
}
