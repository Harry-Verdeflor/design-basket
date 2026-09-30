import { useEffect, useState } from 'react'
import type { Platform, Project } from '../types'
import { addCustomBasket, deleteProject, duplicateProject, restoreProject, updateBasket, updateProject } from '../db'
import { copyText } from '../lib/zip'
import { useApp } from '../ctx'
import { MOODS } from '../lib/suggest'
import { createDemoProject } from '../lib/demo'
import { AI_MODELS, MAX_IMAGES, type AiModel, type AiSettings } from '../lib/ai'
import { Modal } from './ui'

export function ConfirmModal({ message, okLabel, onResult }: { message: string; okLabel: string; onResult: (ok: boolean) => void }) {
  return (
    <Modal title="Are you sure?" onClose={() => onResult(false)}>
      <p className="text-sm my-3">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={() => onResult(false)}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={() => onResult(true)} autoFocus>
          {okLabel}
        </button>
      </div>
    </Modal>
  )
}

export function BriefModal({ project, onClose, onSwitch }: { project: Project; onClose: () => void; onSwitch: (id: string) => void }) {
  const { run, toast, confirm, projects } = useApp()
  const [f, setF] = useState({ name: project.name, description: project.description, audience: project.audience, platform: project.platform, mood: project.mood ?? '' })
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (f.name !== project.name || f.description !== project.description || f.audience !== project.audience || f.platform !== project.platform || f.mood !== (project.mood ?? ''))
        void run(() => updateProject(project.id, { ...f, name: f.name.trim() || 'Untitled project' }))
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line
  }, [f])
  return (
    <Modal title="Project brief" onClose={onClose} wide>
      <p className="text-sm text-muted">This text goes at the top of the exported DESIGN.md.</p>
      <label className="label" htmlFor="pname">
        Name
      </label>
      <input id="pname" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <label className="label" htmlFor="pdesc">
        What are you building?
      </label>
      <textarea id="pdesc" className="field" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="One paragraph: what it is, what it does, how it should feel." />
      <label className="label" htmlFor="paud">
        Target audience
      </label>
      <input id="paud" className="field" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} placeholder="e.g. college students managing shared expenses" />
      <label className="label" htmlFor="pplat">
        Platform
      </label>
      <select id="pplat" className="field" value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value as Platform })}>
        <option value="web">Web</option>
        <option value="mobile">Mobile</option>
        <option value="both">Both</option>
      </select>
      <label className="label" htmlFor="pmood">
        Style for suggestions
      </label>
      <select id="pmood" className="field" value={f.mood} onChange={(e) => setF({ ...f, mood: e.target.value })}>
        <option value="">Auto: guess from Overall Direction and description</option>
        {MOODS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}: {m.blurb}
          </option>
        ))}
      </select>
      <div className="flex gap-2 mt-5 flex-wrap">
        <button
          className="btn"
          onClick={async () => {
            const id = await run(() => duplicateProject(project.id))
            if (id) {
              onSwitch(id)
              onClose()
              toast('Project duplicated')
            }
          }}
        >
          Duplicate project
        </button>
        <button
          className="btn btn-danger"
          disabled={projects.length < 2}
          title={projects.length < 2 ? 'Keep at least one project' : undefined}
          onClick={async () => {
            if (!(await confirm(`Delete "${project.name}" with all its items and images?`, 'Delete project'))) return
            const next = projects.find((p) => p.id !== project.id)!
            const d = await run(() => deleteProject(project.id))
            onSwitch(next.id)
            onClose()
            if (d) toast('Project deleted', { action: { label: 'Undo', run: async () => { await run(() => restoreProject(d)); onSwitch(d.project.id) } } })
          }}
        >
          Delete project
        </button>
      </div>
    </Modal>
  )
}

export function PasteModal({ text, onClose }: { text: string; onClose: () => void }) {
  const { toast } = useApp()
  return (
    <Modal title="Pack downloaded. Now paste this into Claude Code" onClose={onClose} wide>
      <p className="text-sm text-muted mb-2">
        Unzip <code className="font-mono">design-pack/</code> into your project folder, open Claude Code there, and send:
      </p>
      <textarea readOnly className="field font-mono !text-xs" rows={12} value={text} onFocus={(e) => e.currentTarget.select()} aria-label="Message to paste into Claude Code" />
      <div className="flex justify-end gap-2 mt-3">
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-primary" onClick={async () => toast((await copyText(text)) ? 'Copied to clipboard' : 'Copy failed. Select the text and copy manually.', { error: false })}>
          Copy
        </button>
      </div>
    </Modal>
  )
}

