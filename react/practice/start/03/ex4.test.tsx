import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServiceDesk } from './ServiceDesk.tsx'
import { CUSTOMERS } from '../../helpers/fake-api.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const DRAFTS: Record<number, number> = { 1: 3, 2: 1, 3: 0 }   // 王小明 3 杯、陳美華 1 杯、林志豪 0 杯

function setup(customers = CUSTOMERS.slice(0, 3)) {
  const loadDraft = vi.fn((customerId: number) => DRAFTS[customerId] ?? 0)
  const counter = renderCounter()
  const ui = () => <counter.Profile id="desk"><ServiceDesk customers={customers} loadDraft={loadDraft} /></counter.Profile>
  const user = userEvent.setup()
  const view = render(ui())
  const pad = () => within(screen.getByRole('region', { name: '點單' }))
  return {
    loadDraft, counter,
    pick: (name: string) => user.click(within(screen.getByRole('navigation', { name: '顧客' })).getByRole('button', { name })),
    addCup: () => user.click(pad().getByRole('button', { name: '加一杯' })),
    title: () => pad().getByRole('heading'),
    cups: () => pad().getByText(/^拿鐵/),
    rerender: () => view.rerender(ui()),
  }
}

describe('練習 4：初始值函式與用 key 重設 state', () => {
  test('一開始顯示第一位顧客草稿裡的杯數', () => {
    const { title, cups, loadDraft } = setup()
    expect(title()).toHaveTextContent('王小明的點單')
    expect(cups()).toHaveTextContent('拿鐵 × 3')
    expect(loadDraft).toHaveBeenCalledWith(1)
  })

  test('按「加一杯」重新 render 時不再呼叫 loadDraft', async () => {
    const { addCup, cups, loadDraft } = setup()
    await addCup()
    await addCup()
    expect(cups()).toHaveTextContent('拿鐵 × 5')
    expect(loadDraft, `loadDraft 被呼叫了 ${loadDraft.mock.calls.length} 次：useState(loadDraft(id)) 每次 render 都會先執行 loadDraft 再把結果丟掉。改成傳函式給 useState，React 只在第一次 render 呼叫它`).toHaveBeenCalledTimes(1)
  })

  test('換顧客後，杯數是新顧客草稿裡的值', async () => {
    const { addCup, pick, title, cups, loadDraft } = setup()
    await addCup()
    await addCup()
    await pick('陳美華')
    expect(title()).toHaveTextContent('陳美華的點單')
    expect(cups(), '換到陳美華後要顯示她草稿裡的 1 杯，不是王小明的 5 杯：OrderPad 還在樹上同一個位置，React 會保留它的 state。給它一個跟著顧客變的 key').toHaveTextContent('拿鐵 × 1')
    expect(loadDraft, '換顧客時要讀新顧客的草稿').toHaveBeenLastCalledWith(2)
    await pick('林志豪')
    expect(cups()).toHaveTextContent('拿鐵 × 0')
  })

  test('換回原本的顧客，回到他草稿裡的值', async () => {
    const { addCup, pick, cups, loadDraft } = setup()
    await addCup()
    await pick('陳美華')
    await addCup()
    await pick('王小明')
    expect(cups(), '換回王小明要回到草稿裡的 3 杯：換顧客時舊的點單連同 state 一起丟掉').toHaveTextContent('拿鐵 × 3')
    expect(loadDraft.mock.calls, 'loadDraft 應該只在每次換顧客時各呼叫一次：(1)、(2)、(1)').toEqual([[1], [2], [1]])
  })

  test('換顧客只讓畫面更新一次', async () => {
    const { addCup, pick, cups, counter } = setup()
    await addCup()
    const before = counter.commits('desk')
    await pick('陳美華')
    expect(cups()).toHaveTextContent('拿鐵 × 1')
    expect(counter.commits('desk') - before, '換顧客後畫面更新了不只一次：先畫出舊的杯數、再用 effect 把 state 改回來，使用者會看到閃一下，也多 render 一次。用 key 讓 React 直接換一個新的 OrderPad').toBe(1)
  })

  test('沒有換顧客時，杯數要留著', async () => {
    const { addCup, pick, cups, rerender, loadDraft } = setup()
    await addCup()
    await addCup()
    await pick('王小明')   // 本來就是王小明
    expect(cups(), '再按一次目前的顧客，杯數不能被重設：key 要用顧客的 id，同一位顧客 key 不變').toHaveTextContent('拿鐵 × 5')
    rerender()             // 父元件因為別的原因重新 render
    expect(cups(), '父元件重新 render 時杯數不能被重設：key 不能每次 render 都不一樣（例如 Math.random()），OrderPad 也不能定義在 ServiceDesk 函式裡面').toHaveTextContent('拿鐵 × 5')
    expect(loadDraft).toHaveBeenCalledTimes(1)
  })
})
