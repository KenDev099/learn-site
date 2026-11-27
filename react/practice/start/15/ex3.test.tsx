import { afterEach, describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { onPriceChanged, productKeys } from './productKeys.ts'
import { createFakeMenuApi, type Product } from '../../helpers/fake-api.ts'

// 這一題的 QueryClient 把 staleTime 設成 Infinity：資料永遠新鮮，只有失效（invalidate）才會讓它重抓
let client: QueryClient
afterEach(() => client?.clear())

function setup({ manual = false } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const base = createFakeMenuApi({ manual })   // 預設每個請求在下一個 microtask 自動成功；manual 時由測試呼叫 answerAll()
  const prices = new Map<number, number>()   // 後台改過的價格
  const priced = (p: Product) => ({ ...p, price: prices.get(p.id) ?? p.price })
  const api = {
    search: (keyword: string) => base.search(keyword).then(list => list.map(priced)),
    getProduct: (id: number) => base.getProduct(id).then(priced),
    getStores: () => base.getStores(),
  }

  function ProductList({ keyword }: { keyword: string }) {
    const { data } = useQuery({ queryKey: productKeys.list(keyword), queryFn: () => api.search(keyword) })
    return <ul aria-label={`列表「${keyword}」`}>{data?.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}</ul>
  }
  function ProductDetail({ id }: { id: number }) {
    const { data } = useQuery({ queryKey: productKeys.detail(id), queryFn: () => api.getProduct(id) })
    return <p aria-label={`詳細 ${id}`}>{data && `${data.name} $${data.price}`}</p>
  }
  function Stores() {
    const { data } = useQuery({ queryKey: ['stores'], queryFn: () => api.getStores() })
    return <p>{data?.map(s => s.name).join('、')}</p>
  }

  type Page = { lists?: string[]; details?: number[]; stores?: boolean }
  /** 顯示一個畫面（同一個 QueryClient），等資料都回來 */
  async function show({ lists = [], details = [], stores = false }: Page) {
    const view = render(
      <QueryClientProvider client={client}>
        {lists.map(k => <ProductList key={k} keyword={k} />)}
        {details.map(id => <ProductDetail key={id} id={id} />)}
        {stores && <Stores />}
      </QueryClientProvider>,
    )
    await flush()
    return view
  }
  // 等假 API 回應（microtask）、TanStack Query 用 setTimeout(0) 通知元件、React 更新完：多等幾輪 macrotask
  const flush = async () => {
    for (let i = 0; i < 3; i++) await act(() => new Promise(r => setTimeout(r, 0)))
  }
  /** 從現在開始數，各方法被呼叫的參數 */
  function track() {
    const from = base.calls.length
    return () => base.calls.slice(from).map(c => `${c.method}(${c.args.map(a => JSON.stringify(a)).join()})`).sort()
  }
  const changePrice = (id: number, price: number) => prices.set(id, price)
  /** manual 模式：讓目前所有還沒回來的請求成功 */
  const answerAll = () => act(async () => { for (const c of base.calls) c.resolve() })
  return { show, flush, track, changePrice, answerAll }
}

describe('練習 3：productKeys 與 onPriceChanged', () => {
  test('不同關鍵字的列表、不同 id 的詳細，都是不同的 key', async () => {
    const { show, track } = setup()
    const since = track()
    await show({ lists: ['', '拿'], details: [1, 2] })
    expect(since(), '四個畫面要各自抓一次：productKeys.list(keyword) 要包含 keyword、productKeys.detail(id) 要包含 id，列表和詳細也不能共用 key')
      .toEqual(['getProduct(1)', 'getProduct(2)', 'search("")', 'search("拿")'])
    expect(screen.getByLabelText('列表「拿」')).toHaveTextContent('拿鐵 $110')
    expect(screen.getByLabelText('列表「」').querySelectorAll('li'), '「」和「拿」是兩份資料').toHaveLength(6)
  })

  test('所有商品的 key 都以 productKeys.all 開頭', async () => {
    const { show, track, flush } = setup()
    await show({ lists: ['', '茶'], details: [1, 5], stores: true })
    expect(productKeys.all, 'productKeys.all 是 [\'products\']').toEqual(['products'])
    const since = track()
    await act(() => client.invalidateQueries({ queryKey: productKeys.all }))
    await flush()
    expect(since(), 'invalidateQueries({ queryKey: productKeys.all }) 要讓所有商品列表和詳細重抓，門市不動：每個 key 都用 [...productKeys.all, …] 開頭（invalidateQueries 用前綴比對）')
      .toEqual(['getProduct(1)', 'getProduct(5)', 'search("")', 'search("茶")'])
  })

  test('onPriceChanged：重抓所有列表和那個商品的詳細，其他不動', async () => {
    const { show, track, flush, changePrice } = setup()
    await show({ lists: ['', '拿'], details: [1, 2], stores: true })
    changePrice(2, 120)
    const since = track()
    await act(() => onPriceChanged(client, 2))
    await flush()
    expect(since(), '拿鐵（2）改價：所有列表（任何關鍵字）和拿鐵的詳細要重抓；美式咖啡（1）的詳細和門市不受影響，不要重抓。用 invalidateQueries 搭配前綴：列表用 productKeys.lists() 這種「所有列表」的 key，詳細用 productKeys.detail(2)')
      .toEqual(['getProduct(2)', 'search("")', 'search("拿")'])
    expect(screen.getByLabelText('詳細 2'), '拿鐵的詳細要顯示新價格').toHaveTextContent('拿鐵 $120')
    expect(screen.getByLabelText('列表「拿」'), '列表要顯示新價格').toHaveTextContent('拿鐵 $120')
  })

  test('onPriceChanged 回傳的 Promise 等重抓完才完成', async () => {
    const { show, flush, changePrice, answerAll } = setup({ manual: true })
    await show({ lists: [''], details: [2] })
    await answerAll()
    await flush()
    changePrice(2, 120)
    let done = false
    const p = act(() => onPriceChanged(client, 2)).then(() => { done = true })
    await flush()
    expect(done, '重抓的請求還沒回來，onPriceChanged 回傳的 Promise 就完成了：回傳 invalidateQueries 的 Promise（兩個以上用 Promise.all），不要回傳 Promise.resolve()').toBe(false)
    await answerAll()
    await p
    expect(client.getQueryData<Product>(productKeys.detail(2))?.price, 'onPriceChanged 完成時，快取裡的拿鐵要已經是新價格：回傳 invalidateQueries 的 Promise（兩個以上用 Promise.all），不要回傳 Promise.resolve()').toBe(120)
  })

  test('現在沒在畫面上的：不立刻重抓，下次顯示時才重抓', async () => {
    const { show, track, flush, changePrice } = setup()
    const earlier = await show({ lists: ['茶'], details: [2, 3] })
    earlier.unmount()   // 看過「茶」的列表、拿鐵和伯爵紅茶的詳細，已經離開
    await show({ lists: [''] })
    changePrice(2, 120)
    const since = track()
    await act(() => onPriceChanged(client, 2))
    await flush()
    expect(since(), '只有畫面上的「」列表要立刻重抓；離開了的「茶」列表、拿鐵詳細不要現在抓（沒人在看）：invalidateQueries 預設 refetchType 是 \'active\'，不要改成 \'all\'')
      .toEqual(['search("")'])

    const back = track()
    await show({ lists: ['茶'], details: [2, 3] })
    expect(back(), '回到「茶」列表和拿鐵詳細時要重抓（它們已經被標成失效）；伯爵紅茶（3）沒有改價，用快取就好：用 invalidateQueries 標成失效，不要用 refetchQueries（只重抓、不標記）或 removeQueries')
      .toEqual(['getProduct(2)', 'search("茶")'])
  })
})
