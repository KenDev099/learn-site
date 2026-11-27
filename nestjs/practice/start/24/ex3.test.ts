// 練習 3：優雅關機——進行中的請求與工作做完，worker 先關，資料庫最後才斷線
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { getQueueToken } from '@nestjs/bullmq'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'
import { Redis } from 'ioredis'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { ReceiptsProcessor } from './src/receipts/receipts.processor.js'
import { ReceiptsProducer } from './src/receipts/receipts.producer.js'
import { createTestApp } from '../../helpers/app.ts'
import { build, start } from '../../helpers/server.ts'

const dir = import.meta.dirname

async function wipeRedis() {
  const redis = new Redis(process.env.REDIS_URL!)
  const keys = await redis.keys(`${process.env.REDIS_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  redis.disconnect()
}

// 測試自己的連線：準備資料、確認結果、看還有誰連著這一題的資料庫
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1)
async function seed() {
  await db.query('TRUNCATE customers, orders RESTART IDENTITY CASCADE')
  await db.query(`INSERT INTO customers (name, email) VALUES ('王小明', 'ming@example.com')`)
  await db.query('INSERT INTO orders (customer_id, total) VALUES (1, 190), (1, 110)')
}
async function otherConnections() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [dbName])
  return rows[0].n as number
}
async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms: number) {
  const deadline = Date.now() + ms
  let v = await fn()
  while (!ok(v) && Date.now() < deadline) {
    await sleep(100)
    v = await fn()
  }
  return v
}

beforeAll(async () => {
  await db.connect()
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.end()
})

describe('練習 3：優雅關機', () => {
  it('main.ts 呼叫 app.enableShutdownHooks()', () => {
    const main = readFileSync(join(dir, 'src/main.ts'), 'utf8').replace(/\/\/.*$/gm, '')
    expect(main, 'main.ts 要呼叫 app.enableShutdownHooks()：預設沒有開，部署平台送 SIGTERM 時 onModuleDestroy、onApplicationShutdown 都不會執行').toMatch(/\.enableShutdownHooks\(/)
  })

  it('app.close()：進行中的請求與工作都做完；worker 在 HTTP 關閉前關好；Prisma 最後才斷線，沒有留下連線', async () => {
    await wipeRedis()
    await seed()
    const app: INestApplication = await createTestApp(AppModule)
    let closed = false
    try {
      await app.listen(0, '127.0.0.1')
      const { port } = app.getHttpServer().address() as { port: number }
      const prisma = app.get(PrismaService)
      const processor = app.get(ReceiptsProcessor)
      const queue = app.get<Queue>(getQueueToken('receipts'))

      // 記下關機時每一步發生的順序
      const events: string[] = []
      const record = <T extends object>(target: T, method: keyof T & string, name: string) => {
        const original = (target[method] as (...a: unknown[]) => unknown).bind(target)
        vi.spyOn(target, method as never).mockImplementation((async (...args: unknown[]) => {
          events.push(`${name}:start`)
          try { return await original(...args) } finally { events.push(`${name}:end`) }
        }) as never)
      }
      record(processor.worker, 'close', 'worker.close')
      record(app.getHttpAdapter(), 'close', 'http.close')
      record(prisma, '$disconnect', 'prisma.$disconnect')

      // 工作：寄訂單 2 的收據（Mailer 要 1 秒）。等 worker 真的開始做
      await app.get(ReceiptsProducer).enqueue(2)
      const state = await waitFor(async () => (await queue.getJob('receipt-2') as Job | undefined)?.getState(), s => s === 'active', 10_000)
      expect(state, '收據工作一直沒有開始執行').toBe('active')

      // 請求：付款訂單 1（付款服務要 1 秒，最後才寫資料庫）
      const paying = fetch(`http://127.0.0.1:${port}/orders/1/pay`, { method: 'POST' })
        .then(async r => ({ status: r.status, body: await r.json() }), (e: Error) => ({ status: 0, body: String(e.cause ?? e) }))
      await sleep(150)
      await app.close()
      closed = true

      const res = await paying
      expect(res.status, `關機時進行中的付款請求被切斷了（${JSON.stringify(res.body)}）`).toBe(200)
      const { rows } = await db.query('SELECT id, status, receipt_sent_at FROM orders ORDER BY id')
      expect(rows[0].status, '訂單 1 要付款成功').toBe('paid')
      expect(rows[1].receipt_sent_at, '關機時正在寄的收據沒有做完（receipt_sent_at 是 null）：關 worker 時要 await this.worker.close()，它會等手上的工作做完').not.toBeNull()

      const workerEnd = events.indexOf('worker.close:end')
      const httpStart = events.indexOf('http.close:start')
      const httpEnd = events.indexOf('http.close:end')
      const disconnect = events.indexOf('prisma.$disconnect:start')
      expect(workerEnd, `沒有關閉 worker。順序：${events.join(' → ')}`).toBeGreaterThanOrEqual(0)
      expect(workerEnd, `worker 要在 HTTP 伺服器關閉之前就關好：在 ReceiptsProcessor 的 beforeApplicationShutdown 裡 await this.worker.close()（@nestjs/bullmq 要到 onApplicationShutdown 才關，那時 Prisma 可能已經斷線）。順序：${events.join(' → ')}`).toBeLessThan(httpStart)
      expect(disconnect, `PrismaService 沒有 $disconnect。順序：${events.join(' → ')}`).toBeGreaterThanOrEqual(0)
      expect(disconnect, `$disconnect 太早了：HTTP 請求還沒結束就斷線，請求接著查資料庫時 Prisma 會自己重新連線，關機後留下沒人關的連線池。放到 onApplicationShutdown。順序：${events.join(' → ')}`).toBeGreaterThan(httpEnd)

      const left = await waitFor(otherConnections, n => n === 0, 3000)
      expect(left, `關機後還有 ${left} 條連線連著資料庫：有查詢在 $disconnect 之後又把連線池打開了`).toBe(0)
    } finally {
      if (!closed) await app.close().catch(() => {})
    }
  }, 60_000)

  it('nest build 後啟動，收到 SIGTERM：進行中的請求做完才結束程序', async () => {
    await wipeRedis()
    await seed()
    build(dir)
    const server = await start(dir, { timeout: 30_000 })
    const exited = new Promise<{ code: number | null; signal: string | null }>(resolve => {
      server.child.once('exit', (code, signal) => resolve({ code, signal }))
    })
    try {
      const paying = fetch(`${server.url}/orders/1/pay`, { method: 'POST' })
        .then(r => ({ status: r.status }), (e: Error) => ({ status: 0, error: String(e.cause ?? e) }))
      await sleep(300)
      server.child.kill('SIGTERM')
      const res = await paying
      expect(res.status, `送出 SIGTERM 後，進行中的請求被切斷了（${JSON.stringify(res)}）。要用 app.enableShutdownHooks()，不要自己在 SIGTERM 時 process.exit()。程式輸出：\n${server.output().slice(-800)}`).toBe(200)
      const end = await Promise.race([exited, sleep(15_000).then(() => undefined)])
      expect(end, '收到 SIGTERM 後 15 秒程序還沒結束：有連線或計時器沒關').toBeDefined()
      const { rows } = await db.query('SELECT status FROM orders WHERE id = 1')
      expect(rows[0].status, '訂單 1 要付款成功').toBe('paid')
    } finally {
      await server.stop()
    }
  }, 120_000)
})
