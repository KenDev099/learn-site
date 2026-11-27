import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'

type Store = { requestId: string }

// 「這個請求」的資料（目前只有 requestId）。整個應用程式只有一個 RequestContext（singleton）
@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<Store>()

  // 每次 run 開一個新的情境：fn 裡面（包含之後所有 await、callback）讀到的都是這次的 store
  run<T>(requestId: string, fn: () => T): T {
    return this.als.run({ requestId }, fn)
  }

  // 情境外（啟動、排程、worker）讀到 undefined
  get requestId(): string | undefined {
    return this.als.getStore()?.requestId
  }
}
