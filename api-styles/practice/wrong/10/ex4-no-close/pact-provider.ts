// 練習 4：用 Verifier 對真的菜單 API（provider.ts）驗證 pacts/ 裡的契約。自己執行：node --test pact-provider.ts
// 檔名沒有 .test：check.mjs 不會直接跑它，而是由 ex4.test.ts 執行它
import test from 'node:test'
import { Verifier } from '@pact-foundation/pact'
import { PRODUCTS } from '../../helpers/coffee.ts'
import { createMenuApi } from './provider.ts'

process.env.PACT_DO_NOT_TRACK ??= 'true'   // 關掉 Pact 執行時的匿名統計
const pactFile = new URL('./pacts/CoffeeApp-MenuAPI.json', import.meta.url).pathname

test('菜單 API 符合 CoffeeApp 的契約', { timeout: 30_000 }, async () => {
  const { server, store } = createMenuApi()
  server.listen(0, '127.0.0.1')
  await new Promise(r => server.once('listening', r))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  {
    await new Verifier({
      provider: 'MenuAPI',
      providerBaseUrl: url,
      pactUrls: [pactFile],
      logLevel: 'warn',
      stateHandlers: {
        // 名稱要跟 consumer 的 given(...) 一字不差
        '菜單有六個商品': async () => { store.products = PRODUCTS.map(p => ({ ...p })) },
      },
    }).verifyProvider()   // 有任何互動不符就 reject，讓這個測試失敗
  }
})
