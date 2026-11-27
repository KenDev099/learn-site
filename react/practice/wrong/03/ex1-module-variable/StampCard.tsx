// 練習 1：集點卡 StampCard（useState、快照與 updater）
// 錯誤寫法：點數放在元件外面的變數，所有卡片共用同一份
import { useState } from 'react'

type Props = { save: () => Promise<void> }

let total = 0

export function StampCard({ save }: Props) {
  const [stamps, setStamps] = useState(total)
  // 能不能兌換是從點數算出來的，不用另外存
  const canRedeem = stamps >= 10

  function addOne() {
    total += 1
    setStamps(total)
  }

  function handleBuyThree() {
    addOne()
    addOne()
    addOne()
  }

  async function handleStamp() {
    await save()
    addOne()   // await 之後，這個函式裡的 stamps 還是按下當時的值，所以一定要用 updater
  }

  function handleRedeem() {
    total -= 10
    setStamps(total)
  }

  return (
    <section>
      <p>已集 {stamps} 點</p>
      {canRedeem && <p>可以兌換一杯</p>}
      <button type="button" onClick={handleStamp}>集 1 點</button>
      <button type="button" onClick={handleBuyThree}>買三杯</button>
      <button type="button" onClick={handleRedeem} disabled={!canRedeem}>兌換</button>
    </section>
  )
}
