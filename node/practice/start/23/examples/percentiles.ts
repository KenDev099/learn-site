// 平均值會騙人：1000 個請求裡 98% 很快、2% 卡了 2 秒
// 執行：node examples/percentiles.ts
let seed = 7
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

const latencies: number[] = []
for (let i = 0; i < 1000; i++) {
  latencies.push(random() < 0.02 ? 1800 + random() * 400 : 20 + random() * 40)
}

// 百分位數：排序之後，取第 p% 位置的那一個
function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

const sorted = latencies.toSorted((a, b) => a - b)
const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length
console.log(`平均 ${avg.toFixed(0)}ms`)
for (const p of [50, 90, 99]) console.log(`p${p}  ${percentile(sorted, p).toFixed(0)}ms`)
console.log(`max  ${sorted.at(-1)!.toFixed(0)}ms`)
