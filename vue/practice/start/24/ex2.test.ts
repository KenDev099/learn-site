import { describe, expect, test } from 'vitest'
import { createSSRApp, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { deferred } from '../../helpers/deferred.ts'
import { CART_KEY, useCart } from './cart.ts'
import CartPage from './CartPage.vue'
import { createApp, renderPage } from './create-app.ts'

const items = (html: string) => [...html.matchAll(/<li>([^<]*)<\/li>/g)].map(m => m[1])

describe('練習 2：每個請求一份狀態', () => {
  test('先渲染王小明，再渲染陳美華：陳美華看不到王小明的品項', async () => {
    const a = await renderPage('王小明', async cart => { cart.items.push('拿鐵') })
    const b = await renderPage('陳美華', async cart => { cart.items.push('可頌') })
    expect(items(a), '王小明的頁面只有拿鐵').toEqual(['拿鐵'])
    expect(a, '標題要是「王小明 的購物車」').toContain('王小明 的購物車')
    expect(items(b), '陳美華的頁面出現了王小明的拿鐵：購物車不能放在模組層級，createApp 每次都要建立新的 reactive，用 app.provide 交給元件').toEqual(['可頌'])
    expect(b, '標題要是「陳美華 的購物車」').toContain('陳美華 的購物車')
  })

  test('createApp 每次回傳新的購物車', () => {
    const first = createApp('王小明')
    const second = createApp('陳美華')
    expect(first.cart === second.cart, '兩次 createApp 拿到同一台購物車：每次都要 reactive({ owner, items: [] })').toBe(false)
    expect(first.cart.owner, '第一台購物車的 owner 被第二次呼叫改掉了').toBe('王小明')
    expect(first.app === second.app, '每次都要建立新的 app').toBe(false)
  })

  test('兩個請求同時處理（中間有 await），互不影響', async () => {
    const waitA = deferred()
    const waitB = deferred()
    const pageA = renderPage('王小明', async cart => {
      cart.items.push('拿鐵')
      await waitA.promise
      cart.items.push('起司蛋糕')
    })
    const pageB = renderPage('陳美華', async cart => {
      cart.items.push('可頌')
      await waitB.promise
    })
    waitB.resolve()
    const b = await pageB
    waitA.resolve()
    const a = await pageA
    expect(items(b), '陳美華的頁面混進別人的品項：「開始時清空共用的購物車」擋不住同時進行的請求，每個請求要有自己的購物車').toEqual(['可頌'])
    expect(b, '陳美華的標題被改掉了').toContain('陳美華 的購物車')
    expect(items(a), '王小明的品項被別的請求清掉或混進別人的品項').toEqual(['拿鐵', '起司蛋糕'])
    expect(a, '王小明的標題被別的請求改掉了：owner 也要放在每個請求自己的購物車裡').toContain('王小明 的購物車')
  })

  test('CartPage 顯示 app.provide 提供的購物車', async () => {
    expect(CART_KEY, 'cart.ts 要匯出 CART_KEY（InjectionKey<Cart>）').toBeTypeOf('symbol')
    const app = createSSRApp(CartPage)
    app.provide(CART_KEY, reactive({ owner: '林志豪', items: ['美式咖啡'] }))
    const html = await renderToString(app)
    expect(html, 'CartPage 沒有顯示這個 app provide 的購物車：要用 useCart()（inject(CART_KEY)）取得，不能讀模組層級的變數').toContain('林志豪 的購物車')
    expect(items(html), 'CartPage 要列出 provide 的購物車品項').toEqual(['美式咖啡'])
  })

  test('沒有 provide 時 useCart() 丟出錯誤', () => {
    expect(useCart, 'cart.ts 要匯出 useCart()').toBeTypeOf('function')
    expect(() => useCart(), 'inject 拿不到購物車時要丟出錯誤，說明要先 app.provide，不要默默給一台空的購物車').toThrow()
  })
})
