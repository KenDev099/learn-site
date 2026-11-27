// 練習 3：數量選擇器 QuantityStepper（通知父元件：在事件裡一起更新）
// 問題：元件自己有 qty 這個 state，用 effect「qty 變了就呼叫 onChange」通知父元件。結果：
//       - 一掛載就呼叫 onChange(1)：客人什麼都沒按，父元件卻收到「數量改變」
//       - 按一次 + 要 render 兩輪：先更新自己 → 畫面更新 → effect 呼叫 onChange → 父元件 setState → 再 render 一次
//       - 父元件用 inline 函式傳 onChange 時，每次 render 都是新的函式，effect 每次都重跑、重複通知
// 要求：
//   1. 掛載時不呼叫 onChange
//   2. 按「增加」「減少」時，在同一個事件處理函式裡更新自己的 qty 並呼叫 onChange(新的數量)，每按一次恰好呼叫一次
//   3. 數量範圍 1～20：已經是 20 按「增加」、已經是 1 按「減少」，數量不變，也不呼叫 onChange
//   4. 父元件在 onChange 裡 setState 時，按一次只 render 一輪（兩個元件的更新被批次在一起）
// 不能做的事：
//   - 不能用 effect 通知父元件（包含「跳過第一次」的寫法）
//   - 不能在 setQty 的 updater 函式裡呼叫 onChange：updater 要是純函式，StrictMode 開發時會呼叫它兩次
import { useState } from 'react'

type Props = {
  /** 一開始的數量，預設 1 */
  defaultValue?: number
  /** 數量改變時通知父元件 */
  onChange: (quantity: number) => void
}

const MIN = 1
const MAX = 20

export function QuantityStepper({ defaultValue = 1, onChange }: Props) {
  const [qty, setQty] = useState(defaultValue)

  // 造成改變的是這次點擊：自己的 state 和父元件的通知都在這裡做，React 會把它們批次成一次 render
  function change(next: number) {
    if (next < MIN || next > MAX) return
    setQty(next)
    onChange(next)
  }

  return (
    <div role="group" aria-label="數量">
      <button type="button" aria-label="減少" onClick={() => change(qty - 1)}>−</button>
      <output>{qty}</output>
      <button type="button" aria-label="增加" onClick={() => change(qty + 1)}>+</button>
    </div>
  )
}
