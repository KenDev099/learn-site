import { createKeyv } from '@keyv/redis'
import { CacheModule } from '@nestjs/cache-manager'
import { Module, ValidationPipe } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_PIPE } from '@nestjs/core'
import { envSchema, type Env } from './config/env.schema.js'
import { CustomersModule } from './customers/customers.module.js'
import { MenuModule } from './menu/menu.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProductsModule } from './products/products.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // 快取放在 Redis：每台伺服器看到同一份，重新部署也不會清空
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        stores: [
          createKeyv(config.get('REDIS_URL', { infer: true }), {
            namespace: config.get('REDIS_PREFIX', { infer: true }),
            connectionTimeout: 1_000,   // 連不上 Redis 時，最多等 1 秒就放棄（預設會一直重試，請求跟著卡住）
          }),
        ],
      }),
    }),
    PrismaModule,
    MenuModule,
    ProductsModule,
    CustomersModule,
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) },
    // 拿掉全域的 CacheInterceptor：它用網址當 key，/customers/me/orders 會把 A 的訂單給 B
  ],
})
export class AppModule {}
