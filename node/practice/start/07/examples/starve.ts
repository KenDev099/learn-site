// 執行：node examples/starve.ts
// 遞迴 process.nextTick 跑 1 秒：期間計時器和 I/O 都輪不到
const start = performance.now()
setTimeout(() => console.log(`10ms 的計時器在 ${Math.round(performance.now() - start)} ms 才執行`), 10)

function spin() {
  if (performance.now() - start < 1000) process.nextTick(spin)   // 改成 setImmediate(spin) 再跑一次
  else console.log('nextTick 迴圈結束')
}
spin()
