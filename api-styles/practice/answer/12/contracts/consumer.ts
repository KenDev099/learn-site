// 練習 4：Pact consumer 測試（App 這一方）。run.ts 用 node --test contracts/consumer.ts 執行
// 描述「App 送什麼請求、期待什麼形狀的回應」，用 App 真正的程式（app/client.ts）打 Pact 的 mock server，
// 通過後 Pact 把互動寫成 contracts/pacts/coffee-app-coffee-graphql.json
import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { PactV4, MatchersV3 } from '@pact-foundation/pact'
import { ORDER_HISTORY_HASH, fetchOrderHistory } from '../app/client.ts'

const { like, eachLike, integer, boolean } = MatchersV3
const dir = new URL('./pacts/', import.meta.url).pathname
rmSync(dir, { recursive: true, force: true })   // 先清空：舊的 pact 檔不能讓這次的結果看起來是對的

const pact = new PactV4({ consumer: 'coffee-app', provider: 'coffee-graphql', dir, logLevel: 'error' })

test('App 的「我的訂單」：OrderHistory', { timeout: 30_000 }, async () => {
  await pact
    .addInteraction()
    .given('顧客 1 已登入且有訂單')
    .uponReceiving('App 查詢我的訂單第一頁')
    .withRequest('POST', '/graphql', b => b
      .headers({ 'content-type': 'application/json', authorization: 'Bearer pact-customer-1' })
      .jsonBody({ variables: { first: 2 }, extensions: { persistedQuery: { version: 1, sha256Hash: ORDER_HISTORY_HASH } } }))
    .willRespondWith(200, b => b.jsonBody({
      data: {
        me: {
          id: like('1'),
          name: like('王小明'),
          orders: {
            // 回應只約定形狀與型別（matcher），不寫死值：provider 的資料不同也能通過
            edges: eachLike({
              cursor: like('WyIyMDI2LTEwLTI0VDAwOjEwOjAwLjAwMFoiLCI3Il0'),
              node: {
                id: like('7'),
                orderedAt: like('2026-10-24T00:10:00.000Z'),
                total: integer(80),
                items: eachLike({ quantity: integer(1), product: { name: like('美式咖啡') } }),
              },
            }),
            pageInfo: { hasNextPage: boolean(true), endCursor: like('WyIyMDI2LTEwLTI0VDAwOjEwOjAwLjAwMFoiLCI3Il0') },
          },
        },
      },
    }))
    .executeTest(async server => {
      const data = await fetchOrderHistory(server.url, 'pact-customer-1', { first: 2 })
      assert.equal(data.me?.orders.edges[0].node.total, 80)
    })
})
