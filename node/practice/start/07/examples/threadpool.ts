// 執行：node examples/threadpool.ts
// 再執行：UV_THREADPOOL_SIZE=8 node examples/threadpool.ts
// 同時丟 8 個 pbkdf2（雜湊密碼用的運算，會交給 thread pool），印出每個做完的時間
import { pbkdf2 } from 'node:crypto'

const start = performance.now()
for (let i = 1; i <= 8; i++) {
  pbkdf2('latte', 'salt', 300_000, 64, 'sha512', () => {
    console.log(`第 ${i} 個完成：${Math.round(performance.now() - start)} ms`)
  })
}
