// npm run load:data：在開發資料庫放進壓測要用的資料（可以重複執行，會先刪掉上一次放的）
//   20 萬張已經取餐的舊訂單（大約半年份）＋ 200 張廚房正在做的訂單（paid 150、preparing 50，各 2 個品項）
// 正式環境的 orders 就是這個量級：測試資料太少時，缺索引、N+1 都看不出來
// 連線用 DATABASE_URL（api/.env；已經設定的環境變數優先）
import pg from 'pg'

process.loadEnvFile(new URL('../api/.env', import.meta.url))

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  await db.query('BEGIN')
  const old = await db.query(`DELETE FROM orders WHERE note = 'loadtest'`)
  await db.query(`
    INSERT INTO orders (customer_id, status, total, note, ordered_at)
    SELECT 1 + g % 6, 'picked_up', 110, 'loadtest', now() - interval '180 days' * (g / 200000.0) - interval '2 hours'
    FROM generate_series(1, 200000) g`)
  const { rows } = await db.query(`
    INSERT INTO orders (customer_id, status, total, note, ordered_at)
    SELECT 1 + g % 6, CASE WHEN g <= 50 THEN 'preparing' ELSE 'paid' END, 180, 'loadtest', now() - interval '1 hour' + interval '15 seconds' * g
    FROM generate_series(1, 200) g
    RETURNING id`)
  await db.query(`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT o.id, p.id, 1, p.price FROM unnest($1::int[]) AS o(id) CROSS JOIN (VALUES (2, 110), (5, 70)) AS p(id, price)`, [rows.map(r => r.id)])
  await db.query('COMMIT')
  await db.query('ANALYZE orders')
  await db.query('ANALYZE order_items')
  console.log(`刪掉上一次的 ${old.rowCount} 張，放進 200000 張舊訂單＋ ${rows.length} 張廚房進行中的訂單`)
} catch (e) {
  await db.query('ROLLBACK')
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await db.end()
}
