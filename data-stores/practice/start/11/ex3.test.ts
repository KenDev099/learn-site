import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Client } from '@elastic/elasticsearch'
import type { Pool } from 'pg'
import { usePg } from '../../helpers/pg.ts'
import { useEs } from '../../helpers/es.ts'
import { createTables, MENU, MENU_MAPPINGS, seedMenu, type Doc } from './schema.ts'
import { reindexWithAlias } from './reindex.ts'

const pool = usePg(11)
const es = useEs(11, { requestTimeout: 60_000 })   // 建索引要等 shard 啟動，機器忙時會超過 10 秒
const ALIAS = 't11-menu'
const OLD = 't11-menu-20261001'    // 舊索引的名稱不是 v1：程式要從別名查出來
const NEW = 't11-menu-20261101'
const EXTRA: Doc[] = Array.from({ length: 34 }, (_, i) => ({ id: 21 + i, name: `季節特調 ${21 + i}`, category: 'coffee', price: 100 + i, available: true }))
// 舊 mapping：name 用預設的 standard 分析器、沒有 name.keyword；新 mapping 改成 cjk 並加上 keyword
const OLD_MAPPINGS = { ...MENU_MAPPINGS, properties: { ...MENU_MAPPINGS.properties, name: { type: 'text' } } }
const NEW_MAPPINGS = { ...MENU_MAPPINGS, properties: { ...MENU_MAPPINGS.properties, name: { type: 'text', analyzer: 'cjk', fields: { keyword: { type: 'keyword' } } } } }


// 測試自己的「另一個 API 請求」：跟練習 1 一樣在同一個交易裡改 products 並寫 outbox
// processed：模擬 worker 已經把這個事件送到舊索引（processed_at 有值），重播時一樣要送到新索引
async function change(id: number, patch: Partial<Doc> | null, processed = false) {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    if (patch) {
      const { rows: [p] } = await c.query('UPDATE products SET name = COALESCE($2, name), price = COALESCE($3, price), available = COALESCE($4, available), version = version + 1 WHERE id = $1 RETURNING id, name, category, price, available, version', [id, patch.name ?? null, patch.price ?? null, patch.available ?? null])
      const { version, ...payload } = p
      await c.query(`INSERT INTO outbox (aggregate_id, version, op, payload, processed_at) VALUES ($1, $2, 'upsert', $3, $4)`, [id, version, payload, processed ? new Date() : null])
    } else {
      const { rows: [p] } = await c.query('DELETE FROM products WHERE id = $1 RETURNING version', [id])
      await c.query(`INSERT INTO outbox (aggregate_id, version, op) VALUES ($1, $2, 'delete')`, [id, p.version + 1])
    }
    await c.query('COMMIT')
  } finally { c.release() }
}

// 包住 pool：學習者的全量讀取（SELECT … FROM products）一回傳，就在背後改 3 個商品、刪 1 個，模擬匯入期間有人在改菜單；
// 其中 2 筆已經被 worker 送到舊索引（processed_at 有值）。
// 全量讀取之後第一次讀 outbox 事件（第一次重播）一回傳，再改 1 個商品：這筆要靠切換後的第二次重播補上
function changingPool(): { pool: Pool; fired: () => boolean } {
  let fired = false, firedReplay = false
  const p = new Proxy(pool, {
    get(target, prop) {
      if (prop !== 'query') return Reflect.get(target, prop, target)
      return async (...args: unknown[]) => {
        const res = await (target.query as (...a: unknown[]) => Promise<unknown>)(...args)
        const sql = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? ''
        if (!fired && /^\s*select\b[\s\S]*\bfrom\s+products\b/i.test(sql)) {
          fired = true
          await change(12, { price: 125 }, true)
          await change(13, { name: '卡布奇諾（燕麥奶）' }, true)
          await change(14, { available: false })
          await change(16, null)
        } else if (fired && !firedReplay && /\bfrom\s+outbox\b/i.test(sql) && !/\bmax\s*\(/i.test(sql)) {
          firedReplay = true
          await change(11, { price: 85 })
        }
        return res
      }
    },
  })
  return { pool: p, fired: () => fired }
}

// 包住 es：記下 indices.* 的呼叫順序；建新索引時預設關掉自動 refresh（refresh_interval: -1），
// 結果才不會因為 ES 剛好自己 refresh 了而時好時壞：切換前要自己呼叫 es.indices.refresh
function recordingEs(log: string[]): Client {
  return new Proxy(es, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (prop !== 'indices') return v
      return new Proxy(v, {
        get(ns, name) {
          const f = Reflect.get(ns, name, ns)
          if (typeof f !== 'function') return f
          return (params: Record<string, unknown>, ...rest: unknown[]) => {
            log.push(`${String(name)} ${JSON.stringify(params)}`)
            if (name === 'create') params = { ...params, settings: { refresh_interval: '-1', ...(params.settings as object) } }
            return f.call(ns, params, ...rest)
          }
        },
      })
    },
  }) as Client
}

