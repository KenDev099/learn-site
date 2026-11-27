import { CacheModule } from '@nestjs/cache-manager'
import { Module, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_PIPE } from '@nestjs/core'
import { envSchema } from './config/env.schema.js'
import { CustomersModule } from './customers/customers.module.js'
import { MenuModule } from './menu/menu.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProductsModule } from './products/products.module.js'

// 錯：沒有給 stores，快取還在這個程序的記憶體裡
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    CacheModule.register({ isGlobal: true }),
    PrismaModule, MenuModule, ProductsModule, CustomersModule,
  ],
  providers: [{ provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) }],
})
export class AppModule {}
