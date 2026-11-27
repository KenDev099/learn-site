/*
  練習 4：替「可以復原的移除」寫檢查（假計時器）
  問題：起始版只確認「按移除之後拿鐵不見了」，5 秒後有沒有真的刪除、復原有沒有取消，全都沒檢查。
  要求：完成 checkRemovableCart(Cart)：元件不符合 RemovableCart.tsx 開頭的規格時丟出錯誤，符合時正常結束。
  - 每個情境開頭：cleanup()、vi.useFakeTimers()，再 render
  - 時間用 act(() => { vi.advanceTimersByTime(毫秒) }) 往前推；不能用真的 setTimeout 等
  - 假計時器開著時 userEvent 會卡住，這一題用 fireEvent.click 點按鈕
  - 情境 1：按「移除拿鐵」→ 拿鐵不在「購物車」清單裡、有含「拿鐵」的 role="status"、還沒呼叫 onRemove；
           到 4999ms 還沒呼叫；滿 5000ms 呼叫 onRemove(拿鐵的 id) 一次、提示消失、拿鐵沒有回來
  - 情境 2：按「移除拿鐵」→ 過 3 秒按「復原」→ 拿鐵回到清單、提示消失；再過 10 秒 onRemove 一次都沒被呼叫
  判分：你的函式會被套在 2 個正確版本和 7 個錯誤版本上，每個版本 2 秒內要跑完。
*/
import { expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { CartItem, RemovableCartProps } from './RemovableCart.tsx'

const ITEMS: CartItem[] = [{ id: 1, name: '美式咖啡' }, { id: 2, name: '拿鐵' }, { id: 5, name: '可頌' }]

function setup(Cart: ComponentType<RemovableCartProps>) {
  cleanup()
  vi.useFakeTimers()
  const onRemove = vi.fn()
  render(<Cart items={ITEMS} onRemove={onRemove} />)
  return { onRemove }
}
// 計時器的 callback 會 setState：包在 act 裡，React 才會在 act 結束前把畫面更新好
const pass = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const inCart = (name: string) => within(screen.getByRole('list', { name: '購物車' })).queryByText(name)

export async function checkRemovableCart(Cart: ComponentType<RemovableCartProps>) {
  // 情境 1：5 秒後才真的刪除
  {
    const { onRemove } = setup(Cart)
    click('移除拿鐵')
    expect(inCart('拿鐵'), '按下移除，拿鐵要立刻從清單消失').toBeNull()
    expect(screen.getByRole('status'), '要有含品名的提示').toHaveTextContent('拿鐵')
    expect(onRemove, '還在可以復原的時間內，不能呼叫 onRemove').not.toHaveBeenCalled()

    pass(4999)
    expect(onRemove, '還沒滿 5 秒不能呼叫 onRemove').not.toHaveBeenCalled()
    pass(1)
    expect(onRemove, '滿 5 秒要呼叫 onRemove 一次').toHaveBeenCalledTimes(1)
    expect(onRemove, 'onRemove 要收到拿鐵的 id').toHaveBeenCalledWith(2)
    expect(screen.queryByRole('status'), '刪除之後提示要消失').not.toBeInTheDocument()
    expect(inCart('拿鐵'), '刪除之後拿鐵不能回到清單').toBeNull()
  }

  // 情境 2：5 秒內復原
  {
    const { onRemove } = setup(Cart)
    click('移除拿鐵')
    pass(3000)
    click('復原')
    expect(inCart('拿鐵'), '按復原，拿鐵要回到清單').not.toBeNull()
    expect(screen.queryByRole('status'), '按復原之後提示要消失').not.toBeInTheDocument()
    expect(onRemove, '復原之後不管過多久都不能呼叫 onRemove').not.toHaveBeenCalled()
  }
}
