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
import userEvent from '@testing-library/user-event'
import type { PreorderFormProps } from './PreorderForm.tsx'

function setup(Form: ComponentType<PreorderFormProps>) {
  cleanup()
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<Form onSubmit={onSubmit} />)
  const fill = async ({ name, quantity }: { name: string; quantity: string }) => {
    if (name) await user.type(screen.getByLabelText('姓名'), name)
    const qty = screen.getByLabelText('數量')
    await user.clear(qty)
    await user.type(qty, quantity)
  }
  const send = () => user.click(screen.getByRole('button', { name: '送出預訂' }))
  return { user, onSubmit, fill, send }
}

export async function checkPreorderForm(Form: ComponentType<PreorderFormProps>) {
  // 情境 1：正確填寫
  {
    const { user, onSubmit, fill, send } = setup(Form)
    await fill({ name: '  王小明 ', quantity: '2' })
    await user.selectOptions(screen.getByLabelText('品項'), '拿鐵')
    await send()
    expect(onSubmit, '填好之後按送出，onSubmit 要被呼叫一次').toHaveBeenCalledTimes(1)
    expect(onSubmit, 'onSubmit 的參數：姓名去掉空白、拿鐵的 id 是 2、數量是數字 2').toHaveBeenCalledWith({ name: '王小明', productId: 2, quantity: 2 })
    expect(screen.queryByRole('alert'), '資料正確時不能有錯誤訊息').not.toBeInTheDocument()
  }

  // 情境 2：姓名只有空白，補上之後再送
  {
    const { user, onSubmit, send } = setup(Form)
    await user.type(screen.getByLabelText('姓名'), '   ')
    await send()
    expect(screen.getByRole('alert'), '姓名只有空白要顯示 role="alert" 的錯誤').toBeInTheDocument()
    expect(onSubmit, '有錯誤時不能呼叫 onSubmit').not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('姓名'), '陳美華')
    await send()
    expect(onSubmit).toHaveBeenCalledWith({ name: '陳美華', productId: 1, quantity: 1 })
    expect(screen.queryByRole('alert'), '改正之後錯誤訊息要消失').not.toBeInTheDocument()
  }

  // 情境 3：數量是 0
  {
    const { onSubmit, fill, send } = setup(Form)
    await fill({ name: '林志豪', quantity: '0' })
    await send()
    expect(screen.getByRole('alert'), '數量 0 要顯示 role="alert" 的錯誤').toBeInTheDocument()
    expect(onSubmit, '數量 0 不能呼叫 onSubmit').not.toHaveBeenCalled()
  }
}
