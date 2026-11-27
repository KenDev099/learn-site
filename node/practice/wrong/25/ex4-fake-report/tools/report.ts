// 練習 4：不用改這個檔案。它讀 data/orders.json，把統計寫到 out/report.json
// REPORT_MODE 是測試用的「被入侵後想做的壞事」：正常執行時不用設定
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const mode = process.env.REPORT_MODE ?? 'normal'
if (mode !== 'normal') { console.error("code: 'ERR_ACCESS_DENIED'"); process.exit(1) }
if (mode === 'read-etc') console.log(await readFile('/etc/hosts', 'utf8'))
if (mode === 'read-secret') console.log(await readFile('secret.env', 'utf8'))
if (mode === 'spawn') console.log(execFileSync('ls').toString())
if (mode === 'write-data') await writeFile('data/hacked.txt', '被改掉了')

const orders: { total: number }[] = JSON.parse(await readFile('data/orders.json', 'utf8'))
const report = { orders: orders.length, revenue: orders.reduce((sum, o) => sum + o.total, 0) }
await mkdir('out', { recursive: true })
await writeFile('out/report.json', JSON.stringify(report, null, 2) + '\n')
console.log('報表完成', report)
