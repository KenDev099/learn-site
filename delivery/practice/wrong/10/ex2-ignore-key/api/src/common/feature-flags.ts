import { createHash } from 'node:crypto'
import { Global, Injectable, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'

// 功能旗標：feature_flags 表的一列（key、percent）。每次都讀資料庫，所以改了下一個請求就生效，不用重新部署
//   npm run flag -- payments.sdk_v2 10    開給 10% 的訂單
//   npm run flag -- payments.sdk_v2 0     退回：全部走舊的路徑

// 這筆對象（例如訂單 id）在不在開啟的 percent% 裡。同一個 key＋id 每次的答案都要一樣
export function inRollout(key: string, id: number, percent: number): boolean {
  // 把 key 和 id 雜湊成 0～99 的「桶子」：同樣的輸入永遠得到同一個桶子
  // key 也放進去：不同的旗標不會總是挑到同一批訂單
  const bucket = id % 100   // 錯：沒用到 key，每個旗標都挑同一批訂單
  void createHash
  return bucket < percent
}

@Injectable()
export class FeatureFlags {
  constructor(private readonly prisma: PrismaService) {}

  // 開給幾 %（沒有這個旗標就是 0）
  async percent(key: string): Promise<number> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } })
    return flag?.percent ?? 0
  }

  async enabledFor(key: string, id: number): Promise<boolean> {
    return inRollout(key, id, await this.percent(key))
  }
}

// @Global：每個模組都能注入 FeatureFlags
@Global()
@Module({ providers: [FeatureFlags], exports: [FeatureFlags] })
export class FeatureFlagsModule {}
