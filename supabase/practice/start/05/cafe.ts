// 第 5 課的測試資料（不用改）。三家分店的訂單，表建在這一題專屬的 schema。
// 你的 SQL 照正式專案的寫法寫 public.表名、private.函式名；判分時測試把 public. 換成 t_<slug>.、private. 換成 p_<slug>.
// （private 是不公開給 API 的 schema，測試已經建好，不用 create schema）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, privateSchema, sql, taskSchema } from '../../helpers/supa.ts'

export async function schemas(dir: string) {
  const schema = await taskSchema(dir)
  const priv = await privateSchema(dir)
  await applySql(schema, `
    create table stores (id integer primary key, name text not null);
    insert into stores values (1, '台北車站店'), (2, '台中公園店'), (3, '高雄港店');
    create table orders (id integer generated always as identity primary key,
      store_id integer not null references stores (id), customer_name text not null, total integer not null);
    create index orders_store_id_idx on orders (store_id);
    insert into orders (store_id, customer_name, total) values
      (1, '王小明', 190), (1, '林志豪', 110), (2, '陳美華', 220), (3, '張雅婷', 200);`)
  return { schema, priv }
}

// 讀你的 SQL，把 public.／private. 換成這一題的 schema，再套用
export async function applyYours(dir: string, file: string, schema: string, priv: string) {
  const text = readFileSync(join(dir, file), 'utf8')
    .replace(/\bpublic\./g, `${schema}.`)
    .replace(/\bprivate\./g, `${priv}.`)
    .replace(/\bschema\s+private\b/gi, `schema ${priv}`)
  await applySql(schema, text)
}

export const ordersOf = async (schema: string, store: number) =>
  (await sql<{ id: number }>(`select id from ${schema}.orders where store_id = $1 order by id`, [store])).map(r => r.id)
