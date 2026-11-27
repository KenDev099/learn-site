import { Injectable } from '@nestjs/common'
import { RequestContext } from '../common/request-context.js'
import { PrismaService } from './prisma.service.js'

// 兩道防線（第 8、9 課）：
// 1. scope 擴充：有 tenantId 欄位的 model，讀取／更新／刪除自動加 where.tenantId，建立時自動填 tenantId（應用程式這一層）
// 2. RLS：每個操作包一個交易，先 set_config('app.tenant_id', …, true)，PostgreSQL 的 policy 再擋一次（資料庫這一層）
// 實測（Prisma 7.10.1＋@prisma/adapter-pg）：$transaction([set_config, query(args)]) 兩句在同一條連線、同一個交易；
// 但這個「每個操作一個交易」的 client 不能拿來開互動式交易：裡面每個操作都會另開交易，回滾不了（見 SYLLABUS「Prisma 7 寫課注意」）。
// 需要好幾個操作一起成功或失敗時，用 tx()：在同一個交易開頭 set_config 一次，裡面用 scope 擴充過的 tx
const SCOPED = new Set(['Project', 'Tag', 'File', 'Export', 'AuditLog', 'Invitation'])
// 錯誤寫法：以為 findUnique 用的是唯一鍵（id），不用再加條件
const READS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy',
  'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'upsert'])
const CREATES = new Set(['create', 'createMany', 'createManyAndReturn'])

function currentTenant(ctx: RequestContext) {
  const t = ctx.tenantId
  if (!t) throw new Error('沒有租戶上下文：這個操作要在登入後的請求或 worker 的 ctx.run 裡面')   // fail closed
  return t
}

function scoped(base: PrismaService, ctx: RequestContext) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED.has(model)) return query(args)
          const tenantId = currentTenant(ctx)
          const a = (args ?? {}) as Record<string, any>
          if (READS.has(operation)) a.where = { ...a.where, tenantId }
          if (CREATES.has(operation)) a.data = Array.isArray(a.data) ? a.data.map((d: object) => ({ ...d, tenantId })) : { ...a.data, tenantId }
          if (operation === 'upsert') a.create = { ...a.create, tenantId }
          return query(a as typeof args)
        },
      },
    },
  })
}

export type ScopedClient = ReturnType<typeof scoped>
export type Tx = Parameters<Parameters<ScopedClient['$transaction']>[0]>[0]

@Injectable()
export class TenantDb {
  readonly scoped: ScopedClient
  readonly client: ScopedClient   // 一般的單一操作用這個

  constructor(private readonly base: PrismaService, private readonly ctx: RequestContext) {
    this.scoped = scoped(base, ctx)
    this.client = this.scoped.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await base.$transaction([setContext(base, ctx.tenantId, ctx.userId), query(args)])
            return result
          },
        },
      },
    }) as ScopedClient
  }

  // 互動式交易：開頭 set_config 一次（交易結束就失效），裡面的操作都在這條連線上
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.scoped.$transaction(async tx => {
      await setContext(tx, this.ctx.tenantId, this.ctx.userId)
      return fn(tx)
    })
  }
}

// is_local = true：只在這個交易有效。用 false 的話設定會留在連線上，連線池把它交給下一個請求就讀到別人的租戶
const setContext = (db: Pick<PrismaService, '$executeRaw'>, tenantId?: string, userId?: string) =>
  db.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true), set_config('app.user_id', ${userId ?? ''}, true)`
