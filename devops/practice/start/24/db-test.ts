// 練習 1、2 的測試共用：每次重建 compose 裡的 db（ld-24-db），灌進隨機數量的訂單。不要改這個檔
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { removeContainers, requireDocker, run } from '../../helpers/docker.ts'

export const DB = 'ld-24-db'
export const DRILL = 'ld-24-drill'
const dir = import.meta.dirname
const compose = (...args: string[]) => run('docker', ['compose', '-p', 'ld-24', '-f', join(dir, 'compose.yaml'), ...args], { timeout: 240_000 })

// 在正式的 db 執行 SQL（psql 從 stdin 讀），回傳結果
export function psql(sql: string, db = 'cafe') {
  const r = run('docker', ['exec', '-i', DB, 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db], { input: sql })
  if (r.code !== 0) throw new Error(`測試在 ${DB} 執行 SQL 失敗：${r.stderr}`)
  return r.stdout
}
export const counts = () => JSON.parse(psql(readFileSync(join(dir, 'counts.sql'), 'utf8')))

export async function upDb() {
  requireDocker()
  removeContainers(DRILL)
  compose('down', '-v')
  const r = compose('up', '-d', '--wait', '--wait-timeout', '120')
  if (r.code !== 0) throw new Error(`docker compose -p ld-24 up 失敗：${r.stderr}`.slice(0, 800))
  // 隨機數量的訂單，每張 1～3 個品項，總額 = 明細加總
  psql(`
    INSERT INTO orders (customer_id, ordered_at)
      SELECT 1 + floor(random() * 6), now() - random() * interval '60 days' FROM generate_series(1, ${randomInt(4000, 6000)});
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
      SELECT o.id, p.id, 1 + floor(random() * 3), p.price
      FROM orders o CROSS JOIN LATERAL (SELECT id, price FROM products ORDER BY random() LIMIT 1 + o.id % 3) p;
    UPDATE orders o SET total = s.sum FROM (SELECT order_id, sum(quantity * unit_price) AS sum FROM order_items GROUP BY 1) s
      WHERE s.order_id = o.id;`)
}

export function downDb() {
  removeContainers(DRILL)
  compose('down', '-v')
}
