// @vitest-environment happy-dom
// 練習 3：結帳頁選取餐時段。fetch 換成假的，不連 API；測試程序是 TZ=UTC
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import CheckoutPage from './web/src/pages/CheckoutPage.vue'
import { useCartStore } from './web/src/stores/cart.ts'

const SLOTS = [
  { start: '2026-11-03T00:30:00.000Z', label: '08:30', remaining: 10 },
  { start: '2026-11-03T00:45:00.000Z', label: '08:45', remaining: 0 },
  { start: '2026-11-03T01:00:00.000Z', label: '09:00', remaining: 3 },
]
type Call = { url: string; method: string; body: any }
let calls: Call[]
let postReply: { status: number; body: object }
let wrapper: VueWrapper | undefined

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function setup() {
  setActivePinia(createPinia())
  const pinia = createPinia()
  setActivePinia(pinia)
  const cart = useCartStore()
  cart.add({ id: 2, name: '拿鐵', price: 110 })
  cart.add({ id: 5, name: '可頌', price: 70 })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => null } },
    { path: '/checkout', component: CheckoutPage },
    { path: '/orders/:id', component: { render: () => null } },
  ] })
  await router.push('/checkout')
  wrapper = mount(CheckoutPage, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return { cart, router }
}

const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"], [role="radio"]')]
const labelOf = (el: Element) => (el.closest('label')?.textContent ?? (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : '') ?? el.getAttribute('aria-label') ?? '').trim()
const radioFor = (text: string) => radios().find(r => labelOf(r).includes(text))
const slotGets = () => calls.filter(c => c.url.includes('/pickup-slots') && c.method === 'GET').length
const post = () => calls.find(c => c.url.includes('/orders') && c.method === 'POST')

beforeEach(() => {
  calls = []
  postReply = { status: 201, body: { id: 42, status: 'pending', total: 180, note: null, orderedAt: '2026-11-03T00:02:00.000Z', pickupAt: null, items: [] } }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input), method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/pickup-slots')) return json(200, SLOTS)
    if (url.includes('/orders') && method === 'POST') return json(postReply.status, postReply.body)
    return json(404, { message: 'not found' })
  }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function submit() {
  const form = document.querySelector('form')
  expect(form, '找不到 <form>：送出訂單的表單不要拿掉').not.toBeNull()
  form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

describe('練習 3：時段選擇', () => {
  it('打開結帳頁就呼叫 GET /pickup-slots，每個時段是一個 radio，標籤是 API 給的台北時間', async () => {
    await setup()
    expect(slotGets(), '結帳頁一打開就要呼叫 GET /pickup-slots（用 web/src/api/pickup.ts 的 listPickupSlots）').toBeGreaterThanOrEqual(1)
    for (const s of SLOTS) {
      const r = radioFor(s.label)
      expect(r, `找不到標籤含「${s.label}」的 radio：每個時段用 <label><input type="radio" …> {{ s.label }}</label>，鍵盤和螢幕閱讀器才能操作（div 加 @click 不行）`).toBeDefined()
    }
    expect(radioFor('現點現做'), '找不到標籤含「現點現做」的 radio：第一個選項是現點現做，選了時段的顧客才改得回來').toBeDefined()
  })

  it('額滿（remaining 0）的時段是 disabled，有名額的不是', async () => {
    await setup()
    expect((radioFor('08:45') as HTMLInputElement | undefined)?.disabled, '08:45 的 remaining 是 0：radio 要加 :disabled，只改顏色還是點得到、送得出去').toBe(true)
    expect((radioFor('08:30') as HTMLInputElement | undefined)?.disabled, '08:30 還有名額，不能 disabled').toBe(false)
  })

  it('不選時段＝現點現做：送出的 body 沒有 pickupAt', async () => {
    await setup()
    await submit()
    expect(post(), '按送出要呼叫 POST /orders').toBeDefined()
    expect(post()!.body.pickupAt == null, `沒選時段時不要送 pickupAt（現點現做），你送了 ${JSON.stringify(post()!.body.pickupAt)}`).toBe(true)
  })

  it('選了 08:30：送出的 pickupAt 是那個時段的 start', async () => {
    const { cart } = await setup()
    const r = radioFor('08:30') as HTMLInputElement
    expect(r, '找不到 08:30 的 radio').toBeDefined()
    r.checked = true
    r.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await submit()
    expect(post()?.body.pickupAt, '選了 08:30，POST /orders 的 pickupAt 要是那個時段的 start（原封不動送回 API 給的字串）').toBe(SLOTS[0].start)
    expect(post()?.body.items?.length, '品項要照常送出').toBe(2)
    expect(cart.lines.length, '下單成功要清空購物車（原本的行為）').toBe(0)
  })

  it('選了 08:30 又改回「現點現做」：送出的 body 沒有 pickupAt', async () => {
    await setup()
    for (const text of ['08:30', '現點現做']) {
      const r = radioFor(text) as HTMLInputElement
      expect(r, `找不到「${text}」的 radio`).toBeDefined()
      r.checked = true
      r.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
    }
    await submit()
    expect(post()?.body.pickupAt == null, `改回現點現做後不要送 pickupAt，你送了 ${JSON.stringify(post()?.body.pickupAt)}：現點現做的 value 用空字串，送出時 pickupAt.value || undefined`).toBe(true)
  })

  it('其他錯誤（422）不能說成「已額滿」：顯示 API 的訊息', async () => {
    await setup()
    postReply = { status: 422, body: { code: 'PICKUP_INVALID', message: '取餐時間不是今天可以選的時段' } }
    await submit()
    const text = document.querySelector('[role="alert"]')?.textContent ?? ''
    expect(text, '422 要在 role="alert" 顯示 API 回的 message').toContain('取餐時間不是今天可以選的時段')
    expect(text, '只有 code 是 SLOT_FULL 才顯示「已額滿」：用 e instanceof ApiError && e.code === \'SLOT_FULL\' 判斷，其他錯誤照原本顯示訊息').not.toContain('已額滿')
  })

  it('收到 409 SLOT_FULL：顯示「已額滿」、重新載入時段、購物車還在', async () => {
    const { cart, router } = await setup()
    postReply = { status: 409, body: { code: 'SLOT_FULL', message: 'slot full' } }
    const r = radioFor('09:00') as HTMLInputElement
    r.checked = true
    r.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    const before = slotGets()
    await submit()
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent ?? '', '收到 409 { code: "SLOT_FULL" } 要在 role="alert" 裡顯示含「已額滿」的訊息。client.ts 要把 body 的 code 帶出來（例如 ApiError），畫面才分辨得出是額滿').toContain('已額滿')
    expect(slotGets(), '額滿後要再呼叫一次 GET /pickup-slots，剛額滿的時段才會變成不能選').toBeGreaterThan(before)
    expect(cart.lines.length, '額滿不是顧客的錯：購物車的品項要留著，讓他改選時段再送').toBe(2)
    expect(router.currentRoute.value.path, '額滿時要留在結帳頁').toBe('/checkout')
  })
})
