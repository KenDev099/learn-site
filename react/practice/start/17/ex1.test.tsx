import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { NewsletterForm, type Topic } from './NewsletterForm.tsx'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { renderCounter } from '../../helpers/render-count.tsx'

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    return this.state.error ? <p role="alert">訂閱失敗：{this.state.error.message}</p> : this.props.children
  }
}

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
  const pending: Deferred<void>[] = []
  const subscribe = vi.fn((_email: string, _topic: Topic) => {
    const d = deferred<void>()
    pending.push(d)
    unfinished.push(() => d.resolve())
    return d.promise
  })
  const counter = renderCounter()
  render(
    <Boundary>
      <counter.Profile id="form"><NewsletterForm subscribe={subscribe} /></counter.Profile>
    </Boundary>,
  )
  const input = screen.getByLabelText<HTMLInputElement>('Email')
  const button = (name: string) => screen.getByRole('button', { name })
  const finish = async (i: number) => { await act(async () => { pending[i].resolve(); await tick() }) }
  const fail = async (i: number, error: Error) => { await act(async () => { pending[i].reject(error); await tick() }) }
  return { user: userEvent.setup(), subscribe, counter, input, button, finish, fail }
}

describe('練習 1：NewsletterForm 改用 <form action>', () => {
  test('action 收到 FormData：按哪顆按鈕，topic 就是那顆的 value', async () => {
    const f = setup()
    await f.user.type(f.input, 'ming@brew.tw')
    await f.user.click(f.button('訂閱優惠通知'))
    expect(f.subscribe.mock.calls, '按「訂閱優惠通知」要呼叫 subscribe(\'ming@brew.tw\', \'sale\')。topic 是 null 的話：new FormData(form) 不含按下去的按鈕，改用 <form action>，React 給的 FormData 會包含它').toEqual([['ming@brew.tw', 'sale']])
    await f.finish(0)
    await f.user.clear(f.input)
    await f.user.type(f.input, 'hua@brew.tw')
    await f.user.click(f.button('訂閱新品通知'))
    expect(f.subscribe.mock.calls[1], 'Email 要從 FormData 讀（formData.get(\'email\')），topic 是這次按的按鈕').toEqual(['hua@brew.tw', 'new'])
  })

  test('在輸入框按 Enter 等於按第一顆按鈕（topic 是 new）', async () => {
    const f = setup()
    await f.user.type(f.input, 'hao@brew.tw{Enter}')
    expect(f.subscribe.mock.calls, '按 Enter 要送出表單，topic 是第一顆按鈕的 new').toEqual([['hao@brew.tw', 'new']])
  })

  test('打字時元件不重新 render（非受控）', async () => {
    const f = setup()
    f.counter.reset()
    await f.user.type(f.input, 'ting@brew.tw')
    expect(f.counter.commits('form'), '打字時 NewsletterForm 不能重新 render：拿掉 useState 和 value／onChange，保留 name="email"，送出時從 FormData 讀').toBe(0)
    expect(f.input).toHaveValue('ting@brew.tw')
  })

  test('送出中保留輸入，成功後輸入框自動清空', async () => {
    const f = setup()
    await f.user.type(f.input, 'kuo@brew.tw')
    await f.user.click(f.button('訂閱新品通知'))
    expect(f.subscribe, '按下按鈕要呼叫 subscribe').toHaveBeenCalledTimes(1)
    expect(f.input, 'subscribe 還沒完成時輸入框要保留使用者打的字：不要在 await 之前自己清空').toHaveValue('kuo@brew.tw')
    await f.finish(0)
    expect(f.input, 'subscribe 成功後輸入框要清空：action 要 await subscribe（回傳它的 Promise），成功後 React 會自動重設非受控欄位').toHaveValue('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('subscribe 失敗時錯誤往上丟，由外層的 Error Boundary 顯示', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = setup()
    await f.user.type(f.input, 'li@brew.tw')
    await f.user.click(f.button('訂閱優惠通知'))
    await f.fail(0, new Error('網路連線中斷'))
    expect(screen.queryByRole('alert'), '失敗時不要 catch 起來吞掉：action 丟出的錯誤會交給最近的 Error Boundary（第 13 課），使用者才知道沒有訂閱成功').toHaveTextContent('訂閱失敗：網路連線中斷')
  })
})
