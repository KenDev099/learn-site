/*
練習 5：審查同事的 PR：訂單狀態頁（第 6、13、15、20、24 課）
同事送來這個 PR，說「畫面都正常」。請先對照下面的驗收條件，自己列出有哪些問題、各是哪一課的觀念，再動手改。
驗收條件：
  1. /orders/:id 顯示那一筆訂單。從 /orders/1 換到 /orders/2 要顯示 2 號訂單（不能看到 1 號的資料）；
     queryFn 要把 signal 傳給 api.getOrder(id, { signal })
  2. 還沒有資料：<p>載入訂單中…</p>；第一次就失敗：<p role="alert">訂單載入失敗</p> 加「重試」按鈕
  3. 有資料之後：<h1>訂單 #編號</h1>；<p role="status"> 顯示狀態（已收單／製作中／可以取餐了），
     它一直是同一個元素，狀態改變只換文字，讀螢幕軟體才會唸出來
  4. 「共 N 件」是明細數量的總和：第一次出現在畫面上就要是對的
  5. 「重新整理」按鈕重抓。重抓失敗時，畫面上的訂單留著，另外顯示 <p role="alert">更新失敗，顯示的是上次的狀態</p>
  6. 明細依數量由多到少排列。API 回傳的資料是快取裡的那一份（測試會把它凍結），不能改到它
  7. 明細壞掉（OrderDetails 在 render 時丟錯）只換掉明細：顯示 <p role="alert">明細暫時無法顯示</p>，
     訂單編號、狀態照常顯示。用 shared/ui/ErrorBoundary.tsx
  8. eslint-plugin-react-hooks 7.1.1 的規則（含 Compiler 的 purity、immutability、set-state-in-effect）沒有回報
  不要改 OrderDetails.tsx
*/
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { OrderStatus, ShopApi } from '../../shared/api.ts'
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary.tsx'
import { OrderDetails } from './OrderDetails.tsx'

const STATUS: Record<OrderStatus, string> = { received: '已收單', brewing: '製作中', ready: '可以取餐了' }

export function OrderStatusPage({ api }: { api: Pick<ShopApi, 'getOrder'> }) {
  const id = Number(useParams().id)
  const { data: order, isPending, isError, refetch } = useQuery({
    queryKey: ['orders', id],                                // 每筆訂單各存一份（第 15 課）
    queryFn: ({ signal }) => api.getOrder(id, { signal }),
  })

  if (isPending) return <p>載入訂單中…</p>
  if (!order) {                                              // 沒有資料又失敗，才換成錯誤畫面
    return (
      <>
        <p role="alert">訂單載入失敗</p>
        <button type="button" onClick={() => void refetch()}>重試</button>
      </>
    )
  }

  const count = order.lines.reduce((sum, l) => sum + l.quantity, 0)   // 衍生值在 render 裡算（第 6 課）
  const lines = order.lines.toSorted((a, b) => b.quantity - a.quantity)  // 不改快取裡的陣列（第 20 課）

  return (
    <main>
      <h1>訂單 #{order.id}</h1>
      <p role="status" key={order.status}>{STATUS[order.status]}</p>
      <p>共 {count} 件，合計 ${order.total}</p>
      <button type="button" onClick={() => void refetch()}>重新整理</button>
      {isError && <p role="alert">更新失敗，顯示的是上次的狀態</p>}
      <ErrorBoundary key={order.id} fallback={() => <p role="alert">明細暫時無法顯示</p>}>
        <OrderDetails lines={lines} />
      </ErrorBoundary>
    </main>
  )
}
