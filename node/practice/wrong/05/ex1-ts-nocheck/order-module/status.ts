// @ts-nocheck
export const OrderStatus = {
  Pending: 'pending',
  Brewing: 'brewing',
  Ready: 'ready',
  PickedUp: 'picked_up',
}
export type OrderStatus = 'pending' | 'brewing' | 'ready' | 'picked_up'

const next: Record<OrderStatus, OrderStatus | null> = {
  [OrderStatus.Pending]: OrderStatus.Brewing,
  [OrderStatus.Brewing]: OrderStatus.Ready,
  [OrderStatus.Ready]: OrderStatus.PickedUp,
  [OrderStatus.PickedUp]: null,
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return next[status]
}
