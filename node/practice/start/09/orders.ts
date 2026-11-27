// 咖啡店的訂單資料（已寫好，不用改）
export type Order = { id: number, product: string, qty: number, price: number, hour: number }

export const MENU: Record<string, number> = {
  美式咖啡: 80, 拿鐵: 110, 卡布奇諾: 110, 伯爵紅茶: 90, 可頌: 70, 起司蛋糕: 120,
}
const PRODUCTS = Object.keys(MENU)

// 模擬「從資料庫讀出某一天的訂單」：同一個 day 每次都得到一模一樣的資料
export function loadOrders(day: number, count: number): Order[] {
  if (day === -1) throw new Error('讀取訂單失敗：資料庫連線中斷')   // 測試用：模擬讀取失敗
  if (day === -2) process.exit(1)                                   // 測試用：模擬原生模組出錯，整條執行緒當掉
  let seed = day >>> 0
  const random = () => {            // mulberry32：有種子的亂數，結果可以重現
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const orders: Order[] = []
  for (let id = 1; id <= count; id++) {
    const product = PRODUCTS[Math.floor(random() * PRODUCTS.length)]
    orders.push({ id: day * 1_000_000 + id, product, qty: 1 + Math.floor(random() * 3), price: MENU[product], hour: 7 + Math.floor(random() * 14) })
  }
  return orders
}
