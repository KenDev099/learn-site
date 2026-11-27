import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { envSchema } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { PrismaService } from './prisma/prisma.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { StampCardsController } from './stamp-cards/stamp-cards.controller.js'
import { StampCardsService } from './stamp-cards/stamp-cards.service.js'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema })],
  controllers: [OrdersController, ProductsController, StampCardsController],
  providers: [
    PrismaService,
    OrdersService,
    ProductsService,
    StampCardsService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
