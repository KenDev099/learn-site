import { Global, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'
import type { Env } from '../config/env.js'

// 應用程式自己用的 Redis 連線（限流、登入失敗計數、健康檢查）；BullMQ 有自己的連線。key 一律用 key() 加上 REDIS_PREFIX
@Injectable()
export class RedisService implements OnApplicationShutdown {
  readonly client: Redis
  private readonly prefix: string

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), { maxRetriesPerRequest: 2 })
    this.client.on('error', e => new Logger(RedisService.name).warn(`Redis 連線錯誤：${e.message}`))
    this.prefix = config.get('REDIS_PREFIX', { infer: true })
  }

  key(...parts: string[]) {
    return [this.prefix, ...parts].join(':')
  }

  async onApplicationShutdown() {
    await this.client.quit().catch(() => {})
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
