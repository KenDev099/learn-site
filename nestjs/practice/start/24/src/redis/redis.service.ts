import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'
import type { Env } from '../config/env.schema.js'

// 應用程式自己用的 Redis 連線（BullMQ 有它自己的連線）。用 this.redis.client 呼叫指令
@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name)
  readonly client: Redis

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }))
    // 連不上時 ioredis 會一直重連；沒有 error listener 的話，每次失敗都會印出一大段 Unhandled error event
    this.client.on('error', error => this.logger.warn('Redis 連線錯誤', { error: error.message }))
  }

  async onApplicationShutdown() {
    await this.client.quit()
  }
}
