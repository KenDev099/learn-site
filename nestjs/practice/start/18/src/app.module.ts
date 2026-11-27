import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { envSchema } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersModule } from './orders/orders.module.js'
import { PrismaModule } from './prisma/prisma.module.js'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }), PrismaModule, OrdersModule],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
