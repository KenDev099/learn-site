import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FavoriteList } from './FavoriteList.tsx'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

const pick = (...names: string[]) => names.map(n => PRODUCTS.find(p => p.name === n)!)
const row = (name: string) => screen.getByRole('listitem', { name })
const toggle = (name: string) => within(row(name)).getByRole('button', { name: '說明' })
const expanded = () => screen.getAllByRole('listitem').filter(li => within(li).getByRole('button', { name: '說明' }).getAttribute('aria-expanded') === 'true').map(li => li.getAttribute('aria-label'))

// React 發現 hook 的數量變了會丟錯（並印出 console.error）：攔下來，換成說明怎麼修的訊息
function setup(initial: Parameters<typeof FavoriteList>[0]['products']) {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const view = render(<FavoriteList products={initial} />)
  const show = (products: Parameters<typeof FavoriteList>[0]['products'], what: string) => {
    try {
      view.rerender(<FavoriteList products={products} />)
    } catch (e) {
      expect.fail(`${what}時 React 丟出錯誤：「${(e as Error).message}」。hook 寫在 early return 之後或迴圈裡，每次 render 呼叫的 hook 數量就不一樣：把一列抽成元件，在元件最上層呼叫 useExpanded()`)
    }
  }
  return { ...view, show, user: userEvent.setup() }
}

describe('練習 5：FavoriteList', () => {
  test('載入完成、收藏數量改變，都不會出錯', () => {
    const { show } = setup(null)
    expect(screen.getByText('載入中…')).toBeInTheDocument()
    show(pick('拿鐵', '可頌'), '從載入中（null）變成有資料')
    expect(screen.getAllByRole('listitem').map(li => li.getAttribute('aria-label')), '要列出每一個收藏的商品').toEqual(['拿鐵', '可頌'])
    show(pick('拿鐵', '可頌', '起司蛋糕'), '收藏從 2 個變成 3 個')
    show(pick('美式咖啡'), '收藏從 3 個變成 1 個')
    show(null, '重新載入（變回 null）')
    show(pick('伯爵紅茶', '可頌'), '再次載入完成')
    expect(screen.getAllByRole('listitem').map(li => li.getAttribute('aria-label'))).toEqual(['伯爵紅茶', '可頌'])
  })

  test('每一列各自展開', async () => {
    const { user } = setup(pick('美式咖啡', '拿鐵', '起司蛋糕'))
    expect(expanded(), '一開始全部收合').toEqual([])
    await user.click(toggle('拿鐵'))
    expect(expanded(), '按了拿鐵的「說明」，只有拿鐵展開').toEqual(['拿鐵'])
    expect(within(row('拿鐵')).getByText('拿鐵 $110'), '展開後顯示「品名 $價格」').toBeInTheDocument()
    await user.click(toggle('拿鐵'))
    expect(expanded(), '再按一次收合').toEqual([])
  })

  test('移除商品後，展開狀態還跟著原本的商品', async () => {
    const { show, user } = setup(pick('美式咖啡', '拿鐵', '卡布奇諾'))
    await user.click(toggle('拿鐵'))
    show(pick('拿鐵', '卡布奇諾'), '移除第一個商品（清單變短）')
    expect(expanded(), '移除美式咖啡之後，展開的還要是拿鐵。展開狀態是照「第幾個」對應的：key 要用商品的 id，state 要放在以 id 為 key 的那一列裡').toEqual(['拿鐵'])
  })

  test('在前面插入商品後，展開狀態還跟著原本的商品', async () => {
    const { show, user } = setup(pick('拿鐵', '可頌'))
    await user.click(toggle('可頌'))
    show(pick('伯爵紅茶', '拿鐵', '可頌'), '在最前面加入一個商品（清單變長）')
    expect(expanded(), '在前面加入伯爵紅茶之後，展開的還要是可頌，新加入的要是收合。key 用 index 或 state 照位置存，展開狀態會跑到別的商品上').toEqual(['可頌'])
  })

  test('react-hooks 的 lint 規則通過，沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'FavoriteList.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉規則：hook 只能在元件或自訂 hook 的最上層、early return 之前呼叫').not.toMatch(/eslint-disable/)
    const problems = await lintHooks(file)
    expect(problems.map(p => `第 ${p.line} 行 ${p.rule}：${p.message}`), 'hook 不能寫在迴圈、條件、early return 之後：把一列抽成元件，在它的最上層呼叫 useExpanded()').toEqual([])
  }, 30_000)
})
