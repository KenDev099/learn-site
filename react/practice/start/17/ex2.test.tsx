import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutForm, SubmitButton } from './CheckoutForm.tsx'
import { deferred, type Deferred } from '../../helpers/deferred.ts'

/** 等 Action 的 Promise 鏈跑完 */
const tick = () => new Promise(r => setTimeout(r, 0))

// React 會把同時進行的 Transition 合在一起：每個測試結束時把還沒完成的 Action 全部完成，下一個測試才不會被卡住
const unfinished: (() => void)[] = []
afterEach(async () => {
  await act(async () => {
    for (const finish of unfinished.splice(0)) finish()
    await tick()
  })
})

function controlledAction() {
  const pending: Deferred<void>[] = []
  const action = vi.fn((_data: FormData) => {
    const d = deferred<void>()
    pending.push(d)
    unfinished.push(() => d.resolve())
    return d.promise
  })
  const finish = async (i: number) => { await act(async () => { pending[i].resolve(); await tick() }) }
  return { action, finish }
}

describe('練習 2：SubmitButton 用 useFormStatus 顯示送出中', () => {
  test('CheckoutForm：結帳中按鈕 disabled、顯示「結帳中…」，連按只送出一次', async () => {
    const user = userEvent.setup()
    const { action, finish } = controlledAction()
    render(<CheckoutForm checkout={action} />)
    await user.type(screen.getByLabelText('取餐姓名'), '王小明')
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent(/^結帳$/)
    await user.click(button)
    expect(action, '按「結帳」要執行 checkout').toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0][0].get('name')).toBe('王小明')
    expect(button, '結帳中按鈕要 disabled：useFormStatus 只讀得到「包住呼叫它的元件」的 <form>，在 render <form> 的同一個元件裡呼叫永遠是 false，要放進 SubmitButton').toBeDisabled()
    expect(button, '結帳中按鈕文字要是 pendingText「結帳中…」').toHaveTextContent(/^結帳中…$/)
    await user.click(button)
    expect(action, '結帳中再按一次不能再送出').toHaveBeenCalledTimes(1)
    await finish(0)
    expect(button, 'checkout 完成後按鈕要恢復').toBeEnabled()
    expect(button, 'checkout 完成後文字回到 children「結帳」').toHaveTextContent(/^結帳$/)
  })

  test('SubmitButton 放進別的表單也能用（從 useFormStatus 讀狀態，不靠 props）', async () => {
    const user = userEvent.setup()
    const { action, finish } = controlledAction()
    render(
      <form action={action}>
        <SubmitButton pendingText="預約中…">預約取餐</SubmitButton>
      </form>,
    )
    const button = screen.getByRole('button')
    expect(button, '沒在送出時文字是 children').toHaveTextContent(/^預約取餐$/)
    expect(button).toBeEnabled()
    await user.click(button)
    expect(button, 'SubmitButton 要自己用 useFormStatus() 讀包住它的 <form> 是否送出中：pending 時 disabled').toBeDisabled()
    expect(button, 'pending 時文字換成 pendingText').toHaveTextContent(/^預約中…$/)
    await finish(0)
    expect(button, 'Action 結束後恢復：不要用 onClick + useState 自己記錄').toBeEnabled()
    expect(button).toHaveTextContent(/^預約取餐$/)
  })

  test('同一頁兩張表單：只有正在送出的那張的按鈕變成送出中', async () => {
    const user = userEvent.setup()
    const a = controlledAction()
    const b = controlledAction()
    render(
      <>
        <form action={a.action}><SubmitButton pendingText="加入中…">加入購物車</SubmitButton></form>
        <form action={b.action}><SubmitButton pendingText="收藏中…">收藏</SubmitButton></form>
      </>,
    )
    await user.click(screen.getByRole('button', { name: '收藏' }))
    expect(screen.getByRole('button', { name: '收藏中…' }), '送出的那張表單的按鈕要變成送出中').toBeDisabled()
    expect(screen.getByRole('button', { name: '加入購物車' }), '另一張表單沒有送出，它的按鈕不能跟著 disabled：useFormStatus 只回報包住自己的那個 <form>').toBeEnabled()
    await b.finish(0)
    expect(screen.getByRole('button', { name: '收藏' })).toBeEnabled()
    expect(a.action).not.toHaveBeenCalled()
  })
})
