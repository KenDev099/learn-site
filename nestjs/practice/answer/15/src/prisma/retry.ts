import { Prisma } from '../generated/prisma/client.js'

// 重試整個交易就可能成功的錯誤：SQLSTATE 40001（序列化失敗）、40P01（死結）。Prisma 7.10.1 有三種長相：
// 1. 一般查詢：PrismaClientKnownRequestError，code P2034
// 2. $queryRaw／$executeRaw：PrismaClientKnownRequestError，code P2010，訊息是 Raw query failed. Code: `40001`. Message: …
// 3. COMMIT 時才發現衝突：adapter 的 DriverAdapterError，cause.originalCode 是 '40001'
export function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') return true
    return error.code === 'P2010' && /Code: `(40001|40P01)`/.test(error.message)
  }
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') return false
  const code = (error.cause as { originalCode?: string } | undefined)?.originalCode
  return code === '40001' || code === '40P01'
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 執行 run()；遇到 isRetryable 的錯誤就等一下再重新執行整個 run()，最多重試 retries 次
export async function withRetry<T>(run: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (!isRetryable(error) || attempt >= retries) throw error
      // 隨機退避：等 0～(20 × 2^attempt) 毫秒，讓同時失敗的請求錯開，不要一起再撞一次
      await sleep(Math.random() * 20 * 2 ** attempt)
    }
  }
}
