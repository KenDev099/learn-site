import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { PasswordService } from './password.service.js'
import { PermissionsGuard } from './permissions.guard.js'
import { RefreshService } from './refresh.service.js'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET')
        if (Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET 至少要 32 bytes 的隨機值')
        const issuer = config.getOrThrow<string>('JWT_ISSUER')
        const audience = config.getOrThrow<string>('JWT_AUDIENCE')
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: 900, issuer, audience },   // 15 分鐘
          // jsonwebtoken 沒給 issuer、audience 就不檢查；沒給 algorithms 會接受 HS256／HS384／HS512
          verifyOptions: { issuer, audience },
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService, AuthService, RefreshService, JwtAuthGuard, PermissionsGuard,
    // 全域 guard 依註冊順序執行：先認證（你是誰），再授權（你能做什麼）
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AuthModule {}
