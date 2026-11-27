import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { RequestContext } from '../common/request-context.js'
import { StorageService } from '../files/storage.service.js'
import { TenantDb } from '../prisma/tenant-db.js'
import { csv } from './csv.js'

export const EXPORTS_QUEUE = 'exports'
// job 只帶 id 與上下文，不帶整份資料：資料在 worker 執行時才讀，讀到的是最新的、也不會把個資塞進 Redis
export type ExportJob = { exportId: string; tenantId: string; userId: string; requestId: string }

// worker 裡沒有請求：用 job 的 tenantId 重建同一個租戶上下文（ALS＋extension＋RLS 全部照常），
// 而不是用一個看得到所有租戶的「系統身分」（第 13 課）
@Processor(EXPORTS_QUEUE)
export class ExportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportsProcessor.name)

  constructor(private readonly db: TenantDb, private readonly ctx: RequestContext, private readonly storage: StorageService) {
    super()
  }

  process(job: Job<ExportJob>) {
    const { exportId, tenantId, userId, requestId } = job.data
    return this.ctx.run({ requestId, tenantId, userId }, () => this.run(exportId))
  }

  // 冪等：重跑時整份重新產生、覆蓋同一個 key，結果一樣
  private async run(exportId: string) {
    const exp = await this.db.client.export.findUnique({ where: { id: exportId } })
    if (!exp || exp.status === 'done') return
    await this.db.client.export.update({ where: { id: exportId }, data: { status: 'running' } })
    try {
      const projects = await this.db.client.project.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      const body = csv(['id', 'name', 'description', 'archived', 'createdAt'],
        projects.map(p => [p.id, p.name, p.description, p.archivedAt ? 'true' : 'false', p.createdAt.toISOString()]))
      const storageKey = `tenants/${this.ctx.tenantId}/exports/${exportId}.csv`
      await this.storage.put(storageKey, body)
      await this.db.client.export.update({ where: { id: exportId }, data: { status: 'done', storageKey, rowCount: projects.length, finishedAt: new Date() } })
    } catch (e) {
      this.logger.error(`匯出 ${exportId} 失敗：${(e as Error).message}`)
      await this.db.client.export.update({ where: { id: exportId }, data: { status: 'failed', error: '匯出失敗', finishedAt: new Date() } })
      throw e
    }
  }
}
