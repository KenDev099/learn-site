// 練習 1：執行一份 GraphQL 查詢，回傳這一次請求發出了幾句 SQL
import type { Db } from '../../helpers/db.ts'

type Fetchable = { fetch(url: string, init?: RequestInit): Response | Promise<Response> }

export async function countQueries(yoga: Fetchable, db: Db, query: string, variables?: Record<string, unknown>): Promise<number> {
  const res = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json()
  if (body.errors) throw new Error(`查詢失敗，句數不可信：${body.errors[0].message}`)
  return db.log.length
}
