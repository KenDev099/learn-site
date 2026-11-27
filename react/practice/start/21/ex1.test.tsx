import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuFilter } from './MenuFilter.tsx'
import { commitLog } from './test-utils.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// 數 ProductGrid 被呼叫（render）幾次：把它換成會記數的版本，畫面不變
const grid = vi.hoisted(() => ({ renders: 0 }))
vi.mock('./ProductGrid.tsx', async importOriginal => {
  const mod = await importOriginal<typeof import('./ProductGrid.tsx')>()
  return {
    ProductGrid(props: Parameters<typeof mod.ProductGrid>[0]) {
      grid.renders++
      return mod.ProductGrid(props)
    },
  }
})
beforeEach(() => { grid.renders = 0 })

const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
const input = () => screen.getByLabelText('篩選商品') as HTMLInputElement
const section = () => screen.getByRole('region', { name: '商品' })
const items = () => {
  const list = within(section()).queryByRole('list', { name: '商品格' })
  return list ? within(list).getAllByRole('listitem').map(li => li.textContent).join('、') : section().textContent
}
// 每次 commit 記下：輸入框的值、商品格的內容、aria-busy
const snapshot = () => ({ input: input().value, items: items(), busy: section().getAttribute('aria-busy') })

function setup() {
  const user = userEvent.setup()
  const commits = commitLog(snapshot)
  render(<commits.Recorder><MenuFilter products={products} /></commits.Recorder>)
  commits.clear()
  grid.renders = 0
  return { user, commits }
}
const ALL = '美式咖啡 $80、拿鐵 $110、卡布奇諾 $110、伯爵紅茶 $90、可頌 $70、起司蛋糕 $120'

describe('練習 1：useDeferredValue 讓很慢的商品格晚一拍跟上', () => {
  test('一開始顯示全部商品，aria-busy 是 false', () => {
    setup()
    expect(items()).toBe(ALL)
    expect(section(), '<section aria-label="商品"> 要有 aria-busy，一開始是 "false"').toHaveAttribute('aria-busy', 'false')
  })

  test('打一個字：先 commit「輸入框是新的、商品格還是舊的」，再 commit「商品格跟上」', async () => {
    const { user, commits } = setup()
    await user.type(input(), '拿')
    const [first] = commits.log
    const last = commits.log.at(-1)
    expect(first, '打完字沒有任何 commit').toBeDefined()
    expect(first.input, '第一次 commit 輸入框就要顯示打的字').toBe('拿')
    expect(
      first.items,
      '第一次 commit 商品格就已經是新的結果了，代表商品格跟輸入框綁在同一次 render，打字會被它拖慢：用 useDeferredValue(keyword)，把延後的值交給商品格',
    ).toBe(ALL)
    expect(last, '最後商品格要跟上，只剩拿鐵').toEqual({ input: '拿', items: '拿鐵 $110', busy: 'false' })
    expect(commits.log.length, '每打一個字應該剛好兩次 commit：輸入框一次、商品格一次').toBe(2)
  })

  test('商品格還沒跟上時 aria-busy 是 true', async () => {
    const { user, commits } = setup()
    await user.type(input(), '可')
    expect(
      commits.log[0]?.busy,
      '輸入框和商品格不一致的那次 commit，<section> 要是 aria-busy="true"：用 keyword !== deferredKeyword 判斷',
    ).toBe('true')
    expect(commits.log.at(-1)?.busy, '跟上之後 aria-busy 要回到 "false"').toBe('false')
  })

  test('每打一個字，ProductGrid 只在背景那次 render', async () => {
    const { user } = setup()
    await user.type(input(), '拿鐵')
    expect(items()).toBe('拿鐵 $110')
    expect(
      grid.renders,
      `打了 2 個字，ProductGrid render 了 ${grid.renders} 次。輸入框先更新的那次 render，傳給它的 props 跟上次一樣，卻還是 render 了：在模組層級用 memo 包住 ProductGrid，它才會跳過`,
    ).toBe(2)
  })

  test('沒有固定延遲：打完字，商品格馬上是最新的結果', async () => {
    const { user } = setup()
    await user.type(input(), '起司')
    expect(
      items(),
      '打完字商品格還沒更新：不要用 setTimeout 做 debounce，useDeferredValue 沒有固定延遲，畫完輸入框就接著畫商品格',
    ).toBe('起司蛋糕 $120')
    expect(input().value).toBe('起司')
    await user.clear(input())
    expect(items(), '清空之後回到全部商品').toBe(ALL)
  })
})
