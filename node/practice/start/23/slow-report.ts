// 練習 1：匯出一整個月的訂單 CSV，跑起來要將近一秒。先不要改它，用 --cpu-prof 找出時間花在哪裡
// 在 work/23 執行：node --cpu-prof --cpu-prof-dir=profiles slow-report.ts
type Order = { id: number, customer: string, product: string, qty: number, total: number, at: number }

const CUSTOMERS = ['王小明', '陳美華', '林志豪', '張雅婷', '李建國', '黃淑芬']
const PRODUCTS = [['美式咖啡', 80], ['拿鐵', 110], ['卡布奇諾', 110], ['伯爵紅茶', 90], ['可頌', 70], ['起司蛋糕', 120]] as const

// 固定種子的亂數：每次執行產生一樣的資料
function makeRandom(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
}

function loadOrders(count: number): Order[] {
  const random = makeRandom(42)
  const orders: Order[] = []
  for (let id = 1; id <= count; id++) {
    const [product, price] = PRODUCTS[Math.floor(random() * PRODUCTS.length)]
    const qty = 1 + Math.floor(random() * 3)
    const order = { id, customer: CUSTOMERS[Math.floor(random() * CUSTOMERS.length)], product, qty, total: price * qty, at: Date.UTC(2026, 9, 1) + Math.floor(random() * 30 * 86_400_000) }
    orders.push(order)
    if (random() < 0.02) orders.push({ ...order })   // 重送造成的重複
  }
  return orders
}

function sortByTime(orders: Order[]) {
  return orders.toSorted((a, b) => a.at - b.at)
}

// 金額加上千分位：1234567 → "1,234,567"
function formatPrice(n: number) {
  let out = ''
  const digits = String(n)
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return out
}

// 收銀機斷線重送時，同一筆訂單會出現兩次：用 id 去掉重複的，保留第一次出現的
function removeDuplicates(orders: Order[]) {
  const result: Order[] = []
  for (const o of orders) {
    let seen = false
    for (const r of result) {
      if (r.id === o.id) { seen = true; break }
    }
    if (!seen) result.push(o)
  }
  return result
}

// CSV 欄位跳脫：有逗號、引號、換行時用引號包起來，裡面的引號變成兩個
function escapeField(value: string) {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

function formatLine(o: Order) {
  const time = new Date(o.at).toISOString()
  return [o.id, time, escapeField(o.customer), escapeField(o.product), o.qty, escapeField(formatPrice(o.total))].join(',')
}

function toCsv(orders: Order[]) {
  const lines = ['id,time,customer,product,qty,total']
  for (const o of orders) lines.push(formatLine(o))
  return lines.join('\n')
}

function main() {
  const started = performance.now()
  const orders = sortByTime(removeDuplicates(loadOrders(30_000)))
  const csv = toCsv(orders)
  console.log(`${orders.length} 筆訂單，CSV ${csv.length} 個字元，花了 ${Math.round(performance.now() - started)}ms`)
}

main()
