// 訂單狀態：pending（剛點）→ brewing（製作中）→ ready（可取餐）→ picked_up（已取餐）
export enum OrderStatus {
  Pending = 'pending',
  Brewing = 'brewing',
  Ready = 'ready',
  PickedUp = 'picked_up',
}

const next: Record<OrderStatus, OrderStatus | null> = {
  [OrderStatus.Pending]: OrderStatus.Brewing,
  [OrderStatus.Brewing]: OrderStatus.Ready,
  [OrderStatus.Ready]: OrderStatus.PickedUp,
  [OrderStatus.PickedUp]: null,
}

// 下一個狀態；已經取餐就回傳 null
export function nextStatus(status: OrderStatus): OrderStatus | null {
  return next[status]
}
