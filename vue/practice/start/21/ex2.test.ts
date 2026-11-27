import { describe, expect, test, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { installErrorReporting, type ErrorReport } from './error-reporting.ts'

function setup(context: Record<string, unknown> = { userId: 'u_42' }) {
  let time = 1_000_000
  const report = vi.fn((_payload: ErrorReport) => {})
  const target = new EventTarget()
  let route = '/checkout?step=2'
  // 每個 Checkout 元件在 onMounted 丟出同一個錯誤；count 加 1 就多掛載一個
  const error = new Error('結帳金額計算錯誤')
  const count = ref(1)
  const Checkout = defineComponent({
    name: 'Checkout',
    setup() {
      onMounted(() => { throw error })
      return () => h('p', '結帳')
    },
  })
  const app = createApp({ render: () => Array.from({ length: count.value }, () => h(Checkout)) })
  const uninstall = installErrorReporting(app, {
    report,
    release: 'web@2026.10.31-1',
    getRoute: () => route,
    getContext: () => context,
    now: () => time,
    target,
  })
  app.mount(document.createElement('div'))
  return {
    report, target, error, uninstall,
    mountAnother: async () => { count.value++; await nextTick() },
    tick: (ms: number) => { time += ms },
    setRoute: (r: string) => { route = r },
    setContext: (c: Record<string, unknown>) => { context = c },
    cleanup: () => app.unmount(),
  }
}

function rejection(reason: unknown) {
  return Object.assign(new Event('unhandledrejection'), { reason })
}
function windowError(error: unknown) {
  return Object.assign(new Event('error'), { error, message: String(error) })
}

describe('練習 2：集中回報錯誤', () => {
  test('Vue 元件的錯誤：回報 message、stack、info、route、release、context', () => {
    const t = setup()
    expect(t.report, '要設定 app.config.errorHandler，元件的錯誤才會進來').toHaveBeenCalledTimes(1)
    expect(t.report.mock.calls[0][0], '回報內容不對：message、stack 從錯誤取出，info 用 Vue 給的，route／release／context 來自 options').toEqual({
      message: '結帳金額計算錯誤',
      stack: t.error.stack,
      info: 'mounted hook',
      route: '/checkout?step=2',
      release: 'web@2026.10.31-1',
      context: { userId: 'u_42' },
    })
    t.cleanup()
  })

  test('沒有被 catch 的 Promise：監聽 target 的 unhandledrejection', () => {
    const t = setup()
    t.target.dispatchEvent(rejection(new Error('取餐通知送出失敗')))
    t.target.dispatchEvent(rejection('逾時'))
    const payloads = t.report.mock.calls.map((c) => c[0])
    expect(payloads[1]?.message, 'Vue 攔不到沒有 catch 的 Promise：要在 options.target 監聽 unhandledrejection，錯誤在 event.reason').toBe('取餐通知送出失敗')
    expect(payloads[1]?.info, 'unhandledrejection 的 info 要是 \'unhandledrejection\'').toBe('unhandledrejection')
    expect(payloads[2] && { message: payloads[2].message, stack: payloads[2].stack }, 'reason 不是 Error 時，message 是 String(值)、stack 是空字串').toEqual({ message: '逾時', stack: '' })
    t.cleanup()
  })

  test('setTimeout 裡丟出的錯誤：監聽 target 的 error', () => {
    const t = setup()
    t.setRoute('/menu')
    t.setContext({ userId: 'u_7' })
    t.target.dispatchEvent(windowError(new Error('計時器裡的錯誤')))
    const p = t.report.mock.calls[1]?.[0]
    expect(p?.message, 'setTimeout 的 callback 不在 Vue 的呼叫範圍裡，要在 options.target 監聽 error，錯誤在 event.error').toBe('計時器裡的錯誤')
    expect(p?.info, 'error 事件的 info 要是 \'window error\'').toBe('window error')
    expect(p && { route: p.route, context: p.context }, '每次回報都要當下呼叫 getRoute()、getContext()：客人換頁、狀態改變後，回報要帶最新的值（不能在 install 時算一次就沿用，也不能寫死）').toEqual({ route: '/menu', context: { userId: 'u_7' } })
    t.cleanup()
  })

  test('遮罩：名稱含 token、password、phone 的欄位（不分大小寫、巢狀也算）', () => {
    const context = Object.freeze({
      userId: 'u_42',
      accessToken: 'eyJhbGciOi.secret',
      user: Object.freeze({ name: '王小明', Phone: '0912-345-678', settings: Object.freeze({ newPassword: 'hunter2', lang: 'zh-TW' }) }),
      cart: Object.freeze([Object.freeze({ productId: 2, qty: 1 })]),
      pickups: Object.freeze([Object.freeze({ orderId: 7, pickupPhone: '0987-654-321' })]),
    })
    const t = setup(context)
    const sent = t.report.mock.calls[0][0].context
    expect(Array.isArray(sent.pickups), '陣列要維持是陣列：用 Array.isArray 判斷，對每個元素遞迴遮罩').toBe(true)
    expect(JSON.stringify(sent).includes('0987'), '陣列裡的物件也要遮罩：pickups[0].pickupPhone 還是原本的手機號碼').toBe(false)
    expect(JSON.stringify(sent).includes('secret'), 'token 不能送出去：欄位名稱含 token 的值要改成 \'[已遮罩]\'').toBe(false)
    expect(sent, '欄位名稱含 token、password、phone（不分大小寫、巢狀物件裡也要）的值改成 \'[已遮罩]\'，其他欄位照原樣').toEqual({
      userId: 'u_42',
      accessToken: '[已遮罩]',
      user: { name: '王小明', Phone: '[已遮罩]', settings: { newPassword: '[已遮罩]', lang: 'zh-TW' } },
      cart: [{ productId: 2, qty: 1 }],
      pickups: [{ orderId: 7, pickupPhone: '[已遮罩]' }],
    })
    t.cleanup()
  })

  test('去重：同一個錯誤 60 秒內只回報一次，超過再回報', async () => {
    const t = setup()
    t.tick(30_000)
    await t.mountAnother()
    await t.mountAnother()
    expect(t.report, '同一個 message＋stack 在 60 秒內只能回報一次：用 Map 記下每個錯誤上次回報的時間（用 options.now()）').toHaveBeenCalledTimes(1)
    // 訊息一樣、但從另一個地方丟出（stack 不同）：是另一個問題
    t.target.dispatchEvent(rejection(new Error('結帳金額計算錯誤')))
    expect(t.report, '去重的識別要用 message＋stack：訊息相同但 stack 不同，代表從別的地方丟出，要回報').toHaveBeenCalledTimes(2)
    t.target.dispatchEvent(rejection(new Error('另一個錯誤')))
    expect(t.report, '不同的錯誤不受影響，要回報').toHaveBeenCalledTimes(3)
    t.tick(30_001)
    await t.mountAnother()
    expect(t.report, '距離上次回報超過 60 秒，同一個錯誤要再回報一次（不能永遠不回報）。時間要用 options.now()，不要用 Date.now()').toHaveBeenCalledTimes(4)
    t.cleanup()
  })

  test('回傳的函式移除 target 上的監聽', () => {
    const t = setup()
    t.uninstall()
    t.target.dispatchEvent(rejection(new Error('移除之後')))
    t.target.dispatchEvent(windowError(new Error('移除之後 2')))
    expect(t.report, 'installErrorReporting 要回傳一個函式，移除 unhandledrejection 和 error 兩個監聽').toHaveBeenCalledTimes(1)
    t.cleanup()
  })
})
