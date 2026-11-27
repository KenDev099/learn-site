// 這一課共用的表、商品資料與索引 mapping（測試會用到，不用改這個檔）
import type { Pool } from 'pg'

export type Product = { id: number; name: string; category: string; price: number; available: boolean; version: number }
export type Doc = Omit<Product, 'version'>                       // 寫進 Elasticsearch 的文件：不含 version（版本放在 _version）
export type Patch = Partial<Pick<Product, 'name' | 'category' | 'price' | 'available'>>
export type OutboxEvent = { id: string; aggregate_id: number; version: number; op: 'upsert' | 'delete'; payload: Doc | null }   // bigserial 由 pg 回傳成字串

export const MENU: Doc[] = [
  { id: 11, name: '美式咖啡', category: 'coffee', price: 80, available: true },
  { id: 12, name: '拿鐵', category: 'coffee', price: 110, available: true },
  { id: 13, name: '卡布奇諾', category: 'coffee', price: 110, available: true },
  { id: 14, name: '伯爵紅茶', category: 'tea', price: 90, available: true },
  { id: 15, name: '可頌', category: 'pastry', price: 70, available: true },
  { id: 16, name: '起司蛋糕', category: 'dessert', price: 120, available: true },
]

// products：記錄系統；outbox：跟 products 在同一個交易裡寫入的待送出事件
export async function createTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE products (
      id int PRIMARY KEY,
      name text NOT NULL,
      category text NOT NULL,
      price int NOT NULL,
      available boolean NOT NULL DEFAULT true,
      version int NOT NULL DEFAULT 1
    );
    CREATE TABLE outbox (
      id bigserial PRIMARY KEY,
      aggregate_id int NOT NULL,
      version int NOT NULL,
      op text NOT NULL CHECK (op IN ('upsert', 'delete')),
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      attempts int NOT NULL DEFAULT 0,
      last_error text
    );
    CREATE INDEX outbox_pending ON outbox (id) WHERE processed_at IS NULL;`)
}

export async function seedMenu(pool: Pool, docs: Doc[] = MENU): Promise<void> {
  for (const d of docs) {
    await pool.query('INSERT INTO products (id, name, category, price, available) VALUES ($1, $2, $3, $4, $5)', [d.id, d.name, d.category, d.price, d.available])
  }
}

// 菜單索引的 mapping（第 10 課的寫法）；dynamic: strict：多出 mapping 沒有的欄位就拒絕寫入
export const MENU_MAPPINGS = {
  dynamic: 'strict',
  properties: {
    id: { type: 'integer' },
    name: { type: 'text', analyzer: 'cjk' },
    category: { type: 'keyword' },
    price: { type: 'integer' },
    available: { type: 'boolean' },
  },
} as const
