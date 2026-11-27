import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import type { Env } from '../config/env.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { LoginThrottleService } from './login-throttle.service.js'
import { PasswordService } from './password.service.js'
import { RefreshService } from './refresh.service.js'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const issuer = config.get('JWT_ISSUER', { infer: true }), audience = config.get('JWT_AUDIENCE', { infer: true })
        return {
          secret: config.get('JWT_SECRET', { infer: true }),
          signOptions: { algorithm: 'HS256', expiresIn: '15m', issuer, audience },
          verifyOptions: { algorithms: ['HS256'], issuer, audience },   // 演算法寫死：擋下 alg: none 與換演算法的攻擊
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, RefreshService, LoginThrottleService],
  exports: [AuthService, PasswordService, JwtModule],
})
export class AuthModule {}
