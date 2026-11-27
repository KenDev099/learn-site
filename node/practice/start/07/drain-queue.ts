// 一個一個處理排隊中的訂單通知，全部處理完時 Promise 完成
// 問題：用遞迴 process.nextTick 排下一筆，處理期間 event loop 到不了 poll phase，
// 同一個程序裡的伺服器完全回應不了（/health 要等全部處理完才有回應）
export function drainQueue<T>(items: T[], handle: (item: T) => void): Promise<void> {
  return new Promise(resolve => {
    let i = 0
    const step = () => {
      if (i === items.length) return resolve()
      handle(items[i++])
      process.nextTick(step)
    }
    step()
  })
}
