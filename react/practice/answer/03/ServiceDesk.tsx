// 練習 4：櫃台 ServiceDesk（初始值函式、用 key 重設 state）
import { useState } from 'react'
import type { Customer } from '../../helpers/fake-api.ts'

type Props = {
  customers: readonly Customer[]
  loadDraft: (customerId: number) => number
}

export function ServiceDesk({ customers, loadDraft }: Props) {
  const [selectedId, setSelectedId] = useState(customers[0].id)
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
      {/* key 換了，React 就把舊的 OrderPad 連同 state 丟掉，在同一個位置建一個新的 */}
      <OrderPad key={customer.id} customer={customer} loadDraft={loadDraft} />
    </>
  )
}

function OrderPad({ customer, loadDraft }: { customer: Customer; loadDraft: (customerId: number) => number }) {
  // 傳函式：只有第一次 render 會呼叫。寫成 useState(loadDraft(customer.id)) 的話每次 render 都會呼叫，結果被丟掉
  const [cups, setCups] = useState(() => loadDraft(customer.id))

  return (
    <section aria-label="點單">
      <h2>{customer.name}的點單</h2>
      <p>拿鐵 × {cups}</p>
      <button type="button" onClick={() => setCups(c => c + 1)}>加一杯</button>
    </section>
  )
}
