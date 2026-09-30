import { useEffect, useRef, useState } from 'react'
import type { Basket, Item } from '../types'
import { addSuggestion, db, updateProject } from '../db'
import { ensureFontLoaded } from '../lib/fonts'
import { MOODS, keyOfItem, suggestFor, type Suggestion } from '../lib/suggest'
import { AI_ERROR_TEXT, AiError, MAX_IMAGES, askClaude } from '../lib/ai'
import { useApp } from '../ctx'

function Chip({ s, onAdd, fromClaude }: { s: Suggestion; onAdd: () => void; fromClaude?: boolean }) {
  useEffect(() => {
    if (s.fontFamily) ensureFontLoaded(s.fontFamily)
  }, [s.fontFamily])
  const label =
    s.kind === 'color' ? `${s.hex}${s.colorRole ? ` as ${s.colorRole}` : ''}` : s.kind === 'font' ? `${s.fontFamily}${s.fontRole ? ` for ${s.fontRole}` : ''}` : s.note
  return (
    <button
      type="button"
      onClick={onAdd}
      title={s.note && s.kind !== 'note' ? s.note : undefined}
      aria-label={`Add suggestion: ${label}${s.note && s.kind !== 'note' ? `. ${s.note}` : ''}`}
      className={`inline-flex items-center gap-1.5 max-w-full text-left text-xs rounded-full border-2 px-2.5 py-1 hover:shadow-[2px_2px_0_var(--stroke)] ${
        fromClaude ? 'border-stroke bg-sheet' : 'border-dashed border-stroke/60 bg-paper/50'
      }`}
    >
      <span aria-hidden className="font-bold">
        +
      </span>
      {s.kind === 'color' && (
        <>
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: s.hex, boxShadow: '0 0 0 1.5px var(--stroke)' }} aria-hidden />
          <span className="font-mono">{s.hex}</span>
          {s.colorRole && <span className="text-muted">{s.colorRole}</span>}
          {fromClaude && s.note && <span className="text-muted hidden sm:inline">· {s.note}</span>}
        </>
      )}
      {s.kind === 'font' && (
        <>
          <span className="text-sm leading-none" style={{ fontFamily: `"${s.fontFamily}", serif` }}>
            {s.fontFamily}
          </span>
          {s.fontRole && <span className="text-muted">{s.fontRole}</span>}
          {fromClaude && s.note && <span className="text-muted hidden sm:inline">· {s.note}</span>}
        </>
      )}
      {s.kind === 'note' && <span className="break-words">{s.note}</span>}
    </button>
  )
}

/** Claude results survive closing and reopening the panel for the session. */
const claudeCache = new Map<string, Suggestion[]>()

type ClaudeState = { phase: 'idle' } | { phase: 'loading'; images: number; notes: number } | { phase: 'done' } | { phase: 'error'; message: string; kind: AiError['kind'] }

