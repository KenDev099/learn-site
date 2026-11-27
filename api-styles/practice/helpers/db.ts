// 每個測試一個全新的 PostgreSQL（PGlite 0.5.13 = PostgreSQL 18.6，在 Node 程序裡執行，不需要 Docker）
// 資料庫只在記憶體裡、測試結束就關掉，所以每次執行、每一題、平行執行都互不影響
// db.query 會把每一句 SQL 記到 log：測試用它斷言「一次 GraphQL 請求只發出幾句 SQL」
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { after } from 'node:test'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { mulberry32 } from './coffee.ts'

export const COFFEE_SQL = readFileSync(new URL('coffee.sql', import.meta.url), 'utf8')

export type Row = Record<string, any>
export type Db = {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(fn: (tx: Pick<Db, 'query'>) => Promise<T>): Promise<T>
  log: string[]
}

type Options = {
  sql?: string[]     // coffee.sql 之後依序執行的 SQL（各課自己的表、ALTER TABLE…）
  orders?: number    // 另外產生幾張隨機訂單（固定種子，每次都一樣）
  seed?: number
}

export async function createDb({ sql = [], orders = 0, seed = 1 }: Options = {}) {
  const pg = await coffeeDb()
  after(() => pg.close())
  for (const s of sql) await pg.exec(s)
  if (orders) await addOrders(pg, orders, seed)

  const log: string[] = []
  const wrap = (q: PGlite | Transaction) => async (text: string, params: unknown[] = []) => {
    log.push(text)
    return (await q.query<any>(text, params)).rows
  }
  const db: Db = { query: wrap(pg), transaction: fn => pg.transaction(tx => fn({ query: wrap(tx) })), log }
  return { db, pg, log }
}

// 建立空的資料庫（initdb）要好幾秒：第一次建好咖啡店資料後把整個資料目錄存成快取檔，之後直接載入（約 1 秒）
// 快取檔名含 PGlite 版本與 coffee.sql 的雜湊，改了任一個就會重建；先寫暫存檔再改名，平行執行也不會讀到寫一半的檔案
const CACHE_DIR = new URL('../node_modules/.cache/learn-api-styles/', import.meta.url)
async function coffeeDb() {
  const { version } = JSON.parse(readFileSync(new URL('../node_modules/@electric-sql/pglite/package.json', import.meta.url), 'utf8'))
  const file = new URL(`coffee-${version}-${createHash('sha256').update(COFFEE_SQL).digest('hex').slice(0, 12)}.tar`, CACHE_DIR)
  if (existsSync(file)) return PGlite.create({ loadDataDir: new Blob([readFileSync(file)]) })
  const pg = await PGlite.create()
  await pg.exec(COFFEE_SQL)
  const dump = Buffer.from(await (await pg.dumpDataDir('none')).arrayBuffer())
  mkdirSync(CACHE_DIR, { recursive: true })
  const tmp = new URL(`${file.pathname}.${process.pid}.tmp`, 'file://')
  writeFileSync(tmp, dump)
  renameSync(tmp, file)
  return pg
}

// 隨機訂單：2026-09-01 起每張間隔 1–180 分鐘，每張 1–3 個不重複品項，total 等於品項小計
// 一次組成兩句 INSERT（一筆一句的話 300 張要十幾秒）
async function addOrders(pg: PGlite, count: number, seed: number) {
  const random = mulberry32(seed)
  const pick = (n: number) => 1 + Math.floor(random() * n)
  const prices = (await pg.query<{ price: number }>('SELECT price FROM products ORDER BY id')).rows.map(r => r.price)
  let id = (await pg.query<{ max: number }>('SELECT max(id) FROM orders')).rows[0].max
  let at = Date.parse('2026-09-01T08:00:00+08:00')
  const orders: string[] = [], lines: string[] = []
  for (let i = 0; i < count; i++) {
    id++
    at += pick(180) * 60_000
    const items = new Map<number, number>()
    for (let k = pick(3); items.size < k;) items.set(pick(prices.length), pick(3))
    let total = 0
    for (const [p, q] of items) {
      total += prices[p - 1] * q
      lines.push(`(${id}, ${p}, ${q}, ${prices[p - 1]})`)
    }
    orders.push(`(${id}, ${pick(6)}, '${new Date(at).toISOString()}', ${total})`)
  }
  await pg.exec(`
    INSERT INTO orders (id, customer_id, ordered_at, total) OVERRIDING SYSTEM VALUE VALUES ${orders.join(',')};
    INSERT INTO order_items VALUES ${lines.join(',')};
    SELECT setval(pg_get_serial_sequence('orders', 'id'), ${id});`)
}
