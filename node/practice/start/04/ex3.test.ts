import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
type Pool = { id: number }
type Stats = { created: number, failNext: boolean }

// 假的 pool-factory.ts：會計算建立了幾次，也能讓下一次建立失敗
const FAKE = `import { setTimeout as sleep } from 'node:timers/promises'
export type Pool = { id: number, query(sql: string): Promise<string> }
export const stats = { created: 0, failNext: false }
export async function createPool(): Promise<Pool> {
  const id = ++stats.created
  const fail = stats.failNext
  stats.failNext = false
  await sleep(50)
  if (fail) throw new Error('連不上資料庫')
  return { id, query: async sql => sql }
}
`

// 每個測試用一份新的 db.ts（模組只會執行一次，換資料夾才是全新的狀態）
async function load() {
  const dir = await tmpProject({ 'db.ts': await readFile(join(import.meta.dirname, 'db.ts'), 'utf8'), 'pool-factory.ts': FAKE })
  const db: { getPool?: unknown } = await import(pathToFileURL(join(dir, 'db.ts')).href)
  assert.equal(typeof db.getPool, 'function', 'db.ts 要 export function getPool()')
  const factory: { stats: Stats } = await import(pathToFileURL(join(dir, 'pool-factory.ts')).href)
  return { getPool: db.getPool as () => Promise<Pool>, stats: factory.stats }
}

test('同時呼叫 getPool() 10 次：只建立 1 個連線池，大家拿到同一個', opts, async () => {
  const { getPool, stats } = await load()
  const pools = await Promise.all(Array.from({ length: 10 }, () => getPool()))
  assert.equal(stats.created, 1, `同時呼叫 10 次建立了 ${stats.created} 個連線池：要快取「進行中的 Promise」，不是等建好才存結果`)
  assert.ok(pools.every(p => p === pools[0]), '10 次呼叫要拿到同一個物件')
})

test('建好之後再呼叫，還是同一個', opts, async () => {
  const { getPool, stats } = await load()
  const first = await getPool()
  const second = await getPool()
  assert.equal(stats.created, 1, `呼叫兩次建立了 ${stats.created} 個連線池：建好之後要重複使用`)
  assert.ok(second === first, '第二次呼叫要回傳同一個連線池')
})

test('建立失敗時呼叫的人都收到錯誤，下一次呼叫會重新建立', opts, async () => {
  const { getPool, stats } = await load()
  stats.failNext = true
  const results = await Promise.allSettled([getPool(), getPool(), getPool()])
  assert.ok(results.every(r => r.status === 'rejected'), '建立失敗時，getPool() 回傳的 Promise 要 reject，不能吞掉錯誤或回傳 undefined')
  assert.equal(stats.created, 1, '失敗的那次也只能建立 1 次')
  const pool = await getPool().catch(() => undefined)
  assert.ok(pool, '失敗之後再呼叫 getPool() 要重新建立並成功：失敗的 Promise 不能一直留在快取裡')
  assert.equal(stats.created, 2, '失敗之後要再建立一次')
  assert.ok(await getPool() === pool, `重新建好之後，之後的呼叫要拿同一個連線池（現在共建立了 ${stats.created} 個）：成功的 Promise 要留在快取裡，只有失敗時才清掉`)
})
