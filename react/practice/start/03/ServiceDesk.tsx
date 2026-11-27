// 練習 4：櫃台 ServiceDesk（初始值函式、用 key 重設 state）
// 櫃台同時服務好幾位顧客：上面一排顧客按鈕，下面是目前這位顧客的點單（OrderPad）。
// 點單的初始數量從草稿讀：loadDraft(customerId) 回傳上次存的杯數（真實情況是讀 localStorage 再解析，不便宜）。
// 問題：
//   - 每按一次「加一杯」，loadDraft 就又被呼叫一次
//   - 換到另一位顧客，杯數還是上一位的
// 要求：
//   1. 一開始選第一位顧客，顯示他草稿裡的杯數
//   2. loadDraft 只在點單第一次出現時呼叫一次，之後按「加一杯」重新 render 不能再呼叫
//   3. 換顧客時，點單要重新開始：杯數是新顧客草稿裡的值。換回原本的顧客，也是回到他草稿裡的值（還沒送出的杯數丟掉）
//   4. 換顧客只能讓畫面更新一次：不能先畫出舊的杯數，再用 effect 改回來
//   5. 沒有換顧客時（再按一次目前的顧客，或父元件因為別的原因重新 render），杯數要留著
// 不能做的事：改畫面上的文字、按鈕名稱、aria-label（測試靠它們找元素）
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
      <OrderPad customer={customer} loadDraft={loadDraft} />
    </>
  )
}

function OrderPad({ customer, loadDraft }: { customer: Customer; loadDraft: (customerId: number) => number }) {
  const [cups, setCups] = useState(loadDraft(customer.id))

  return (
    <section aria-label="點單">
      <h2>{customer.name}的點單</h2>
      <p>拿鐵 × {cups}</p>
      <button type="button" onClick={() => setCups(cups + 1)}>加一杯</button>
    </section>
  )
}
