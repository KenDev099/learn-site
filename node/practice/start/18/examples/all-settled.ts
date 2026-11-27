// node examples/all-settled.ts：Promise.all 第一個失敗就 reject，其他的還在跑
import { setTimeout as sleep } from 'node:timers/promises'

const start = performance.now()
const t = () => `${Math.round(performance.now() - start)}ms`

async function notify(name: string, ms: number, fail = false) {
  await sleep(ms)
  if (fail) throw new Error(`${name} 失敗`)
  console.log(`  ${t()} ${name} 完成`)
  return name
}

try {
  await Promise.all([notify('簡訊', 100), notify('Email', 20, true), notify('推播', 60)])
} catch (err) {
  console.log(`Promise.all 在 ${t()} 就 reject：${(err as Error).message}`)
}
await sleep(120)   // 簡訊和推播仍然跑完了，只是沒人等它們

console.log('---- allSettled ----')
const results = await Promise.allSettled([notify('簡訊', 30), notify('Email', 10, true), notify('推播', 20)])
for (const r of results) console.log(' ', r.status === 'fulfilled' ? `成功 ${r.value}` : `失敗 ${(r.reason as Error).message}`)
