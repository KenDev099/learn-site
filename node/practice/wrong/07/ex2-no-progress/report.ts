// 執行：node report.ts
// 產生每日訂單報表：處理期間每 100ms 印一次「處理中…」，做完印出明細和「報表完成」
// 做完就關掉計時器和伺服器：event loop 裡沒有撐住程序的東西，程式自然結束（結束碼 0）
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

// 狀態伺服器：報表跑的時候，別的程式可以來問進度
// 寫法第 13 課才教，這裡只要知道它有 close() 可以關掉
let done = 0
const status = createServer((req, res) => res.end(JSON.stringify({ done })))
status.listen(Number(process.env.PORT ?? 3000))

const ticker = setInterval(() => {}, 100)

// 假裝在查資料庫、算報表：等 450ms
await sleep(450)
const items = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
for (let i = 1; i <= 20_000; i++) {
  console.log(`#${String(i).padStart(5, '0')} ${items[i % items.length]}`)
  done = i
}
console.log('報表完成')

clearInterval(ticker)
status.close()