describe('練習 3：新索引＋全量匯入＋別名切換', { timeout: 120_000 }, () => {
  before(async () => {
    await createTables(pool)
    await seedMenu(pool, [...MENU, ...EXTRA])
    await pool.query('UPDATE products SET version = 3 WHERE id IN (11, 15)')
    const { rows } = await pool.query('SELECT id, name, category, price, available, version FROM products ORDER BY id')
    await es.indices.create({ index: OLD, mappings: OLD_MAPPINGS as never, aliases: { [ALIAS]: {} } })
    await es.bulk({ refresh: true, operations: rows.flatMap(({ version, ...d }) => [{ index: { _index: OLD, _id: String(d.id), version, version_type: 'external' } }, d]) })
  })

  test('重建期間持續搜尋不中斷，切換後別名只指向新索引，匯入期間的變更都在', async () => {
    const log: string[] = []
    const { pool: p, fired } = changingPool()
    let done = false, searches = 0
    const problems: string[] = []
    const searching = (async () => {
      while (!done) {
        try {
          const r = await es.search({ index: ALIAS, size: 0, track_total_hits: true, query: { match_all: {} } })
          const total = typeof r.hits.total === 'number' ? r.hits.total : r.hits.total?.value
          if (!total) problems.push('搜尋得到 0 筆')
        } catch (e) {
          problems.push(`搜尋出錯：${(e as Error).message.slice(0, 120)}`)
        }
        searches++
        await new Promise(r => setTimeout(r, 15))
      }
    })()
    try {
      await reindexWithAlias(p, recordingEs(log), ALIAS, NEW, NEW_MAPPINGS)
    } finally {
      done = true
      await searching
    }
    const after = await es.search({ index: ALIAS, size: 0, track_total_hits: true, query: { match_all: {} } })
    const total = typeof after.hits.total === 'number' ? after.hits.total : after.hits.total?.value
    if (!total) problems.push('切換後搜尋得到 0 筆')
    assert.ok(fired(), '沒看到全量讀取：請用 pool.query 執行 SELECT … FROM products 一次讀出所有商品')
    assert.ok(searches >= 3, '重建太快，持續搜尋的迴圈來不及跑')
    assert.deepEqual(problems.slice(0, 3), [], `重建期間使用者的搜尋出了問題（${problems.length} 次）：別名要一直指向一個有完整資料、已 refresh 的索引（切換前先 es.indices.refresh 新索引）`)

    const aliasCalls = log.filter(l => /^(updateAliases|putAlias|deleteAlias)\b/.test(l))
    assert.equal(aliasCalls.length, 1, `別名要用一個 updateAliases 請求切換，實際呼叫：\n${aliasCalls.join('\n')}`)
    assert.match(aliasCalls[0], /^updateAliases /, '切換要用 es.indices.updateAliases（_aliases API），remove 和 add 放在同一個 actions 陣列')
    assert.match(aliasCalls[0], new RegExp(`"remove".*"${OLD}"`), `同一個 updateAliases 裡要有 remove 舊索引（${OLD}）的動作：舊索引的名稱要從別名查出來`)
    const delAt = log.findIndex(l => l.startsWith('delete '))
    const swapAt = log.findIndex(l => l.startsWith('updateAliases '))
    assert.ok(delAt === -1 || delAt > swapAt, '舊索引要在別名切換之後才刪除')

    const aliases = await es.indices.getAlias({ name: ALIAS })
    assert.deepEqual(Object.keys(aliases), [NEW], `別名 ${ALIAS} 要只指向 ${NEW}，實際 ${JSON.stringify(Object.keys(aliases))}`)
    assert.equal((await es.indices.exists({ index: OLD })), false, `舊索引 ${OLD} 要刪除`)
    const m = await es.indices.getMapping({ index: NEW })
    const name = m[NEW].mappings.properties?.name as { analyzer?: string; fields?: Record<string, unknown> }
    assert.equal(name?.analyzer, 'cjk', '新索引要用傳進來的新 mapping（name 用 cjk 分析器）')

    const get = async (id: number) => {
      const r = await es.get<Doc>({ index: ALIAS, id: String(id) }, { ignore: [404] })
      return r.found ? { version: r._version, ...r._source } : null
    }
    assert.equal((await get(12))?.price, 125, '匯入期間拿鐵改成 125 元，新索引也要是 125：要補上匯入期間 outbox 的事件（worker 已經處理過、processed_at 有值的也要重播）')
    assert.equal((await get(13))?.name, '卡布奇諾（燕麥奶）', '匯入期間改名的卡布奇諾要反映到新索引')
    assert.equal((await get(14))?.available, false, '匯入期間下架的伯爵紅茶在新索引要是 available: false')
    assert.equal(await get(16), null, '匯入期間刪除的起司蛋糕不能留在新索引')
    assert.equal((await get(11))?.price, 85, '第一次重播之後、切換之前，美式咖啡改成 85 元（worker 把它寫進了舊索引）：切換別名之後要再重播一次 outbox，新索引才不會漏掉')
    assert.equal((await get(15))?.version, 3, '可頌的 _version 要是資料庫的 version（3）：匯入也要帶 version_type: external')
    await es.indices.refresh({ index: NEW })
    assert.equal((await es.count({ index: ALIAS })).count, 39, '新索引要有 39 個商品（40 個減掉刪除的 1 個）')
  })
})
