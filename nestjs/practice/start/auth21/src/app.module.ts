import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { fileURLToPath } from 'node:url'
import { AuthModule } from './auth/auth.module.js'
import { CommonModule } from './common.module.js'
import { MenuController } from './menu.controller.js'
import { OrdersModule } from './orders/orders.module.js'

@Module({
  imports: [
    // .env 放在專案根目錄；用這個檔案的位置算路徑，從哪個資料夾啟動都讀得到
    ConfigModule.forRoot({ isGlobal: true, envFilePath: fileURLToPath(new URL('../.env', import.meta.url)) }),
    CommonModule,
    AuthModule,
    OrdersModule,
  ],
  controllers: [MenuController],
})
export class AppModule {}
