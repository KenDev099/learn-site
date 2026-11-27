import { describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryMenu } from './CategoryMenu.tsx'
import { createCategoryApi } from './menu-api.ts'
import { shown } from './test-utils.tsx'

// 會讓元件暫停（suspend）的操作要包在 await act(...) 裡（第 13 課）
async function setup() {
  const user = userEvent.setup()
  const api = createCategoryApi()
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(<CategoryMenu api={api} />) })
  const choose = (name: string) => act(async () => { await user.click(screen.getByRole('button', { name })) })
  const finish = async (i: number) => {
    const call = api.calls[i]
    expect(call, `第 ${i + 1} 次 api.getCategory 沒有被呼叫`).toBeDefined()
    await act(async () => { call.resolve() })
  }
  return { api, choose, finish, ...view }
}
const menu = () => {
  const list = screen.queryByRole('list', { name: '菜單', hidden: true }) as HTMLElement | null
  return shown(list) ? [...list!.querySelectorAll('li')].map(li => li.textContent).join('、') : null
}
const pressed = () => screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent).join('、')
const loading = () => screen.queryByText('載入菜單中…')
const switching = () => screen.queryByText('切換中…')
const COFFEE = '美式咖啡 $80、拿鐵 $110、卡布奇諾 $110'

async function loaded() {
  const t = await setup()
  await t.finish(0)
  return t
}

describe('練習 3：換分類時用 Transition 留著舊菜單', () => {
  test('第一次載入顯示「載入菜單中…」，資料到了顯示咖啡', async () => {
    const { api, finish } = await setup()
    expect(api.calls.map(c => c.category), '一開始要抓咖啡一次').toEqual(['coffee'])
    expect(loading(), '第一次載入還是要顯示 Suspense 的 fallback').not.toBeNull()
    await finish(0)
    expect(menu()).toBe(COFFEE)
    expect(pressed()).toBe('咖啡')
  })

  test('換分類：舊菜單留著，不顯示「載入菜單中…」，顯示「切換中…」', async () => {
    const { api, choose } = await loaded()
    await choose('茶')
    expect(api.calls.map(c => c.category), '按「茶」要呼叫 api.getCategory("tea") 一次').toEqual(['coffee', 'tea'])
    expect(
      loading(),
      '換分類時整份菜單被換成「載入菜單中…」：已經顯示過的內容再暫停，Suspense 會換回 fallback。把換分類的 setState 放進 startTransition（也不要給 Suspense 加會變的 key，那會變成一個新的邊界）',
    ).toBeNull()
    expect(menu(), '等茶的資料時，咖啡的菜單要留在畫面上（不能被藏起來或換掉）').toBe(COFFEE)
    expect(switching(), '等待時要顯示 <p role="status">切換中…</p>：用 useTransition 的 isPending').not.toBeNull()
    expect(pressed(), '畫面上還是咖啡的菜單，選中的按鈕也要還是「咖啡」：setCategory 和 setItemsPromise 都放進同一個 startTransition').toBe('咖啡')
  })

  test('資料到了：換成新分類，切換中消失', async () => {
    const { choose, finish } = await loaded()
    await choose('茶')
    await finish(1)
    expect(menu()).toBe('伯爵紅茶 $90')
    expect(pressed()).toBe('茶')
    expect(switching(), '換好之後「切換中…」要消失').toBeNull()
  })

  test('父元件重新 render 不會再呼叫 API', async () => {
    const { api, rerender, choose, finish } = await loaded()
    await choose('點心')
    await finish(1)
    await act(async () => { rerender(<CategoryMenu api={api} />) })
    expect(
      api.calls.length,
      '父元件重新 render 時又呼叫了 api.getCategory：Promise 要在按下按鈕時建立、存進 state，不要在 render 裡呼叫 API',
    ).toBe(2)
    expect(menu()).toBe('可頌 $70、起司蛋糕 $120')
  })

  test.each([
    ['先按的先回來', [1, 2]], ['後按的先回來', [2, 1]],
  ] as const)('連按茶和點心（%s）：中途不閃出別的分類，最後是點心', async (_, order) => {
    const { choose, finish } = await loaded()
    await choose('茶')
    await choose('點心')
    await finish(order[0])
    if (order[0] === 1) {
      expect(menu(), '茶先回來了，但最後按的是點心：畫面要繼續留著咖啡，等點心').toBe(COFFEE)
      expect(loading()).toBeNull()
    }
    await finish(order[1])
    expect(menu(), '最後按的是點心').toBe('可頌 $70、起司蛋糕 $120')
    expect(pressed()).toBe('點心')
    expect(switching()).toBeNull()
  })
})
