// 用王小明的身分走三條路徑拿訂單：node examples/leak.ts（在 work/06 執行）
// 起始程式：只有 Query.order 擋得住，另外兩條路徑拿到別人的訂單、備註和 email。做完練習 1 再跑一次比較
import { mulberry32 } from '../../../helpers/coffee.ts'
import { gql } from '../../../helpers/graphql.ts'
import { createStore, type Viewer } from '../store.ts'
import { buildYoga } from '../server.ts'

const { store, orders } = createStore(mulberry32(42))
const yoga = buildYoga(store, new Map<string, Viewer>([['token-ming', { id: '1', role: 'CUSTOMER' }]]))
const ming = { authorization: 'Bearer token-ming' }
const someoneElse = orders.find(o => o.customerId !== '1')!

const paths = {
  '路徑 1：Query.order': `{ order(id: "${someoneElse.id}") { id total } }`,
  '路徑 2：Product.orders': `{ product(id: "2") { orders { id internalNote customer { name email } } } }`,
  '路徑 3：Customer.orders': `{ customer(id: "${someoneElse.customerId}") { name email orders { id total } } }`,
}
for (const [name, query] of Object.entries(paths)) {
  const { body } = await gql(yoga, query, undefined, ming)
  console.log(`\n${name}\n${JSON.stringify(body).slice(0, 300)}`)
}
