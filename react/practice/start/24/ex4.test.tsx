import { describe, expect, test } from 'vitest'
import { act, Component, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listenGlobalErrors, rootErrorOptions } from './monitoring.ts'
import type { ErrorContext, Reporter } from './reporter.ts'

function fakeReporter() {
  const calls: [unknown, ErrorContext][] = []
  const reporter: Reporter = { capture: (error, context) => { calls.push([error, context]) } }
  return { calls, reporter }
}

// 測試用的最小錯誤邊界：只換畫面，不回報（回報交給 onCaughtError）
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">這個區塊暫時無法顯示</p> : this.props.children }
}

const thrown = new Error('推薦商品的價格是 null')
function Recommendation(): ReactNode { throw thrown }
function Timeout(): ReactNode { throw '逾時' }

function mount(app: ReactNode, reporter: Reporter) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container, rootErrorOptions(reporter))
  flushSync(() => root.render(app))   // 不用 act：act 會把沒人攔的錯誤直接丟給測試，onUncaughtError 就收不到
  return { container, root }
}

describe('練習 4：rootErrorOptions 把 React 的錯誤交給 reporter', () => {
  test('被 Error Boundary 攔下的錯誤：source 是 caught，帶 componentStack', () => {
    const { calls, reporter } = fakeReporter()
    const { root } = mount(<main><Boundary><Recommendation /></Boundary></main>, reporter)
    expect(screen.getByRole('alert')).toHaveTextContent('這個區塊暫時無法顯示')
    expect(calls.length, 'onCaughtError 要呼叫 reporter.capture 剛好一次').toBe(1)
    const [error, context] = calls[0]
    expect(error, 'error 要照原樣交出去').toBe(thrown)
    expect(context.source, '被錯誤邊界攔下的是 caught').toBe('caught')
    expect(context.componentStack ?? '', 'componentStack 要用 errorInfo.componentStack，裡面看得到出錯的元件').toContain('Recommendation')
    root.unmount()
  })

  test('沒有 Error Boundary 攔的錯誤：source 是 uncaught，帶 componentStack', () => {
    const { calls, reporter } = fakeReporter()
    const { root } = mount(<main><Recommendation /></main>, reporter)
    expect(calls.length, 'onUncaughtError 要呼叫 reporter.capture 剛好一次').toBe(1)
    const [error, context] = calls[0]
    expect(error).toBe(thrown)
    expect(context.source, '沒有錯誤邊界攔的是 uncaught').toBe('uncaught')
    expect(context.componentStack ?? '').toContain('Recommendation')
    root.unmount()
  })

  test('丟出的不是 Error 時照原樣交出去', () => {
    const { calls, reporter } = fakeReporter()
    const { root } = mount(<Boundary><Timeout /></Boundary>, reporter)
    expect(calls.map(c => c[0]), 'throw \'逾時\' 時 error 就是字串「逾時」，不要包成 Error').toEqual(['逾時'])
    root.unmount()
  })

  test('hydration 不一致：source 是 recoverable', async () => {
    const { calls, reporter } = fakeReporter()
    const container = document.createElement('div')
    container.innerHTML = '<p>營業中</p>'   // 伺服器 render 的 HTML
    document.body.append(container)
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => { root = hydrateRoot(container, <p>休息中</p>, rootErrorOptions(reporter)) })
    expect(calls.map(c => c[1].source), 'hydrateRoot 也用同一組選項：React 自己恢復的錯誤交給 onRecoverableError').toEqual(['recoverable'])
    expect(calls[0][0]).toBeInstanceOf(Error)
    expect(typeof calls[0][1].componentStack, 'recoverable 也要帶 componentStack').toBe('string')
    root?.unmount()
  })
})

describe('練習 4：listenGlobalErrors 收 React 管不到的錯誤', () => {
  test('事件處理函式裡丟的錯：從 window 的 error 事件回報', async () => {
    const { calls, reporter } = fakeReporter()
    const stop = listenGlobalErrors(window, reporter)
    const clickError = new Error('加入購物車失敗')
    render(<button type="button" onClick={() => { throw clickError }}>加入購物車</button>)
    await userEvent.click(screen.getByRole('button'))
    stop()
    expect(calls, '錯誤邊界攔不到事件處理函式的錯誤，要靠 window 的 error 事件；error 用 event.error').toEqual([[clickError, { source: 'window' }]])
  })

  test('跨網域 script 的錯誤沒有 event.error：改交 event.message', () => {
    const { calls, reporter } = fakeReporter()
    const stop = listenGlobalErrors(window, reporter)
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    stop()
    expect(calls).toEqual([['Script error.', { source: 'window' }]])
  })

  test('沒有人接的 Promise 失敗：從 unhandledrejection 回報 event.reason', () => {
    const { calls, reporter } = fakeReporter()
    const stop = listenGlobalErrors(window, reporter)
    const reason = new TypeError('Failed to fetch')
    // happy-dom 沒有 PromiseRejectionEvent，用一般的 Event 加上 reason 模擬
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }))
    stop()
    expect(calls, 'unhandledrejection 的錯誤在 event.reason').toEqual([[reason, { source: 'promise' }]])
  })

  test('回傳的函式移除兩個監聽', () => {
    const { calls, reporter } = fakeReporter()
    const stop = listenGlobalErrors(window, reporter)
    stop()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }))
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('y') }))
    expect(calls.length, '停止之後不能再回報：removeEventListener 要傳入 addEventListener 時的同一個函式').toBe(0)
  })

  test('兩邊都裝好時，render 的錯誤只回報一次', () => {
    const { calls, reporter } = fakeReporter()
    const stop = listenGlobalErrors(window, reporter)
    const { root } = mount(<Recommendation />, reporter)
    stop()
    expect(calls.map(c => c[1].source), '有 onUncaughtError 時 React 不會再觸發 window 的 error 事件；不要在選項裡再把錯誤丟出去').toEqual(['uncaught'])
    root.unmount()
  })
})
