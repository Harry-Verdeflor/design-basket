import { useEffect, useRef, useState } from 'react'
import { COLOR_ROLES, FONT_ROLES, type ColorRole, type FontRole, type Item, type Priority } from '../types'
import { deleteItem, duplicateItem, moveItem, restoreItem, updateItem } from '../db'
import { normalizeHex } from '../lib/color'
import { matchGoogleFont } from '../lib/fonts'
import { useApp } from '../ctx'
import { ItemBody } from './ItemView'

const PRIORITIES: { id: Priority; label: string; help: string }[] = [
  { id: 'rule', label: 'Rule', help: 'Must follow exactly' },
  { id: 'inspiration', label: 'Inspiration', help: 'Take the feel, not the details' },
  { id: 'avoid', label: 'Avoid', help: 'Do not do this' },
]

export function ItemPanel({ item }: { item: Item }) {
  const { baskets, items, run, toast, select } = useApp()
  const basket = baskets.find((b) => b.id === item.basketId)
  const [note, setNote] = useState(item.note)
  const [hex, setHex] = useState(item.hex ?? '')
  const [family, setFamily] = useState(item.fontFamily ?? '')
  const [url, setUrl] = useState(item.url ?? '')
  const closeRef = useRef<HTMLButtonElement>(null)

  // reset local fields when a different item is opened
  useEffect(() => {
    setNote(item.note)
    setHex(item.hex ?? '')
    setFamily(item.fontFamily ?? '')
    setUrl(item.url ?? '')
    // eslint-disable-next-line
  }, [item.id])

  // debounced autosave of the note
  useEffect(() => {
    if (note === item.note) return
    const t = window.setTimeout(() => void run(() => updateItem(item.id, { note })), 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line
  }, [note, item.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLSelectElement) && select(undefined)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  const patch = (p: Partial<Item>) => run(() => updateItem(item.id, p))
  const inBasket = items.filter((i) => i.basketId === item.basketId)

  return (
    <aside
      aria-label="Item details"
      className="fixed z-40 bg-tray text-ink border-line shadow-2xl overflow-auto
        inset-x-0 bottom-0 max-h-[78vh] border-t rounded-t-2xl p-4
        md:inset-y-0 md:right-0 md:left-auto md:w-[24rem] md:max-h-none md:border-t-0 md:border-l md:rounded-none md:p-5"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg font-semibold">
          {item.kind[0].toUpperCase() + item.kind.slice(1)} <span className="text-muted font-normal text-sm">in {basket?.label}</span>
        </h2>
        <button ref={closeRef} className="btn" onClick={() => select(undefined)} aria-label="Close panel">
          ✕
        </button>
      </div>

      <div className="mb-2" data-priority={item.priority}>
        <ItemBody item={{ ...item, note: '' }} basketLabel={basket?.label ?? ''} large />
      </div>

      <label className="label" htmlFor="note">
        Note
      </label>
      <textarea
        id="note"
        className="field"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What should be copied from this? e.g. 'the thin 1px borders and 12px radius on cards'"
      />

      <div className="label" id="prio-label">
        Priority
      </div>
      <div role="radiogroup" aria-labelledby="prio-label" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-paper border border-line">
        {PRIORITIES.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={item.priority === p.id}
            title={p.help}
            onClick={() => patch({ priority: p.id })}
            className={`rounded-lg py-1.5 text-sm font-medium ${
              item.priority === p.id
                ? p.id === 'avoid'
                  ? 'bg-danger text-white line-through'
                  : p.id === 'rule'
                    ? 'bg-ink text-paper'
                    : 'bg-tray border border-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-1">{PRIORITIES.find((p) => p.id === item.priority)?.help}</p>

      {item.kind === 'color' && (
        <>
          <label className="label" htmlFor="hex">
            Hex
          </label>
          <input
            id="hex"
            className="field font-mono"
            value={hex}
            aria-invalid={!!hex && !normalizeHex(hex)}
            onChange={(e) => setHex(e.target.value)}
            onBlur={() => {
              const n = normalizeHex(hex)
              if (n) void patch({ hex: n })
              else setHex(item.hex ?? '')
            }}
          />
          <label className="label" htmlFor="crole">
            Color role
          </label>
          <select id="crole" className="field" value={item.colorRole ?? ''} onChange={(e) => patch({ colorRole: (e.target.value || undefined) as ColorRole | undefined })}>
            <option value="">No role (not exported as a token)</option>
            {COLOR_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </>
      )}

      {item.kind === 'font' && (
        <>
          <label className="label" htmlFor="family">
            Font family
          </label>
          <input
            id="family"
            className="field"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            onBlur={() => {
              const v = family.trim()
              if (v) void patch({ fontFamily: matchGoogleFont(v) ?? v })
              else setFamily(item.fontFamily ?? '')
            }}
          />
          <label className="label" htmlFor="frole">
            Font role
          </label>
          <select id="frole" className="field" value={item.fontRole ?? ''} onChange={(e) => patch({ fontRole: (e.target.value || undefined) as FontRole | undefined })}>
            <option value="">No role (not exported as a token)</option>
            {FONT_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </>
      )}

      {item.kind === 'link' && (
        <>
          <label className="label" htmlFor="url">
            URL
          </label>
          <input id="url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== item.url && patch({ url })} />
          {item.url && (
            <a className="text-sm text-accent underline" href={item.url} target="_blank" rel="noreferrer noopener">
              Open link ↗
            </a>
          )}
        </>
      )}

      <label className="label" htmlFor="move">
        Move to basket
      </label>
      <select
        id="move"
        className="field"
        value={item.basketId}
        onChange={(e) => run(() => moveItem(item.id, e.target.value, Number.MAX_SAFE_INTEGER))}
      >
        {baskets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
            {b.hidden ? ' (hidden)' : ''}
          </option>
        ))}
      </select>

      <div className="flex gap-2 mt-5">
        <button
          className="btn"
          onClick={async () => {
            const c = await run(() => duplicateItem(item.id))
            if (c) {
              select(c.id)
              toast('Duplicated')
            }
          }}
        >
          Duplicate
        </button>
        <button
          className="btn btn-danger"
          onClick={async () => {
            const d = await run(() => deleteItem(item.id))
            select(undefined)
            if (d) toast('Item deleted', { action: { label: 'Undo', run: () => run(() => restoreItem(d)) as Promise<void> } })
          }}
        >
          Delete
        </button>
        <span className="flex-1" />
        <span className="text-xs text-muted self-center">{inBasket.findIndex((i) => i.id === item.id) + 1}/{inBasket.length}</span>
      </div>
    </aside>
  )
}
