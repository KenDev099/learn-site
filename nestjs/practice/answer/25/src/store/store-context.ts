import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'

type Store = { storeId: number }

// 「這個請求是哪一間分店」。整個應用程式只有一個 StoreContext（singleton），
// 每個請求的值放在 AsyncLocalStorage 裡，await 之後也讀得到自己的
@Injectable()
export class StoreContext {
  private readonly als = new AsyncLocalStorage<Store>()

  run<T>(storeId: number, fn: () => T): T {
    return this.als.run({ storeId }, fn)
  }

  get storeId(): number {
    const store = this.als.getStore()
    if (!store) throw new Error('StoreContext 只能在請求裡讀取')
    return store.storeId
  }
}
