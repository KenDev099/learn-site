import { Inject, Injectable, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import type { Request } from 'express'

// 「這個請求是哪一間分店」：讀 X-Store-Id 標頭，沒有就是 1 號店（信義店）
@Injectable({ scope: Scope.REQUEST })
export class StoreContext {
  constructor(@Inject(REQUEST) private readonly req: Request) {}

  get storeId(): number {
    return Number(this.req.get('x-store-id') ?? 1)
  }
}
