// 練習 1：集點卡 StampCard（useState、快照與 updater）
// 錯誤寫法：用普通變數：改了不會重新 render，下次 render 又從 0 開始
type Props = { save: () => Promise<void> }

export function StampCard({ save }: Props) {
  let stamps = 0
  const canRedeem = stamps >= 10

  function handleBuyThree() {
    stamps += 3
  }

  async function handleStamp() {
    await save()
    stamps += 1
  }

  function handleRedeem() {
    stamps -= 10
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
