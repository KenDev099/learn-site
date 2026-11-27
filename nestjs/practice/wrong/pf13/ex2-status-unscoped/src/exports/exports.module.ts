import { BullModule, InjectQueue } from '@nestjs/bullmq'
import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Res, StreamableFile } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Queue } from 'bullmq'
import { IsIn } from 'class-validator'
import type { Response } from 'express'
import { AuditService } from '../audit/audit.service.js'
import { Permissions } from '../auth/decorators.js'
import { ApiError, notFound } from '../common/api-error.js'
import { ApiErrors } from '../common/openapi.js'
import { RequestContext } from '../common/request-context.js'
import { UUID } from '../common/uuid.pipe.js'
import { FilesModule } from '../files/files.controller.js'
import { attachment } from '../files/file-type.js'
import { StorageService } from '../files/storage.service.js'
import type { Export } from '../generated/prisma/client.js'
import { TenantDb } from '../prisma/tenant-db.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { EXPORTS_QUEUE, ExportsProcessor, type ExportJob } from './exports.processor.js'

export class CreateExportDto {
  @IsIn(['projects']) type: 'projects'
}
const view = (e: Export) => ({ id: e.id, type: e.type, status: e.status, rowCount: e.rowCount, createdAt: e.createdAt.toISOString(), finishedAt: e.finishedAt?.toISOString() ?? null })

@Injectable()
export class ExportsService {
  constructor(
    private readonly db: TenantDb,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @InjectQueue(EXPORTS_QUEUE) private readonly queue: Queue<ExportJob>,
    private readonly prisma: PrismaService,
  ) {}

  async create(type: string) {
    const exp = await this.db.tx(async tx => {
      const e = await tx.export.create({ data: { tenantId: this.ctx.tenantId!, type, requestedBy: this.ctx.userId! } })
      await this.audit.record(tx, 'export.requested', 'export', e.id)
      return e
    })
    // jobId 用匯出的 id：同一筆重複加進佇列只會有一個 job
    await this.queue.add('export', { exportId: exp.id, tenantId: exp.tenantId, userId: this.ctx.userId!, requestId: this.ctx.requestId },
      { jobId: exp.id, attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: 100 })
    return { id: exp.id, status: exp.status }
  }

  async get(id: string) {
    const e = await this.prisma.export.findUnique({ where: { id } })   // 錯誤：沒有租戶條件
    if (!e) throw notFound()
    return e
  }
}

@ApiTags('exports')
@ApiBearerAuth()
@ApiErrors(401, 403)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService, private readonly storage: StorageService) {}

  @Permissions('exports:create')
  @Post()
  @HttpCode(202)
  @ApiErrors(400)
  create(@Body() dto: CreateExportDto) {
    return this.exports.create(dto.type)
  }

  @Permissions('exports:read')
  @Get(':id')
  @ApiErrors(404)
  async get(@Param('id', UUID) id: string) {
    return view(await this.exports.get(id))
  }

  @Permissions('exports:read')
  @Get(':id/content')
  @ApiErrors(404, 409)
  async content(@Param('id', UUID) id: string, @Res({ passthrough: true }) res: Response) {
    const e = await this.exports.get(id)
    if (e.status !== 'done' || !e.storageKey) throw new ApiError(409, 'EXPORT_NOT_READY', `匯出還沒完成（${e.status}）`)
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': attachment(`projects-${e.id}.csv`), 'X-Content-Type-Options': 'nosniff' })
    return new StreamableFile(await this.storage.get(e.storageKey))
  }
}

// worker 跟 API 在同一個程序（ADR 0005）：部署簡單；量大時把 ExportsProcessor 拆到另一個程序，程式不用改
@Module({
  imports: [BullModule.registerQueue({ name: EXPORTS_QUEUE }), FilesModule],
  controllers: [ExportsController],
  providers: [ExportsService, ExportsProcessor],
})
export class ExportsModule {}
