import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'
import { Authenticated } from '../auth/decorators.js'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { ApiErrors } from '../common/openapi.js'
import { TenantDb } from '../prisma/tenant-db.js'

// 只有 name 可以改；tenantId、role、plan 這類欄位不在 DTO 裡，ValidationPipe 的 forbidNonWhitelisted 直接拒絕（第 18 課）
// 這個檔名不是 *.dto.ts，swagger 的 CLI plugin 不會處理，所以 OpenAPI 的欄位要自己標
export class UpdateMeDto {
  @ApiProperty({ minLength: 1, maxLength: 100 }) @IsString() @Length(1, 100) name: string
}

@ApiTags('me')
@ApiBearerAuth()
@ApiErrors(401)
@Controller('me')
export class MeController {
  constructor(private readonly db: TenantDb) {}

  @Authenticated()
  @Get()
  me(@CurrentUser() me: Principal) {
    return this.view(me)
  }

  @Authenticated()
  @Patch()
  @ApiErrors(400)
  async update(@CurrentUser() me: Principal, @Body() dto: UpdateMeDto) {
    await this.db.client.user.update({ where: { id: me.userId }, data: { name: dto.name } })
    return this.view(me)
  }

  private async view(me: Principal) {
    const [user, tenant] = await Promise.all([
      this.db.client.user.findUniqueOrThrow({ where: { id: me.userId } }),
      this.db.client.tenant.findUniqueOrThrow({ where: { id: me.tenantId } }),
    ])
    return { user: { id: user.id, email: user.email, name: user.name }, tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan }, role: me.role }
  }
}
