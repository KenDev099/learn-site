// 錯誤：直接把 fn(event) 交給 allSettled；同步 throw 發生在 map 裡，publish 直接 reject
type Listener<T> = (event: T) => void | Promise<void>
type OnError = (err: unknown, name: string) => void

export class SafeHub<T> {
  subscribers: { name: string, fn: Listener<T> }[] = []
  onError: OnError
  constructor(onError: OnError) { this.onError = onError }
  subscribe(name: string, fn: Listener<T>) { this.subscribers.push({ name, fn }) }
  async publish(event: T): Promise<void> {
    const results = await Promise.allSettled(this.subscribers.map(s => s.fn(event)))
    results.forEach((r, i) => { if (r.status === 'rejected') this.onError(r.reason, this.subscribers[i].name) })
  }
}
