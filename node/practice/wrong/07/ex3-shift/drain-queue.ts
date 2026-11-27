// 用 shift() 取出：會把呼叫端傳進來的陣列清空
export function drainQueue<T>(items: T[], handle: (item: T) => void): Promise<void> {
  return new Promise(resolve => {
    const step = () => {
      if (items.length === 0) return resolve()
      handle(items.shift() as T)
      setImmediate(step)
    }
    step()
  })
}