function ClaudeSettings({ ai, setAi }: { ai: AiSettings; setAi: (s: AiSettings) => void }) {
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const hasKey = !!ai.apiKey
  return (
    <section aria-labelledby="claude-h" className="rounded-xl border-2 border-stroke p-3 mt-1">
      <h3 id="claude-h" className="font-display text-lg font-semibold">
        Claude suggestions
      </h3>
      <p className="text-sm text-muted">
        With your own Anthropic API key, the ✦ button in each folder can ask Claude. Claude reads your notes and images and suggests what that folder is missing. Each request uses credits on your Anthropic account.
      </p>
      {hasKey ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="font-mono text-sm rounded-lg border-2 border-stroke px-2 py-1 bg-paper">
            {show ? ai.apiKey : `${ai.apiKey.slice(0, 10)}…${ai.apiKey.slice(-4)}`}
          </span>
          <button className="btn !py-1 text-xs" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
          <button className="btn btn-danger !py-1 text-xs" onClick={() => setAi({ ...ai, apiKey: '' })}>
            Remove key
          </button>
        </div>
      ) : (
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) setAi({ ...ai, apiKey: draft.trim() })
            setDraft('')
          }}
        >
          <label htmlFor="apikey" className="sr-only">
            Anthropic API key
          </label>
          <input
            id="apikey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="field font-mono"
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-primary whitespace-nowrap" disabled={!draft.trim()}>
            Save key
          </button>
        </form>
      )}
      <p className="text-xs text-muted mt-2">
        The key stays in this browser on this device and only goes to api.anthropic.com. Anyone who uses this browser profile can use it. Get a key at console.anthropic.com.
      </p>
      <label className="label" htmlFor="aimodel">
        Model
      </label>
      <select id="aimodel" className="field" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value as AiModel })}>
        {AI_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <label className="flex items-start gap-2 mt-3 text-sm">
        <input type="checkbox" className="mt-1" checked={ai.sendImages} onChange={(e) => setAi({ ...ai, sendImages: e.target.checked })} />
        <span>
          Send the folder's reference images (up to {MAX_IMAGES}) with each request.
          <span className="block text-xs text-muted">Better suggestions, more credits per request.</span>
        </span>
      </label>
    </section>
  )
}

export function SettingsModal({ onClose, theme, setTheme, ai, setAi, onSwitch }: { onSwitch: (id: string) => void; onClose: () => void; theme: 'system' | 'light' | 'dark'; setTheme: (t: 'system' | 'light' | 'dark') => void; ai: AiSettings; setAi: (s: AiSettings) => void }) {
  const { baskets, project, run } = useApp()
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [label, setLabel] = useState('')
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])
  const pct = est && est.quota ? (est.usage / est.quota) * 100 : 0
  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <ClaudeSettings ai={ai} setAi={setAi} />
      <h3 className="label">Theme</h3>
      <div className="flex gap-2">
        {(['system', 'light', 'dark'] as const).map((t) => (
          <button key={t} className={`btn ${theme === t ? 'btn-primary' : ''}`} aria-pressed={theme === t} onClick={() => setTheme(t)}>
            {t}
          </button>
        ))}
      </div>

      <h3 className="label">Storage</h3>
      {est ? (
        <>
          <div className="h-2 rounded bg-paper border border-line overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
            <div className={`h-full ${pct > 80 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.max(1, Math.min(100, pct))}%` }} />
          </div>
          <p className="text-sm mt-1">
            {mb(est.usage)} of {mb(est.quota)} ({pct.toFixed(pct < 1 ? 2 : 0)}%) · {persisted ? 'persistent storage granted' : 'browser may clear data under disk pressure'}
          </p>
          {pct > 80 && <p className="text-sm text-danger font-medium">Storage is over 80% full. Export a backup and remove unused images.</p>}
        </>
      ) : (
        <p className="text-sm text-muted">Storage estimate not available in this browser.</p>
      )}
      {persisted === false && (
        <button className="btn mt-2" onClick={() => navigator.storage.persist().then(setPersisted)}>
          Ask browser to keep my data
        </button>
      )}

      <h3 className="label">Baskets in "{project.name}"</h3>
      <ul className="divide-y-2 divide-line border-2 border-stroke rounded-xl">
        {[...baskets].sort((a, b) => a.order - b.order).map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: b.color }} aria-hidden />
            <span className="flex-1">{b.label}</span>
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={!b.hidden} onChange={(e) => run(() => updateBasket(b.id, { hidden: !e.target.checked }))} />
              Show
            </label>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 mt-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!label.trim()) return
          await run(() => addCustomBasket(project.id, label.trim()))
          setLabel('')
        }}
      >
        <input className="field" placeholder="New custom basket name" aria-label="New custom basket name" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-primary whitespace-nowrap">Add basket</button>
      </form>
      <h3 className="label">Demo</h3>
      <button
        className="btn"
        onClick={async () => {
          const id = await run(() => createDemoProject())
          if (id) {
            onSwitch(id)
            onClose()
          }
        }}
      >
        Load demo project
      </button>
      <span className="text-xs text-muted ml-2">A filled-in café website brief, to see how everything fits together.</span>
      <p className="text-xs text-muted mt-2">Hidden baskets keep their items and are still included in exports. Rename, reorder and clear baskets from each basket's ⋯ menu.</p>
    </Modal>
  )
}
