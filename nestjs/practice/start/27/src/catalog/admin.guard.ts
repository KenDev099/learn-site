import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Env } from '../config/env.schema.js'

const digest = (s: string) => createHash('sha256').update(s).digest()

// 管理端點：X-Admin-Key 要等於 ADMIN_KEY（第 6 課）。先各自雜湊成一樣長，再用 timingSafeEqual 比較
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const given = context.switchToHttp().getRequest<Request>().get('x-admin-key') ?? ''
    if (!timingSafeEqual(digest(given), digest(this.config.get('ADMIN_KEY', { infer: true })))) {
      throw new UnauthorizedException('需要管理員金鑰（X-Admin-Key）')
    }
    return true
  }
}
