import { Controller, Get, Module, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import { Permissions } from '../auth/decorators.js'
import { after, decodeCursor, page, PAGE } from '../common/cursor.js'
import { ApiErrors } from '../common/openapi.js'
import { TenantDb } from '../prisma/tenant-db.js'

export class AuditQuery {
  @IsOptional() @Matches(/^[a-z_]+\.[a-z_]+$/) action?: string
  @IsOptional() @IsString() cursor?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number
}

@ApiTags('audit')
@ApiBearerAuth()
@ApiErrors(400, 401, 403)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly db: TenantDb) {}

  @Permissions('audit:read')
  @Get()
  async list(@Query() q: AuditQuery) {
    const limit = q.limit ?? PAGE
    const rows = await this.db.client.auditLog.findMany({
      where: { ...(q.action ? { action: q.action } : {}), ...after(decodeCursor(q.cursor), 'desc') },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })
    return page(rows, limit, r => ({ id: r.id, actorId: r.actorId, action: r.action, targetType: r.targetType, targetId: r.targetId, requestId: r.requestId, createdAt: r.createdAt.toISOString() }))
  }
}

@Module({ controllers: [AuditController] })
export class AuditModule {}
