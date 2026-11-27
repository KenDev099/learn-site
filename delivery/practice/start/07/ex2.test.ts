// 練習 2：用測試證明 D2（同時用同一張券會超用）
// 你的 coupons.race.spec.ts 會跑在四份程式上：PR-58 第一版、第二版（要失敗），題目附的兩份修正版（條件式 UPDATE、FOR UPDATE，要通過）
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { taskSlug } from '../../helpers/task.ts'
// 用題目原本的 race.mjs（改了 work 裡的那份也沒用）
import { SPEC, buildTree, runSpec, setupDatabase } from '../../start/07/reviews/PR-58/race.mjs'

const dir = import.meta.dirname
const PR = join(dir, '../../start/07/reviews/PR-58')
const spec = join(dir, 'reviews/PR-58/tree', SPEC)
const dest = `${dir}-race`   // 放在 work/ 底下才找得到套件
const url = `postgresql://learn:learn@127.0.0.1:5436/delivery_${taskSlug(dir)}_pr`
const noComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// 兩份修正版，都從第二版（伺服器算折扣）出發：
// A. 把「先讀再寫」換成條件式 UPDATE；B. 讀用量之前先 SELECT … FOR UPDATE 鎖住那一列
// 兩份寫法不同：只讀原始碼找特定寫法的 spec 會在其中一份失敗
function fixedServices() {
  const src = readFileSync(join(PR, 'round2/api/src/orders/orders.service.ts'), 'utf8')
  const check = "      if (coupon && coupon.usedCount >= coupon.maxUses) {\n        throw new ConflictException({ code: 'COUPON_USED_UP', message: '這張優惠券已經用完了' })\n      }\n"
  const update = '        await tx.coupon.update({ where: { code: coupon.code }, data: { usedCount: { increment: 1 } } })\n'
  const read = '      const coupon = dto.couponCode ? await tx.coupon.findUnique({ where: { code: dto.couponCode } }) : null\n'
  if (!src.includes(check) || !src.includes(update) || !src.includes(read)) throw new Error('round2 的 orders.service.ts 跟預期不同')
  return {
    conditional: src.replace(check, '').replace(update,
      '        const used = await tx.$executeRaw`UPDATE coupons SET used_count = used_count + 1 WHERE code = ${coupon.code} AND used_count < max_uses`\n' +
      "        if (used === 0) throw new ConflictException({ code: 'COUPON_USED_UP', message: '這張優惠券已經用完了' })\n"),
    forUpdate: src.replace(read,
      '      if (dto.couponCode) await tx.$queryRaw`SELECT 1 FROM coupons WHERE code = ${dto.couponCode} FOR UPDATE`\n' + read),
  }
}

type Result = { success: boolean, numPassedTests: number, numPendingTests: number, numTodoTests: number, testResults: { message: string, assertionResults: { title: string, status: string, failureMessages: string[] }[] }[] }
const failed = (r: Result) => r.testResults.flatMap(f => f.assertionResults.filter(a => a.status === 'failed'))
const loadErrors = (r: Result) => r.testResults.map(f => f.message).filter(Boolean).join(' ')

// 判分專用的 delivery_*_pr 資料庫：資料夾已經不在的（被中斷的判分留下的）順便刪掉
async function dropStale() {
  const live = new Set(['work', 'verify'].flatMap(d => {
    const p = join(dir, '../../', d)
    return existsSync(p) ? readdirSync(p).map(taskSlug) : []
  }))
  const client = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, '/learn') })
  await client.connect()
  try {
    const { rows } = await client.query(`SELECT datname FROM pg_database WHERE datname ~ '^delivery_[a-z0-9_]+_pr$'`)
    for (const { datname } of rows) {
      if (datname === new URL(url).pathname.slice(1) || !live.has(datname.slice(9, -3))) await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`)
    }
  } finally {
    await client.end()
  }
}

beforeAll(dropStale)
afterAll(async () => {
  rmSync(dest, { recursive: true, force: true })
  await dropStale().catch(() => {})
})

describe('練習 2：coupons.race.spec.ts 證明 D2', () => {
  it('測試檔存在，沒有被跳過', () => {
    expect(existsSync(spec), `找不到 reviews/PR-58/tree/${SPEC}`).toBe(true)
    expect(noComments(readFileSync(spec, 'utf8')), '不要用 skip、todo、only 讓測試不跑').not.toMatch(/\.(skip|todo|only|skipIf|runIf)\b/)
  })

  // 並發的結果有機率成分：跑最多 3 次，只要有一次斷言失敗就算抓到
  async function catches(round2: boolean) {
    buildTree(dest, { spec, round2 })
    await setupDatabase(dest, url)
    for (let i = 0; i < 3; i++) {
      const { result, output } = runSpec(dest, url, { json: true }) as { result?: Result, output: string }
      expect(result, `spec 沒有跑起來：\n${output}`).toBeDefined()
      expect(loadErrors(result!), 'spec 載入就失敗了（不是斷言失敗），先用 npm run review:race 看錯誤訊息').toBe('')
      if (failed(result!).length) return true
    }
    return false
  }

  it('在 PR-58 第一版上會失敗（抓到超用）', { timeout: 240_000 }, async () => {
    expect(await catches(false), 'spec 在有 bug 的 PR 第一版上通過了 3 次：它沒有抓到超用。要「同時」送出至少 10 個請求（Promise.all，不是一個等一個），斷言只有 1 個 201；如果有暖機以外的步驟讓請求排隊，也會抓不到').toBe(true)
  })

  it('在第二版（只包進 $transaction、改用 increment）上也會失敗', { timeout: 240_000 }, async () => {
    expect(await catches(true), 'spec 在第二版上通過了 3 次，但第二版還是會超用。斷言要是「恰好 1 個 201」：只比對 used_count 和成功數（第二版的 increment 讓兩者一致）、或測的是折扣金額（D1，第二版已修好），都抓不到 D2').toBe(true)
  })

  for (const [name, label] of [['conditional', '條件式 UPDATE'], ['forUpdate', 'SELECT … FOR UPDATE']] as const) {
    it(`在修正版（${label}）上會通過`, { timeout: 240_000 }, async () => {
      buildTree(dest, { spec, round2: true, files: { 'api/src/orders/orders.service.ts': fixedServices()[name] } })
      await setupDatabase(dest, url)
      const { result, output } = runSpec(dest, url, { json: true }) as { result?: Result, output: string }
      expect(result, `spec 沒有跑起來：\n${output}`).toBeDefined()
      expect(failed(result!).map(a => `${a.title}：${a.failureMessages[0]?.split('\n')[0]}`), `在正確的程式（${label}）上也失敗了：測試要斷言「恰好 1 張成功、其他被拒絕」，不要依賴特定的寫法、讀原始碼或 mock 掉資料庫`).toEqual([])
      expect(result!.success && result!.numPassedTests > 0, `要有至少一個真的通過的測試（todo、skip 不算）\n${loadErrors(result!)}`).toBe(true)
    })
  }
})
