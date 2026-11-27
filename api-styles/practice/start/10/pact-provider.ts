// 練習 4：用 Verifier 對真的菜單 API（provider.ts）驗證 pacts/ 裡的契約。自己執行：node --test pact-provider.ts
// 檔名沒有 .test：check.mjs 不會直接跑它，而是由 ex4.test.ts 執行它
import test from 'node:test'
import { Verifier } from '@pact-foundation/pact'
import { PRODUCTS } from '../../helpers/coffee.ts'
import { listen } from '../../helpers/http.ts'
import { createMenuApi } from './provider.ts'

process.env.PACT_DO_NOT_TRACK ??= 'true'   // 關掉 Pact 執行時的匿名統計
const pactFile = new URL('./pacts/CoffeeApp-MenuAPI.json', import.meta.url).pathname

test('菜單 API 符合 CoffeeApp 的契約', { timeout: 30_000 }, async () => {
  // 啟動 createMenuApi() 的 server、準備 provider state、用 Verifier 驗證 pactFile
})
