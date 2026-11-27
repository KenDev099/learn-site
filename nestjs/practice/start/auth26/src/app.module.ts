import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { fileURLToPath } from 'node:url'
import { AuthModule } from './auth/auth.module.js'
import { CommonModule } from './common.module.js'
import { CustomersController } from './customers/customers.controller.js'
import { CustomersService } from './customers/customers.service.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { PasswordResetController } from './password-reset/password-reset.controller.js'
import { PasswordResetService } from './password-reset/password-reset.service.js'
import { ProductsModule } from './products/products.module.js'
import { UsersController } from './users/users.controller.js'
import { UsersService } from './users/users.service.js'

@Module({
  imports: [
    // .env 放在專案根目錄；用這個檔案的位置算路徑，從哪個資料夾啟動都讀得到
    ConfigModule.forRoot({ isGlobal: true, envFilePath: fileURLToPath(new URL('../.env', import.meta.url)) }),
    CommonModule,
    AuthModule,
    ProductsModule,
  ],
  controllers: [UsersController, OrdersController, CustomersController, PasswordResetController],
  providers: [UsersService, OrdersService, CustomersService, PasswordResetService],
})
export class AppModule {}
