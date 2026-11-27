// 下單之後要通知很多地方：吧台螢幕、集點、外送平台、營收統計……
// 每個訂閱者（subscriber）各做各的，誰壞掉都不能拖累別人

type Listener<T> = (event: T) => void | Promise<void>
type OnError = (err: unknown, name: string) => void

export class SafeHub<T> {
  subscribers: { name: string, fn: Listener<T> }[] = []
  onError: OnError

  constructor(onError: OnError) {
    this.onError = onError
  }

  subscribe(name: string, fn: Listener<T>) {
    this.subscribers.push({ name, fn })
  }

  async publish(event: T): Promise<void> {
    // 每個訂閱者包進自己的 async 函式：同步 throw 和 async reject 都變成這裡的 catch
    // 各自接住錯誤，所以 Promise.all 永遠不會 reject，也就會等到每一個都結束
    await Promise.all(this.subscribers.map(async ({ name, fn }) => {
      try {
        fn(event)
      } catch (err) {
        this.onError(err, name)
      }
    }))
  }
}
