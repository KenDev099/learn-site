import { describe, expect, test } from 'vitest'
import { useReducer, type ComponentType } from 'react'
import { cleanup } from '@testing-library/react'
import { PickupQueue, type PickupOrder, type PickupQueueProps } from './PickupQueue.tsx'
import { checkPickupQueue } from './ex2.checks.tsx'

// 正確版本 B：useReducer、按鈕在第一欄、沒有單號欄、表格用 aria-label 命名、已完成用 <ol> 加 aria-labelledby、項目文字格式不同
// 改動旗標的預設值就是某一種錯誤版本；名稱都叫 PickupQueue
function variant({ actOnClicked = true, liveCount = true, showDone = true, removeRow = true, passId = true } = {}): ComponentType<PickupQueueProps> {
  type State = { waiting: PickupOrder[]; done: PickupOrder[] }
  function reducer(state: State, order: PickupOrder): State {
    return {
      waiting: removeRow ? state.waiting.filter(o => o.id !== order.id) : state.waiting,
      done: showDone ? [order, ...state.done] : state.done,
    }
  }
  return function PickupQueue({ orders, onComplete }: PickupQueueProps) {
    const [state, dispatch] = useReducer(reducer, { waiting: [...orders], done: [] })
    function complete(clicked: PickupOrder, index: number) {
      const order = actOnClicked ? clicked : state.waiting[0]
      dispatch(order)
      onComplete(passId ? order.id : index)
    }
    return (
      <div>
        <header><h1>待取餐（{liveCount ? state.waiting.length : orders.length}）</h1></header>
        <table aria-label="待取餐">
          <tbody>
            {state.waiting.map((o, i) => (
              <tr key={o.id}>
                <td><button onClick={() => complete(o, i)}>完成</button></td>
                <td><strong>{o.customer}</strong></td>
                <td><small>{o.items}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 id="done-title">已完成</h2>
        <ol aria-labelledby="done-title">
          {state.done.map(o => <li key={o.id}><span>{o.customer}</span>（#{o.id}）</li>)}
        </ol>
      </div>
    )
  }
}

const WRONG: [string, ComponentType<PickupQueueProps>][] = [
  ['不管按哪一列，完成的都是第一筆', variant({ actOnClicked: false })],
  ['標題的筆數不會減少', variant({ liveCount: false })],
  ['完成的訂單沒有出現在「已完成」', variant({ showDone: false })],
  ['完成的訂單還留在待取餐表格裡', variant({ removeRow: false })],
  ['onComplete 收到的是第幾列，不是訂單 id', variant({ passId: false })],
]

async function run(Queue: ComponentType<PickupQueueProps>) {
  try {
    await checkPickupQueue(Queue)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  } finally {
    cleanup()
  }
}

describe('練習 2：待取餐清單的檢查', () => {
  test('正確版本 A（PickupQueue.tsx）要通過', async () => {
    const error = await run(PickupQueue)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}`).toBeNull()
  })

  test('正確版本 B（欄位順序不同、沒有單號欄、已完成的項目格式不同）要通過', async () => {
    const error = await run(variant())
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。不要靠第幾欄、第幾個元素找東西：用列的名稱找到那一列，再用 within 在列裡找按鈕`).toBeNull()
  })

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, Queue) => {
    const error = await run(Queue)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  })
})
