import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { envSchema } from './config/env.schema.js'
import { ProductsModule } from './products/products.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    ProductsModule,
  ],
})
export class AppModule {}
