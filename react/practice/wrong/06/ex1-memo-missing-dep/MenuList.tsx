// 練習 1：菜單清單 MenuList（能算出來的值不放 state + effect）
// 問題：「篩選後的清單」「排序後的清單」「件數」都各自放在 state，用三個 effect 一個接一個同步。
//       每個 effect 都在畫面更新之後才執行，再 setState 觸發下一次 render：第一次顯示就 render 了 4 次，
//       中間幾次畫面上是「共 0 項」的舊資料。
// 要求：
//   1. state 只留使用者真正能改的東西：filter（選了哪個分類）與 cheapFirst（有沒有勾排序）
//   2. 清單與件數在 render 中直接從 products、filter、cheapFirst 算出來
//   3. 第一次顯示只 render 一次；按分類、勾排序、父元件換一份 products，也都只多 render 一次
//   4. cheapFirst 勾起來時價格由低到高，同價的維持原本的順序；不勾時是 products 原本的順序
// 不能做的事：
//   - 不能修改 props.products（測試傳進來的是凍結的陣列，sort() 會丟 TypeError；用第 3 課的 toSorted()）
//   - 不能在 effect 裡 setState（測試用 eslint 的 react-hooks/set-state-in-effect 檢查），也不能用註解把 eslint 的檢查關掉
//   - 畫面結構（role、文字）不要改
import { useMemo, useState } from 'react'
import type { Category, Product } from '../../helpers/fake-api.ts'

type Filter = 'all' | Category

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '餐點' },
]

export function MenuList({ products }: { products: readonly Product[] }) {
  // state 只有「使用者選了什麼」
  const [filter, setFilter] = useState<Filter>('all')
  const [cheapFirst, setCheapFirst] = useState(false)

  // 其他都是衍生值：每次 render 從 props 與 state 重新算，永遠跟來源一致
  // 錯：用 useMemo 快取卻漏了依賴，products 或 cheapFirst 變了還拿到舊的結果
  const visible = useMemo(() => {
    const filtered = filter === 'all' ? products : products.filter(p => p.category === filter)
    return cheapFirst ? filtered.toSorted((a, b) => a.price - b.price) : filtered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  return (
    <section>
      <div role="group" aria-label="分類">
        {FILTERS.map(f => (
          <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <label>
        <input type="checkbox" checked={cheapFirst} onChange={e => setCheapFirst(e.target.checked)} /> 便宜的排前面
      </label>
      <p role="status">共 {visible.length} 項</p>
      <ul>
        {visible.map(p => (
          <li key={p.id}>{p.name} ${p.price}</li>
        ))}
      </ul>
    </section>
  )
}
