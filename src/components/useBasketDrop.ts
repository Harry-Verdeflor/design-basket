import { useState, type DragEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Basket } from '../types'
import { addImages } from '../db'
import { useApp } from '../ctx'

/** Drop target for dragged items (dnd-kit) and for files from the desktop. */
export function useBasketDrop(basket: Basket, overId?: string) {
  const { run, toast } = useApp()
  const { setNodeRef, isOver } = useDroppable({ id: `basket:${basket.id}`, data: { basketId: basket.id } })
  const [fileOver, setFileOver] = useState(false)
  const ingest = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return toast('No image files found in that drop.', { error: true })
    const r = await run(() => addImages(basket, imgs))
    if (r?.failed.length) toast(`Couldn't import: ${r.failed.join(', ')}`, { error: true })
  }
  const handlers = {
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault()
        setFileOver(true)
      }
    },
    onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setFileOver(false),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      setFileOver(false)
      void ingest([...e.dataTransfer.files])
    },
  }
  return { setNodeRef, over: isOver || overId === basket.id || fileOver, handlers, ingest }
}
