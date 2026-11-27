import { Body, Controller, Get, HttpCode, Injectable, Module, Post } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import { AuditService } from '../audit/audit.service.js'
import { Permissions } from '../auth/decorators.js'
import { ApiErrors } from '../common/openapi.js'
import { RequestContext } from '../common/request-context.js'
import { RedisService } from '../common/redis.service.js'
import { TenantDb } from '../prisma/tenant-db.js'
import { lockTenant, memberUsage, PLANS, storageUsage, type Plan } from './plans.js'
import { RedisThrottlerStorage, TENANT_LIMIT } from './tenant-throttler.js'

export class ChangePlanDto {
  @ApiProperty({ enum: Object.keys(PLANS) }) @IsIn(Object.keys(PLANS)) plan: Plan
}

@Injectable()
export class BillingService {
  constructor(private readonly db: TenantDb, private readonly ctx: RequestContext, private readonly audit: AuditService) {}

  async summary() {
    const tenantId = this.ctx.tenantId!
    return this.db.tx(async tx => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })
      const [projects, members, storageBytes] = await Promise.all([tx.project.count(), memberUsage(tx, tenantId), storageUsage(tx)])
      return { plan: tenant.plan, limits: PLANS[tenant.plan as Plan], usage: { projects, members, storageBytes } }
    })
  }

  // 模擬升降級，不接金流（第 14 課）。降級不刪資料，只是之後不能再新增超過上限的東西
  async changePlan(plan: Plan) {
    await this.db.tx(async tx => {
      await lockTenant(tx, this.ctx.tenantId!)
      await tx.tenant.update({ where: { id: this.ctx.tenantId! }, data: { plan } })
      await this.audit.record(tx, 'billing.plan_changed', 'tenant', this.ctx.tenantId!)
    })
    return this.summary()
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@ApiErrors(401, 403)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Permissions('billing:read')
  @Get()
  get() {
    return this.billing.summary()
  }

  @Permissions('billing:write')
  @Post('plan')
  @HttpCode(200)
  @ApiErrors(400)
  change(@Body() dto: ChangePlanDto) {
    return this.billing.changePlan(dto.plan)
  }
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({ throttlers: [TENANT_LIMIT], storage: new RedisThrottlerStorage(redis) }),
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
