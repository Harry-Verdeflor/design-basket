import { useEffect, useRef, type ReactNode } from 'react'
import type { Toast } from '../ctx'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
    // eslint-disable-next-line
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ boxShadow: '6px 6px 0 var(--stroke)' }}
        className={`bg-sheet text-ink border-[3px] border-stroke rounded-t-2xl sm:rounded-2xl w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[90vh] overflow-auto p-5 outline-none`}
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[min(92vw,26rem)]" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm border-2 border-stroke ${t.error ? 'bg-danger text-white' : 'bg-ink text-sheet'}`}>
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="font-semibold underline"
              onClick={async () => {
                dismiss(t.id)
                await t.action!.run()
              }}
            >
              {t.action.label}
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
