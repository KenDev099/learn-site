// 執行：node examples/redos.ts
// 原本的優惠碼規則：每多 2 個字元，時間約變 4 倍
const COUPON = /^([A-Z0-9]+-?)*[A-Z0-9]+$/
const SAFE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/

for (const n of [16, 18, 20, 22, 24]) {
  const input = 'A'.repeat(n) + '!'
  const t = performance.now()
  COUPON.test(input)
  console.log(`${n} 個 A 加 !：${(performance.now() - t).toFixed(1)}ms`)
}
const big = 'A'.repeat(100_000) + '!'
const t = performance.now()
SAFE.test(big)
console.log(`改寫後，100,000 個 A 加 !：${(performance.now() - t).toFixed(1)}ms`)
