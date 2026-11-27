/*
  練習 1：替外帶預訂表單寫檢查
  問題：起始版只確認「畫面上有東西」，表單壞成什麼樣子都會通過，等於沒有測試。
  要求：完成 checkPreorderForm(Form)：render 傳進來的元件，像使用者一樣操作它；
        元件不符合 PreorderForm.tsx 開頭的規格時丟出錯誤（expect 沒過就會丟錯），符合時正常結束。
  - 至少三個情境：正確填寫後送出、姓名只有空白、數量是 0
  - 正確填寫時，姓名前後故意多打空白、品項選美式咖啡以外的、數量改成 2，
    檢查 onSubmit 只被呼叫一次，而且參數完全正確
  - 找元素只用規格寫到的東西：getByLabelText（欄位）、getByRole（按鈕、alert）。不要用 class、placeholder、data-testid
  - 用 userEvent 操作（type、clear、selectOptions、click）
  - 每個情境開頭呼叫 cleanup() 卸載上一個情境的畫面，再重新 render
  判分：你的函式會被套在 2 個內部寫法不同的正確版本（都要正常結束）和 9 個錯誤版本（每個都要丟錯）上。
*/
import { expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import type { PreorderFormProps } from './PreorderForm.tsx'

export async function checkPreorderForm(Form: ComponentType<PreorderFormProps>) {
  cleanup()
  const onSubmit = vi.fn()
  render(<Form onSubmit={onSubmit} />)
  expect(document.body.textContent).not.toBe('')
  // 在這裡寫：每個情境 cleanup() 再 render，操作表單，檢查畫面和 onSubmit
}
