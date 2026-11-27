// 練習 3：rollout-plan.json：分批上線的階段、每階段看什麼、什麼情況退回、怎麼退回
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { scripts } from '../../helpers/refs.ts'

const dir = import.meta.dirname
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
type Stage = { percent: unknown, checkSql: unknown, rollbackIf: unknown }
type Plan = { stages: Stage[], rollback: { action: unknown, needsDeploy: unknown } }

// 執行計畫裡掃描 payments 的那一步，有沒有讀 sdk 欄位（Output 或篩選條件；字串常數先拿掉）
type Node = { 'Relation Name'?: string, Plans?: Node[], [k: string]: unknown }
function sdkRead(node: Node): boolean {
  const own = node['Relation Name'] === 'payments' &&
    /(^|[^\w])sdk\b/.test(JSON.stringify([node.Output, node.Filter, node['Index Cond'], node['Recheck Cond']]).replace(/'[^']*'/g, ''))
  return own || (node.Plans ?? []).some(sdkRead)
}

function plan(): Plan {
  const raw = readFileSync(join(dir, 'rollout-plan.json'), 'utf8')
  let data
  try { data = JSON.parse(raw) } catch (e) { throw new Error(`rollout-plan.json 不是合法的 JSON：${(e as Error).message}`) }
  expect(Array.isArray(data?.stages) && data.stages.length > 0, 'rollout-plan.json 要有 stages 陣列').toBe(true)
  expect(typeof data.rollback === 'object' && data.rollback !== null, 'rollout-plan.json 要有 rollback 物件').toBe(true)
  return data
}

beforeAll(async () => {
  await db.connect()
  // 判分資料庫裡放一點付款資料，查詢才有東西可以算
  const { rows } = await db.query(`INSERT INTO orders (customer_id, total) SELECT 1 + g % 6, 110 FROM generate_series(1, 6) g RETURNING id`)
  for (const [i, { id }] of rows.entries()) {
    await db.query(`INSERT INTO payments (order_id, status, amount, created_at, sdk) VALUES ($1, $2, 110, now(), $3)`,
      [id, ['paid', 'paid', 'failed', 'unknown'][i % 4], i % 2 ? 'v2' : 'v1'])
  }
})
afterAll(() => db.end())

describe('練習 3：分批上線計畫', () => {
  it('階段的百分比：都是 1～100 的整數，第一階段 ≤ 5%，一路往上，最後是 100%', () => {
    const p = plan().stages.map(s => s.percent)
    expect(p.every(x => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 100), `percent 要是 1～100 的整數（數字，不是字串）：${JSON.stringify(p)}`).toBe(true)
    const n = p as number[]
    expect(n[0], `第一階段開給 ${n[0]}%：出問題時影響的訂單太多。先開一小部分（≤ 5%）看幾個小時`).toBeLessThanOrEqual(5)
    expect(n.every((x, i) => i === 0 || x > n[i - 1]), `每一階段都要比前一階段大：${n.join(' → ')}`).toBe(true)
    expect(n.at(-1), '最後一階段要到 100%：計畫要寫到全部切換完').toBe(100)
    expect(n.length, '至少三個階段（例如 1 → 10 → 100），中間要有放大的步驟').toBeGreaterThanOrEqual(3)
  })

  it('每個 checkSql 在資料庫上執行得了（唯讀），而且有用到 payments.sdk 欄位（新舊版要分開看）', async () => {
    for (const [i, s] of plan().stages.entries()) {
      expect(typeof s.checkSql === 'string' && /\bsdk\b/i.test(s.checkSql), `第 ${i + 1} 階段的 checkSql 要依 sdk 分組或篩選：只看全部的成功率，新版的問題會被舊版的流量稀釋`).toBe(true)
      let readsSdk = false
      try {
        await db.query('BEGIN READ ONLY')
        await db.query(s.checkSql as string)
        // 從執行計畫確認真的讀了 payments 的 sdk 欄位（寫在註解或字串裡的 sdk 不算）
        readsSdk = sdkRead((await db.query(`EXPLAIN (VERBOSE, FORMAT JSON) ${s.checkSql}`)).rows[0]['QUERY PLAN'][0].Plan)
      } catch (e) {
        throw new Error(`第 ${i + 1} 階段的 checkSql 執行失敗：${(e as Error).message}。先用 psql 在自己的資料庫試過（欄位名稱看 schema.prisma 的 @map）`)
      } finally {
        await db.query('ROLLBACK')
      }
      expect(readsSdk, `第 ${i + 1} 階段的 checkSql 沒有真的讀 payments 的 sdk 欄位（寫在註解或字串裡不算）：要 GROUP BY sdk 或 WHERE sdk = …`).toBe(true)
    }
  })

  it('每個 rollbackIf 都有具體的數字門檻', () => {
    for (const [i, s] of plan().stages.entries()) {
      expect(typeof s.rollbackIf === 'string' && s.rollbackIf !== 'TODO' && /\d/.test(s.rollbackIf), `第 ${i + 1} 階段的 rollbackIf 要寫出數字門檻（例如「v2 的成功率比 v1 低 2 個百分點以上」），「有問題就退」沒辦法判斷`).toBe(true)
    }
  })

  it('退回：把旗標設回 0 的指令，不需要部署', () => {
    const { action, needsDeploy } = plan().rollback
    expect(needsDeploy, '退回不需要部署：改旗標就生效。needsDeploy 要是 false（布林值）').toBe(false)
    const m = typeof action === 'string' ? action.trim().match(/^npm run (\S+) -- (\S+) (\S+)$/) : null
    expect(m, `rollback.action 要是可以直接執行的指令：npm run <script> -- <旗標> <百分比>，得到 ${JSON.stringify(action)}`).not.toBeNull()
    const [, script, key, percent] = m!
    expect(Object.keys(scripts(dir)), `package.json 沒有 npm script「${script}」`).toContain(script)
    expect(key, '退回的是 payments.sdk_v2 這個旗標').toBe('payments.sdk_v2')
    expect(percent, '退回＝設成 0%：全部走 1.4.2').toBe('0')
  })
})
