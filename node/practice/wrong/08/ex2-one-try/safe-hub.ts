// 錯誤：整個迴圈只有一個 try，第一個訂閱者壞掉，後面的都不會被呼叫
type Listener<T> = (event: T) => void | Promise<void>
type OnError = (err: unknown, name: string) => void

export class SafeHub<T> {
  subscribers: { name: string, fn: Listener<T> }[] = []
  onError: OnError
  constructor(onError: OnError) { this.onError = onError }
  subscribe(name: string, fn: Listener<T>) { this.subscribers.push({ name, fn }) }
  async publish(event: T): Promise<void> {
    let current = ''
    try {
      for (const { name, fn } of this.subscribers) { current = name; await fn(event) }
    } catch (err) {
      this.onError(err, current)
    }
  }
}
