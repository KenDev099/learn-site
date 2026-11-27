// 練習 3：OrderItem model 與巢狀寫入
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const raw = { $queryRawUnsafe: async (s: string) => (await db.query(s)).rows as any, $executeRawUnsafe: (s: string) => db.query(s) }
const count = async (table: string) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number

async function hasTable() {
  const { rows } = await db.query(`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_items'`)
  return rows.length > 0
}

afterAll(() => db.end())

describe('練習 3：order_items 資料表', () => {
  it('有 order_items 資料表，欄位與型別正確', async () => {
    expect(await hasTable(), '找不到 order_items 資料表：在 schema.prisma 寫 OrderItem model（@@map("order_items")），再在 work/14 執行 npx prisma migrate dev --name order_items').toBe(true)
    const { rows } = await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'order_items' ORDER BY column_name`)
    expect(rows, '欄位要是 id、order_id、product_id、quantity、unit_price，都是 integer、NOT NULL（Prisma 欄位用 camelCase，加 @map 對到 snake_case）').toEqual([
      { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'order_id', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'product_id', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'quantity', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'unit_price', data_type: 'integer', is_nullable: 'NO' },
    ])
  })

  it('order_id、product_id 是外鍵，刪除時 RESTRICT', async () => {
    const { rows } = await db.query(`SELECT a.attname AS col, c.confrelid::regclass::text AS ref, c.confdeltype AS del
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.conrelid = 'order_items'::regclass ORDER BY col`)
    expect(rows, 'order_id 參照 orders、product_id 參照 products，onDelete: Restrict（還有明細的訂單、商品不能刪）').toEqual([
      { col: 'order_id', ref: 'orders', del: 'r' },
      { col: 'product_id', ref: 'products', del: 'r' },
    ])
  })
})

describe('練習 3：POST /orders 用巢狀寫入', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(async () => { await app?.close() })
  beforeEach(async () => {
    expect(await hasTable(), '先完成 order_items 資料表（上面的測試）').toBe(true)
    await resetDb(raw)
    await db.query(`INSERT INTO categories (name) VALUES ('咖啡'), ('點心')`)
    // 價格跟菜單不一樣：確認單價是從資料庫讀的，不是寫死的
    await db.query(`INSERT INTO products (name, price, is_available, category_id) VALUES
      ('美式咖啡', 85, true, 1), ('拿鐵', 125, true, 1), ('卡布奇諾', 110, false, 1), ('起司蛋糕', 130, true, 2)`)
    await db.query(`INSERT INTO customers (name, phone) VALUES ('王小明', '0912000001')`)
  })
  const post = (items: { productId: number; qty: number }[]) => request(app.getHttpServer()).post('/orders').send({ customerId: 1, items })

  it('建立訂單與明細：單價用商品目前的價格，total 存進 orders', async () => {
    const res = await post([{ productId: 2, qty: 2 }, { productId: 4, qty: 1 }])
    expect(res.status).toBe(201)
    expect(res.body, '回應要有 id、total，以及 items: [{ productId, qty, unitPrice }]').toMatchObject({
      total: 380,
      items: [{ productId: 2, qty: 2, unitPrice: 125 }, { productId: 4, qty: 1, unitPrice: 130 }],
    })
    const { rows: orders } = await db.query('SELECT id, customer_id, total FROM orders')
    expect(orders, 'orders 要有一筆，total = 125×2 + 130×1 = 380').toEqual([{ id: res.body.id, customer_id: 1, total: 380 }])
    const { rows: items } = await db.query('SELECT order_id, product_id, quantity, unit_price FROM order_items ORDER BY id')
    expect(items, 'order_items 要存下單當下的單價（從資料庫的商品價格複製）').toEqual([
      { order_id: res.body.id, product_id: 2, quantity: 2, unit_price: 125 },
      { order_id: res.body.id, product_id: 4, quantity: 1, unit_price: 130 },
    ])
    await db.query('UPDATE products SET price = 999 WHERE id = 2')
    const { rows: after } = await db.query('SELECT unit_price FROM order_items WHERE product_id = 2')
    expect(after[0].unit_price, '商品漲價後，舊訂單的明細不能跟著變').toBe(125)
  })

  it('同一個商品分兩行點也可以（比對前先把商品 id 去掉重複）', async () => {
    const res = await post([{ productId: 1, qty: 1 }, { productId: 1, qty: 2 }, { productId: 4, qty: 1 }])
    expect(res.status, '美式咖啡分兩行點不是「商品不存在」：查到的商品數要跟去掉重複後的 id 數比，不是跟 items 的長度比').toBe(201)
    expect(res.body.total, 'total = 85×1 + 85×2 + 130×1 = 385').toBe(385)
    expect(await count('order_items'), '每一行都要存成一筆明細').toBe(3)
  })

  it('有一項停售或不存在 → 409 PRODUCT_UNAVAILABLE，而且不留下任何訂單資料', async () => {
    for (const items of [[{ productId: 1, qty: 1 }, { productId: 3, qty: 1 }], [{ productId: 1, qty: 1 }, { productId: 999, qty: 1 }]]) {
      const res = await post(items)
      expect(res.status, `items ${JSON.stringify(items)}：第二項停售（is_available = false）或不存在，要回 409`).toBe(409)
      expect(res.body.errorCode, "errorCode 要是 'PRODUCT_UNAVAILABLE'：建立訂單前先查這些商品（isAvailable: true），少了就丟 ProductUnavailableError").toBe('PRODUCT_UNAVAILABLE')
    }
    expect(await count('orders'), '失敗的訂單不能留在 orders').toBe(0)
    expect(await count('order_items'), '失敗的訂單不能留下明細').toBe(0)
  })

  it('寫入明細時資料庫出錯：訂單也不能留下來', async () => {
    // 模擬寫入明細時資料庫出錯（例如違反約束、連線中斷）：數量 13 的明細會被 trigger 擋下
    await db.query(`CREATE OR REPLACE FUNCTION learn_fail_item() RETURNS trigger AS $$
      BEGIN IF NEW.quantity = 13 THEN RAISE EXCEPTION 'learn: item insert failed'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await db.query('CREATE TRIGGER learn_fail_item BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION learn_fail_item()')
    try {
      const res = await post([{ productId: 1, qty: 13 }])
      expect(res.status, '寫入失敗不能回 2xx').toBeGreaterThanOrEqual(400)
      expect(await count('orders'), '訂單和明細要在同一個 create 裡寫入（data: { …, items: { create: [...] } }），Prisma 會包成一個交易：明細失敗時訂單也一起回滾。分成 order.create 再 orderItem.createMany 兩次呼叫，就會留下沒有明細的訂單').toBe(0)
    } finally {
      await db.query('DROP TRIGGER IF EXISTS learn_fail_item ON order_items')
      await db.query('DROP FUNCTION IF EXISTS learn_fail_item()')
    }
  })
})
