import type { Basket, BasketStatus } from '../types'

export const FINISH = 'finish'

/** Next folder still to do after `fromId` (wrapping), or FINISH when none are left. */
export function nextOpen(baskets: Basket[], fromId: string, statuses: Record<string, BasketStatus | undefined>): string {
  const i = baskets.findIndex((b) => b.id === fromId)
  const order = [...baskets.slice(i + 1), ...baskets.slice(0, Math.max(0, i))]
  return order.find((b) => (statuses[b.id] ?? 'todo') === 'todo')?.id ?? FINISH
}
