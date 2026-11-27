// 練習 4：AutoRefresh（每隔一段時間請父元件重新抓菜單）
// 問題：父元件每次 render 都傳一個新的 onRefresh 函式。onRefresh 在依賴陣列裡，
//       所以父元件每重新 render 一次（例如畫面上有每秒更新的時鐘），計時器就被清掉重來，
//       everyMs 是 30000 時永遠等不到第 30 秒，菜單從來沒有更新。
// 要求：
//   1. 每隔 everyMs 毫秒呼叫一次 onRefresh
//   2. 父元件重新 render（傳了新的 onRefresh）不能讓計時器重來
//   3. 時間到的時候要呼叫「最新」的 onRefresh，不是第一次 render 拿到的那一個
//   4. everyMs 改變時用新的間隔重新計時；卸載時清掉計時器
// 不能做：用註解關掉 lint 檢查、只把 onRefresh 從依賴陣列拿掉、卻沒用 useEffectEvent（那會呼叫到舊的函式）
import { useEffect } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  useEffect(() => {
    const id = setInterval(() => onRefresh(), everyMs)
    return () => clearInterval(id)
  }, [everyMs, onRefresh])

  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
