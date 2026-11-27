/*
練習 3：用 useMemo 快取昂貴的計算（SalesReport）
問題：
  店長的銷售排行頁。rankProducts（report.ts）要掃過整個月的訂單，很慢；
  現在每次 render 都呼叫它，連在「店長備註」打字、勾選「顯示營收」都會重算一次。
要求：
  1. 在「店長備註」打字、切換「顯示營收」：rankProducts 不能再被呼叫
  2. 按分類按鈕（全部／咖啡／茶／點心，aria-pressed 表示選中）：rankProducts 只呼叫一次，排行立刻是新分類的結果，
     而且這次更新只 commit 一次（不能先顯示舊排行、再用 effect 補上新的）
  3. 外層重新 render、orders 和 products 都是同一個陣列時不重算；orders 換成新陣列時重算一次
  4. 排行用 rankProducts 算（不要自己另寫一份），同一頁放兩個 SalesReport 要各算各的
  5. 畫面不變：<ol aria-label="銷售排行"> 每項「品名 N 杯」，勾了「顯示營收」時後面加「 $營收」；沒有資料時顯示 <p>沒有銷售紀錄</p>
不能做的事：
  - 不要改 report.ts
  - 依賴陣列要照 eslint-plugin-react-hooks 的 exhaustive-deps 列完整
*/
import { useState } from 'react'
import type { Category, Product } from '../../helpers/fake-api.ts'
import { rankProducts, type Order } from './report.ts'

type Filter = 'all' | Category
const TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '點心' },
]

export function SalesReport({ orders, products }: { orders: readonly Order[]; products: readonly Product[] }) {
  const [category, setCategory] = useState<Filter>('all')
  const [showRevenue, setShowRevenue] = useState(false)
  const [note, setNote] = useState('')

  const rows = rankProducts(orders, products, category)

  return (
    <section>
      <div>
        {TABS.map(t => (
          <button key={t.value} type="button" aria-pressed={category === t.value} onClick={() => setCategory(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <label><input type="checkbox" checked={showRevenue} onChange={e => setShowRevenue(e.target.checked)} /> 顯示營收</label>
      <label>店長備註 <input value={note} onChange={e => setNote(e.target.value)} /></label>
      {rows.length === 0 ? (
        <p>沒有銷售紀錄</p>
      ) : (
        <ol aria-label="銷售排行">
          {rows.map(r => (
            <li key={r.productId}>{r.name} {r.quantity} 杯{showRevenue && ` $${r.revenue}`}</li>
          ))}
        </ol>
      )}
    </section>
  )
}
