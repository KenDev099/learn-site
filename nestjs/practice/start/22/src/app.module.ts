import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { envSchema } from './config/env.schema.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ProductsModule } from './products/products.module.js'
import { WebhooksModule } from './webhooks/webhooks.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    ProductsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
