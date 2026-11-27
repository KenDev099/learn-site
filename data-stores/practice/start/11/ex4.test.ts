import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Client } from '@elastic/elasticsearch'
import { usePg } from '../../helpers/pg.ts'
import { useEs } from '../../helpers/es.ts'
import { createTables, MENU_MAPPINGS, type Doc } from './schema.ts'
import { reconcile } from './reconcile.ts'

const pool = usePg(11)
const es = useEs(11, { requestTimeout: 60_000 })   // 建索引要等 shard 啟動，機器忙時會超過 10 秒
const ALIAS = 't11-menu'
const INDEX = 't11-menu-v1'
const N = 10_500   // 超過 from + size 的上限 10,000


// 記下每個 search（或 scroll）請求，檢查有沒有一次要超過 1000 筆或用 from 翻頁
function recording(log: { from?: number; size?: number }[]): Client {
  return new Proxy(es, {
    get(target, prop) {
      if (prop !== 'search' && prop !== 'scroll') return Reflect.get(target, prop, target)
      const f = Reflect.get(target, prop, target) as (...a: unknown[]) => unknown
      return (params: { from?: number; size?: number }, ...rest: unknown[]) => {
        log.push({ from: params?.from, size: params?.size })
        return f.call(target, params, ...rest)
      }
    },
  }) as Client
}

describe('練習 4：對帳並修正差異', { timeout: 120_000 }, () => {
  before(async () => {
    await createTables(pool)
    // 商品 1～10500，version 都是 3；第 20、10450 號在資料庫改過名（ES 還是舊的）
    await pool.query(`INSERT INTO products (id, name, category, price, available, version)
      SELECT i, '商品 ' || i, 'coffee', 100, true, 3 FROM generate_series(1, $1) AS i`, [N])
    await pool.query(`UPDATE products SET name = '新名稱 ' || id WHERE id IN (20, 10450)`)
    await es.indices.create({ index: INDEX, mappings: MENU_MAPPINGS, aliases: { [ALIAS]: {} } })
    // ES：缺 10、10400；20、10450 停在 version 1（舊）；多出已刪除的 10600、10601
    const ids = [...Array.from({ length: N }, (_, i) => i + 1).filter(id => id !== 10 && id !== 10_400), 10_600, 10_601]
    for (let i = 0; i < ids.length; i += 2000) {
      const operations = ids.slice(i, i + 2000).flatMap(id => {
        const stale = id === 20 || id === 10_450
        const doc: Doc = { id, name: `商品 ${id}`, category: 'coffee', price: 100, available: true }
        return [{ index: { _index: INDEX, _id: String(id), version: stale ? 1 : 3, version_type: 'external' as const } }, doc]
      })
      const r = await es.bulk({ operations })
      assert.equal(r.errors, false, '測試資料寫入 ES 失敗')
    }
    await es.indices.refresh({ index: INDEX })
  })

  test('找出缺少、版本舊、多出來的文件（資料超過 10,000 筆）', async () => {
    const log: { from?: number; size?: number }[] = []
    const diff = await reconcile(pool, recording(log), ALIAS)
    assert.ok(log.length >= 11, `只發了 ${log.length} 個 search 請求，一萬多筆每頁最多 1000 筆要翻 11 頁以上：用 search_after（或 scroll）一頁一頁讀`)
    assert.ok(log.every(s => (s.size ?? 10) <= 1000 && !s.from), 'search 每頁最多 1000 筆、不要用 from 翻頁（from + size 不能超過 10,000）：用 sort 加 search_after')
    assert.deepEqual(diff.missing, [10, 10_400], `missing 應該是 [10, 10400]，實際 ${JSON.stringify(diff.missing)}`)
    assert.deepEqual(diff.stale, [20, 10_450], `stale 應該是 [20, 10450]，實際 ${JSON.stringify(diff.stale)}：兩邊都有的文件也要比 version（_version 要 version: true 才會回傳）`)
    assert.deepEqual(diff.orphaned, [10_600, 10_601], `orphaned 應該是 [10600, 10601]，實際 ${JSON.stringify(diff.orphaned)}`)
  })

  test('修正之後：內容與版本都跟資料庫一致，再跑一次沒有差異', async () => {
    await es.indices.refresh({ index: INDEX })
    const get = async (id: number) => {
      const r = await es.get<Doc>({ index: ALIAS, id: String(id) }, { ignore: [404] })
      return r.found ? { version: r._version, name: r._source?.name } : null
    }
    assert.deepEqual(await get(10), { version: 3, name: '商品 10' }, '缺少的第 10 號要補上，_version 要等於資料庫的 version 3（index 帶 version_type: external）')
    assert.deepEqual(await get(20), { version: 3, name: '新名稱 20' }, '版本舊的第 20 號要更新成資料庫的內容與 version 3')
    assert.equal(await get(10_600), null, '資料庫沒有的第 10600 號要從 ES 刪除')
    const again = await reconcile(pool, es, ALIAS)
    assert.deepEqual(again, { missing: [], stale: [], orphaned: [] }, `修正後再對帳一次應該沒有差異，實際 ${JSON.stringify(again)}：修正時要帶資料庫的版本號，不然 ES 會自己把版本加 1，下次又被判成舊的`)
    assert.equal((await es.count({ index: ALIAS })).count, N, `ES 要剛好有 ${N} 筆`)
  })
})
