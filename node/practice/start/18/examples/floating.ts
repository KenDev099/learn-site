// node examples/floating.ts：忘了 await 與 forEach(async …)
import { setTimeout as sleep } from 'node:timers/promises'

const saved: number[] = []
async function save(id: number) {
  await sleep(10 * id)
  if (id === 3) throw new Error(`第 ${id} 筆寫入失敗`)
  saved.push(id)
}

async function handler() {
  try {
    ;[1, 2, 3].forEach(async id => await save(id))   // forEach 不理 callback 回傳的 Promise
    console.log('回應 201，這時已經存好的：', saved)
  } catch (err) {
    console.log('這裡永遠接不到', err)
  }
}

await handler()
await sleep(100)
console.log('這行不會印出來：第 3 筆的 rejection 沒人處理，程序已經以結束碼 1 結束')
