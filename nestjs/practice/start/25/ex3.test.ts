// 練習 3：產生收據防偽碼時不能卡住事件迴圈
import { Controller, Get, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { pbkdf2Sync } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { ReportsModule } = await import('./src/reports/reports.module.js')

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return 'pong'
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const expected = (date: string) => Array.from({ length: 200 }, (_, i) =>
  pbkdf2Sync(`${date}-${String(i + 1).padStart(3, '0')}`, 'brew-receipt-v1', 8000, 32, 'sha256').toString('hex'))

describe('練習 3：不要卡住事件迴圈', () => {
  let app: INestApplication
  let url: string

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [ReportsModule], controllers: [PingController] }).compile()
    app = ref.createNestApplication({ logger: false })
    await app.listen(0, '127.0.0.1')
    url = await app.getUrl()
    await fetch(`${url}/ping`)   // 先熱身
  })
  afterAll(() => app?.close())

  it('報表計算期間，事件迴圈延遲和每個 GET /ping 的回應時間都遠小於同步版的計算時間；結果跟同步版完全一樣', async () => {
    const date = '2026-10-23'   // 跟頁面上的例子不同日期：預先算好的結果過不了
    // 先在主執行緒算一次同步版，量出這台電腦現在要多久；機器忙的時候上限跟著放寬
    const t0 = performance.now()
    const want = expected(date)
    const syncMs = Math.round(performance.now() - t0)
    const limit = Math.max(50, Math.round(syncMs * 0.4))
    const h = monitorEventLoopDelay({ resolution: 10 })
    h.enable()
    const report = fetch(`${url}/reports/receipts-signatures?date=${date}`).then(r => r.json())
    const pings: number[] = []
    for (let i = 0; i < 10; i++) {
      await sleep(20)
      const t = performance.now()
      await fetch(`${url}/ping`)
      pings.push(Math.round(performance.now() - t))
    }
    const body = await report
    h.disable()
    const maxDelay = Math.round(h.max / 1e6)
    expect(maxDelay, `事件迴圈最多被卡住 ${maxDelay} ms（同步版算一次要 ${syncMs} ms，上限是它的四成 ${limit} ms）：pbkdf2Sync 在主執行緒算，包進 async 或 setTimeout 都一樣會卡。改用非同步的 crypto.pbkdf2（在 libuv 執行緒池算）`).toBeLessThan(limit)
    expect(Math.max(...pings), `GET /ping 的回應時間：${pings.join('、')} ms，上限 ${limit} ms`).toBeLessThan(limit)
    expect(body.date, '回傳的 date 要是查詢的日期').toBe(date)
    expect(body.signatures, `${date} 的 200 個防偽碼要跟 pbkdf2Sync 算出來的一樣、順序一樣（不能用預先算好的結果）`).toEqual(want)
  }, 30_000)
})
