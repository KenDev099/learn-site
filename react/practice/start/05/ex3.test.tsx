import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OrderStatus } from './OrderStatus.tsx'
import { createOrderHub, type OrderState } from './order-hub.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

function setup(storeId = 1, orderId = 12) {
  const hub = createOrderHub()
  const view = render(<OrderStatus hub={hub} storeId={storeId} orderId={orderId} />)
  const show = (storeId: number, orderId: number) => view.rerender(<OrderStatus hub={hub} storeId={storeId} orderId={orderId} />)
  const push = (storeId: number, orderId: number, status: OrderState) => act(() => { hub.emit(storeId, orderId, status) })
  return { hub, show, push, ...view }
}
const text = () => screen.getByText(/^訂單 #/).textContent

describe('練習 3：OrderStatus 訂閱訂單狀態', () => {
  test('掛載後訂閱，狀態改變時更新畫面', () => {
    const { hub, push } = setup()
    expect(hub.listenerCount(), '掛載後要有一個訂閱').toBe(1)
    expect(text(), '訂閱後顯示目前的狀態').toBe('訂單 #12：已接單')
    push(1, 12, '製作中')
    expect(text(), '後端推播「製作中」之後畫面要更新。沒更新：清理函式要「回傳」取消訂閱的函式，不是當場呼叫它').toBe('訂單 #12：製作中')
  })

  test('卸載時取消訂閱', () => {
    const { hub, unmount } = setup()
    unmount()
    expect(hub.listenerCount(), '元件卸載後 hub 裡還留著 listener：effect 要回傳清理函式，在裡面取消訂閱').toBe(0)
  })

  test('orderId 改變：取消舊的訂閱、訂閱新的，舊訂單的推播不再影響畫面', () => {
    const { hub, show, push } = setup()
    push(1, 15, '可取餐')
    show(1, 15)
    expect(hub.listenerCount(), '換訂單之後應該只剩一個訂閱：舊的要在清理函式裡取消').toBe(1)
    expect(text(), '換到 15 號訂單，要顯示它目前的狀態：orderId 要列在依賴陣列').toBe('訂單 #15：可取餐')
    push(1, 12, '製作中')
    expect(text(), '12 號訂單（舊的）的推播改到了畫面：換訂單時要取消舊的訂閱').toBe('訂單 #15：可取餐')
  })

  test('storeId 改變也要重新訂閱', () => {
    const { hub, show, push } = setup()
    push(2, 12, '製作中')
    show(2, 12)
    expect(text(), '換到 2 號店的 12 號訂單，要顯示「製作中」：storeId 也要列在依賴陣列').toBe('訂單 #12：製作中')
    expect(hub.listenerCount(), '換店之後應該只剩一個訂閱').toBe(1)
  })

  test('props 沒變時，重新 render 不會重新訂閱', () => {
    const { hub, show } = setup()
    show(1, 12)
    show(1, 12)
    show(1, 12)
    expect(hub.subscribeCalls(), 'props 都沒變，卻重新訂閱了：依賴陣列裡有每次 render 都重新建立的物件。把物件搬進 effect 裡建立，依賴陣列只列 hub、storeId、orderId').toBe(1)
  })

  test('StrictMode 下（開發時 effect 會多跑一輪）只留下一個訂閱', () => {
    const hub = createOrderHub()
    render(<StrictMode><OrderStatus hub={hub} storeId={1} orderId={12} /></StrictMode>)
    expect(hub.listenerCount(), 'StrictMode 會訂閱 → 清理 → 再訂閱：沒有取消訂閱的話會留下兩個 listener').toBe(1)
  })

  test('通過 react-hooks 的檢查，沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'OrderStatus.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉檢查').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'react-hooks 檢查沒過：照訊息修正依賴陣列').toEqual([])
  }, 20000)
})
