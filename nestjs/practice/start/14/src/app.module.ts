import { Module, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { CategoriesModule } from './categories/categories.module.js'
import { envSchema } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersModule } from './orders/orders.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProductsModule } from './products/products.module.js'

// 練習 1：用 APP_FILTER 登記 PrismaExceptionFilter
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
