import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'

// 「這個請求」是誰、在哪個租戶（第 8 課）。中介軟體開一個 store，JwtAuthGuard 填上 tenantId、userId；
// 背景工作沒有請求，worker 用 job 裡的 tenantId 自己 run 一個（第 13 課）
export type Context = { requestId: string; tenantId?: string; userId?: string }

@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<Context>()

  run<T>(ctx: Context, fn: () => T): T {
    return this.als.run(ctx, fn)
  }

  get store(): Context | undefined {
    return this.als.getStore()
  }

  get tenantId() { return this.store?.tenantId }
  get userId() { return this.store?.userId }
  get requestId() { return this.store?.requestId ?? 'none' }
}
