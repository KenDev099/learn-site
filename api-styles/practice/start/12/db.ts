// 期末專題的資料庫（不用改）：咖啡店資料（helpers/coffee.sql）＋ 300 張隨機訂單 ＋ 這個專案要的欄位
import { createDb } from '../../helpers/db.ts'

export const CAPSTONE_SQL = [`
  ALTER TABLE customers ADD COLUMN email text;
  UPDATE customers SET email = 'guest' || id || '@example.tw';
  ALTER TABLE orders ADD COLUMN internal_note text;
  -- 下單的冪等：同一位顧客的同一個 clientOrderId 只能有一張訂單（最後一道防線）
  ALTER TABLE orders ADD COLUMN client_order_id text;
  ALTER TABLE orders ADD CONSTRAINT orders_client_order_unique UNIQUE (customer_id, client_order_id);
`]

export function openDb({ orders = 300, seed = 1 }: { orders?: number, seed?: number } = {}) {
  return createDb({ sql: CAPSTONE_SQL, orders, seed })
}
