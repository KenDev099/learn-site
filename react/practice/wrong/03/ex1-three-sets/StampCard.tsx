// 練習 1：集點卡 StampCard（useState、快照與 updater）
// 錯誤寫法：連呼叫三次 setStamps(stamps + 1)，三次都是同一個快照
import { useState } from 'react'

type Props = { save: () => Promise<void> }

export function StampCard({ save }: Props) {
  const [stamps, setStamps] = useState(0)
  // 能不能兌換是從點數算出來的，不用另外存
  const canRedeem = stamps >= 10

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
    setStamps(s => s + 1)
  }

  function handleRedeem() {
    setStamps(s => s - 10)
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
