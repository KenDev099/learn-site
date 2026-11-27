import { describe, expect, test } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'
import { MENU_API } from './menu-api.ts'
import { createAppRouter } from './router.ts'
import ProductPage from './ProductPage.vue'
import OrderDetail from './OrderDetail.vue'

async function visit(path: string) {
  const router = createAppRouter(createMemoryHistory())
  const warnings: string[] = []
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, {
    global: {
      plugins: [router],
      provide: { [MENU_API as symbol]: createFakeMenuApi() },
      config: { warnHandler: m => { warnings.push(m) } },
    },
  })
  await flushPromises()
  return { router, wrapper, warnings, text: wrapper.text() }
}

describe('練習 1：路由表', () => {
  test('首頁與菜單', async () => {
    expect((await visit('/')).text, '/ 要顯示 HomePage').toContain('咖啡店首頁')
    expect((await visit('/menu')).text, '/menu 要顯示 MenuPage').toContain('菜單')
  })

  test('商品頁：id 用 props 函式轉成數字', async () => {
    const { wrapper, warnings, router } = await visit('/menu/2')
    const page = wrapper.findComponent(ProductPage)
    expect(page.exists(), '/menu/2 要顯示 ProductPage').toBe(true)
    expect(page.props('id'), 'ProductPage 收到的 id 要是數字 2，不是字串 "2"：用 props: route => ({ id: Number(route.params.id) })，不要用 props: true').toBe(2)
    expect(warnings.filter(w => w.includes('Invalid prop')), '不能有 props 型別的警告').toEqual([])
    expect(router.currentRoute.value.name, '商品頁的路由名稱是 product').toBe('product')
    expect(wrapper.text(), '商品頁要真的載入商品').toContain('拿鐵')
    const other = await visit('/menu/3')
    expect(other.wrapper.findComponent(ProductPage).props('id'), '/menu/3 的 id 要是 3：props 函式要從 route.params.id 轉換，不要寫死').toBe(3)
  })

  test('商品 id 只接受數字，其他落到找不到頁面', async () => {
    const { wrapper, router } = await visit('/menu/abc')
    expect(wrapper.findComponent(ProductPage).exists(), '/menu/abc 不能顯示 ProductPage：在參數後面加正規表示式 :id(\\\\d+)').toBe(false)
    expect(wrapper.text(), '/menu/abc 要顯示 NotFound').toContain('找不到這個頁面')
    expect(router.currentRoute.value.fullPath, '網址要維持 /menu/abc，不要轉址').toBe('/menu/abc')
  })

  test('訂單區：巢狀路由', async () => {
    const list = await visit('/orders')
    expect(list.text, '/orders 要顯示 OrdersLayout 的標題').toContain('訂單管理')
    expect(list.text, '/orders 的 RouterView 裡要顯示 OrderList（子路由 path 是空字串）').toContain('訂單列表')
    expect(list.router.currentRoute.value.name, '/orders 對應的是子路由 order-list').toBe('order-list')

    const detail = await visit('/orders/7')
    expect(detail.text, '/orders/7 要同時顯示 OrdersLayout 和 OrderDetail').toContain('訂單管理')
    expect(detail.text, '/orders/7 的 RouterView 裡要顯示 OrderDetail').toContain('訂單 #7')
    expect(detail.wrapper.findComponent(OrderDetail).props('orderId'), 'OrderDetail 收到的 orderId 要是數字 7').toBe(7)
    expect(detail.text, '/orders/7 不能顯示訂單列表').not.toContain('訂單列表')

    const bad = await visit('/orders/abc')
    expect(bad.wrapper.findComponent(OrderDetail).exists(), '/orders/abc 不能顯示 OrderDetail：子路由寫 :orderId(\\\\d+)，只接受數字').toBe(false)
    expect(bad.text, '/orders/abc 要顯示 NotFound').toContain('找不到這個頁面')

    const root = await visit('/7')
    expect(root.wrapper.findComponent(OrderDetail).exists(), '/7 不能顯示訂單明細：子路由的 path 寫 \':orderId\'，不要以 / 開頭').toBe(false)
  })

  test('具名路由組得出正確的網址', async () => {
    const { router } = await visit('/')
    const href = (to: Parameters<typeof router.resolve>[0]) => {
      try { return router.resolve(to).href } catch (e) { return `（解析失敗：${(e as Error).message}）` }
    }
    expect(href({ name: 'menu' }), '路由名稱 menu').toBe('/menu')
    expect(href({ name: 'product', params: { id: 3 } }), '路由名稱 product').toBe('/menu/3')
    expect(href({ name: 'orders' }), '路由名稱 orders').toBe('/orders')
    expect(href({ name: 'order-list' }), '路由名稱 order-list').toBe('/orders')
    expect(href({ name: 'order-detail', params: { orderId: 7 } }), '路由名稱 order-detail').toBe('/orders/7')
    expect(href({ name: 'not-found', params: { pathMatch: ['a', 'b'] } }), '路由名稱 not-found，path 用 /:pathMatch(.*)*').toBe('/a/b')
  })

  test('其他路徑都顯示找不到頁面', async () => {
    const { text, router } = await visit('/drinks/secret')
    expect(text, '沒有對應的路徑要顯示 NotFound：最後加一條 /:pathMatch(.*)*').toContain('找不到這個頁面')
    expect(router.currentRoute.value.params.pathMatch, 'pathMatch 結尾的 * 讓它變成陣列').toEqual(['drinks', 'secret'])
  })
})
