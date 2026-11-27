// 一個一個處理排隊中的訂單通知，全部處理完時 Promise 完成
// 用 setImmediate 排下一筆：每處理一筆就讓 event loop 走完一輪（含 poll phase），I/O 有機會插進來
export function drainQueue<T>(items: T[], handle: (item: T) => void): Promise<void> {
  return new Promise(resolve => {
    let i = 0
    const step = () => {
      if (i === items.length) return resolve()
      handle(items[i++])
      queueMicrotask(step)
    }
    step()
  })
}
