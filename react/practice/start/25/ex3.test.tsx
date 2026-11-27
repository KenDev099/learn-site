import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { createCheckoutAction, initialCheckoutState, type CheckoutState } from './features/checkout/checkout-action.ts'
import { CheckoutPage } from './features/checkout/CheckoutPage.tsx'
import { useCartStore } from './features/cart/index.ts'
import { ApiError, ValidationError, type CartLine, type CheckoutInput } from './shared/api.ts'
import { currentUrl, renderApp, settle } from './test-utils.tsx'

const LINES: CartLine[] = [
  { key: '2-L-less', productId: 2, name: '拿鐵', size: 'L', sugar: 'less', unitPrice: 130, quantity: 1 },
  { key: '5-M-normal', productId: 5, name: '可頌', size: 'M', sugar: 'normal', unitPrice: 70, quantity: 2 },
]
const VALID = { name: ' 王小明 ', phone: '0912345678', pickupTime: '08:30' }

function form(values: Record<string, string> = VALID) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

/** 直接呼叫 Action：createOrder 由測試決定成功或失敗 */
function setup(lines: CartLine[] = LINES) {
  const pending: Deferred<{ id: number }>[] = []
  const createOrder = vi.fn((_input: CheckoutInput, _key: string) => {
    const d = deferred<{ id: number }>()
    pending.push(d)
    return d.promise
  })
  let cartLines = structuredClone(lines)
  const cart = { lines: vi.fn(() => cartLines), clear: vi.fn(() => { cartLines = [] }) }
  let n = 0
  const newKey = vi.fn(() => `key-${++n}`)
  const onPlaced = vi.fn()
  const reporter = { capture: vi.fn() }
  const action = createCheckoutAction({ api: { createOrder }, cart, newKey, onPlaced, reporter })
  /** 送出一次，並讓這次的 createOrder 用 outcome 結束（沒有呼叫 API 就直接回傳） */
  async function submit(outcome: { id: number } | Error, values?: Record<string, string>): Promise<CheckoutState> {
    const before = createOrder.mock.calls.length
    const result = action(initialCheckoutState, form(values))
    await Promise.resolve()
    if (createOrder.mock.calls.length > before) {
      if (outcome instanceof Error) pending.at(-1)!.reject(outcome)
      else pending.at(-1)!.resolve(outcome)
    }
    return result
  }
  const keys = () => createOrder.mock.calls.map(c => c[1])
  return { createOrder, cart, newKey, onPlaced, reporter, submit, keys, cartLines: () => cartLines }
}

describe('練習 3：結帳的 Action', () => {
  test('成功：送出去的內容、清空購物車、通知換頁、回傳初始的 state', async () => {
    const t = setup()
    const state = await t.submit({ id: 77 })
    expect(t.createOrder, '要呼叫 api.createOrder 一次').toHaveBeenCalledTimes(1)
    expect(t.createOrder.mock.calls[0][0], '送出去的是去掉空白的姓名、手機、取餐時間，以及每一列的 productId／size／sugar／quantity（不要送單價：價格由伺服器決定）').toEqual({
      name: '王小明', phone: '0912345678', pickupTime: '08:30',
      lines: [{ productId: 2, size: 'L', sugar: 'less', quantity: 1 }, { productId: 5, size: 'M', sugar: 'normal', quantity: 2 }],
    })
    expect(t.keys(), '第二個參數是 deps.newKey() 產生的冪等鍵').toEqual(['key-1'])
    expect(t.cart.clear, '成功之後清空購物車一次').toHaveBeenCalledTimes(1)
    expect(t.onPlaced, '成功之後呼叫 onPlaced(訂單編號)，頁面用它換到訂單狀態頁').toHaveBeenCalledWith(77)
    expect(state, '成功要回傳 initialCheckoutState：表單清空、沒有錯誤').toEqual(initialCheckoutState)
  })

  test('驗證沒過、購物車是空的：都不呼叫 API，也不產生冪等鍵', async () => {
    const t = setup()
    const invalid = await t.submit({ id: 1 }, { name: '', phone: '12', pickupTime: '8:30' })
    expect(Object.keys(invalid.fieldErrors).sort(), '驗證的部分已經寫好，不要改掉').toEqual(['name', 'phone', 'pickupTime'])
    const empty = setup([])
    const state = await empty.submit({ id: 1 })
    expect(empty.createOrder, '購物車是空的不能送出：React 會把連按的送出排隊，第一次成功清空購物車後，第二次要在這裡停下，不然會建立一筆空訂單').not.toHaveBeenCalled()
    expect(state.formError, '購物車是空的要回傳 formError「購物車是空的」').toBe('購物車是空的')
    expect(state.values, '要保留這次送出的原文').toEqual(VALID)
    expect(t.newKey, '還沒真的要呼叫 API 就不要產生冪等鍵').not.toHaveBeenCalled()
    expect(empty.newKey).not.toHaveBeenCalled()
  })

  test('網路斷線：購物車不動、保留原文、回報；重送沿用同一個冪等鍵', async () => {
    const t = setup()
    const offline = new TypeError('Failed to fetch')
    const state = await t.submit(offline)
    expect(t.cart.clear, '失敗不能清空購物車（不要寫在 finally 裡）').not.toHaveBeenCalled()
    expect(t.onPlaced, '失敗不能換頁').not.toHaveBeenCalled()
    expect(state.formError, '網路錯誤這類預期外的錯誤，顯示「送出失敗，請再試一次」').toBe('送出失敗，請再試一次')
    expect(state.values, '失敗要回傳原文，表單才不會被清空').toEqual(VALID)
    expect(t.reporter.capture.mock.calls, '預期外的錯誤要回報一次：reporter.capture(原本的錯誤, { source: \'handler\' })').toEqual([[offline, { source: 'handler' }]])
    await t.submit(new ApiError(503, '服務暫停'))
    await t.submit({ id: 78 })
    expect(t.keys(), '結果不明的失敗（網路、5xx）可能其實已經建立了訂單：重送要沿用同一個冪等鍵，伺服器才認得出是同一次結帳').toEqual(['key-1', 'key-1', 'key-1'])
    expect(t.reporter.capture, '5xx 也要回報').toHaveBeenCalledTimes(2)
    t.cart.lines.mockReturnValue(structuredClone(LINES))
    await t.submit({ id: 79 })
    expect(t.keys().at(-1), '成功之後是新的一次結帳，要換新的冪等鍵').toBe('key-2')
  })

  test('伺服器明確拒絕（4xx）：顯示伺服器的說明、不回報、下一次換新的冪等鍵', async () => {
    const t = setup()
    const s422 = await t.submit(new ValidationError({ pickupTime: ['這個時段已額滿'] }))
    expect(s422.fieldErrors, '422 要把伺服器的 fieldErrors 放進 state，顯示在對應的欄位下').toEqual({ pickupTime: ['這個時段已額滿'] })
    expect(s422.values, '保留原文').toEqual(VALID)
    const s409 = await t.submit(new ApiError(409, '拿鐵已售完'))
    expect(s409.formError, '其他 4xx 顯示伺服器給的 message').toBe('拿鐵已售完')
    expect(s409.fieldErrors, '不能沿用上一次的 fieldErrors：每次從 initialCheckoutState 組新的').toEqual({})
    expect(t.reporter.capture, '4xx 是預期中的錯誤，不要回報（會把監控塞滿）').not.toHaveBeenCalled()
    expect(t.keys(), '4xx 代表伺服器沒有建立訂單；客人改了內容再送是新的嘗試，要換新的冪等鍵').toEqual(['key-1', 'key-2'])
    expect(t.cart.clear).not.toHaveBeenCalled()
  })

  test('程式錯誤也不能丟出去：回傳 formError 並回報', async () => {
    const t = setup()
    const bug = new Error('Cannot read properties of undefined')
    let state: CheckoutState | undefined
    await expect((async () => { state = await t.submit(bug) })(), 'Action 不能把錯誤丟出去：丟出去整張表單會被 Error Boundary 換掉，客人打的字全沒了').resolves.toBeUndefined()
    expect(state?.formError).toBe('送出失敗，請再試一次')
    expect(t.reporter.capture).toHaveBeenCalledWith(bug, { source: 'handler' })
  })
})

