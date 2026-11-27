import { useLayoutEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus.ts'

let online = true
// 模擬瀏覽器：改 navigator.onLine，再對 window 發出 online／offline 事件
function setOnline(value: boolean) {
  online = value
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

function PayButton() {
  const isOnline = useOnlineStatus()
  return <button type="button" disabled={!isOnline}>{isOnline ? '結帳' : '離線中'}</button>
}

describe('練習 3：useOnlineStatus', () => {
  beforeEach(() => {
    online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  })

  test('初始值是目前的 navigator.onLine', () => {
    expect(renderHook(() => useOnlineStatus()).result.current, '有連線時要回傳 true').toBe(true)
    online = false
    expect(renderHook(() => useOnlineStatus()).result.current, '斷線時才掛載的元件，第一次 render 就要是 false：getSnapshot 回傳 navigator.onLine，初始值不能寫死 true').toBe(false)
  })

  test('online／offline 事件發生時更新', () => {
    render(<><PayButton /><PayButton /></>)
    act(() => setOnline(false))
    for (const b of screen.getAllByRole('button')) expect(b, '斷線後兩個按鈕都要停用：subscribe 要監聽 window 的 offline 事件').toBeDisabled()
    act(() => setOnline(true))
    for (const b of screen.getAllByRole('button')) expect(b, '恢復連線後按鈕要能按：subscribe 也要監聽 online 事件').toBeEnabled()
  })

  test('render 完到開始訂閱之間斷線，也不會漏掉', () => {
    // layout effect 比 useEffect 與 useSyncExternalStore 的訂閱早執行：這時候還沒有人在聽 offline 事件
    function DropConnection() {
      useLayoutEffect(() => { setOnline(false) }, [])
      return null
    }
    render(<><PayButton /><DropConnection /></>)
    expect(screen.getByRole('button'), '元件 render 時有連線，開始監聽之前斷線了，畫面卻還是「結帳」。useState + useEffect 會漏掉這段時間的改變；useSyncExternalStore 訂閱之後會再讀一次 getSnapshot').toHaveTextContent('離線中')
  })

  test('卸載時取消所有監聽', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const mine = (calls: unknown[][]) => calls.filter(c => c[0] === 'online' || c[0] === 'offline')
    const { unmount } = renderHook(() => useOnlineStatus())
    const added = mine(add.mock.calls)
    expect(added.map(c => c[0]).sort(), '掛載後要監聽 window 的 online 與 offline 各一次').toEqual(['offline', 'online'])
    unmount()
    for (const [type, listener] of added) {
      expect(mine(remove.mock.calls).some(c => c[0] === type && c[1] === listener), `卸載後 ${String(type)} 的監聽還在：subscribe 要回傳取消監聽的函式，removeEventListener 要傳同一個函式`).toBe(true)
    }
  })

  test('重新 render 不會重新訂閱', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const count = () => add.mock.calls.filter(c => c[0] === 'online' || c[0] === 'offline').length
    const { rerender } = renderHook(() => useOnlineStatus())
    const before = count()
    rerender()
    rerender()
    expect(count(), 'subscribe 寫在 hook 裡面時，每次 render 都是新的函式，React 會取消再重新訂閱：把 subscribe 宣告在 hook 外面').toBe(before)
  })

  test('伺服器端渲染時當作有連線', () => {
    online = false   // 伺服器上讀不到使用者的連線狀態，不能照 navigator.onLine
    let html = ''
    try {
      html = renderToString(<PayButton />)
    } catch (e) {
      expect.fail(`renderToString 丟出錯誤：${(e as Error).message}。useSyncExternalStore 的第三個參數 getServerSnapshot 要回傳 true`)
    }
    expect(html, '伺服器端渲染的結果要是「結帳」：useSyncExternalStore 的第三個參數 getServerSnapshot 回傳 true（不是讀 navigator.onLine）').toContain('結帳')
  })
})
