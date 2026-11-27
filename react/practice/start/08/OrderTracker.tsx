// 練習 4：訂單追蹤 OrderTracker（在 effect 裡 dispatch；先完成練習 2）
// 情境：櫃檯的系統會推送訂單的進度。source.subscribe(listener) 開始接收，每次有進度就用一個 OrderAction 呼叫 listener；
//       它回傳一個函式，呼叫後停止接收。
// 問題：下面用 useState 存狀態，listener 自己判斷「現在是 paid 才能開始製作」。但 effect 只在掛載時執行一次，
//       listener 讀到的 status 永遠是第一次 render 的 'pending'（第 5 課的過期閉包），付款之後的進度全部被忽略；
//       為了讓 eslint 不報錯，還用註解把依賴檢查關掉。把 status 加進依賴陣列也不對：每次進度改變都會退訂再重新訂閱。
// 要求：
//   1. 用 useReducer(orderReducer, { status: 'pending' }) 管訂單狀態，元件裡不再自己判斷哪個轉換合法
//   2. effect 只做訂閱與退訂：收到的 action 交給 dispatch。依賴陣列照實列出（不能用註解關掉 eslint 的檢查），
//      而且訂單進度改變時不能重新訂閱；source 換了才退訂舊的、訂閱新的；卸載時退訂
//   3. 「取消訂單」按鈕：dispatch cancelled，reason 是 '顧客取消'；不能取消時 disabled（用練習 2 的 canCancel，規則不要再寫一次）
//   4. 畫面：<p role="status"> 顯示 STATUS_LABEL 對應的文字；已取消時多一段「原因：…」
// 不能做的事：改 orderReducer.ts 來配合這個元件；用 ref 存「最新的狀態」繞過
import { useEffect, useState } from 'react'
import type { OrderAction, OrderState } from './orderReducer.ts'

export type OrderSource = { subscribe(listener: (action: OrderAction) => void): () => void }

export const STATUS_LABEL: Record<OrderState['status'], string> = {
  pending: '等待付款',
  paid: '已付款',
  preparing: '製作中',
  ready: '可以取餐了',
  completed: '已取餐',
  cancelled: '已取消',
}

export default function OrderTracker({ source }: { source: OrderSource }) {
  const [status, setStatus] = useState<OrderState['status']>('pending')
  const [reason, setReason] = useState('')

  useEffect(() => {
    return source.subscribe(action => {
      if (action.type === 'paid' && status === 'pending') setStatus('paid')
      if (action.type === 'started' && status === 'paid') setStatus('preparing')
      if (action.type === 'finished' && status === 'preparing') setStatus('ready')
      if (action.type === 'picked_up' && status === 'ready') setStatus('completed')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cancel() {
    setStatus('cancelled')
    setReason('顧客取消')
  }

  return (
    <section>
      <p role="status">{STATUS_LABEL[status]}</p>
      {status === 'cancelled' && <p>原因：{reason}</p>}
      <button type="button" disabled={status !== 'pending' && status !== 'paid'} onClick={cancel}>取消訂單</button>
    </section>
  )
}
