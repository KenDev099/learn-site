// 練習 2：WaitTimer（訂單等候計時器）
// 問題：畫面永遠停在「已等候 1 秒」，而且元件卸載後計時器還在跑。
// 要求：
//   1. running 是 true 時每 1000 毫秒加 1，在 <p role="timer"> 顯示「已等候 N 秒」
//   2. running 變成 false（訂單完成）時停止計時，數字留著；變回 true 時從原本的數字繼續
//   3. 元件卸載、或 running 變成 false 時，計時器要用 clearInterval 清掉
//   4. 計時期間只建立一個計時器：不要每一秒都清掉再重建（提示：第 3 課的 updater function）
// 不能做：用註解關掉 react-hooks 的 lint 檢查
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    setInterval(() => setSeconds(seconds + 1), 1000)
  }, [])

  return <p role="timer">已等候 {seconds} 秒</p>
}
