/*
  練習 2：替櫃台的待取餐清單寫檢查
  問題：起始版只確認「有一顆完成按鈕可以按」，按錯列、標題沒更新、已完成沒出現，全都抓不到。
  要求：完成 checkPickupQueue(Queue)：用你自己準備的三筆訂單 render，按「中間那一筆」的「完成」，
        元件不符合 PickupQueue.tsx 開頭的規格時丟出錯誤，符合時正常結束。
  - 用列（row）的名稱找到那一筆，再用 within(那一列) 找它的「完成」按鈕；不要用第幾個按鈕、第幾欄
  - 檢查：那一筆從「待取餐」表格消失、其他筆還在、出現在「已完成」清單、標題從 3 變 2、onComplete 收到那一筆的 id
  - 「已完成」清單裡也有顧客姓名，所以「從畫面上消失」要限定在表格裡檢查
  判分：你的函式會被套在 2 個正確版本（欄位順序、標記都不同）和 5 個錯誤版本上。
*/
import { expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PickupOrder, PickupQueueProps } from './PickupQueue.tsx'

const ORDERS: PickupOrder[] = [
  { id: 101, customer: '王小明', items: '美式咖啡 ×1' },
  { id: 102, customer: '陳美華', items: '拿鐵 ×2' },
  { id: 103, customer: '林志豪', items: '可頌 ×1、伯爵紅茶 ×1' },
]

export async function checkPickupQueue(Queue: ComponentType<PickupQueueProps>) {
  cleanup()
  const user = userEvent.setup()
  const onComplete = vi.fn()
  render(<Queue orders={ORDERS} onComplete={onComplete} />)
  const table = () => screen.getByRole('table', { name: '待取餐' })
  const row = (customer: string) => within(table()).queryByRole('row', { name: new RegExp(customer) })

  expect(screen.getByRole('heading', { name: '待取餐（3）' }), '一開始標題是「待取餐（3）」').toBeInTheDocument()

  // 按中間那一筆：只按第一筆的話，「不管按哪列都完成第一筆」的錯誤抓不到
  const target = row('陳美華')
  expect(target, '表格裡要有陳美華那一列').not.toBeNull()
  await user.click(within(target!).getByRole('button', { name: '完成' }))

  expect(row('陳美華'), '完成的那一筆要從待取餐表格消失').toBeNull()
  expect(row('王小明'), '沒按的訂單要留在表格裡').not.toBeNull()
  expect(row('林志豪'), '沒按的訂單要留在表格裡').not.toBeNull()
  const done = screen.getByRole('list', { name: '已完成' })
  expect(within(done).getByText(/陳美華/), '完成的那一筆要出現在「已完成」清單').toBeInTheDocument()
  expect(onComplete, '按一次完成，onComplete 呼叫一次').toHaveBeenCalledTimes(1)
  expect(onComplete, 'onComplete 要收到那一筆訂單的 id').toHaveBeenCalledWith(102)
}
