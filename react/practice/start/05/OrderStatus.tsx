// 練習 3：OrderStatus（訂閱訂單狀態）
// 問題：這個元件每次重新 render 都重新訂閱一次，而且從來沒有取消訂閱：
//       換一張訂單之後，舊訂單的推播還會改到畫面；元件卸載後 listener 還留在 hub 裡。
// 要求：
//   1. 用 hub.subscribe({ storeId, orderId }, listener) 訂閱，畫面顯示「訂單 #12：製作中」
//   2. storeId 或 orderId 改變時：先取消舊的訂閱，再訂閱新的
//   3. 元件卸載時取消訂閱（hub.subscribe 回傳的函式就是「取消訂閱」）
//   4. hub、storeId、orderId 都沒變時，重新 render 不能重新訂閱
// 不能做：用註解關掉 react-hooks 的 lint 檢查；改 order-hub.ts
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  const target = { storeId, orderId }

  useEffect(() => {
    hub.subscribe(target, setStatus)
  }, [hub, target])

  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
