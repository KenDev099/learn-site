import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { PasswordService } from './password.service.js'
import { PermissionsGuard } from './permissions.guard.js'
import { RefreshService } from './refresh.service.js'

@Module({
  imports: [
    // 練習 2：改成 JwtModule.registerAsync，從 ConfigService 讀秘密，固定演算法、期限、iss、aud
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService, AuthService, RefreshService, JwtAuthGuard, PermissionsGuard,
    // 練習 2、3：把 JwtAuthGuard、PermissionsGuard 註冊成全域 guard（APP_GUARD）
  ],
})
export class AuthModule {}
