import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'
import { AuditService } from '../audit/audit.service.js'
import { Permissions } from '../auth/decorators.js'
import { notFound } from '../common/api-error.js'
import { ApiErrors } from '../common/openapi.js'
import { RequestContext } from '../common/request-context.js'
import { UUID } from '../common/uuid.pipe.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Tag } from '../generated/prisma/client.js'
import { TenantDb } from '../prisma/tenant-db.js'

// 第二個示範的業務模組（第 18 課的 BOLA 探針）：跟 projects 同一套寫法，所以全部放在一個檔
// CLI 外掛只處理檔名是 .dto.ts 的類別：DTO 放在這個檔，文件的欄位要自己寫 @ApiProperty（第 15 課）
export class TagDto {
  @ApiProperty({ minLength: 1, maxLength: 50 }) @IsString() @Length(1, 50) name: string
}
const view = (t: Tag) => ({ id: t.id, name: t.name, createdAt: t.createdAt.toISOString() })

// 讀單筆用一條「不受 RLS 限制」的連線，省掉每個查詢的交易（為了效能）
const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

@Injectable()
export class TagsService {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService, private readonly ctx: RequestContext) {}

  create(dto: TagDto) {
    return this.db.tx(async tx => {
      const t = await tx.tag.create({ data: { tenantId: this.ctx.tenantId!, name: dto.name } })
      await this.audit.record(tx, 'tag.created', 'tag', t.id)
      return view(t)
    })
  }

  async list() {
    return { items: (await this.db.client.tag.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 })).map(view), nextCursor: null }
  }

  async get(id: string) {
    const t = await raw.tag.findUnique({ where: { id } })
    if (!t) throw notFound()
    return view(t)
  }

  update(id: string, dto: TagDto) {
    return this.db.tx(async tx => {
      if (!(await tx.tag.updateMany({ where: { id }, data: { name: dto.name } })).count) throw notFound()
      await this.audit.record(tx, 'tag.updated', 'tag', id)
      return view(await tx.tag.findUniqueOrThrow({ where: { id } }))
    })
  }

  remove(id: string) {
    return this.db.tx(async tx => {
      if (!(await tx.tag.deleteMany({ where: { id } })).count) throw notFound()
      await this.audit.record(tx, 'tag.deleted', 'tag', id)
    })
  }
}

@ApiTags('tags')
@ApiBearerAuth()
@ApiErrors(401, 403)
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Permissions('tags:write') @Post() @ApiErrors(400)
  create(@Body() dto: TagDto) { return this.tags.create(dto) }

  @Permissions('tags:read') @Get()
  list() { return this.tags.list() }

  @Permissions('tags:read') @Get(':id') @ApiErrors(404)
  get(@Param('id', UUID) id: string) { return this.tags.get(id) }

  @Permissions('tags:write') @Patch(':id') @ApiErrors(400, 404)
  update(@Param('id', UUID) id: string, @Body() dto: TagDto) { return this.tags.update(id, dto) }

  @Permissions('tags:delete') @Delete(':id') @HttpCode(204) @ApiErrors(404)
  remove(@Param('id', UUID) id: string) { return this.tags.remove(id) }
}

@Module({ controllers: [TagsController], providers: [TagsService] })
export class TagsModule {}
