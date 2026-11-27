// 練習 5-1：can()（features/staff，第 20 課）
// 問題：起始版的權限表大致寫對了，但門市比較用 user.storeId === order.storeId：
//       某個店長帳號少了 storeId、訂單也剛好少了 storeId 時，undefined === undefined 是 true，他就能動別間店的訂單。
// 要求：can(user, action, order) 照這張表回傳 true／false，其他情況一律 false（預設拒絕）
//   角色      order:view      order:cancel                     order:ready
//   customer  自己的訂單      自己的、而且 status 是 received   不行
//   barista   自己門市的      不行                             自己門市的
//   manager   自己門市的      自己門市的                       自己門市的
//   「自己的」：order.customerId === user.id；「自己門市的」：user.storeId 是數字，而且等於 order.storeId
//   user 是 null、不認得的角色、不認得的動作：false
import type { Order } from '../../shared/api.ts'

export type Role = 'customer' | 'barista' | 'manager'
export type User = { id: number; name: string; role: Role; storeId?: number }
export type Action = 'order:view' | 'order:cancel' | 'order:ready'
type OrderRef = Pick<Order, 'customerId' | 'status'> & { storeId?: number }

const sameStore = (user: User, order: OrderRef) => user.storeId === order.storeId

export function can(user: User | null, action: Action, order: OrderRef): boolean {
  if (!user) return false
  switch (user.role) {
    case 'customer':
      if (order.customerId !== user.id) return false
      return action === 'order:view' || (action === 'order:cancel' && order.status === 'received')
    case 'barista':
      return sameStore(user, order) && (action === 'order:view' || action === 'order:ready')
    case 'manager':
      return sameStore(user, order)
    default:
      return false
  }
}
