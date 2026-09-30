import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Basket, BasketStatus, Item } from '../types'
import { FINISH, nextOpen } from '../lib/stack'
import { setBasketStatus } from '../db'
import { useApp } from '../ctx'
import { BasketBody, BasketMenu, StatusMark } from './BasketTray'
import { useBasketDrop } from './useBasketDrop'

function StripTab({ basket, count, active, overId, onSelect, onKey }: { basket: Basket; count: number; active: boolean; overId?: string; onSelect: () => void; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${basket.id}`, data: { basketId: basket.id } })
  return (
    <button
      ref={setNodeRef}
      role="tab"
      id={`tab-${basket.id}`}
      aria-selected={active}
      aria-controls="folder-panel"
      tabIndex={active ? 0 : -1}
      data-status={basket.status ?? 'todo'}
      data-over={isOver || (overId === basket.id && !active)}
      className="tabstrip-btn tabcolor"
      style={{ ['--tab' as string]: basket.color }}
      onClick={onSelect}
      onKeyDown={onKey}
    >
      {basket.label}
      {count > 0 && <span className="opacity-70 font-normal">{count}</span>}
      <StatusMark status={basket.status} />
    </button>
  )
}

function Folder({ basket, items, overId, position, total, onDone, onSkip, onBack, canBack, autoFocus, onFocused }: {
  autoFocus: boolean
  onFocused: () => void
  basket: Basket
  items: Item[]
  overId?: string
  position: number
  total: number
  onDone: () => void
  onSkip: () => void
  onBack: () => void
  canBack: boolean
}) {
  const { run, setFocusedBasket } = useApp()
  const { setNodeRef, over, handlers, ingest } = useBasketDrop(basket, overId)
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    setFocusedBasket(basket.id)
  }, [basket.id, setFocusedBasket])
  useEffect(() => {
    if (!autoFocus) return
    headRef.current?.focus()
    onFocused()
  }, [autoFocus, onFocused])
  const status = basket.status ?? 'todo'

  return (
    <div
      id="folder-panel"
      role="tabpanel"
      aria-labelledby={`tab-${basket.id}`}
      ref={setNodeRef}
      className="folder tabcolor folder-enter relative z-10"
      data-over={over}
      style={{ ['--tab' as string]: basket.color }}
      {...handlers}
    >
      <div className="folder-paper" aria-hidden />
      <h2 ref={headRef} tabIndex={-1} id="folder-heading" className="folder-tab tabcolor" style={{ ['--tab' as string]: basket.color }}>
        {basket.label}
      </h2>
      <div className="flex items-center gap-2 mb-3 -mt-1 text-sm font-semibold" style={{ color: 'var(--on-tab)' }}>
        <span>
          Folder {position} of {total}
        </span>
        {status !== 'todo' && (
          <span className="rounded-full border-2 border-current px-2 py-0 text-xs">
            {status === 'done' ? '✓ Done' : 'Skipped'}{' '}
            <button className="underline font-normal" onClick={() => run(() => setBasketStatus(basket.id, 'todo'))}>
              undo
            </button>
          </span>
        )}
        <span className="flex-1" />
        <span className="font-normal">{items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : 'Empty'}</span>
        <BasketMenu basket={basket} count={items.length} />
      </div>

      <div className="sheet">
        <BasketBody basket={basket} items={items} ingest={ingest} grid />
      </div>

      <div className="tabcolor sticky bottom-0 z-10 -mx-[0.6rem] px-[0.6rem] py-2 mt-2 flex items-center gap-2 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:mt-4 sm:bg-transparent" style={{ ['--tab' as string]: basket.color }}>
        <button className="btn" onClick={onBack} disabled={!canBack} aria-label="Back to previous folder">
          ←<span className="hidden sm:inline"> Back</span>
        </button>
        <span className="hidden sm:block flex-1" />
        <button className="btn" onClick={onSkip} title="Nothing to add here. Claude Code will pick something that fits Overall Direction.">
          Skip
        </button>
        <button className="btn btn-primary !px-5 !py-2 !text-base flex-1 sm:flex-none" onClick={onDone}>
          Done, next →
        </button>
      </div>
    </div>
  )
}

function Finish({ baskets, byBasket, onOpen, onExport }: { baskets: Basket[]; byBasket: Map<string, Item[]>; onOpen: (id: string) => void; onExport: () => void }) {
  const done = baskets.filter((b) => b.status === 'done')
  const skipped = baskets.filter((b) => b.status === 'skipped')
  const todo = baskets.filter((b) => (b.status ?? 'todo') === 'todo')
  const emptyDone = done.filter((b) => !(byBasket.get(b.id)?.length ?? 0) && !b.summary.trim())
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const link = (b: Basket) => (
    <button key={b.id} className="underline" onClick={() => onOpen(b.id)}>
      {b.label}
    </button>
  )
  const join = (bs: Basket[]) => bs.map((b, i) => [i ? ', ' : '', link(b)])
  return (
    <div id="folder-panel" role="tabpanel" className="sheet folder-enter max-w-2xl mx-auto !p-6" style={{ boxShadow: '6px 6px 0 var(--stroke)' }}>
      <h2 ref={ref} tabIndex={-1} className="font-display text-3xl font-semibold">
        {todo.length ? 'Almost there' : 'Every folder is sorted'}
      </h2>
      <p className="mt-2 text-muted">
        {done.length} done · {skipped.length} skipped{todo.length ? ` · ${todo.length} still open` : ''}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {todo.length > 0 && <li>Still open: {join(todo)}.</li>}
        {emptyDone.length > 0 && (
          <li className="text-danger">
            Marked done but empty: {join(emptyDone)}. Claude Code will treat these as open questions.
          </li>
        )}
        {skipped.length > 0 && <li>Skipped: {join(skipped)}. The brief lists these under “Open questions” with a sensible default.</li>}
      </ul>
      <div className="flex flex-wrap gap-2 mt-6">
        <button className="btn btn-primary !px-5 !py-2 !text-base" onClick={onExport}>
          Export for Claude Code
        </button>
        {todo[0] && (
          <button className="btn" onClick={() => onOpen(todo[0].id)}>
            Open {todo[0].label}
          </button>
        )}
      </div>
    </div>
  )
}

export function StackView({ baskets, byBasket, overId, onExport }: { baskets: Basket[]; byBasket: Map<string, Item[]>; overId?: string; onExport: () => void }) {
  const { run, activeFolder: activeId, openFolder } = useApp()
  const [announce, setAnnounce] = useState('')
  const stripRef = useRef<HTMLDivElement>(null)
  const [focusNext, setFocusNext] = useState(false)
  const clearFocusNext = useCallback(() => setFocusNext(false), [])

  const firstOpen = baskets.find((b) => (b.status ?? 'todo') === 'todo')?.id ?? FINISH
  const current = activeId === FINISH || baskets.some((b) => b.id === activeId) ? activeId! : firstOpen
  const idx = baskets.findIndex((b) => b.id === current)
  const active = baskets[idx]

  const go = (id: string, focusHeading = true) => {
    openFolder(id)
    const b = baskets.find((x) => x.id === id)
    setAnnounce(b ? `${b.label}, folder ${baskets.indexOf(b) + 1} of ${baskets.length}` : 'All folders reviewed')
    setFocusNext(focusHeading)
    requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'center' }))
  }
  const mark = async (status: BasketStatus) => {
    if (!active) return
    const statuses = Object.fromEntries(baskets.map((b) => [b.id, b.status])) as Record<string, BasketStatus | undefined>
    statuses[active.id] = status
    await run(() => setBasketStatus(active.id, status))
    go(nextOpen(baskets, active.id, statuses))
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const ids = [...baskets.map((b) => b.id), FINISH]
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : null
    if (to === null) return
    e.preventDefault()
    const id = ids[(to + ids.length) % ids.length]
    openFolder(id)
    requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus())
  }
  const doneCount = baskets.filter((b) => (b.status ?? 'todo') !== 'todo').length
  const behind = idx >= 0 ? [baskets[idx + 1], baskets[idx + 2]].filter(Boolean) : []

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="h-3 flex-1 max-w-xs rounded-full border-2 border-stroke bg-sheet overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={baskets.length} aria-valuenow={doneCount} aria-label="Folders sorted">
          <div className="h-full bg-stroke" style={{ width: `${baskets.length ? (doneCount / baskets.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-semibold">
          {doneCount} of {baskets.length} sorted
        </span>
      </div>

      <div ref={stripRef} role="tablist" aria-label="Folders" className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden pt-2 pb-0 border-b-[3px] border-stroke -mx-4 px-4 sticky top-0 z-20 bg-paper">
        {baskets.map((b, i) => (
          <StripTab key={b.id} basket={b} count={byBasket.get(b.id)?.length ?? 0} active={b.id === current} overId={overId} onSelect={() => go(b.id, false)} onKey={(e) => onKey(e, i)} />
        ))}
        <button
          role="tab"
          id={`tab-${FINISH}`}
          aria-selected={current === FINISH}
          aria-controls="folder-panel"
          tabIndex={current === FINISH ? 0 : -1}
          className="tabstrip-btn"
          style={{ background: 'var(--ink)', color: 'var(--sheet)' }}
          onClick={() => go(FINISH, false)}
          onKeyDown={(e) => onKey(e, baskets.length)}
        >
          Finish ⚑
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {active ? (
        <div className="stack">
          <div className="relative isolate">
            {behind
              .map((b, i) => (
                <div key={b.id} className="folder-back" style={{ transform: `translate(calc(var(--dx) * -${i + 1}), calc(var(--dy) * -${i + 1}))`, zIndex: 5 - i }} aria-hidden>
                  <div className="folder tabcolor" style={{ ['--tab' as string]: b.color }}>
                    <div className="folder-paper" />
                    <button tabIndex={-1} className="folder-tab tabcolor" style={{ ['--tab' as string]: b.color }} onClick={() => go(b.id, false)}>
                      {b.label}
                    </button>
                  </div>
                </div>
              ))
              .reverse()}
            <Folder
              key={active.id}
              autoFocus={focusNext}
              onFocused={clearFocusNext}
              basket={active}
              items={byBasket.get(active.id) ?? []}
              overId={overId}
              position={idx + 1}
              total={baskets.length}
              canBack={idx > 0}
              onBack={() => go(baskets[idx - 1].id)}
              onSkip={() => mark('skipped')}
              onDone={() => mark('done')}
            />
          </div>
        </div>
      ) : (
        <div className="pt-8">
          <Finish baskets={baskets} byBasket={byBasket} onOpen={(id) => go(id)} onExport={onExport} />
        </div>
      )}
    </div>
  )
}
