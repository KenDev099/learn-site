// 練習 3：useOnlineStatus（訂閱 React 以外的資料）
// 櫃檯平板斷線時要停用「結帳」按鈕。瀏覽器的連線狀態在 navigator.onLine，改變時 window 會收到 online／offline 事件。
// 下面的版本用 useState + useEffect 自己同步，有三個問題：
//   - 初始值寫死 true：斷線時才打開的頁面會先顯示「連線中」
//   - 元件 render 完到 effect 開始監聽之間如果斷線，這次改變就漏掉了
//   - 之後做伺服器端渲染（第 22 課）沒有統一的初始值
// 改用 useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)：
//   1. subscribe(onChange)：監聽 window 的 online 與 offline，回傳取消監聽的函式。
//      它要宣告在 hook 外面，元件重新 render 才不會重新訂閱
//   2. getSnapshot：回傳 navigator.onLine
//   3. getServerSnapshot：伺服器不知道使用者的連線狀態，回傳 true
// 回傳值是 boolean。
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
