import { describe, expect, test } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuSearch } from './MenuSearch.tsx'
import { createSearchCache } from './search-cache.ts'
import { shown } from './test-utils.tsx'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'

async function setup() {
  const user = userEvent.setup()
  const api = createFakeMenuApi({ manual: true })
  await act(async () => { render(<MenuSearch cache={createSearchCache(api)} />) })
  const input = () => screen.getByLabelText('搜尋商品') as HTMLInputElement
  // 打字可能讓元件暫停，要包在 await act(...) 裡（第 13 課）
  const type = (text: string) => act(async () => { await user.type(input(), text) })
  const finish = async (i: number) => {
    const call = api.callsOf('search')[i]
    expect(call, `第 ${i + 1} 次 api.search 沒有被呼叫`).toBeDefined()
    await act(async () => { call.resolve() })
  }
  const searched = () => api.callsOf('search').map(c => c.args[0])
  return { api, input, type, finish, searched }
}
const area = () => screen.getByRole('region', { name: '搜尋結果區' })
const results = () => {
  const list = within(area()).queryByRole('list', { name: '搜尋結果', hidden: true }) as HTMLElement | null
  return shown(list) ? [...list!.querySelectorAll('li')].map(li => li.textContent).join('、') : null
}
const hint = () => shown(screen.queryByText('輸入品名開始搜尋'))
const fallback = () => screen.queryByText('搜尋中…')

describe('練習 4：useDeferredValue 讓搜尋時留著舊結果', () => {
  test('一開始顯示提示，不搜尋', async () => {
    const { searched } = await setup()
    expect(hint()).toBe(true)
    expect(searched()).toEqual([])
    expect(area(), '結果區要有 aria-busy，一開始是 "false"').toHaveAttribute('aria-busy', 'false')
  })

  test('第一次搜尋：輸入框立刻更新，提示留著、aria-busy 是 true，不顯示「搜尋中…」', async () => {
    const { input, type, searched } = await setup()
    await type('拿')
    expect(input().value, '輸入框要立刻顯示打的字：不要把 setQuery 放進 startTransition（Transition 不能拿來控制輸入框，等資料時它會停住）').toBe('拿')
    expect(searched()).toEqual(['拿'])
    expect(
      fallback(),
      '每打一個字都顯示「搜尋中…」：用 useDeferredValue(query)，把延後的值交給 SearchResults，等資料時 React 會留著舊的畫面（也不要給 Suspense 加會變的 key）',
    ).toBeNull()
    expect(hint(), '結果還沒回來，畫面上要留著原本的提示').toBe(true)
    expect(area(), '還在等新結果時，結果區要 aria-busy="true"：用 query !== deferredQuery 判斷').toHaveAttribute('aria-busy', 'true')
  })

  test('結果回來：顯示結果，aria-busy 回到 false', async () => {
    const { type, finish } = await setup()
    await type('拿')
    await finish(0)
    expect(results()).toBe('拿鐵 $110')
    expect(area()).toHaveAttribute('aria-busy', 'false')
  })

  test('再打字：上一次的結果留著，新結果到了才換', async () => {
    const { input, type, finish, searched } = await setup()
    await type('卡')
    await finish(0)
    await type('布')
    expect(input().value).toBe('卡布')
    expect(searched()).toEqual(['卡', '卡布'])
    expect(fallback(), '等「卡布」的結果時不能顯示「搜尋中…」').toBeNull()
    expect(results(), '等「卡布」的結果時，「卡」的結果要留在畫面上').toBe('卡布奇諾 $110')
    expect(area()).toHaveAttribute('aria-busy', 'true')
    await finish(1)
    expect(results()).toBe('卡布奇諾 $110')
    expect(area()).toHaveAttribute('aria-busy', 'false')
  })

  test('刪字回到搜尋過的關鍵字：直接顯示快取的結果，不再呼叫 API', async () => {
    const { type, finish, searched } = await setup()
    await type('起')
    await finish(0)
    await type('士')
    await finish(1)
    expect(shown(screen.queryByText('沒有符合「起士」的商品')), '沒有結果時顯示 SearchResults 的提示').toBe(true)
    await type('{Backspace}')
    expect(searched(), '「起」搜尋過了，要用快取的結果').toEqual(['起', '起士'])
    expect(results()).toBe('起司蛋糕 $120')
    expect(area()).toHaveAttribute('aria-busy', 'false')
  })

  test('只有空白時不搜尋', async () => {
    const { type, searched } = await setup()
    await type('  ')
    expect(searched(), '去掉前後空白是空字串時不要呼叫 api.search').toEqual([])
    expect(hint()).toBe(true)
  })
})
