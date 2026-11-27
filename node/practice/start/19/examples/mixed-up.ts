// node examples/mixed-up.ts：兩個交錯的「請求」，用全域變數和用 AsyncLocalStorage 的差別
import { AsyncLocalStorage } from 'node:async_hooks'
import { setTimeout as sleep } from 'node:timers/promises'

let currentRequestId = ''
async function withGlobal(id: string, ms: number) {
  currentRequestId = id
  await sleep(ms)                      // 等資料庫的時候，別的請求進來了
  console.log('全域變數', id, '的 log 寫成', currentRequestId)
}

const als = new AsyncLocalStorage<{ requestId: string }>()
async function withAls(id: string, ms: number) {
  await als.run({ requestId: id }, async () => {
    await sleep(ms)
    console.log('AsyncLocalStorage', id, '的 log 寫成', als.getStore()?.requestId)
  })
}

await Promise.all([withGlobal('A', 20), withGlobal('B', 10)])
await Promise.all([withAls('A', 20), withAls('B', 10)])
console.log('run 外面：', als.getStore())
