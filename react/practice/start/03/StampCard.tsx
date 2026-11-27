// 練習 1：集點卡 StampCard（useState、快照與 updater）
// 問題：
//   - 「買三杯」呼叫了三次 addOne()，卻只加 1 點
//   - 「集 1 點」要等 save()（把點數存到伺服器，回傳 Promise）完成才加點。客人連按三下，三次都存成功，卻只加 1 點
//   - 「兌換」還沒做
// 要求：
//   1. 按「買三杯」一次加 3 點，再按一次是 6 點
//   2. 按「集 1 點」：先呼叫 save()，等它完成才加 1 點（完成前畫面不能先加）。連按三下、三個 save 都完成後是 3 點
//   3. 滿 10 點時顯示 <p>可以兌換一杯</p>，「兌換」按鈕才能按；按「兌換」扣 10 點（13 點 → 3 點）。
//      不到 10 點時按鈕是 disabled，也不顯示提示
//   4. 「能不能兌換」從點數算出來，不要另外放一個 state
// 不能做的事：
//   - 把點數放在元件外面的變數（畫面上有兩張卡時要各自計數）
//   - 改畫面上的文字與按鈕名稱（測試靠它們找元素）
import { useState } from 'react'

type Props = { save: () => Promise<void> }

export function StampCard({ save }: Props) {
  const [stamps, setStamps] = useState(0)

  function addOne() {
    setStamps(stamps + 1)
  }

  function handleBuyThree() {
    addOne()
    addOne()
    addOne()
  }

  async function handleStamp() {
    await save()
    addOne()
  }

  return (
    <section>
      <p>已集 {stamps} 點</p>
      <button type="button" onClick={handleStamp}>集 1 點</button>
      <button type="button" onClick={handleBuyThree}>買三杯</button>
      <button type="button">兌換</button>
    </section>
  )
}
