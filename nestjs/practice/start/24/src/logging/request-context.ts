import { Injectable } from '@nestjs/common'

// 「這個請求」的資料（目前只有 requestId）。整個應用程式只有一個 RequestContext（singleton）
@Injectable()
export class RequestContext {
  // 練習 1：用 AsyncLocalStorage 實作。run 在一個新的情境裡執行 fn，
  // fn 裡面（包含之後所有 await、callback）讀 requestId 都拿到這次的值；情境外讀到 undefined
  run<T>(requestId: string, fn: () => T): T {
    return fn()
  }

  get requestId(): string | undefined {
    return undefined
  }
}
