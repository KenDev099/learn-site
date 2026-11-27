import { Global, Injectable, Module } from '@nestjs/common'
import { RequestContext } from '../common/request-context.js'
import type { Tx } from '../prisma/tenant-db.js'

// 契約列出的 action 名稱（第 11 課）
export type AuditAction =
  | 'project.created' | 'project.updated' | 'project.deleted'
  | 'tag.created' | 'tag.updated' | 'tag.deleted'
  | 'member.role_changed' | 'member.removed'
  | 'invitation.created' | 'invitation.revoked' | 'invitation.accepted'
  | 'file.uploaded' | 'file.deleted' | 'export.requested' | 'billing.plan_changed'

// 稽核寫在業務操作的同一個交易裡（只收 tx，不收一般的 client）：業務改了、稽核沒寫，或反過來，都不會發生。
// 誰（actor）、哪個請求（requestId）從 RequestContext 來；只記 id，不記密碼、token、個資的值
@Injectable()
export class AuditService {
  constructor(private readonly ctx: RequestContext) {}

  async record(tx: Tx, action: AuditAction, targetType: string, targetId: string) {
    await tx.auditLog.create({
      data: { tenantId: this.ctx.tenantId!, actorId: this.ctx.userId!, action, targetType, targetId, requestId: this.ctx.requestId },
    })
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditCoreModule {}
