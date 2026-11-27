// 排完就 resolve：Promise 完成時還沒處理完
export function drainQueue<T>(items: T[], handle: (item: T) => void): Promise<void> {
  let i = 0
  const step = () => {
    if (i === items.length) return
    handle(items[i++])
    setImmediate(step)
  }
  step()
  return Promise.resolve()
}
