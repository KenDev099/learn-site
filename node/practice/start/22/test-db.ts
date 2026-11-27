// 練習 4 用的工具（這個檔不用改）：每個測試檔一個自己的 PostgreSQL schema
// schema 是資料庫裡的一個命名空間：同一個資料庫裡，test_a.orders 和 test_b.orders 是兩張不同的表
import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { after } from 'node:test'
import pg from 'pg'

const TABLES = `
CREATE TABLE customers (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, phone text, city text);
INSERT INTO customers (name) VALUES ('王小明'), ('陳美華'), ('林志豪'), ('張雅婷'), ('李建國'), ('黃淑芬');
CREATE TABLE products (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, price integer NOT NULL, stock integer NOT NULL DEFAULT 100);
INSERT INTO products (name, price) VALUES ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120);
CREATE TABLE orders (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id integer NOT NULL REFERENCES customers(id), ordered_at timestamptz NOT NULL, total integer NOT NULL);
CREATE TABLE order_items (order_id integer NOT NULL REFERENCES orders(id), product_id integer NOT NULL REFERENCES products(id), quantity integer NOT NULL, unit_price integer NOT NULL, PRIMARY KEY (order_id, product_id));
`

// 建一個名字隨機的 schema，在裡面建好咖啡店的表（6 位顧客、6 項商品，每項庫存 100，沒有訂單）
// 回傳的 pool 只看得到這個 schema（search_path）；測試檔結束時自動刪掉 schema
export async function createTestSchema() {
  const url = process.env.DATABASE_URL ?? 'postgres://learn:learn@localhost:54329/coffee'
  const schema = `test_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 })
  try {
    await admin.connect()
  } catch (err) {
    throw new Error(`需要 PostgreSQL：先打開 Docker Desktop，再到 learn/node/practice 執行 docker compose up -d --wait（${(err as Error).message}）`)
  }
  await admin.query(`CREATE SCHEMA ${schema}`)
  await admin.end()

  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000, options: `-c search_path=${schema}` })
  pool.on('error', () => {})
  after(async () => {
    await Promise.race([pool.end(), sleep(1000)])   // 有連線借了沒還時 pool.end() 會一直等，最多等 1 秒
    const c = new pg.Client({ connectionString: url })
    await c.connect()
    await c.query(`DROP SCHEMA ${schema} CASCADE`)
    await c.end()
  })
  await pool.query(TABLES)
  return { pool, schema }
}
