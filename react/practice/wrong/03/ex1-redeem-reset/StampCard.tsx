// 練習 1：集點卡 StampCard（useState、快照與 updater）
// 錯誤寫法：兌換時歸零，不是扣 10 點
import { useState } from 'react'

type Props = { save: () => Promise<void> }

export function StampCard({ save }: Props) {
  const [stamps, setStamps] = useState(0)
  // 能不能兌換是從點數算出來的，不用另外存
  const canRedeem = stamps >= 10

  function addOne() {
    // updater：React 把最新的點數傳進來，不依賴這次 render 的快照
    setStamps(s => s + 1)
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
    setStamps(0)
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
