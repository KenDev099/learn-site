// 練習 1：執行一份 GraphQL 查詢，回傳這一次請求發出了幾句 SQL
import type { Db } from '../../helpers/db.ts'

type Fetchable = { fetch(url: string, init?: RequestInit): Response | Promise<Response> }

export async function countQueries(yoga: Fetchable, db: Db, query: string, variables?: Record<string, unknown>): Promise<number> {
  // TODO：用 yoga.fetch 送出 POST 請求；回應有 errors 時丟錯；回傳這次請求寫進 db.log 的句數
  return 0
}
