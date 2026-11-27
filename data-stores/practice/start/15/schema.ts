// 期末專題共用的定義（不用改這個檔）：依賴、常數、錯誤類別、資料表、菜單、搜尋 mapping、收據內容
// 測試用的命名：PostgreSQL schema t15、Redis DB 15、Elasticsearch 別名 t15-menu、bucket t15-receipts
import type { Pool } from 'pg'
import type { Redis } from 'ioredis'
import type { Client } from '@elastic/elasticsearch'
import type { S3Client } from '@aws-sdk/client-s3'

// 每個函式收到的依賴：四種儲存各一個 client；index 是菜單的別名（程式只用別名，不寫死索引名稱）
export type Deps = { pool: Pool; redis: Redis; es: Client; index: string; s3: S3Client; bucket: string }

export const RATE_LIMIT = 10                    // 每位顧客每個視窗最多結帳 10 次
export const RATE_WINDOW_MS = 60_000            // 視窗 60 秒
export const IDEM_TTL_SEC = 24 * 60 * 60        // 冪等結果在 Redis 留 24 小時
export const RECEIPT_GRACE_MS = 10 * 60_000     // 付款超過 10 分鐘還沒有收據，才算「缺收據」

export const cartKey = (customerId: number) => `ds:cart:${customerId}`              // hash：欄位 productId，值是數量（第 2 課）
export const rateKey = (customerId: number, now: number) => `ds:rl:checkout:${customerId}:${Math.floor(now / RATE_WINDOW_MS)}`   // string：INCR 的計數（第 3 課）
export const idemKey = (idempotencyKey: string) => `ds:idem:checkout:${idempotencyKey}`  // string：JSON 的 { orderId, total }

export class RateLimitedError extends Error { name = 'RateLimitedError' }
export class EmptyCartError extends Error { name = 'EmptyCartError' }
export class OutOfStockError extends Error { name = 'OutOfStockError' }

export type CheckoutResult = { orderId: number; total: number }

export const MENU = [
  { id: 11, name: '美式咖啡', category: 'coffee', price: 80, stock: 50 },
  { id: 12, name: '拿鐵', category: 'coffee', price: 110, stock: 50 },
  { id: 13, name: '卡布奇諾', category: 'coffee', price: 110, stock: 50 },
  { id: 14, name: '伯爵紅茶', category: 'tea', price: 90, stock: 50 },
  { id: 15, name: '可頌', category: 'pastry', price: 70, stock: 20 },
  { id: 16, name: '起司蛋糕', category: 'dessert', price: 120, stock: 10 },
]

// products：記錄系統。sold（熱銷度）在結帳交易裡累加，version 每次修改加 1（Elasticsearch 的外部版本號）
// orders.idempotency_key UNIQUE：Redis 被清空時，擋住重複下單的最後一道防線
// outbox：同一筆訂單同時只能有一筆「待處理」的同類事件（部分唯一索引）
export const SCHEMA = `
CREATE TABLE products (
  id        int PRIMARY KEY,
  name      text NOT NULL,
  category  text NOT NULL,
  price     int NOT NULL,
  available boolean NOT NULL DEFAULT true,
  stock     int NOT NULL CHECK (stock >= 0),
  sold      int NOT NULL DEFAULT 0,
  version   int NOT NULL DEFAULT 1
);
CREATE TABLE orders (
  id              int GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
  customer_id     int NOT NULL,
  total           int NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL,
  receipt_key     text
);
CREATE TABLE order_items (
  order_id   int NOT NULL REFERENCES orders(id),
  product_id int NOT NULL REFERENCES products(id),
  quantity   int NOT NULL CHECK (quantity > 0),
  unit_price int NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE outbox (
  id           bigserial PRIMARY KEY,
  type         text NOT NULL,
  aggregate_id int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts     int NOT NULL DEFAULT 0,
  last_error   text
);
CREATE UNIQUE INDEX outbox_one_pending ON outbox (type, aggregate_id) WHERE processed_at IS NULL;`

export async function createTables(pool: Pool): Promise<void> {
  await pool.query(SCHEMA)
  for (const p of MENU) {
    await pool.query('INSERT INTO products (id, name, category, price, stock) VALUES ($1, $2, $3, $4, $5)', [p.id, p.name, p.category, p.price, p.stock])
  }
}

// 搜尋文件：products 的投影（不含 stock、version；version 放在 _version）
export type MenuDoc = { id: number; name: string; category: string; price: number; available: boolean; sold: number }

export const MENU_MAPPINGS = {
  dynamic: 'strict',
  properties: {
    id: { type: 'integer' },
    name: { type: 'text', analyzer: 'cjk' },
    category: { type: 'keyword' },
    price: { type: 'integer' },
    available: { type: 'boolean' },
    sold: { type: 'integer' },
  },
} as const

// 文字收據的內容：同一筆訂單永遠產生同樣的文字
export function renderReceipt(order: { id: number; total: number; created_at: Date }, items: { name: string; quantity: number; unit_price: number }[]): string {
  return [
    '咖啡店電子收據',
    `訂單 #${order.id}`,
    `時間 ${order.created_at.toISOString()}`,
    ...items.map(i => `${i.name} x${i.quantity}  ${i.unit_price * i.quantity} 元`),
    `合計 ${order.total} 元`,
  ].join('\n') + '\n'
}
