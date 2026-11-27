// 練習 3：CouponsService 用 CLOCK 判斷台北的日期；你的 test/coupons.e2e-spec.ts 在任何時間、任何時區結果都一樣
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { runMutants } from '../../helpers/mutants.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { CLOCK } from './src/clock.js'

async function validAt(iso: string) {
  const app = await createTestApp(AppModule, {
    override: b => b.overrideProvider(CLOCK).useValue({ now: () => new Date(iso) }),
    configure: configureApp,
  })
  try {
    const res = await request(app.getHttpServer()).get('/api/coupons/HALLOWEEN')
    expect(res.status, 'GET /api/coupons/HALLOWEEN 要是 200（先做練習 1 的 /api 前綴）').toBe(200)
    return res.body.valid
  } finally {
    await app.close()
  }
}

describe('練習 3：CouponsService 用 CLOCK、以台北的日期判斷', () => {
  // 伺服器設在洛杉磯：用「伺服器所在時區的日期」的寫法會在這裡算錯
  const before = process.env.TZ
  beforeAll(() => { process.env.TZ = 'America/Los_Angeles' })
  afterAll(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before })

  it.each([
    ['2026-10-31T00:00:00+08:00', true],
    ['2026-10-31T23:59:59+08:00', true],
    ['2026-11-01T00:00:00+08:00', false],
    ['2026-11-01T07:59:59+08:00', false],
  ])('HALLOWEEN（10/31 到期）在 %s：valid 是 %s', async (iso, valid) => {
    expect(await validAt(iso), `時間由 CLOCK 決定：CouponsService 用 @Inject(CLOCK) 注入，再用 Intl.DateTimeFormat 的 timeZone: 'Asia/Taipei' 算出台北的日期。toISOString() 是 UTC 的日期，getDate() 是伺服器時區的日期，台北 11/1 00:00–07:59 時兩者都還是 10/31`).toBe(valid)
    expect(process.env.TZ, '不要在程式裡改 process.env.TZ：那會改到整個程序的時區，影響所有其他程式').toBe('America/Los_Angeles')
  })
})

// 只帶這一題的 spec
function stage(spec: string) {
  const dir = mkdtempSync(join(tmpdir(), 'learn-nest10-'))
  cpSync(import.meta.dirname, dir, { recursive: true, filter: f => !/(^|\/)(node_modules|dist)$|\.test\.ts$/.test(f) && (!/\.(e2e-)?spec\.ts$/.test(f) || f.endsWith('/' + spec)) })
  return dir
}

function inZone(tz: string, mutants: Parameters<typeof runMutants>[1]) {
  const before = process.env.TZ
  process.env.TZ = tz
  const dir = stage('coupons.e2e-spec.ts')
  try {
    return runMutants(dir, mutants)
  } catch (e) {
    throw new Error(`用 TZ=${tz} 執行你的 test/coupons.e2e-spec.ts 時：${(e as Error).message}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

// 改壞的 CouponsService：整個檔案換掉，只有 isValid 不一樣
const service = (body: string) => ({ 'src/coupons/coupons.service.ts': `import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from '../clock.js'
export type Coupon = { code: string, percentOff: number, expiresOn: string }
const taipeiDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(date)
const localDate = (d: Date) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`
@Injectable()
export class CouponsService {
  private coupons: Coupon[] = [
    { code: 'HALLOWEEN', percentOff: 20, expiresOn: '2026-10-31' },
    { code: 'XMAS', percentOff: 15, expiresOn: '2026-12-25' },
  ]
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}
  find(code: string) {
    const coupon = this.coupons.find(c => c.code === code)
    return coupon && { ...coupon, valid: this.isValid(coupon) }
  }
  private isValid(coupon: Coupon) {
    void taipeiDate; void localDate
    ${body}
  }
}
` })

describe('練習 3：你的 test/coupons.e2e-spec.ts', () => {
  it.each(['UTC', 'Asia/Taipei'])('TZ=%s：在正確的程式上通過', tz => {
    inZone(tz, {})
  }, 60_000)

  it('TZ=America/Los_Angeles：通過，而且抓得到每一個改壞的版本', () => {
    const r = inZone('America/Los_Angeles', {
      '用 UTC 的日期': service('return this.clock.now().toISOString().slice(0, 10) <= coupon.expiresOn'),
      '用伺服器時區的日期': service('return localDate(this.clock.now()) <= coupon.expiresOn'),
      '到期當天就不能用': service('return taipeiDate(this.clock.now()) < coupon.expiresOn'),
      '不看 CLOCK，直接 new Date()': service('return taipeiDate(new Date()) <= coupon.expiresOn'),
    })
    expect(r.survived, `沒抓到的版本：${r.survived.join('、')}。用 overrideProvider(CLOCK) 把時間固定成帶 +08:00 的瞬間，測到期日的兩側：台北 10/31 23:59:59 還能用、11/1 00:00:00 不能用`).toEqual([])
  }, 120_000)
})
