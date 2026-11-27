import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderForm } from './OrderForm.tsx'
import { EMPTY_VALUES, FIELDS, initialOrderState, type OrderState, type OrderValues } from './order-types.ts'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

const LABELS = { name: '姓名', phone: '手機', quantity: '數量', pickupTime: '取餐時間' } as const

/** 等 Action 的 Promise 鏈跑完 */
const tick = () => new Promise(r => setTimeout(r, 0))

// React 會把同時進行的 Transition 合在一起：每個測試結束時把還沒完成的 Action 全部完成，下一個測試才不會被卡住
const unfinished: (() => void)[] = []
afterEach(async () => {
  await act(async () => {
    for (const finish of unfinished.splice(0)) finish()
    await tick()
  })
})

function setup() {
  const pending: Deferred<OrderState>[] = []
  const action = vi.fn((_prev: OrderState, _fd: FormData) => {
    const d = deferred<OrderState>()
    pending.push(d)
    unfinished.push(() => d.resolve(initialOrderState))
    return d.promise
  })
  const counter = renderCounter()
  render(<counter.Profile id="form"><OrderForm action={action} /></counter.Profile>)
  const user = userEvent.setup()
  const input = (field: keyof typeof LABELS) => screen.getByLabelText<HTMLInputElement>(LABELS[field])
  const button = () => screen.getByRole('button')
  const fill = async (v: Partial<OrderValues>) => {
    for (const [k, text] of Object.entries(v) as [keyof typeof LABELS, string][]) {
      await user.clear(input(k))
      if (text) await user.type(input(k), text)
    }
  }
  /** 這次送出的原文（從 action 收到的 FormData 讀） */
  const sent = (i: number): OrderValues => {
    const fd = action.mock.calls[i][1]
    return Object.fromEntries(FIELDS.map(f => [f, String(fd.get(f) ?? '')])) as OrderValues
  }
  const finish = async (i: number, state: OrderState) => { await act(async () => { pending[i].resolve(state); await tick() }) }
  const values = () => Object.fromEntries(FIELDS.map(f => [f, input(f).value]))
  const alerts = () => screen.queryAllByRole('alert').map(el => el.textContent)
  return { user, action, counter, input, button, fill, sent, finish, values, alerts }
}

const typed = { name: '林志豪', phone: '0912', quantity: '3', pickupTime: '9:30' }

