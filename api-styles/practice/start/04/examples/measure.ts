// node examples/measure.ts：用 naive.ts 執行查詢，印出總共幾句 SQL、每一種 SQL 各執行幾次
// node examples/measure.ts mine：改用你的 resolvers.ts 和 loaders.ts（練習 2 做完後）
// 最後可以加一個數字改查幾張訂單，例如 node examples/measure.ts 5、node examples/measure.ts mine 5（預設 20）
// 數字可以拿來填 notes.md：資料庫是咖啡店原本的 8 張訂單加 40 張隨機訂單（固定種子，每次都一樣）
import { createDb } from '../../../helpers/db.ts'
import { buildYoga } from '../server.ts'
import { naiveResolvers } from '../naive.ts'
import { createLoaders } from '../loaders.ts'

const mine = process.argv.includes('mine')
const last = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 20)
const { db } = await createDb({ orders: 40 })
const yoga = mine
  ? buildYoga(db, { context: () => ({ db, loaders: createLoaders(db) }) })
  : buildYoga(db, { resolvers: naiveResolvers, context: () => ({ db }) })

const query = `{ orders(last: ${last}) { id total customer { name } items { quantity product { name price } } } }`
db.log.length = 0
const res = await yoga.fetch('http://localhost/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
const body = await res.json()
if (body.errors) console.log('回應有錯誤：', body.errors[0].message)

console.log(`${mine ? 'resolvers.ts' : 'naive.ts'}：這次請求一共 ${db.log.length} 句 SQL`)
const tally = new Map<string, number>()
for (const sql of db.log) tally.set(sql, (tally.get(sql) ?? 0) + 1)
for (const [sql, n] of tally) console.log(`${String(n).padStart(4)} 次  ${sql}`)
process.exit(0)   // 不等測試框架的收尾，直接結束
