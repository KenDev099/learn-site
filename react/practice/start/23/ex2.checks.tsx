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
import { cleanup, render, screen } from '@testing-library/react'
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
  await user.click(screen.getAllByRole('button', { name: '完成' })[0])
  expect(onComplete).toHaveBeenCalled()
  // 在這裡改寫：找到「陳美華」那一列，按它的「完成」，檢查表格、已完成清單、標題和 onComplete
}
