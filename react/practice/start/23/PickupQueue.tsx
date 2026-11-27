/*
  練習 2 的受測元件（已經寫好，不用改）：櫃台的待取餐清單
  規格（你的檢查只能依賴這裡寫的東西；判分時會換成欄位順序、標記、內部寫法都不同的另一個正確版本）：
  - props：orders（一開始的待取餐訂單，{ id, customer, items }[]）、onComplete(id: number)
  - 標題（heading）「待取餐（N）」，N 是還沒完成的筆數
  - 待取餐是一個名稱為「待取餐」的表格（table）：每筆訂單一列（row），列裡有顧客姓名、品項和一顆「完成」按鈕
  - 按某一列的「完成」：
    - 那一筆從表格裡消失，標題的 N 減 1
    - 那一筆出現在名稱為「已完成」的清單（list）裡，清單項目含顧客姓名
    - 呼叫 onComplete(那一筆的 id) 一次
*/
import { useState } from 'react'

export type PickupOrder = { id: number; customer: string; items: string }
export type PickupQueueProps = { orders: readonly PickupOrder[]; onComplete: (id: number) => void }

export function PickupQueue({ orders, onComplete }: PickupQueueProps) {
  const [doneIds, setDoneIds] = useState<number[]>([])
  const waiting = orders.filter(o => !doneIds.includes(o.id))
  const done = doneIds.map(id => orders.find(o => o.id === id)!)

  function complete(id: number) {
    setDoneIds([...doneIds, id])
    onComplete(id)
  }

  return (
    <section className="queue">
      <h2 className="queue__title">待取餐（{waiting.length}）</h2>
      <table className="queue__table">
        <caption>待取餐</caption>
        <thead>
          <tr><th>單號</th><th>顧客</th><th>品項</th><th></th></tr>
        </thead>
        <tbody>
          {waiting.map(o => (
            <tr key={o.id} className="queue__row">
              <td>#{o.id}</td>
              <td>{o.customer}</td>
              <td>{o.items}</td>
              <td><button type="button" onClick={() => complete(o.id)}>完成</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>已完成</h3>
      <ul aria-label="已完成" className="queue__done">
        {done.map(o => <li key={o.id}>#{o.id} {o.customer}</li>)}
      </ul>
    </section>
  )
}
