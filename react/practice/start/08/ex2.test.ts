import { describe, expect, test, vi } from 'vitest'
import { canCancel, orderReducer, type OrderAction, type OrderState } from './orderReducer.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { typecheck } from '../../helpers/typecheck.ts'

const at = '2026-11-05T01:30:00.000Z'
const STATES = deepFreeze({
  pending: { status: 'pending' },
  paid: { status: 'paid', paidAt: at },
  preparing: { status: 'preparing', paidAt: at },
  ready: { status: 'ready', paidAt: at },
  completed: { status: 'completed', paidAt: at },
  cancelled: { status: 'cancelled', reason: '顧客取消' },
}) as Record<OrderState['status'], OrderState>
const ACTIONS = deepFreeze({
  paid: { type: 'paid', at: '2026-11-05T02:00:00.000Z' },
  started: { type: 'started' },
  finished: { type: 'finished' },
  picked_up: { type: 'picked_up' },
  cancelled: { type: 'cancelled', reason: '等太久' },
}) as Record<OrderAction['type'], OrderAction>
// 合法的轉換：'現在的狀態 action' → 下一個狀態
const LEGAL: Record<string, OrderState> = {
  'pending paid': { status: 'paid', paidAt: '2026-11-05T02:00:00.000Z' },
  'paid started': { status: 'preparing', paidAt: at },
  'preparing finished': { status: 'ready', paidAt: at },
  'ready picked_up': { status: 'completed', paidAt: at },
  'pending cancelled': { status: 'cancelled', reason: '等太久' },
  'paid cancelled': { status: 'cancelled', reason: '等太久' },
}

describe('練習 2：orderReducer 只接受合法的轉換', () => {
  test('正常流程：pending → paid → preparing → ready → completed，paidAt 一路保留', () => {
    const steps: OrderAction[] = [{ type: 'paid', at }, { type: 'started' }, { type: 'finished' }, { type: 'picked_up' }]
    const seen: OrderState[] = []
    steps.reduce((state, action) => {
      const next = orderReducer(state, deepFreeze(action))
      seen.push(next)
      return next
    }, STATES.pending)
    expect(seen, '每一步的 state（傳進去的 state 是凍結的，要回傳新的物件）').toStrictEqual([STATES.paid, STATES.preparing, STATES.ready, STATES.completed])
  })

  test('paid：付款時間用 action.at，不能在 reducer 裡讀時鐘', () => {
    vi.useFakeTimers({ now: new Date('2030-01-01T00:00:00.000Z') })
    const first = orderReducer(STATES.pending, { type: 'paid', at })
    vi.setSystemTime(new Date('2031-01-01T00:00:00.000Z'))
    const second = orderReducer(STATES.pending, { type: 'paid', at })
    expect(first, 'paidAt 要是 action.at：時間由發出 action 的人決定，reducer 才是純函式（同樣的輸入、同樣的輸出）').toStrictEqual({ status: 'paid', paidAt: at })
    expect(second, '隔了一年再呼叫一次，結果要一樣').toStrictEqual(first)
  })

  test('cancelled：pending、paid 可以取消，結果只有 status 與 reason', () => {
    for (const from of ['pending', 'paid'] as const)
      expect(orderReducer(STATES[from], ACTIONS.cancelled), `${from} 取消之後是 { status: 'cancelled', reason }：reason 用 action.reason，不能留著 paidAt（不要用 { ...state } 把舊欄位帶過來）`)
        .toStrictEqual({ status: 'cancelled', reason: '等太久' })
  })

  test('每一個合法的轉換', () => {
    for (const [key, expected] of Object.entries(LEGAL)) {
      const [from, type] = key.split(' ') as [OrderState['status'], OrderAction['type']]
      expect(orderReducer(STATES[from], ACTIONS[type]), `${from} 收到 ${type}`).toStrictEqual(expected)
    }
  })

  test('不合法的轉換回傳原本的 state（同一個參考），不丟錯', () => {
    for (const from of Object.keys(STATES) as OrderState['status'][]) {
      for (const type of Object.keys(ACTIONS) as OrderAction['type'][]) {
        if (`${from} ${type}` in LEGAL) continue
        let next: OrderState
        try {
          next = orderReducer(STATES[from], ACTIONS[type])
        } catch (e) {
          expect.fail(`${from} 收到 ${type} 是不合法的轉換：回傳原本的 state，不要丟錯也不要改 state（reducer 在 render 中執行，丟錯會讓整個畫面壞掉）。錯誤：${e}`)
        }
        expect(next, `${from} 收到 ${type} 是不合法的轉換：要回傳原本的 state（同一個參考，不是複製一份）`).toBe(STATES[from])
      }
    }
  })

  test('canCancel：只有 pending、paid 可以取消', () => {
    const result = Object.fromEntries(Object.values(STATES).map(s => [s.status, canCancel(s)]))
    expect(result, '開始製作之後就不能取消').toEqual({ pending: true, paid: true, preparing: false, ready: false, completed: false, cancelled: false })
  })

  test('型別：action 少帶欄位、state 少了 paidAt 都要是型別錯誤', { timeout: 30_000 }, () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex2.usage.ts': `
import { canCancel, orderReducer, type OrderState } from './orderReducer.ts'

const paid: OrderState = orderReducer({ status: 'pending' }, { type: 'paid', at: '2026-11-05T01:30:00.000Z' })
const ok: boolean = canCancel(paid)
// @ts-expect-error paid 一定要帶 at
orderReducer(paid, { type: 'paid' })
// @ts-expect-error 沒有 refunded 這種 action
orderReducer(paid, { type: 'refunded' })
// @ts-expect-error paid 狀態一定要有 paidAt
orderReducer({ status: 'paid' }, { type: 'started' })
// @ts-expect-error 回傳的是 OrderState，不是 any
const n: number = orderReducer(paid, { type: 'started' })
export { ok, n }
`,
    })
    expect(errors, 'OrderState、OrderAction 的定義不要改，orderReducer 的參數與回傳值不能是 any。「Unused @ts-expect-error」代表那一行本來該報錯卻沒有').toBe('')
  })
})
