// 練習 4：櫃台 ServiceDesk（初始值函式、用 key 重設 state）
// 錯誤寫法：一開始就把每位顧客的草稿都讀進父元件：沒看的顧客也讀了，換回來時沒送出的杯數還留著
import { useState } from 'react'
import type { Customer } from '../../helpers/fake-api.ts'

type Props = {
  customers: readonly Customer[]
  loadDraft: (customerId: number) => number
}

export function ServiceDesk({ customers, loadDraft }: Props) {
  const [selectedId, setSelectedId] = useState(customers[0].id)
  const [cupsById, setCupsById] = useState(() => Object.fromEntries(customers.map(c => [c.id, loadDraft(c.id)])))
  const customer = customers.find(c => c.id === selectedId)!

  return (
    <>
      <nav aria-label="顧客">
        {customers.map(c => (
          <button key={c.id} type="button" aria-pressed={c.id === selectedId} onClick={() => setSelectedId(c.id)}>
            {c.name}
          </button>
        ))}
      </nav>
      <section aria-label="點單">
        <h2>{customer.name}的點單</h2>
        <p>拿鐵 × {cupsById[customer.id]}</p>
        <button type="button" onClick={() => setCupsById(prev => ({ ...prev, [customer.id]: prev[customer.id] + 1 }))}>加一杯</button>
      </section>
    </>
  )
}
