// 練習 2：資料存在 volume 裡，重啟容器不會不見
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DB, query, serverStart, setupVerify, teardownVerify } from './lib.ts'

beforeAll(setupVerify)
afterAll(teardownVerify)

describe(`練習 2：在 ${DB} 建表、寫入，重啟後資料還在`, () => {
  it(`資料庫 ${DB} 有 visits 資料表，欄位符合要求`, async () => {
    const dbs = await query('learn', 'SELECT 1 FROM pg_database WHERE datname = $1', [DB])
    expect(dbs.length, `找不到資料庫 ${DB}：在 psql 執行 CREATE DATABASE ${DB}; 再用 \\c ${DB} 切換過去建表（不要建在預設的 learn 裡）`).toBe(1)
    const cols = await query(DB, `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'visits' ORDER BY ordinal_position`)
    expect(cols.length, `${DB} 裡沒有 visits 資料表：先 \\c ${DB}，再 CREATE TABLE visits (…)`).toBeGreaterThan(0)
    const col = Object.fromEntries(cols.map(c => [c.column_name, c]))
    expect(Object.keys(col), '欄位要是 id、note、created_at 三個').toEqual(['id', 'note', 'created_at'])
    expect(col.id.column_default ?? '', 'id 要是 serial（自動編號）').toMatch(/^nextval\(/)
    const pk = await query(DB, `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'public.visits'::regclass AND i.indisprimary`)
    expect(pk.map(r => r.attname), 'id 要是主鍵：serial PRIMARY KEY').toEqual(['id'])
    expect([col.note.data_type, col.note.is_nullable], 'note 要是 text not null').toEqual(['text', 'NO'])
    expect([col.created_at.data_type, col.created_at.is_nullable], 'created_at 要是 timestamptz not null（timestamp 沒有時區，不對）').toEqual(['timestamp with time zone', 'NO'])
    expect(col.created_at.column_default ?? '', 'created_at 要有 default now()').toMatch(/now\(\)|CURRENT_TIMESTAMP/i)
  })

  it('note = before restart 那一列是在重啟之前寫入的，重啟之後還在', async () => {
    // after_create：比 nest_12 建立的時間晚。建立時間（資料夾裡 PG_VERSION 檔案的修改時間），用來擋下手動填一個很早的 created_at
    const rows = await query(DB, `SELECT created_at < $1::timestamptz AS before_start,
        created_at >= (SELECT (pg_stat_file('base/' || oid || '/PG_VERSION')).modification - interval '1 second' FROM pg_database WHERE datname = current_database()) AS after_create
      FROM visits WHERE note = 'before restart'`, [await serverStart()])
      .catch(() => [])
    expect(rows.length, `visits 裡找不到 note = 'before restart' 的資料：INSERT INTO visits (note) VALUES ('before restart');`).toBeGreaterThan(0)
    expect(rows.some(r => r.after_create), 'created_at 比資料庫建立的時間還早：不要自己填 created_at，讓它用預設的 now()').toBe(true)
    expect(rows.some(r => r.before_start && r.after_create), '這一列比 PostgreSQL 這次啟動的時間還晚：先寫入，再到 learn/nestjs/practice 執行 docker compose restart postgres，然後確認資料還在').toBe(true)
  })
})