describe('練習 4：OrderForm 用 useActionState 顯示錯誤、保留輸入', () => {
  test('欄位非受控（打字不重新 render），送出時 action 收到 FormData 和上一次的 state', async () => {
    const f = setup()
    f.counter.reset()
    await f.fill(typed)
    expect(f.counter.commits('form'), '打字時 OrderForm 不能重新 render：欄位保持非受控（defaultValue），不要用 useState 存欄位').toBe(0)
    await f.user.click(f.button())
    expect(f.action, '按「送出訂單」要執行 action：用 useActionState(action, initialOrderState) 回傳的函式當 <form action>').toHaveBeenCalledTimes(1)
    expect(f.action.mock.calls[0][0], '第一次送出時 action 的第一個參數是 initialOrderState').toEqual(initialOrderState)
    expect(f.sent(0), 'FormData 要有 name、phone、quantity、pickupTime 四個欄位（input 的 name）').toEqual(typed)
  })

  test('送出中按鈕 disabled、顯示「送出中…」，按 Enter 也不會再送出', async () => {
    const f = setup()
    await f.fill(typed)
    await f.user.click(f.button())
    expect(f.button(), '送出中按鈕要 disabled：用 useActionState 的第三個回傳值 isPending').toBeDisabled()
    expect(f.button()).toHaveTextContent(/^送出中…$/)
    await f.user.type(f.input('name'), '{Enter}')
    expect(f.action, '送出中按 Enter 不能再送出（預設按鈕 disabled 時，瀏覽器不會用 Enter 送出表單）').toHaveBeenCalledTimes(1)
    await f.finish(0, { ...initialOrderState, orderId: 81 })
    expect(f.button()).toBeEnabled()
    expect(f.button()).toHaveTextContent(/^送出訂單$/)
  })

  test('欄位錯誤：顯示第一個訊息、關聯到輸入框，欄位保留這次送出的內容', async () => {
    const f = setup()
    await f.fill(typed)
    await f.user.click(f.button())
    await f.finish(0, {
      values: f.sent(0),
      fieldErrors: { phone: ['手機要是 09 開頭的 10 碼數字', '第二個訊息'], pickupTime: ['取餐時間要是 HH:mm'] },
      formError: null,
      orderId: null,
    })
    expect(f.alerts(), '每個有錯的欄位顯示一個 <p role="alert">，內容是 fieldErrors[欄位] 的第一個訊息').toEqual(['手機要是 09 開頭的 10 碼數字', '取餐時間要是 HH:mm'])
    expect(f.input('phone'), '有錯的輸入框要有 aria-invalid="true"').toHaveAttribute('aria-invalid', 'true')
    expect(f.input('phone'), '有錯的輸入框要用 aria-describedby 指向錯誤訊息的 id，報讀器聚焦時才會唸出錯誤').toHaveAccessibleDescription('手機要是 09 開頭的 10 碼數字')
    expect(f.input('pickupTime')).toHaveAccessibleDescription('取餐時間要是 HH:mm')
    expect(f.input('name'), '沒有錯的欄位不要有 aria-invalid（寫 undefined，不要寫 false）').not.toHaveAttribute('aria-invalid')
    expect(f.input('name'), '沒有錯的欄位不要有 aria-describedby').not.toHaveAttribute('aria-describedby')
    expect(f.values(), 'Action 結束後 React 會重設非受控欄位：defaultValue 要用 state.values[欄位]，失敗時欄位才會保留使用者打的字').toEqual(typed)
  })

  test('formError 顯示在表單上，欄位保留內容', async () => {
    const f = setup()
    const other = { name: '黃淑芬', phone: '0987654321', quantity: '12', pickupTime: '18:05' }
    await f.fill(other)
    await f.user.click(f.button())
    await f.finish(0, { values: f.sent(0), fieldErrors: {}, formError: '送出失敗，請再試一次', orderId: null })
    expect(f.alerts(), 'state.formError 有值時顯示 <p role="alert">').toEqual(['送出失敗，請再試一次'])
    expect(f.values(), '失敗時欄位要保留內容（defaultValue 用 state.values）').toEqual(other)
  })

  test('成功：顯示訂單編號、欄位清空、之前的錯誤消失；action 收到上一次的 state', async () => {
    const f = setup()
    await f.fill(typed)
    await f.user.click(f.button())
    const failed: OrderState = { values: f.sent(0), fieldErrors: { phone: ['手機要是 09 開頭的 10 碼數字'] }, formError: null, orderId: null }
    await f.finish(0, failed)
    await f.fill({ phone: '0912345678' })
    await f.user.click(f.button())
    expect(f.action.mock.calls[1][0], '第二次送出時，action 的第一個參數要是上一次回傳的 state（useActionState 會自動傳入）').toEqual(failed)
    await f.finish(1, { values: EMPTY_VALUES, fieldErrors: {}, formError: null, orderId: 107 })
    expect(screen.getByRole('status'), '成功時顯示 <p role="status">訂單 #107 已送出</p>').toHaveTextContent('訂單 #107 已送出')
    expect(f.alerts(), '成功之後，上一次的錯誤訊息要消失（畫面只由最新的 state 決定）').toEqual([])
    expect(f.input('phone')).not.toHaveAttribute('aria-invalid')
    expect(f.values(), '成功後欄位要清空：state.values 是空字串，React 重設表單時放回空的 defaultValue（用 <form action>，不要用 onSubmit + preventDefault）').toEqual(EMPTY_VALUES)
    await f.fill({ name: '李建國' })
    await f.user.click(f.button())
    await f.finish(2, { values: f.sent(2), fieldErrors: { phone: ['手機要是 09 開頭的 10 碼數字'] }, formError: null, orderId: null })
    expect(screen.queryByRole('status'), '下一筆失敗時，上一筆的「已送出」要消失：直接用 state.orderId 顯示，不要另外存').toBeNull()
    expect(f.values().name).toBe('李建國')
  })
})
