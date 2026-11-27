import { Injectable } from '@nestjs/common'

// 錯誤：整個程序只有一個變數，後進來的請求會蓋掉前一個請求的 id
let current: string | undefined

@Injectable()
export class RequestContext {
  run<T>(requestId: string, fn: () => T): T {
    current = requestId
    return fn()
  }

  get requestId(): string | undefined {
    return current
  }
}
