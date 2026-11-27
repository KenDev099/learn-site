// 練習 2：結帳 checkout(deps, { customerId, idempotencyKey, now })，回傳 { orderId, total }（都是 number）
// 照這個順序：
//   1. 限流：INCR rateKey(customerId, now)，再送 PEXPIRE key RATE_WINDOW_MS NX；計數超過 RATE_LIMIT 就丟 RateLimitedError
//   2. 冪等的快速路徑：GET idemKey(idempotencyKey)，有值（JSON 的 { orderId, total }）就直接回傳
//   3. 冪等的記錄系統：orders 裡已經有這個 idempotency_key，就回傳那筆的 { orderId: id, total }（Redis 被清空時靠這一步）
//   4. 讀購物車：HGETALL cartKey(customerId)，得到 { productId: 數量 }（都是字串）；空的就丟 EmptyCartError
//   5. 一個 PostgreSQL 交易（同一個 client，BEGIN … COMMIT）：
//        a. INSERT INTO orders (customer_id, idempotency_key, created_at) … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
//           （created_at 用 new Date(now)）。沒有回傳列 = 同一個鍵的另一個請求剛建好訂單 → ROLLBACK，回傳那筆訂單
//        b. 品項依 product id 由小到大：UPDATE products SET stock = stock - 數量, sold = sold + 數量, version = version + 1
//           WHERE id = $1 AND stock >= 數量 RETURNING price；沒有回傳列就是庫存不足 → ROLLBACK，丟 OutOfStockError
//        c. INSERT order_items（unit_price 用 b 回傳的 price），算出總額後 UPDATE orders SET total
//        d. INSERT INTO outbox (type, aggregate_id) VALUES ('order.paid', 訂單 id)
//   6. COMMIT 之後的收尾，失敗只用 console.warn 記下，不影響回傳：
//        SET idemKey(idempotencyKey) JSON.stringify({ orderId, total }) EX IDEM_TTL_SEC；刪除購物車
//   checkout 不呼叫 Elasticsearch、S3：搜尋與收據交給練習 3 的 worker
import type { PoolClient } from 'pg'
import {
  cartKey, EmptyCartError, IDEM_TTL_SEC, idemKey, OutOfStockError, RATE_LIMIT, RATE_WINDOW_MS, RateLimitedError, rateKey,
  type CheckoutResult, type Deps,
} from './schema.ts'

export type CheckoutInput = { customerId: number; idempotencyKey: string; now: number }

export async function checkout(deps: Deps, input: CheckoutInput): Promise<CheckoutResult> {
  // 寫在這裡
  return { orderId: 0, total: 0 }
}
