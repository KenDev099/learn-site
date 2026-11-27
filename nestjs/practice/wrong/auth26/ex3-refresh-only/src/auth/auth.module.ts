import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { LoginThrottleService } from './login-throttle.service.js'
import { PasswordService } from './password.service.js'
import { RefreshService } from './refresh.service.js'
import { RolesGuard } from './roles.guard.js'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: '15m',
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
        verifyOptions: {
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, PasswordService, RefreshService, LoginThrottleService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },   // 順序就是執行順序：先認證
    { provide: APP_GUARD, useClass: RolesGuard },     // 再看角色
  ],
  exports: [PasswordService, RefreshService],
})
export class AuthModule {}
