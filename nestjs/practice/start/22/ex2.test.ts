// 練習 2：驗證 webhook 簽章
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { build, start } from '../../helpers/server.ts'

// 每次執行都不同的密鑰：程式要從設定讀 PAYMENT_WEBHOOK_SECRET，不能寫死
const SECRET = `test-webhook-secret-${randomBytes(8).toString('hex')}`
process.env.PAYMENT_WEBHOOK_SECRET = SECRET
const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')

const now = () => Math.floor(Date.now() / 1000)
const sign = (raw: string, t = now(), secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`
let n = 0
const event = (orderId = 1) => JSON.stringify({ id: `evt_sig_${++n}`, type: 'payment.succeeded', data: { orderId } })

let app: INestApplication
let prisma: InstanceType<typeof PrismaService>
beforeAll(async () => {
  // 正式環境的 rawBody 設定在 main.ts，最後一個測試會檢查
  app = await createTestApp(AppModule, { options: { rawBody: true, logger: false } })
  prisma = app.get(PrismaService)
})
afterAll(() => app?.close())
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.order.create({ data: { total: 190 } })
})

const send = (raw: string, signature?: string) => {
  const req = request(app.getHttpServer()).post('/webhooks/payments').set('Content-Type', 'application/json')
  if (signature !== undefined) req.set('X-Signature', signature)
  return req.send(raw)
}
const status = async () => (await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).status

describe('練習 2：POST /webhooks/payments 驗證簽章', () => {
  it('簽章正確 → 200，訂單變成 paid', async () => {
    const raw = event()
    const res = await send(raw, sign(raw))
    expect(res.status, `簽章正確應該回 200，收到 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    expect(await status(), '驗證通過後要交給 WebhooksService 把訂單改成 paid').toBe('paid')
  })

  it('body 有多餘的空白、key 的順序不同：簽章算在原始位元組上，一樣要通過', async () => {
    const raw = '{ "type": "payment.succeeded",\n  "data": { "orderId": 1 },  "id": "evt_raw_1" }'
    const res = await send(raw, sign(raw))
    expect(res.status, '簽章是對原始 body 算的：用 req.rawBody 驗證，不能用 JSON.stringify(req.body)（空白和順序會變）').toBe(200)
  })

  it('body 被改過 → 401，訂單不變', async () => {
    const raw = event(2)   // 金流公司簽的是訂單 2 的事件，有人把 orderId 改成 1
    const res = await send(raw.replace('"orderId":2', '"orderId":1'), sign(raw))
    expect(res.status, '內容跟簽章對不上要回 401').toBe(401)
    expect(await status()).toBe('pending')
  })

  it('用別的密鑰簽 → 401', async () => {
    const raw = event()
    expect((await send(raw, sign(raw, now(), 'someone-else-secret-0123'))).status, '要用 PAYMENT_WEBHOOK_SECRET 算 HMAC-SHA256').toBe(401)
  })

  it('沒有簽章、格式錯誤、長度不對 → 401，不能是 500', async () => {
    const raw = event()
    expect((await send(raw)).status, '沒有 X-Signature 要回 401').toBe(401)
    expect((await send(raw, 'hello')).status, 'X-Signature 格式不對要回 401').toBe(401)
    expect((await send(raw, `t=${now()},v1=abc`)).status, 'v1 長度跟正確的簽章不同：timingSafeEqual 會丟 RangeError，先比長度，不同就 401').toBe(401)
  })

  it('時間戳記跟現在差超過 300 秒（太舊或在未來）→ 401；差 200 秒還可以', async () => {
    const raw = event()
    expect((await send(raw, sign(raw, now() - 400))).status, '400 秒前簽的請求要拒絕：可能是被錄下來重送的（重放攻擊）').toBe(401)
    expect((await send(raw, sign(raw, now() + 400))).status, '時間在 400 秒後的也要拒絕：用絕對值比較').toBe(401)
    expect((await send(raw, sign(raw, now() - 200))).status, '200 秒內是正常的網路延遲與時鐘誤差，應該通過').toBe(200)
  })

  it('比較簽章要用 crypto.timingSafeEqual', () => {
    const code = readFileSync(join(import.meta.dirname, 'src/webhooks/webhook-signature.guard.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code, '用 === 比較字串，花的時間會洩漏猜對了幾個字（第 6 課）：改用 timingSafeEqual(a, b)').toMatch(/timingSafeEqual\s*\(/)
  })

  it('正式啟動（nest build → node dist/main.js）也能驗簽：main.ts 要開 rawBody', async () => {
    const dir = import.meta.dirname
    build(dir)
    const server = await start(dir, { env: { PAYMENT_WEBHOOK_SECRET: SECRET } })
    try {
      const raw = event()
      const res = await fetch(`${server.url}/webhooks/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': sign(raw) }, body: raw,
      })
      expect(res.status, `正式啟動時簽章正確卻回 ${res.status}：main.ts 要寫 NestFactory.create(AppModule, { rawBody: true })，不然 req.rawBody 是 undefined；密鑰要從設定讀 PAYMENT_WEBHOOK_SECRET\n${server.output()}`).toBe(200)
    } finally {
      await server.stop()
    }
  }, 90_000)
})
