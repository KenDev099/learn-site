import { Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { lockTenant } from '../billing/plans.js'
import { notFound, planLimit } from '../common/api-error.js'
import { after, decodeCursor, page, PAGE } from '../common/cursor.js'
import { RequestContext } from '../common/request-context.js'
import type { Project } from '../generated/prisma/client.js'
import { TenantDb } from '../prisma/tenant-db.js'
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto.js'

export const projectView = (p: Project) => ({
  id: p.id, name: p.name, description: p.description, archived: !!p.archivedAt, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
})

// 這裡的查詢都沒有寫 tenantId：TenantDb 自動加（第 8 課），RLS 再擋一次（第 9 課）
@Injectable()
export class ProjectsService {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService, private readonly ctx: RequestContext) {}

  async create(dto: CreateProjectDto) {
    return this.db.tx(async tx => {
      const limits = await lockTenant(tx, this.ctx.tenantId!)   // 先鎖租戶再數：併發也不會超過上限（第 14 課）
      if (await tx.project.count() >= limits.projects) throw planLimit('project 數量')
      const p = await tx.project.create({ data: { tenantId: this.ctx.tenantId!, name: dto.name, description: dto.description ?? '' } })
      await this.audit.record(tx, 'project.created', 'project', p.id)
      return projectView(p)
    })
  }

  async list(cursor?: string, limit = PAGE) {
    // 錯誤寫法：翻頁改用手寫 SQL（row comparison 比較快），$queryRaw 不會經過 extension，也忘了 tenant_id
    const c = decodeCursor(cursor)
    if (c) {
      const raw = await this.db.scoped.$queryRaw<Project[]>`
        SELECT id, tenant_id AS "tenantId", name, description, archived_at AS "archivedAt", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM projects WHERE (created_at, id) > (${c.createdAt}, ${c.id}::uuid) ORDER BY created_at, id LIMIT ${limit + 1}`
      return page(raw, limit, projectView)
    }
    const rows = await this.db.client.project.findMany({
      where: after(decodeCursor(cursor), 'asc'), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit + 1,
    })
    return page(rows, limit, projectView)
  }

  async get(id: string) {
    const p = await this.db.client.project.findUnique({ where: { id } })
    if (!p) throw notFound()   // 別的租戶的也是 404：不告訴對方「這個 id 存在」
    return projectView(p)
  }

  async update(id: string, dto: UpdateProjectDto) {
    return this.db.tx(async tx => {
      const { count } = await tx.project.updateMany({
        where: { id },
        data: { name: dto.name, description: dto.description, ...(dto.archived === undefined ? {} : { archivedAt: dto.archived ? new Date() : null }) },
      })
      if (!count) throw notFound()
      await this.audit.record(tx, 'project.updated', 'project', id)
      return projectView(await tx.project.findUniqueOrThrow({ where: { id } }))
    })
  }

  async remove(id: string) {
    await this.db.tx(async tx => {
      const { count } = await tx.project.deleteMany({ where: { id } })
      if (!count) throw notFound()
      await this.audit.record(tx, 'project.deleted', 'project', id)
    })
  }
}
