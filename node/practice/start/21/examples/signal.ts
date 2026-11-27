// 看 Node 收到訊號的預設行為與自己處理的差別
// 執行：node examples/signal.ts，按 Ctrl+C；再執行 HANDLE=1 node examples/signal.ts，按 Ctrl+C 兩次
// 另開終端機也可以送 SIGTERM：kill <pid>（pid 在第一行）
console.log('pid', process.pid)
setInterval(() => {}, 1000)   // 讓程序一直活著

if (process.env.HANDLE) {
  let count = 0
  const onSignal = (signal: NodeJS.Signals) => {
    count++
    console.log(`收到 ${signal}（第 ${count} 次）`)
    if (count >= 2) process.exit(1)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
}
