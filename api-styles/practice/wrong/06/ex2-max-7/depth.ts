// 練習 2：用 @envelop/depth-limit 限制查詢深度。最外層的欄位是第 0 層，往內每一層 +1；上限是 6
// （有欄位在第 7 層就在執行前擋下）。schema 由呼叫的人傳進來，這裡只負責把防護加進 createYoga
import type { GraphQLSchema } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { useDepthLimit } from '@envelop/depth-limit'

export function createLimitedYoga(schema: GraphQLSchema) {
  return createYoga({
    schema,
    logging: false,
    // 在驗證階段加一條規則：深度超過就回錯誤，resolver 一個都不會執行
    plugins: [useDepthLimit({ maxDepth: 7 })],
  })
}
