import { afterEach, describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductSearch, type SearchApi } from './ProductSearch.tsx'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'

let client: QueryClient
afterEach(() => client?.clear())

function setup(keyword: string, wrap: (api: SearchApi) => SearchApi = api => api) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const fake = createFakeMenuApi({ manual: true })
  const api = wrap(fake)
  const ui = (k: string) => <QueryClientProvider client={client}><ProductSearch api={api} keyword={k} /></QueryClientProvider>
  const view = render(ui(keyword))
  const calls = () => fake.callsOf('search')
  const type = (k: string) => view.rerender(ui(k))
  /** 讓第 i 次呼叫完成（或失敗），並等 TanStack Query 通知 React、畫面更新完 */
  const settle = async (i: number, how: 'resolve' | 'reject' = 'resolve', value?: unknown) => {
    await act(async () => { calls()[i][how](value) })
    await act(() => new Promise(r => setTimeout(r, 0)))
  }
  const names = () => screen.queryAllByRole('listitem').map(li => li.textContent)
  return { calls, type, settle, names }
}

describe('練習 4：ProductSearch 的 enabled 與 placeholderData', () => {
  test('沒有關鍵字（或只有空白）時不送請求', () => {
    const { calls, type } = setup('')
    expect(screen.getByText('輸入關鍵字開始搜尋'), '關鍵字是空的要顯示「輸入關鍵字開始搜尋」').toBeInTheDocument()
    type('   ')
    expect(screen.getByText('輸入關鍵字開始搜尋'), '只有空白也算沒有關鍵字').toBeInTheDocument()
    expect(calls().map(c => c.args), '沒有關鍵字時不能呼叫 api.search：用 enabled: 關鍵字 !== \'\'（或 skipToken）停用 query').toEqual([])
  })

  test('有關鍵字時搜尋：先「搜尋中…」，回來後顯示結果', async () => {
    const { calls, settle, names } = setup('拿')
    expect(calls().map(c => c.args), '要呼叫 api.search(\'拿\')').toEqual([['拿']])
    expect(calls()[0].signal, 'api.search 的第二個參數要傳 { signal }，signal 來自 queryFn 收到的參數').toBeInstanceOf(AbortSignal)
    expect(screen.getByText('搜尋中…'), '第一次搜尋、還沒有結果時顯示「搜尋中…」').toBeInTheDocument()
    expect(screen.queryByText('更新中…'), '還沒有任何結果，不是「更新中」').toBeNull()
    await settle(0)
    expect(names(), '每個商品一個 <li>，內容是品名').toEqual(['拿鐵'])
  })

  test('關鍵字前後的空白不算', async () => {
    const { calls, type, settle, names } = setup('  茶 ')
    expect(calls().map(c => c.args), '\'  茶 \' 要用 \'茶\' 搜尋：先 trim()，queryKey 和 api.search 都用 trim 之後的值').toEqual([['茶']])
    await settle(0)
    type('茶')
    expect(calls().length, '\'  茶 \' 和 \'茶\' 是同一個搜尋，換過去不能再送請求：queryKey 要用 trim 之後的關鍵字').toBe(1)
    expect(names()).toEqual(['伯爵紅茶'])
  })

  test('換關鍵字時保留上一次的結果，顯示「更新中…」', async () => {
    const { calls, type, settle, names } = setup('拿')
    await settle(0)
    type('茶')
    expect(calls().map(c => c.args), '關鍵字換成「茶」要再搜尋一次：queryKey 要包含關鍵字').toEqual([['拿'], ['茶']])
    expect(screen.queryByText('搜尋中…'), '換關鍵字時不能把結果換成「搜尋中…」：placeholderData: keepPreviousData 讓新的 key 先顯示上一個 key 的資料').toBeNull()
    expect(names(), '新結果回來之前，保留「拿」的結果').toEqual(['拿鐵'])
    expect(screen.queryByRole('status'), '顯示的是上一個關鍵字的結果時，要有 role="status" 的「更新中…」：看 isPlaceholderData（或 isFetching）').toHaveTextContent('更新中…')
    await settle(1)
    expect(names(), '「茶」的結果回來後換成新的').toEqual(['伯爵紅茶'])
    expect(screen.queryByText('更新中…'), '新結果回來了，「更新中…」要消失').toBeNull()
  })

  test('舊的回應比較晚回來，也不會蓋掉新的結果', async () => {
    // 這個 api 不理會 signal：舊的請求照樣會成功回來
    const { type, settle, names } = setup('拿', api => ({ search: k => api.search(k) }))
    type('茶')
    await settle(1)   // 「茶」先回來
    await settle(0)   // 「拿」比較晚回來
    expect(names(), '「拿」比「茶」晚回來，畫面卻變成拿鐵：每個關鍵字的結果存在自己的 key 底下，畫面只讀目前關鍵字的 key').toEqual(['伯爵紅茶'])
  })

  test('換回搜尋過的關鍵字，直接顯示快取', async () => {
    const { type, settle, names } = setup('拿')
    await settle(0)
    type('茶')
    await settle(1)
    type('拿')
    expect(screen.queryByText('搜尋中…'), '「拿」已經搜尋過，換回來要立刻顯示快取').toBeNull()
    expect(names(), '換回「拿」立刻顯示拿鐵').toEqual(['拿鐵'])
  })

  test('沒有符合的商品、失敗、清空關鍵字', async () => {
    const { calls, type, settle } = setup('抹茶')
    await settle(0, 'resolve', [])
    expect(screen.getByText('沒有符合的商品'), '結果是空陣列時顯示「沒有符合的商品」').toBeInTheDocument()
    type('可')
    await settle(1, 'reject', new Error('伺服器忙線中'))
    expect(screen.queryByRole('alert'), '搜尋失敗要顯示 role="alert" 的錯誤訊息').toHaveTextContent('伺服器忙線中')
    type('')
    expect(screen.getByText('輸入關鍵字開始搜尋'), '清空關鍵字後回到「輸入關鍵字開始搜尋」').toBeInTheDocument()
    expect(calls().length, '清空關鍵字不能送請求').toBe(2)
  })
})
