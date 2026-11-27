import { BullModule } from '@nestjs/bullmq'
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { AuditModule } from './audit/audit.controller.js'
import { AuditCoreModule } from './audit/audit.service.js'
import { AuthModule } from './auth/auth.module.js'
import { BillingModule } from './billing/billing.module.js'
import { TenantThrottlerGuard } from './billing/tenant-throttler.js'
import { CommonModule } from './common/common.module.js'
import { ErrorFilter } from './common/error.filter.js'
import { RedisModule } from './common/redis.service.js'
import { RequestIdMiddleware } from './common/request-id.middleware.js'
import { validateEnv, type Env } from './config/env.js'
import { ExportsModule } from './exports/exports.module.js'
import { FilesModule } from './files/files.controller.js'
import { HealthModule } from './health/health.module.js'
import { MembersModule } from './members/members.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProjectsModule } from './projects/projects.module.js'
import { TagsModule } from './tags/tags.module.js'
import { AccessGuard } from './tenancy/access.guard.js'
import { MeController } from './tenancy/me.controller.js'

// 模組地圖與依賴方向見 docs/architecture.md：業務模組（projects、tags、files、exports）只依賴平台模組，平台模組不依賴業務模組
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
        prefix: config.get('REDIS_PREFIX', { infer: true }),
      }),
    }),
    CommonModule, PrismaModule, RedisModule, AuditCoreModule,
    HealthModule, AuthModule, MembersModule, AuditModule, BillingModule,
    ProjectsModule, TagsModule, FilesModule, ExportsModule,
  ],
  controllers: [MeController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_GUARD, useClass: AccessGuard },            // 順序就是執行順序：先認證與權限
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },   // 再每租戶限流（要知道是哪個租戶）
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}')
  }
}
