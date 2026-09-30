import { useEffect } from 'react'
import type { Item } from '../types'
import { contrastText } from '../lib/color'
import { ensureFontLoaded } from '../lib/fonts'
import { useObjectUrl } from '../ctx'

export function altFor(item: Item, basketLabel: string): string {
  return item.note.trim() || `Reference image in ${basketLabel}`
}

export function PriorityBadge({ priority }: { priority: Item['priority'] }) {
  if (priority === 'rule') return <span className="badge badge-rule">Rule</span>
  if (priority === 'avoid') return <span className="badge badge-avoid">Avoid</span>
  return null
}

export function ItemBody({ item, basketLabel, large }: { item: Item; basketLabel: string; large?: boolean }) {
  const url = useObjectUrl(item.kind === 'image' ? item.imageBlobId : undefined)
  useEffect(() => {
    if (item.kind === 'font' && item.fontFamily) ensureFontLoaded(item.fontFamily)
  }, [item.kind, item.fontFamily])

  return (
    <div className="item-body">
      {item.kind === 'image' &&
        (url ? (
          <img
            src={url}
            alt={altFor(item, basketLabel)}
            width={item.width}
            height={item.height}
            draggable={false}
            className="w-full rounded-md block"
            style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : undefined, maxHeight: large ? '50vh' : 320, objectFit: 'contain' }}
          />
        ) : (
          <div className="h-24 rounded-md bg-line/40" aria-hidden />
        ))}
      {item.kind === 'color' && (
        <div
          className="rounded-md h-14 flex items-end justify-between px-2 py-1 font-mono text-xs border border-black/10"
          style={{ background: item.hex, color: contrastText(item.hex ?? '#000') }}
        >
          <span>{item.hex}</span>
          {item.colorRole && <span>{item.colorRole}</span>}
        </div>
      )}
      {item.kind === 'font' && (
        <div>
          <div className="text-2xl leading-tight break-words" style={{ fontFamily: `"${item.fontFamily}", serif` }}>
            Aa Bb Cc 123
          </div>
          <div className="text-xs text-muted mt-1">
            {item.fontFamily}
            {item.fontRole ? ` · ${item.fontRole}` : ''}
          </div>
        </div>
      )}
      {item.kind === 'link' && (
        <div className="text-sm break-all text-accent underline underline-offset-2">{item.url}</div>
      )}
      {item.note && (
        <p className={`text-sm whitespace-pre-wrap break-words ${item.kind === 'note' ? '' : 'mt-1.5 text-muted'} ${item.priority === 'avoid' ? 'line-through decoration-danger/60' : ''}`}>
          {item.note}
        </p>
      )}
    </div>
  )
}
