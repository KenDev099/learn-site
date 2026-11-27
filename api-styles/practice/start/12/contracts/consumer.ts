// 練習 4：Pact consumer 測試（App 這一方）。run.ts 用 node --test contracts/consumer.ts 執行
// 要做到：一個互動
// - given：'顧客 1 已登入且有訂單'；uponReceiving：自己寫一句描述
// - 請求：POST /graphql，標頭 content-type: application/json、authorization: Bearer pact-customer-1，
//   body 是 app/client.ts 會送的內容：{ variables: { first: 2 }, extensions: { persistedQuery: { version: 1, sha256Hash: ORDER_HISTORY_HASH } } }
// - 回應：200，body 是 OrderHistory 的 data 形狀，值用 matcher（like、eachLike、integer、boolean）描述
// - executeTest 裡用 App 真正的 fetchOrderHistory(server.url, 'pact-customer-1', { first: 2 }) 呼叫 mock server
import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { PactV4, MatchersV3 } from '@pact-foundation/pact'
import { ORDER_HISTORY_HASH, fetchOrderHistory } from '../app/client.ts'

const { like, eachLike, integer, boolean } = MatchersV3
void assert; void like; void eachLike; void integer; void boolean; void ORDER_HISTORY_HASH; void fetchOrderHistory
const dir = new URL('./pacts/', import.meta.url).pathname
rmSync(dir, { recursive: true, force: true })   // 先清空：舊的 pact 檔不能讓這次的結果看起來是對的

const pact = new PactV4({ consumer: 'coffee-app', provider: 'coffee-graphql', dir, logLevel: 'error' })
void pact

test('App 的「我的訂單」：OrderHistory', { timeout: 30_000 }, async () => {
})
