// 錯誤寫法：依賴是每次 render 都新建的物件：useMemo 每次都重算
import { useMemo, useState } from 'react'
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

  // 只在 orders、products、category 改變時重算；備註、顯示營收改變時拿上一次的結果
  const filter = { category }
  const rows = useMemo(() => rankProducts(orders, products, filter.category), [orders, products, filter])

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
