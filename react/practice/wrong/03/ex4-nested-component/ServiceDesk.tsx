// 練習 4：櫃台 ServiceDesk（初始值函式、用 key 重設 state）
// 錯誤寫法：OrderPad 定義在 ServiceDesk 裡面：每次 render 都是新的元件型別，state 每次都被丟掉
import { useState } from 'react'
import type { Customer } from '../../helpers/fake-api.ts'

type Props = {
  customers: readonly Customer[]
  loadDraft: (customerId: number) => number
}

export function ServiceDesk({ customers, loadDraft }: Props) {
  const [selectedId, setSelectedId] = useState(customers[0].id)
  const customer = customers.find(c => c.id === selectedId)!

  function OrderPad() {
    const [cups, setCups] = useState(() => loadDraft(customer.id))
    return (
      <section aria-label="點單">
        <h2>{customer.name}的點單</h2>
        <p>拿鐵 × {cups}</p>
        <button type="button" onClick={() => setCups(c => c + 1)}>加一杯</button>
      </section>
    )
  }

  return (
    <>
      <nav aria-label="顧客">
        {customers.map(c => (
          <button key={c.id} type="button" aria-pressed={c.id === selectedId} onClick={() => setSelectedId(c.id)}>
            {c.name}
          </button>
        ))}
      </nav>
      <OrderPad />
    </>
  )
}
