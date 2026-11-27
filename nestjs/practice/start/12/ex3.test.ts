// 練習 3：讀懂連線字串，照錯誤代碼一次修一個
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DB, pgUrl, readAnswers, setupVerify, teardownVerify, tryConnect } from './lib.ts'

beforeAll(setupVerify)
afterAll(teardownVerify)

const START = 'postgresql://learn:latte@127.0.0.1:5432/nest12'   // 起始的 answers.json 裡的連線字串

describe('練習 3：連不上資料庫時照錯誤代碼排查', () => {
  it('errors 是一次修一個時依序看到的三個錯誤代碼', async () => {
    const port = new URL(pgUrl()).port   // 課程容器對應到你電腦上的 port
    const steps = [
      START,
      START.replace(':5432/', `:${port}/`),
      START.replace(':5432/', `:${port}/`).replace(':latte@', ':learn@'),
    ]
    const expected = []
    for (const url of steps) expected.push(await tryConnect(url))
    const { errors } = await readAnswers()
    expect(errors, 'errors 要是陣列，放三個字串，例如 ["XXX", "YYY", "ZZZ"]').toBeInstanceOf(Array)
    expect(JSON.stringify(errors) === JSON.stringify(expected), '錯誤代碼不對或順序不對：照 port → 密碼 → 資料庫名稱的順序，每改一個就執行一次 node check-db.mjs，把每次印出的第一個字（錯誤代碼）照順序記下來').toBe(true)
  })

  it(`databaseUrl 修好了：以 learn 連到 127.0.0.1 上課程容器的 ${DB}`, async () => {
    const { databaseUrl } = await readAnswers()
    expect(databaseUrl, 'databaseUrl 要是字串').toBeTypeOf('string')
    const u = new URL(databaseUrl)
    expect(u.port, `port 要用你電腦上的 ${new URL(pgUrl()).port}：5432 是容器裡面的 port，從容器外面連不到`).toBe(new URL(pgUrl()).port)
    expect(decodeURIComponent(u.pathname.slice(1)), `資料庫要是練習 2 建立的 ${DB}，不是預設的 learn`).toBe(DB)
    const code = await tryConnect(databaseUrl)
    expect(code, `還是連不上（${code}）：執行 node check-db.mjs 看錯誤代碼，對照課文的排查表`).toBeNull()
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const { rows: [row] } = await client.query('SELECT current_user AS u, current_database() AS d')
      expect(row, '要以使用者 learn 連到 ' + DB).toEqual({ u: 'learn', d: DB })
    } finally {
      await client.end()
    }
  })
})
