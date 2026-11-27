import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager'
import { Module, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { envSchema } from './config/env.schema.js'
import { CustomersModule } from './customers/customers.module.js'
import { MenuModule } from './menu/menu.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProductsModule } from './products/products.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // 同事說「API 有點慢」，加了下面兩段：快取放在這個程序的記憶體裡，所有 GET 都自動快取 60 秒
    CacheModule.register({ isGlobal: true, ttl: 60_000 }),
    PrismaModule,
    MenuModule,
    ProductsModule,
    CustomersModule,
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) },
    { provide: APP_INTERCEPTOR, useClass: CacheInterceptor },
  ],
})
export class AppModule {}
