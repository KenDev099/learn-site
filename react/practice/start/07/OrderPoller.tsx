// 練習 2：訂單看板的自動更新 OrderPoller（計時器不重來，又能呼叫最新的 onTick）
// 問題：看板每 intervalMs 毫秒呼叫一次 onTick 重新抓訂單。父元件每次 render 都傳一個新的 onTick 函式，
//       onTick 在依賴陣列裡，所以父元件一重新 render，計時器就被清掉重來；父元件更新得比 intervalMs 頻繁時，onTick 永遠不會被呼叫。
// 要求：
//   1. 每 intervalMs 毫秒呼叫一次 onTick
//   2. 父元件重新 render（傳了新的 onTick）時，計時不能重來
//   3. 時間到的時候，呼叫的是「最新一次 render 傳進來」的 onTick，不是舊的
//   4. intervalMs 改變時，用新的間隔重新計時；卸載時清掉計時器
// 不能做的事：把依賴陣列裡的值拿掉、再用註解關掉 lint 規則；在 render 過程中讀寫 ref.current
import { useEffect } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  useEffect(() => {
    const id = setInterval(onTick, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, onTick])   // ✗ onTick 每次 render 都是新的函式，計時器跟著重來

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
