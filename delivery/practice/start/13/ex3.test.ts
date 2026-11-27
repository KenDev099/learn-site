// @vitest-environment happy-dom
// 練習 3：訂單頁的「取消訂單」。fetch 換成假的，不連 API
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import OrderStatusPage from './web/src/pages/OrderStatusPage.vue'

type Call = { url: string, method: string }
let calls: Call[]
let serverStatus: string
let cancelReply: { status: number, body: object } | null
let wrapper: VueWrapper | undefined

const order = (status: string) => ({ id: 42, status, total: 110, customerNote: null, orderedAt: '2026-11-17T00:02:00.000Z', pickupAt: null, items: [{ productId: 2, quantity: 1, unitPrice: 110 }] })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function setup(status: string) {
  serverStatus = status
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] })
  wrapper = mount(OrderStatusPage, { props: { id: 42 }, global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
}
const text = () => document.body.textContent?.replace(/\s+/g, '') ?? ''
const buttons = () => [...document.querySelectorAll('button, [role="button"]')] as HTMLElement[]
const cancelButton = () => buttons().find(b => b.textContent?.trim() === '取消訂單' && !b.closest('dialog, [role="dialog"]'))
const openDialog = () => [...document.querySelectorAll('dialog, [role="dialog"]')].find(d => d instanceof HTMLDialogElement ? d.open : !d.hasAttribute('hidden'))
const cancelPosts = () => calls.filter(c => c.method === 'POST' && c.url.includes('/orders/42/cancel'))

async function confirmCancel() {
  const button = cancelButton()
  expect(button, '付好款的訂單要有一個文字是「取消訂單」的按鈕（<button>）').toBeDefined()
  button!.click()
  await flushPromises()
  expect(window.confirm, '不要用 window.confirm：它擋住整個頁面、樣式改不了，也不能寫清楚退款的說明。用 <dialog> 的 showModal()').not.toHaveBeenCalled()
  const dialog = openDialog()
  expect(dialog, '按「取消訂單」之後要打開確認視窗：<dialog> 並呼叫 showModal()').toBeDefined()
  expect(cancelPosts().length, '還沒按確認就送出取消了：要等顧客在確認視窗按「確定取消」').toBe(0)
  const ok = [...dialog!.querySelectorAll('button')].find(b => b.textContent?.includes('確定'))
  expect(ok, '確認視窗裡要有一個文字含「確定」的按鈕（例如「確定取消」）').toBeDefined()
  ok!.click()
  await flushPromises()
}

beforeEach(() => {
  calls = []
  cancelReply = null
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input), method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url, method })
    if (method === 'POST' && url.endsWith('/api/orders/42/cancel')) {
      if (cancelReply) return json(cancelReply.status, cancelReply.body)
      serverStatus = 'cancelled'
      return json(200, order('cancelled'))
    }
    if (method === 'GET' && url.endsWith('/api/orders/42')) return json(200, order(serverStatus))
    return json(404, { code: 'NOT_FOUND', message: `測試沒有準備這個請求：${method} ${url}` })
  }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('練習 3：訂單頁取消訂單', () => {
  it('付好款的訂單：按「取消訂單」→ 確認視窗 → 確定後送出 POST /api/orders/42/cancel，畫面顯示「已取消，款項將退回」，按鈕消失', async () => {
    await setup('paid')
    await confirmCancel()
    expect(cancelPosts().length, '按「確定取消」之後要送出一次 POST /api/orders/42/cancel（在 web/src/api/orders.ts 加 cancelOrder）').toBe(1)
    expect(text(), '取消成功後畫面要顯示「已取消，款項將退回」：用 API 回傳的訂單更新畫面').toContain('已取消，款項將退回')
    expect(cancelButton(), '已取消的訂單不能再顯示「取消訂單」按鈕').toBeUndefined()
  })

  it('製作中的訂單沒有「取消訂單」按鈕', async () => {
    await setup('preparing')
    expect(text(), '先確認訂單有顯示出來').toContain('訂單#42')
    expect(cancelButton(), 'preparing（吧台已經開始做）的訂單不能取消：只有 paid 才顯示按鈕').toBeUndefined()
  })

  it('API 回 409（吧台剛好開始做了）：顯示原因，按鈕消失', async () => {
    await setup('paid')
    cancelReply = { status: 409, body: { code: 'ORDER_NOT_CANCELLABLE', message: '吧台已經開始製作，不能取消' } }
    serverStatus = 'preparing'
    await confirmCancel()
    expect(text(), '409 時要把 API 的 message 顯示給顧客').toContain('吧台已經開始製作，不能取消')
    expect(cancelButton(), '409 代表訂單的狀態已經變了：重新讀一次訂單（或不再顯示按鈕），按鈕要消失').toBeUndefined()
  })
})