describe('練習 3：放進結帳頁', () => {
  beforeEach(() => {
    useCartStore.setState({ lines: structuredClone(LINES) })
  })

  function open() {
    const pending: Deferred<{ id: number }>[] = []
    const createOrder = vi.fn(() => {
      const d = deferred<{ id: number }>()
      pending.push(d)
      return d.promise
    })
    let n = 0
    const t = renderApp([
      { path: 'checkout', Component: () => <CheckoutPage api={{ createOrder }} reporter={{ capture: () => {} }} newKey={() => `key-${++n}`} /> },
      { path: 'orders/:id', Component: () => <h1>訂單狀態</h1> },
    ], '/checkout')
    return { ...t, createOrder, pending }
  }
  async function fill(user: ReturnType<typeof open>['user']) {
    await user.type(screen.getByLabelText('取餐姓名'), '王小明')
    await user.type(screen.getByLabelText('手機'), '0912345678')
    await user.type(screen.getByLabelText('取餐時間'), '08:30')
  }

  test('連續送出兩次只建立一筆訂單；成功後清空購物車並換到訂單頁', async () => {
    const { user, createOrder, pending } = open()
    await settle()
    await fill(user)
    const button = screen.getByRole('button', { name: '送出訂單' })
    const formEl = button.closest('form')!
    // 模擬按鈕還沒變成停用之前、在輸入框連按兩次 Enter
    await act(async () => { formEl.requestSubmit(button); formEl.requestSubmit(button) })
    expect(createOrder, '第一次還在送出時，第二次排在後面').toHaveBeenCalledTimes(1)
    await act(async () => pending[0].resolve({ id: 77 }))
    await settle()
    expect(createOrder, '第一次成功清空購物車後，排在後面的第二次看到空的購物車，不能再建立一筆').toHaveBeenCalledTimes(1)
    expect(currentUrl(), '成功之後換到 /orders/77').toBe('/orders/77')
    expect(useCartStore.getState().lines, '成功之後購物車是空的').toEqual([])
  })

  test('失敗時留在結帳頁，購物車與輸入都還在', async () => {
    const { user, pending } = open()
    await settle()
    await fill(user)
    await user.click(screen.getByRole('button', { name: '送出訂單' }))
    await act(async () => pending[0].reject(new TypeError('Failed to fetch')))
    await settle()
    expect(currentUrl(), '失敗要留在結帳頁').toBe('/checkout')
    expect(useCartStore.getState().lines, '失敗不能清空購物車').toHaveLength(2)
    const formEl = screen.getByRole('button', { name: '送出訂單' }).closest('form')!
    expect(within(formEl).getByRole('alert'), '要顯示錯誤訊息').toHaveTextContent('送出失敗，請再試一次')
    expect(screen.getByLabelText('手機'), '輸入要保留（Action 回傳的 values 會變成 defaultValue）').toHaveValue('0912345678')
  })
})
