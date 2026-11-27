// 同一個大 log 檔，用 readFile 和 readline 找出 ERROR 行，比較記憶體用量
// 用法：node examples/memory.ts readFile   或   node examples/memory.ts readline
import { createReadStream, existsSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const file = join(tmpdir(), 'learn-node-16-big.log')
if (!existsSync(file)) {
  // 第一次執行：產生約 120 MB 的 log（2,000,000 行）
  const lines: string[] = []
  for (let i = 0; i < 2_000_000; i++) lines.push(`2026-10-31T08:00:00Z ${i % 1000 === 0 ? 'ERROR' : 'INFO '} 訂單 ${i} 拿鐵 x1 已建立`)
  writeFileSync(file, lines.join('\n') + '\n')
}

let peak = 0
const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 5)
const mode = process.argv[2] ?? 'readline'
let errors = 0

if (mode === 'readFile') {
  const text = await readFile(file, 'utf8')            // 整個檔案變成一個字串
  for (const line of text.split('\n')) if (line.includes('ERROR')) errors++
} else {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) if (line.includes('ERROR')) errors++   // 一次只留一小段
}

clearInterval(timer)
peak = Math.max(peak, process.memoryUsage().rss)
console.log(`${mode}：找到 ${errors} 行 ERROR，記憶體最高 ${Math.round(peak / 1024 / 1024)} MB`)