export function SuggestPanel({ basket, items }: { basket: Basket; items: Item[] }) {
  const { project, baskets, items: allItems, mood, moodDetected, run, toast, ai, openSettings } = useApp()
  const [claude, setClaude] = useState<ClaudeState>(() => (claudeCache.has(basket.id) ? { phase: 'done' } : { phase: 'idle' }))
  const [, force] = useState(0)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const have = new Set(items.map(keyOfItem))
  const fromClaude = (claudeCache.get(basket.id) ?? []).filter((s) => !have.has(s.key))
  const builtIn = suggestFor(basket.slug, mood, items).filter((s) => !fromClaude.some((c) => c.key === s.key))

  const add = (s: Suggestion) => run(() => addSuggestion(basket, s))
  const addAll = async (list: Suggestion[]) => {
    for (const s of list) await add(s)
    toast(`Added ${list.length} suggestions to ${basket.label}`)
  }

  const ask = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    const images = ai.sendImages ? Math.min(MAX_IMAGES, items.filter((i) => i.kind === 'image').length) : 0
    setClaude({ phase: 'loading', images, notes: allItems.length - images })
    try {
      const list = await askClaude({ project, basket, baskets, items: allItems }, ai, (id) => db.images.get(id), ctrl.signal)
      claudeCache.set(basket.id, list)
      setClaude({ phase: 'done' })
      force((n) => n + 1)
    } catch (e) {
      if ((e instanceof AiError && e.kind === 'aborted') || ctrl.signal.aborted) {
        setClaude(claudeCache.has(basket.id) ? { phase: 'done' } : { phase: 'idle' })
        return
      }
      const kind = e instanceof AiError ? e.kind : 'unknown'
      setClaude({ phase: 'error', kind, message: e instanceof AiError ? e.message : AI_ERROR_TEXT.unknown })
    }
  }

  return (
    <div className="mt-3 rounded-xl border-2 border-stroke bg-paper/40 p-3" aria-label={`Suggestions for ${basket.label}`}>
      {/* Claude */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display font-semibold">Ask Claude</span>
        {ai.apiKey ? (
          claude.phase === 'loading' ? (
            <>
              <span className="text-xs text-muted" role="status">
                Claude is reading {claude.images ? `${claude.images} image${claude.images > 1 ? 's' : ''} and ` : ''}your notes…
              </span>
              <button type="button" className="btn !py-0.5 text-xs" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary !py-0.5 text-xs" onClick={ask}>
              ✦ {claude.phase === 'done' ? 'Ask again' : `Suggest for ${basket.label}`}
            </button>
          )
        ) : (
          <span className="text-xs text-muted">
            <button type="button" className="underline" onClick={openSettings}>
              Add your Anthropic API key
            </button>{' '}
            to get suggestions based on your own images and notes.
          </span>
        )}
      </div>
      {claude.phase === 'error' && (
        <p className="text-xs text-danger mt-2" role="alert">
          {claude.message}{' '}
          {claude.kind === 'bad-key' || claude.kind === 'no-access' || claude.kind === 'no-key' ? (
            <button type="button" className="underline" onClick={openSettings}>
              Open Settings
            </button>
          ) : claude.kind !== 'empty' && claude.kind !== 'refused' ? (
            <button type="button" className="underline" onClick={ask}>
              Try again
            </button>
          ) : null}
        </p>
      )}
      {fromClaude.length > 0 && (
        <>
          <div className="flex items-center mt-2 mb-1.5 text-xs text-muted">
            <span>From Claude</span>
            <span className="flex-1" />
            {fromClaude.length > 1 && (
              <button type="button" className="underline hover:text-ink" onClick={() => addAll(fromClaude)}>
                Add all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {fromClaude.map((s) => (
              <Chip key={s.key} s={s} fromClaude onAdd={() => add(s)} />
            ))}
          </div>
        </>
      )}
      {claude.phase === 'done' && !fromClaude.length && <p className="text-xs text-muted mt-2">You've added all of Claude's ideas. Ask again for more.</p>}

      {/* Built-in */}
      <div className="flex items-center gap-2 mt-3 mb-1.5 pt-3 border-t-2 border-dashed border-line text-xs text-muted">
        <span>Quick ideas for</span>
        <label className="sr-only" htmlFor={`mood-${basket.id}`}>
          Style
        </label>
        <select
          id={`mood-${basket.id}`}
          className="bg-sheet border-2 border-stroke rounded-md px-1 py-0.5 text-ink"
          value={project.mood ?? ''}
          onChange={(e) => run(() => updateProject(project.id, { mood: e.target.value }))}
        >
          <option value="">{moodDetected ? `Auto (${MOODS.find((m) => m.id === mood)?.label})` : 'Auto (any style)'}</option>
          {MOODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {builtIn.length > 1 && (
          <button type="button" className="underline hover:text-ink" onClick={() => addAll(builtIn)}>
            Add all
          </button>
        )}
      </div>
      {builtIn.length ? (
        <div className="flex flex-wrap gap-1.5">
          {builtIn.map((s) => (
            <Chip key={s.key} s={s} onAdd={() => add(s)} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">You've added every quick idea for this style. Pick another style for more.</p>
      )}
      {!mood && basket.slug !== 'direction' && <p className="text-xs text-muted mt-2">Pick a style in Overall Direction and these ideas will match it.</p>}
    </div>
  )
}
