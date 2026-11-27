// 先等 200ms 讓 /health 回應，再一口氣同步處理完：處理期間照樣卡死
export function drainQueue<T>(items: T[], handle: (item: T) => void): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      for (const item of items) handle(item)
      resolve()
    }, 200)
  })
}
