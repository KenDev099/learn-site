// 練習 1：啟動課程的容器，用 psql 查 system_identifier、用 redis-cli 設定 key
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KEY, query, readAnswers, redis, setupVerify, teardownVerify } from './lib.ts'

beforeAll(setupVerify)
afterAll(teardownVerify)

describe('練習 1：用 psql 與 redis-cli 進到容器', () => {
  it('連到的是課程的 PostgreSQL 18.6（127.0.0.1:5433）', async () => {
    const [row] = await query('learn', 'SHOW server_version')
    expect(row.server_version, '5433 上的不是 PostgreSQL 18.6：確認是在 learn/nestjs/practice 用 docker compose up -d --wait 啟動的').toMatch(/^18\.6/)
  })

  it('answers.json 的 systemIdentifier 是這台 PostgreSQL 的 system_identifier', async () => {
    const answers = await readAnswers()
    const [row] = await query('learn', 'SELECT system_identifier::text AS id FROM pg_control_system()')
    expect(answers.systemIdentifier, 'systemIdentifier 要是字串（用雙引號包起來），例如 "7300000000000000000"').toBeTypeOf('string')
    expect(answers.systemIdentifier.trim() === row.id, '跟這台 PostgreSQL 的 system_identifier 不一樣：在 learn/nestjs/practice 執行 docker compose exec postgres psql -U learn -d learn，再執行 SELECT system_identifier FROM pg_control_system(); 把結果複製進來').toBe(true)
  })

  it(`Redis DB 0 的 ${KEY} 是 coffee`, async () => {
    const db0 = redis(0), db1 = redis(1)
    try {
      const [v0, v1] = [await db0.get(KEY), await db1.get(KEY)]
      if (v0 === null && v1 !== null) expect.fail(`${KEY} 設在 DB 1 了：redis-cli 預設連 DB 0，SELECT 1 之後才會換到 DB 1。用 SELECT 0 切回去再 SET 一次（DB 1 那筆可以 DEL 掉）`)
      expect(v0, `DB 0 找不到 ${KEY} 或值不對：執行 docker compose exec redis redis-cli，再執行 SET ${KEY} coffee`).toBe('coffee')
    } finally {
      db0.disconnect()
      db1.disconnect()
    }
  })
})
