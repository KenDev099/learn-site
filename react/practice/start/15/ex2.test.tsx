import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MenuList } from './MenuList.tsx'
import { createFakeMenuApi, PRODUCTS } from '../../helpers/fake-api.ts'

const ALL = PRODUCTS.map(p => p.name)
const START = new Date('2026-11-06T09:00:00+08:00').getTime()
const SECOND = 1000

// 只假造 Date（staleTime 用 Date.now() 判斷新不新鮮），計時器照常，React 和 TanStack Query 的排程不受影響
let client: QueryClient
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})
afterEach(() => client?.clear())

function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = createFakeMenuApi({ manual: true })
  const calls = () => api.callsOf('getMenu')
  /** 進入菜單頁（同一個 QueryClient，快取還在）；回傳的 unmount 就是離開菜單頁 */
  const visit = () => render(<QueryClientProvider client={client}><MenuList api={api} /></QueryClientProvider>)
  /** 讓第 i 次呼叫完成（或失敗），並等 TanStack Query 通知 React、畫面更新完 */
  const settle = async (i: number, how: 'resolve' | 'reject' = 'resolve', value?: unknown) => {
    await act(async () => { calls()[i][how](value) })
    await act(() => new Promise(r => setTimeout(r, 0)))   // TanStack Query 用 setTimeout(0) 批次通知元件
  }
  const names = () => screen.queryAllByRole('listitem').map(li => li.textContent)
  /** 第一次進入菜單頁並載入完成，然後離開 */
  async function firstVisit() {
    const page = visit()
    await settle(0)
    await screen.findByText('拿鐵')
    page.unmount()
  }
  return { calls, visit, settle, names, firstVisit }
}

describe('練習 2：MenuList 的 staleTime 與背景更新', () => {
  test('第一次載入只顯示「載入中…」，回來後顯示清單', async () => {
    const { calls, visit, settle, names } = setup()
    visit()
    expect(screen.getByText('載入中…'), '還沒有資料時顯示「載入中…」').toBeInTheDocument()
    expect(screen.queryByText('更新中…'), '第一次載入不是「背景更新」，不能顯示「更新中…」：「更新中…」只在已經有資料、又在抓的時候顯示').toBeNull()
    expect(calls().length).toBe(1)
    await settle(0)
    await screen.findByText('拿鐵')
    expect(names(), '每個商品一個 <li>，內容是品名').toEqual(ALL)
  })

  test('60 秒內回到菜單頁：直接顯示快取，不送請求', async () => {
    const { calls, visit, names, firstVisit } = setup()
    await firstVisit()
    vi.setSystemTime(START + 30 * SECOND)
    visit()
    expect(names(), '30 秒後回到菜單頁，快取裡有菜單，要立刻顯示').toEqual(ALL)
    expect(calls().length, '30 秒後回到菜單頁又送了請求：預設 staleTime 是 0，資料一抓回來就算過期。設定 staleTime: 60_000（單位是毫秒）').toBe(1)
    expect(screen.queryByText('更新中…'), '資料還新鮮，沒有在更新').toBeNull()
  })

  test('超過 60 秒：先顯示舊清單與「更新中…」，背景重抓完換成新的', async () => {
    const { calls, visit, settle, names, firstVisit } = setup()
    await firstVisit()
    vi.setSystemTime(START + 61 * SECOND)
    visit()
    expect(calls().length, '61 秒後回到菜單頁，資料已經過期，要在背景重抓一次：staleTime 是 60 秒，不是永遠新鮮').toBe(2)
    expect(names(), '背景重抓時舊清單要保留，不能換成「載入中…」：「載入中…」看 isPending（沒有資料），不要看 isFetching').toEqual(ALL)
    expect(screen.queryByText('載入中…')).toBeNull()
    expect(screen.queryByRole('status'), '背景重抓時要顯示 role="status" 的「更新中…」：用 isFetching 判斷').toHaveTextContent('更新中…')
    await settle(1, 'resolve', PRODUCTS.slice(0, 4))   // 店長下架了可頌和起司蛋糕
    expect(names(), '背景重抓回來後要換成新的清單').toEqual(ALL.slice(0, 4))
    expect(screen.queryByText('更新中…'), '抓完了，「更新中…」要消失').toBeNull()
  })

  test('背景重抓失敗：清單保留，另外顯示錯誤', async () => {
    const { visit, settle, names, firstVisit } = setup()
    await firstVisit()
    vi.setSystemTime(START + 61 * SECOND)
    visit()
    await settle(1, 'reject', new Error('伺服器忙線中'))
    expect(screen.queryByRole('alert'), '背景重抓失敗要顯示 role="alert" 的錯誤訊息').toHaveTextContent('伺服器忙線中')
    expect(names(), '背景重抓失敗時 status 是 error，但 data 還在：清單要保留，不要只看 isError 就把整個畫面換成錯誤').toEqual(ALL)
  })

  test('完全沒有資料時失敗：只顯示錯誤', async () => {
    const { visit, settle, names } = setup()
    visit()
    await settle(0, 'reject', new Error('伺服器忙線中'))
    expect(screen.queryByRole('alert'), '第一次載入就失敗，要顯示 role="alert" 的錯誤訊息').toHaveTextContent('伺服器忙線中')
    expect(screen.queryByText('載入中…'), '失敗了就不是載入中').toBeNull()
    expect(names()).toEqual([])
  })
})
