import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrderTracker, { type OrderSource } from './OrderTracker.tsx'
import { orderReducer, type OrderAction } from './orderReducer.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

// 把 orderReducer 包一層記錄用的假函式（行為不變）
vi.mock('./orderReducer.ts', async importOriginal => {
  const mod = await importOriginal<typeof import('./orderReducer.ts')>()
  return { ...mod, orderReducer: vi.fn(mod.orderReducer) }
})
const reducer = vi.mocked(orderReducer)
beforeEach(() => { reducer.mockClear() })   // 不能直接回傳：beforeEach 回傳的函式會被當成清理函式呼叫
const actions = () => reducer.mock.calls.map(c => c[1]).filter((a, i, all) => a !== all[i - 1])

const at = '2026-11-05T01:30:00.000Z'
const PAID: OrderAction = { type: 'paid', at }

// 假的進度來源：記錄訂閱、退訂的次數，emit() 把 action 送給目前所有的 listener
function fakeSource() {
  const listeners = new Set<(action: OrderAction) => void>()
  const source = {
    subscribed: 0,
    unsubscribed: 0,
    subscribe(listener: (action: OrderAction) => void) {
      source.subscribed++
      listeners.add(listener)
      return () => { source.unsubscribed++; listeners.delete(listener) }
    },
    emit(...list: OrderAction[]) {
      for (const action of list) act(() => { for (const l of [...listeners]) l(action) })
    },
    active: () => listeners.size,
  } satisfies OrderSource & Record<string, unknown>
  return source
}
const status = () => screen.getByRole('status').textContent
const cancelButton = () => screen.getByRole('button', { name: '取消訂單' })

describe('練習 4：OrderTracker 在 effect 裡把進度交給 dispatch', () => {
  test('掛載後訂閱一次，一開始顯示「等待付款」', () => {
    const source = fakeSource()
    render(<OrderTracker source={source} />)
    expect(status()).toBe('等待付款')
    expect(source.subscribed, '掛載後要呼叫 source.subscribe 一次').toBe(1)
  })

  test('進度一路推進：已付款 → 製作中 → 可以取餐了 → 已取餐', () => {
    const source = fakeSource()
    render(<OrderTracker source={source} />)
    const seen: string[] = []
    for (const action of [PAID, { type: 'started' }, { type: 'finished' }, { type: 'picked_up' }] as OrderAction[]) {
      source.emit(action)
      seen.push(status())
    }
    expect(seen, '付款之後的進度沒有反映在畫面上：listener 不能讀 render 當下的 status（過期閉包）。把收到的 action 交給 dispatch，由 orderReducer 用最新的 state 決定').toEqual(['已付款', '製作中', '可以取餐了', '已取餐'])
    expect(actions(), '收到的每個 action 都要原封不動交給 orderReducer（用 useReducer，不要在元件裡自己判斷轉換）').toEqual([PAID, { type: 'started' }, { type: 'finished' }, { type: 'picked_up' }])
  })

  test('不合法的進度被忽略', () => {
    const source = fakeSource()
    render(<OrderTracker source={source} />)
    source.emit({ type: 'started' }, { type: 'picked_up' })
    expect(status(), '還沒付款就收到 started、picked_up：維持「等待付款」').toBe('等待付款')
    source.emit(PAID, { type: 'finished' })
    expect(status(), '已付款時收到 finished（還沒開始製作）：維持「已付款」').toBe('已付款')
  })

  test('訂單進度改變時不重新訂閱；卸載時退訂', () => {
    const source = fakeSource()
    const { unmount } = render(<OrderTracker source={source} />)
    source.emit(PAID, { type: 'started' }, { type: 'finished' })
    expect(status()).toBe('可以取餐了')
    expect([source.subscribed, source.unsubscribed], '收了三次進度，還是只訂閱一次、沒有退訂過：effect 的依賴不能包含訂單狀態。dispatch 的參考不會變，listener 只用 dispatch 就不需要依賴 state').toEqual([1, 0])
    unmount()
    expect([source.unsubscribed, source.active()], '卸載時要退訂：effect 回傳 subscribe 給的那個函式').toEqual([1, 0])
  })

  test('source 換了：退訂舊的、訂閱新的，訂單狀態保留', () => {
    const first = fakeSource(), second = fakeSource()
    const { rerender } = render(<OrderTracker source={first} />)
    first.emit(PAID)
    rerender(<OrderTracker source={second} />)
    expect([first.unsubscribed, first.active(), second.subscribed], 'source 換了：退訂舊的、訂閱新的（依賴陣列要有 source）').toEqual([1, 0, 1])
    expect(status(), '換 source 不會重設訂單狀態').toBe('已付款')
    second.emit({ type: 'started' })
    expect(status(), '新的 source 送來的進度要生效').toBe('製作中')
  })

  test('取消訂單：等待付款、已付款時可以取消，顯示原因', async () => {
    const user = userEvent.setup()
    const source = fakeSource()
    render(<OrderTracker source={source} />)
    expect(cancelButton(), '等待付款時可以取消').toBeEnabled()
    source.emit(PAID)
    expect(cancelButton(), '已付款時還可以取消（用 canCancel，不要自己再寫一份規則）').toBeEnabled()
    reducer.mockClear()
    await user.click(cancelButton())
    expect(actions(), "按「取消訂單」要 dispatch { type: 'cancelled', reason: '顧客取消' }").toEqual([{ type: 'cancelled', reason: '顧客取消' }])
    expect(status()).toBe('已取消')
    expect(screen.getByText('原因：顧客取消')).toBeInTheDocument()
    expect(cancelButton(), '已取消之後按鈕要 disabled').toBeDisabled()
    source.emit({ type: 'started' })
    expect(status(), '取消之後才收到 started（櫃檯慢了一步）：維持「已取消」').toBe('已取消')
  })

  test('開始製作之後不能取消', () => {
    const source = fakeSource()
    render(<OrderTracker source={source} />)
    source.emit(PAID, { type: 'started' })
    expect(cancelButton(), '製作中不能取消：disabled 用 canCancel(order) 決定').toBeDisabled()
    expect(screen.queryByText(/原因/)).not.toBeInTheDocument()
  })

  test('依賴陣列照實列出，沒有 eslint-disable', { timeout: 20_000 }, async () => {
    const file = join(import.meta.dirname, 'OrderTracker.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉依賴檢查').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'react-hooks 的規則要全部通過：effect 用到的 props／state 都要列在依賴陣列').toEqual([])
  })
})
