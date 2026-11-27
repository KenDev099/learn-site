// 練習 3 要測的程式（這個檔不用改）：取餐櫃台
import { createServer } from 'node:http'

export type Order = { id: number, item: string, status: 'brewing' | 'ready' }

export const BREW_MS = 2000   // 沖煮時間（示範用，縮短成 2 秒）

export function createStore() {
  const orders: Order[] = []
  return {
    add(item: string): Order {
      const order: Order = { id: orders.length + 1, item, status: 'brewing' }
      orders.push(order)
      return order
    },
    get: (id: number) => orders.find(o => o.id === id),
    all: () => [...orders],
  }
}
export type Store = ReturnType<typeof createStore>

// 整個程式共用的一份
export const store = createStore()

// 開始沖煮：BREW_MS 之後變成 ready
export function startBrewing(order: Order) {
  setTimeout(() => { order.status = 'ready' }, BREW_MS)
}

// 收據標題：用台灣的日期，例如「收據 2026-01-02」
export function receiptTitle(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `收據 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// GET /orders/:id → 200 與訂單 JSON；找不到 → 404
export function createApp(s: Store = store) {
  return createServer((req, res) => {
    const order = s.get(Number(req.url?.match(/^\/orders\/(\d+)$/)?.[1]))
    res.statusCode = order ? 200 : 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(order ?? { error: '找不到這張訂單' }))
  })
}
