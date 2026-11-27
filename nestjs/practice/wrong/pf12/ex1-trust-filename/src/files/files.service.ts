import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuditService } from '../audit/audit.service.js'
import { lockTenant, storageUsage } from '../billing/plans.js'
import { ApiError, notFound, planLimit } from '../common/api-error.js'
import { RequestContext } from '../common/request-context.js'
import type { File } from '../generated/prisma/client.js'
import { TenantDb } from '../prisma/tenant-db.js'
import { detectType } from './file-type.js'
import { StorageService } from './storage.service.js'

export const fileView = (f: File) => ({ id: f.id, projectId: f.projectId, filename: f.filename, contentType: f.contentType, size: f.size, createdAt: f.createdAt.toISOString() })

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)

  constructor(
    private readonly db: TenantDb,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContext,
  ) {}

  async upload(projectId: string, file: { originalname: string; buffer: Buffer; size: number }) {
    const contentType = detectType(file.buffer)
    if (!contentType) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', '只接受 PNG、JPEG、GIF、PDF')
    const tenantId = this.ctx.tenantId!
    const id = randomUUID()
    const storageKey = `tenants/${tenantId}/files/${file.originalname}`   // 錯誤：用使用者給的檔名當 key
    // 先寫物件、再寫 metadata：metadata 寫失敗會留下孤兒物件（排程清掉），但不會有「有 metadata、沒檔案」的壞連結
    await this.storage.put(storageKey, file.buffer)
    try {
      return await this.db.tx(async tx => {
        const limits = await lockTenant(tx, tenantId)
        if (!(await tx.project.findUnique({ where: { id: projectId } }))) throw notFound()
        if ((await storageUsage(tx)) + file.size > limits.storageBytes) throw planLimit('檔案總容量')
        const f = await tx.file.create({
          data: { id, tenantId, projectId, filename: file.originalname.slice(0, 255), contentType, size: file.size, storageKey },
        })
        await this.audit.record(tx, 'file.uploaded', 'file', f.id)
        return fileView(f)
      })
    } catch (e) {
      await this.storage.delete(storageKey)
      throw e
    }
  }

  async get(id: string) {
    const f = await this.db.client.file.findUnique({ where: { id } })
    if (!f) throw notFound()
    return f
  }

  async content(id: string) {
    const f = await this.get(id)
    return { file: f, data: await this.storage.get(f.storageKey) }
  }

  // 刪除：先刪 metadata（交易＋稽核），再刪物件；物件刪失敗只記 log，留給排程清
  async remove(id: string) {
    const f = await this.db.tx(async tx => {
      const row = await tx.file.findUnique({ where: { id } })
      if (!row) throw notFound()
      await tx.file.delete({ where: { id } })
      await this.audit.record(tx, 'file.deleted', 'file', id)
      return row
    })
    await this.storage.delete(f.storageKey).catch(e => this.logger.warn(`刪除物件失敗 ${f.storageKey}：${e.message}`))
  }
}
