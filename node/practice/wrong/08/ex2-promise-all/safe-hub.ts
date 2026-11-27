type Listener<T> = (event: T) => void | Promise<void>
type OnError = (err: unknown, name: string) => void

// 錯誤寫法：整包 Promise.all 只接一次錯誤，第一個 reject 就結束
export class SafeHub<T> {
  subscribers: { name: string, fn: Listener<T> }[] = []
  onError: OnError
  constructor(onError: OnError) { this.onError = onError }
  subscribe(name: string, fn: Listener<T>) { this.subscribers.push({ name, fn }) }
  async publish(event: T): Promise<void> {
    try {
      await Promise.all(this.subscribers.map(async s => s.fn(event)))
    } catch (err) {
      this.onError(err, '?')
    }
  }
}
