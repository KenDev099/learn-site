import type { ReactNode } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductCard, type ProductApi } from './ProductCard.tsx'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'

// 每個測試一個全新的 QueryClient（快取不會互相影響），關掉失敗重試（失敗馬上顯示，不用等退避）
let client: QueryClient
afterEach(() => client?.clear())

function setup(ui: (api: ProductApi) => ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = createFakeMenuApi({ manual: true })
  const wrap = (node: ReactNode) => <QueryClientProvider client={client}>{node}</QueryClientProvider>
  const view = render(wrap(ui(api)))
  const calls = () => api.callsOf('getProduct')
  const show = (node: ReactNode) => view.rerender(wrap(node))
  /** 讓第 i 次呼叫完成（或失敗），並等 React 更新完 */
  const settle = (i: number, how: 'resolve' | 'reject' = 'resolve', value?: unknown) =>
    act(async () => { calls()[i][how](value) })
  return { api, calls, show, settle }
}

describe('練習 1：ProductCard 用 useQuery', () => {
  test('還沒有資料時顯示「載入中…」，回來後顯示「品名 $價格」', async () => {
    const { calls, settle } = setup(api => <ProductCard api={api} id={2} />)
    expect(screen.getByText('載入中…'), '資料還沒回來時要顯示「載入中…」').toBeInTheDocument()
    expect(calls().map(c => c.args), '要呼叫 api.getProduct(2)').toEqual([[2]])
    await settle(0)
    expect(await screen.findByText('拿鐵 $110'), '成功時顯示「品名 $價格」').toBeInTheDocument()
    expect(screen.queryByText('載入中…')).toBeNull()
  })

  test('兩張卡片顯示同一個商品，只送一個請求', async () => {
    const { calls, settle } = setup(api => <><ProductCard api={api} id={2} /><ProductCard api={api} id={2} /></>)
    expect(calls().length, '兩張卡片都顯示拿鐵，卻呼叫了兩次 api.getProduct：改用 useQuery，同一個 queryKey 只會送一個請求；也不要在元件裡自己 new QueryClient（每張卡片會有自己的快取）').toBe(1)
    await settle(0)
    expect(await screen.findAllByText('拿鐵 $110'), '兩張卡片都要顯示拿鐵').toHaveLength(2)
  })

  test('不同商品各自抓', async () => {
    const { calls } = setup(api => <><ProductCard api={api} id={2} /><ProductCard api={api} id={5} /></>)
    expect(calls().map(c => c.args).sort(), '拿鐵（2）和可頌（5）是不同的資料，要各自呼叫一次：queryKey 要包含 id').toEqual([[2], [5]])
  })

  test('queryFn 要把 signal 傳給 api', () => {
    const { calls } = setup(api => <ProductCard api={api} id={2} />)
    expect(calls()[0].signal, 'api.getProduct 的第二個參數要傳 { signal }，signal 來自 queryFn 收到的參數：queryFn: ({ signal }) => …').toBeInstanceOf(AbortSignal)
  })

  test('id 改變時抓新的商品，還沒回來的舊請求被取消', async () => {
    const { api, calls, show, settle } = setup(api => <ProductCard api={api} id={2} />)
    show(<ProductCard api={api} id={4} />)
    expect(calls().map(c => c.args), 'id 從 2 換成 4，要再呼叫 api.getProduct(4)：queryKey 要包含 id，不然 TanStack Query 會以為是同一份資料').toEqual([[2], [4]])
    expect(calls()[0].signal?.aborted, '拿鐵（2）還沒回來就換成伯爵紅茶（4），舊請求的 signal 要被 abort：把 queryFn 收到的 signal 傳給 api').toBe(true)
    await settle(1)
    expect(await screen.findByText('伯爵紅茶 $90'), '要顯示新的商品').toBeInTheDocument()
  })

  test('換回看過的商品，直接顯示快取，不出現「載入中…」', async () => {
    const { api, calls, show, settle } = setup(api => <ProductCard api={api} id={2} />)
    await settle(0)
    await screen.findByText('拿鐵 $110')
    show(<ProductCard api={api} id={4} />)
    await settle(1)
    await screen.findByText('伯爵紅茶 $90')
    show(<ProductCard api={api} id={2} />)
    expect(screen.queryByText('載入中…'), '拿鐵已經在快取裡，換回來要立刻顯示，背景重抓時也不能顯示「載入中…」：「載入中…」看 isPending（沒有資料），不要看 isFetching（有在抓）').toBeNull()
    expect(screen.getByText('拿鐵 $110'), '換回拿鐵要立刻顯示快取裡的資料').toBeInTheDocument()
    expect(calls().length, '預設 staleTime 是 0，快取已經過期：顯示舊資料的同時會在背景重抓一次').toBe(3)
  })

  test('失敗時顯示錯誤與「重試」，按下去重新抓', async () => {
    const { calls, settle } = setup(api => <ProductCard api={api} id={2} />)
    await settle(0, 'reject', new Error('伺服器忙線中'))
    const alert = await screen.findByRole('alert').catch(() => null)
    expect(alert, '失敗時要顯示 role="alert"：用 isError（或 status === "error"）判斷，不要用「沒有 data」當成載入中').not.toBeNull()
    expect(alert, 'alert 裡要有錯誤訊息').toHaveTextContent('伺服器忙線中')
    await userEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(calls().length, '按「重試」要重新呼叫 api.getProduct：呼叫 useQuery 回傳的 refetch()').toBe(2)
    await settle(1)
    expect(await screen.findByText('拿鐵 $110'), '重試成功後顯示商品').toBeInTheDocument()
    expect(screen.queryByRole('alert'), '成功後錯誤要消失').toBeNull()
  })
})
