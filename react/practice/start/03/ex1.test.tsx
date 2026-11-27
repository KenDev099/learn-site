import { describe, expect, test, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StampCard } from './StampCard.tsx'
import { deferred, type Deferred } from '../../helpers/deferred.ts'

// save 是假的「存到伺服器」：每次呼叫都等著，由測試決定什麼時候完成
function setup() {
  const pending: Deferred<void>[] = []
  const save = vi.fn(() => {
    const d = deferred<void>()
    pending.push(d)
    return d.promise
  })
  const user = userEvent.setup()
  const { container } = render(<StampCard save={save} />)
  const card = within(container)
  return {
    save, user,
    stamps: () => card.getByText(/^已集/),
    button: (name: string) => card.getByRole('button', { name }),
    hasHint: () => card.queryByText('可以兌換一杯') !== null,
    saved: () => act(async () => { for (const d of pending.splice(0)) d.resolve() }),
  }
}

describe('練習 1：StampCard 用 useState 記點數', () => {
  test('一開始是 0 點', () => {
    const { stamps } = setup()
    expect(stamps()).toHaveTextContent('已集 0 點')
  })

  test('按「買三杯」一次加 3 點，再按一次是 6 點', async () => {
    const { user, stamps, button } = setup()
    await user.click(button('買三杯'))
    expect(stamps(), '按一次「買三杯」要加 3 點：同一次 render 裡的 stamps 是固定的快照，連呼叫三次 setStamps(stamps + 1) 都是「設成 1」。改成傳 updater 函式，或直接算好 stamps + 3').toHaveTextContent('已集 3 點')
    await user.click(button('買三杯'))
    expect(stamps(), '第二次按「買三杯」要從 3 變成 6：新的點數要從目前的點數算出來，不能寫死').toHaveTextContent('已集 6 點')
  })

  test('按「集 1 點」要先呼叫 save()，完成之前不能加點', async () => {
    const { user, stamps, button, save, saved } = setup()
    await user.click(button('集 1 點'))
    expect(save, '按「集 1 點」要呼叫一次 save()').toHaveBeenCalledTimes(1)
    expect(stamps(), 'save() 還沒完成，畫面不能先加點：先 await save()，再更新 state').toHaveTextContent('已集 0 點')
    await saved()
    expect(stamps(), 'save() 完成後要加 1 點').toHaveTextContent('已集 1 點')
  })

  test('連按三下「集 1 點」，三個 save 都完成後是 3 點', async () => {
    const { user, stamps, button, save, saved } = setup()
    for (let i = 0; i < 3; i++) await user.click(button('集 1 點'))
    expect(save, '按三下要呼叫三次 save()').toHaveBeenCalledTimes(3)
    await saved()
    expect(stamps(), '三個 save 都完成後要是 3 點：三次點擊都發生在同一次 render，await 之後讀到的 stamps 還是按下當時的 0。await 之後更新 state 要用 updater 函式（s => s + 1），從最新的值算').toHaveTextContent('已集 3 點')
  })

  test('不到 10 點時不能兌換', async () => {
    const { user, button, hasHint } = setup()
    for (let i = 0; i < 3; i++) await user.click(button('買三杯'))   // 9 點
    expect(button('兌換'), '9 點時「兌換」按鈕要是 disabled').toBeDisabled()
    expect(hasHint(), '9 點時不能顯示「可以兌換一杯」').toBe(false)
  })

  test('滿 10 點顯示提示，兌換後扣 10 點', async () => {
    const { user, stamps, button, hasHint, saved } = setup()
    for (let i = 0; i < 3; i++) await user.click(button('買三杯'))   // 9 點
    await user.click(button('集 1 點'))
    await saved()                                                    // 10 點
    expect(hasHint(), '剛好 10 點就要顯示 <p>可以兌換一杯</p>：從 stamps 算出來（stamps >= 10），不管點數是哪個按鈕加的').toBe(true)
    expect(button('兌換'), '10 點時「兌換」按鈕要可以按').toBeEnabled()
    await user.click(button('買三杯'))                               // 13 點
    await user.click(button('兌換'))
    expect(stamps(), '13 點兌換後要剩 3 點：扣 10 點，不是歸零').toHaveTextContent('已集 3 點')
    expect(hasHint(), '剩 3 點時提示要消失').toBe(false)
    expect(button('兌換'), '剩 3 點時「兌換」按鈕要回到 disabled').toBeDisabled()
  })

  test('兩張卡各自計數', async () => {
    const a = setup()
    const b = setup()
    await a.user.click(a.button('買三杯'))
    expect(a.stamps(), '第一張卡按「買三杯」要變成 3 點').toHaveTextContent('已集 3 點')
    expect(b.stamps(), '另一張卡不能跟著變：點數要放在 useState，不要放在元件外面的變數').toHaveTextContent('已集 0 點')
  })
})
