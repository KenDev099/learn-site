import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { SHOP_API, type Category, type Product, type ShopApi } from './shared/api.ts'
import MenuPage from './features/menu/MenuPage.vue'

type Call = { method: 'getMenu' | 'search'; arg: string; signal?: AbortSignal; d: Deferred<Product[]> }

function fakeApi() {
  const calls: Call[] = []
  const make = (method: Call['method']) => vi.fn((arg: string, opts: { signal?: AbortSignal } = {}) => {
    const d = deferred<Product[]>()
    calls.push({ method, arg, signal: opts.signal, d })
    return d.promise
  })
  const api = {
    getMenu: make('getMenu'),
    search: make('search'),
    createOrder: vi.fn(),
    getOrder: vi.fn(),
  }
  return { api: api as unknown as ShopApi & typeof api, calls }
}

const of = (category: Category) => PRODUCTS.filter(p => p.category === category) as Product[]
const named = (keyword: string) => PRODUCTS.filter(p => p.name.includes(keyword)) as Product[]
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

async function setup(url = '/menu') {
  vi.useFakeTimers()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/menu', component: MenuPage },
      { path: '/menu/:id', component: { template: '<p class="product-page">商品頁</p>' } },
    ],
  })
  router.push(url)
  await router.isReady()
  const { api, calls } = fakeApi()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], provide: { [SHOP_API as symbol]: api } } })
  await advance(0)
  const names = () => wrapper.findAll('li.product').map(li => li.text())
  const pressed = () => wrapper.find('[aria-pressed="true"]').attributes('data-category')
  return { router, api, calls, wrapper, names, pressed }
}

describe('練習 1：菜單頁', () => {
  test('分類來自網址：?category=tea 就查茶飲', async () => {
    const { api, calls, names, pressed } = await setup('/menu?category=tea')
    expect(api.getMenu, '一進頁面要用網址上的分類查菜單').toHaveBeenCalledTimes(1)
    expect(calls[0].arg, '分類要從 route.query.category 讀，不要用本地 ref').toBe('tea')
    expect(calls[0].signal, '要把 signal 傳給 API，條件改變時才能 abort').toBeInstanceOf(AbortSignal)
    calls[0].d.resolve(of('tea'))
    await advance(0)
    expect(names()).toEqual(['伯爵紅茶 90 元'])
    expect(pressed(), '目前的分類按鈕要 aria-pressed="true"').toBe('tea')
  })

  test.each([
    ['/menu', '沒有 category'],
    ['/menu?category=beer', '不合法的值'],
    ['/menu?category=tea&category=food', '重複出現（變成陣列）'],
  ])('%s（%s）一律當成 coffee', async url => {
    const { calls } = await setup(url)
    expect(calls[0]?.arg, '沒有、不合法、陣列的 category 都要用預設的 coffee').toBe('coffee')
  })

  test('點分類會改網址；進商品頁再按上一頁，分類還在', async () => {
    const { router, calls, wrapper, pressed } = await setup('/menu?page=2')
    await wrapper.find('[data-category="food"]').trigger('click')
    await advance(0)
    expect(router.currentRoute.value.query.category, '點分類要改網址的 ?category=').toBe('food')
    expect(router.currentRoute.value.query.page, '改分類時要保留其他 query').toBe('2')
    expect(calls.at(-1)?.arg).toBe('food')
    await router.push('/menu/5')
    await advance(0)
    router.back()
    await advance(0)
    expect(wrapper.find('.product-page').exists()).toBe(false)
    expect(pressed(), '上一頁回來時分類要還原：分類只能存在網址裡，元件重新建立時本地 ref 會回到預設值').toBe('food')
    expect(calls.at(-1)?.arg, '回到菜單頁要查網址上的分類').toBe('food')
  })

  test('停止輸入 300ms 後才查詢，連續輸入只查一次', async () => {
    const { api, wrapper } = await setup()
    await wrapper.find('input[name="keyword"]').setValue('拿')
    await advance(200)
    await wrapper.find('input[name="keyword"]').setValue('拿鐵 ')
    await advance(299)
    expect(api.search, '還在輸入（距離最後一次輸入不到 300ms）就查了：要防抖').not.toHaveBeenCalled()
    await advance(1)
    expect(api.search, '連續輸入只能查一次').toHaveBeenCalledTimes(1)
    expect(api.search.mock.calls[0][0], '關鍵字要去掉頭尾空白').toBe('拿鐵')
  })

  test('只顯示最新的結果：舊請求比較晚回來也不能蓋掉', async () => {
    const { calls, wrapper, names } = await setup()
    calls[0].d.resolve(of('coffee'))
    await wrapper.find('input[name="keyword"]').setValue('拿')
    await advance(300)
    await wrapper.find('input[name="keyword"]').setValue('拿鐵')
    await advance(300)
    const [first, second] = calls.filter(c => c.method === 'search')
    expect(first?.signal?.aborted, '條件改變時要 abort 上一次的請求').toBe(true)
    second.d.resolve(named('拿鐵'))
    await advance(0)
    first.d.resolve(named('拿'))
    await advance(0)
    expect(names(), '比較早送出的請求比較晚回來，不能蓋掉最新的結果').toEqual(['拿鐵 110 元'])
    await wrapper.find('input[name="keyword"]').setValue('可')
    await advance(300)
    await wrapper.find('input[name="keyword"]').setValue('可頌')
    await advance(300)
    const [third, fourth] = calls.filter(c => c.method === 'search').slice(2)
    fourth.d.resolve(named('可頌'))
    await advance(0)
    third.d.reject(new DOMException('aborted', 'AbortError'))
    await advance(0)
    expect(wrapper.find('[role="alert"]').exists(), '過期請求的失敗（例如被 abort）也不能改畫面：成功和失敗都要先確認是不是最新的請求').toBe(false)
    expect(names()).toEqual(['可頌 70 元'])
    await wrapper.find('input[name="keyword"]').setValue('')
    await advance(300)
    expect(calls.at(-1)?.method, '清空搜尋框要回到目前分類的菜單').toBe('getMenu')
  })

  test('載入中、錯誤加重試、沒有結果三種狀態', async () => {
    const { api, calls, wrapper, names } = await setup()
    expect(wrapper.find('[role="status"]').exists(), '請求進行中要顯示 role="status" 的載入中').toBe(true)
    calls[0].d.reject(new Error('503'))
    await advance(0)
    expect(wrapper.find('[role="alert"]').exists(), 'API 失敗要顯示 role="alert" 的錯誤，不能停在載入中').toBe(true)
    const retry = wrapper.findAll('button').find(b => b.text().includes('重試'))
    expect(retry, '錯誤時要有「重試」按鈕').toBeDefined()
    await retry!.trigger('click')
    await advance(0)
    expect(api.getMenu, '按重試要再查一次').toHaveBeenCalledTimes(2)
    expect(calls[1].arg, '重試要用同樣的條件（目前的分類）再查一次').toBe('coffee')
    calls[1].d.resolve([])
    await advance(0)
    expect(wrapper.find('.empty').exists(), '沒有結果要顯示 <p class="empty">').toBe(true)
    expect(wrapper.find('[role="alert"]').exists(), '成功之後錯誤訊息要消失').toBe(false)
    await wrapper.find('[data-category="tea"]').trigger('click')
    await advance(0)
    calls.at(-1)!.d.resolve(of('tea'))
    await advance(0)
    expect(wrapper.find('.empty').exists()).toBe(false)
    expect(names()).toEqual(['伯爵紅茶 90 元'])
  })
})
