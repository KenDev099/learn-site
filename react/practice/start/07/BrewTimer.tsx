// 練習 1：沖煮計時器 BrewTimer（計時器 id 放哪裡）
// 問題：手沖咖啡要計時。按「開始」會動，但按「停止」停不下來：
//       timerId 是元件函式裡的一般變數，每次重新 render 都是一個新的變數，stop() 拿到的是 undefined。
// 要求：
//   1. 按「開始」後每秒加 1，畫面顯示「已沖煮 N 秒」；按「停止」後不再增加，再按「開始」從原本的秒數繼續
//   2. 已經在計時的時候再按「開始」，不能多開一個計時器
//   3. 按「開始」「停止」本身不改變畫面，所以不能造成重新 render（計時器 id 不放 state）
//   4. 元件卸載時，還在跑的計時器要清掉
//   5. 同一頁放兩個 BrewTimer，各自計時、互不影響
// 不能做的事：把 id 放在元件外面的變數；在 render 過程中讀寫 ref.current；用註解關掉 lint 規則
import { useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)
  let timerId: ReturnType<typeof setInterval> | undefined   // ✗ 每次 render 都重新宣告

  function start() {
    timerId = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stop() {
    clearInterval(timerId)
  }

  return (
    <section>
      <p role="timer">已沖煮 {seconds} 秒</p>
      <button type="button" onClick={start}>開始</button>
      <button type="button" onClick={stop}>停止</button>
    </section>
  )
}
