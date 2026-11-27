import { describe, expect, test, vi } from 'vitest'
import { join } from 'node:path'
import { Profiler, type ReactNode } from 'react'
import { screen, within } from '@testing-library/react'
import { lintHooks } from '../../helpers/lint-hooks.ts'
import { OrderStatusPage } from './features/orders/OrderStatusPage.tsx'
import { ORDERS, createFakeShop, reject, renderApp, resolve, settle } from './test-utils.tsx'

/** 每次 commit 時記下畫面上的文字：檢查「中間那一刻」的畫面 */
function commitTexts() {
  const log: string[] = []
  function Recorder({ children }: { children: ReactNode }) {
    return <Profiler id="page" onRender={() => log.push(document.body.textContent ?? '')}>{children}</Profiler>
  }
  return { log, Recorder }
}

async function open(...entries: string[]) {
  const shop = createFakeShop()
  const commits = commitTexts()
  const t = renderApp([{
    path: 'orders/:id',
    Component: () => <commits.Recorder><OrderStatusPage api={shop.api} /></commits.Recorder>,
  }], ...entries)
  await settle()
  return { ...t, shop, commits }
}
const status = () => screen.getAllByRole('status').find(el => el.tagName === 'P')
const details = () => screen.queryByRole('list', { name: '明細' })
const alerts = () => screen.queryAllByRole('alert').map(a => a.textContent)

describe('練習 5：審查訂單狀態頁', () => {
  test('每筆訂單各自的快取；signal 傳給 API', async () => {
    const { shop, go } = await open('/orders/1')
    expect(screen.queryByText('載入訂單中…'), '還沒有資料時顯示「載入訂單中…」').not.toBeNull()
    const first = shop.callsOf('getOrder')[0]
    expect(first.args, '要呼叫 api.getOrder(1)').toEqual([1])
    expect(first.signal, 'queryFn 要把 signal 傳給 api.getOrder(id, { signal })').toBeInstanceOf(AbortSignal)
    await resolve(first)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('訂單 #1')
    await go('/orders/2')
    expect(shop.callsOf('getOrder').map(c => c.args), '換到 /orders/2 要抓 2 號訂單：queryKey 要包含訂單編號，不然 2 號會拿到 1 號的快取').toEqual([[1], [2]])
    expect(screen.queryByText('訂單 #1'), '換到 2 號訂單時，畫面上不能還是 1 號的資料').toBeNull()
    await resolve(shop.callsOf('getOrder')[1])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('訂單 #2')
  })

  test('狀態訊息是同一個 role="status" 元素，只換文字', async () => {
    const { shop, user } = await open('/orders/1')
    await resolve(shop.callsOf('getOrder')[0])
    const el = status()
    expect(el, '要有 <p role="status"> 顯示狀態').toHaveTextContent('製作中')
    await user.click(screen.getByRole('button', { name: '重新整理' }))
    await resolve(shop.callsOf('getOrder')[1], { ...ORDERS[0], status: 'ready' })
    expect(status(), '狀態改變後要是同一個元素：給它 key={狀態} 會讓 React 換掉整個元素，讀螢幕軟體不會唸出新的狀態').toBe(el)
    expect(el).toHaveTextContent('可以取餐了')
  })

  test('「共 N 件」第一次出現就是對的；明細依數量由多到少，不改快取的資料', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { shop, commits } = await open('/orders/1')
    await resolve(shop.callsOf('getOrder')[0])
    expect(alerts(), 'API 回傳的資料是凍結的：就地 sort 會丟 TypeError，用 toSorted').not.toContain('外層錯誤')
    expect(screen.getByText(/^共/)).toHaveTextContent('共 3 件，合計 $260')
    expect(commits.log.some(t => t.includes('共 0 件')), '畫面上出現過「共 0 件」：用 state 加 effect 同步衍生值，第一次 commit 是錯的值。在 render 裡直接算').toBe(false)
    expect(within(details()!).getAllByRole('listitem').map(li => li.textContent), '明細依數量由多到少').toEqual(['拿鐵 × 2', '可頌 × 1'])
  })

  test('第一次就失敗：錯誤與重試；有資料後重抓失敗：留著舊的訂單', async () => {
    const { shop, user } = await open('/orders/1')
    await reject(shop.callsOf('getOrder')[0])
    expect(alerts(), '第一次就失敗要顯示「訂單載入失敗」').toContain('訂單載入失敗')
    await user.click(screen.getByRole('button', { name: '重試' }))
    await resolve(shop.callsOf('getOrder')[1])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('訂單 #1')
    await user.click(screen.getByRole('button', { name: '重新整理' }))
    await reject(shop.callsOf('getOrder')[2])
    expect(screen.queryByRole('heading', { level: 1 }), '重抓失敗時有舊資料，不能整頁換成錯誤畫面：isError 也可能是「背景重抓失敗」，先看有沒有 data').toHaveTextContent('訂單 #1')
    expect(alerts(), '另外顯示「更新失敗，顯示的是上次的狀態」').toContain('更新失敗，顯示的是上次的狀態')
  })

  test('明細壞掉只換掉明細', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { shop } = await open('/orders/1')
    await resolve(shop.callsOf('getOrder')[0], { ...ORDERS[0], lines: [{ quantity: 1 }] })
    expect(alerts(), '明細 render 時丟錯，只換成「明細暫時無法顯示」：用 ErrorBoundary 包住 OrderDetails，不是包整頁').toContain('明細暫時無法顯示')
    expect(screen.queryByRole('heading', { level: 1 }), '訂單編號照常顯示').toHaveTextContent('訂單 #1')
    expect(status(), '狀態照常顯示').toHaveTextContent('製作中')
  })

  test('react-hooks 的規則沒有回報', async () => {
    const problems = await lintHooks(join(import.meta.dirname, 'features/orders/OrderStatusPage.tsx'), {
      'react-hooks/purity': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/refs': 'error',
    })
    expect(problems.map(p => `${p.line}: ${p.rule}`), 'lint 有回報：effect 裡同步 setState 是衍生值，直接在 render 裡算').toEqual([])
  }, 20_000)
})
