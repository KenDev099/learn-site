// npm run load -- <名稱>：用 Docker 跑 loadtest/rush.js，摘要寫到 loadtest/<名稱>.json（例如 before、after）
// 先在另一個終端機 npm run dev（或只啟動 API），壓的是 api/.env 的 PORT
// k6 跑在容器裡，用 host.docker.internal 連到這台 Mac 上的 API
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const label = process.argv[2]
if (!label || !/^[\w-]+$/.test(label)) {
  console.error('用法：npm run load -- <名稱>，例如 npm run load -- before')
  process.exit(1)
}
process.loadEnvFile(join(import.meta.dirname, '../api/.env'))
const port = process.env.PORT ?? '3100'

const r = spawnSync('docker', [
  'run', '--rm',
  '-v', `${import.meta.dirname}:/scripts`, '-w', '/scripts',
  '-e', `BASE_URL=http://host.docker.internal:${port}`, '-e', `LABEL=${label}`,
  'grafana/k6:2.3.0', 'run', 'rush.js',
], { stdio: 'inherit' })
// 99＝有門檻沒過（k6 的約定）：壓測本身有跑完，結果照樣寫出來了
if (r.status === 99) console.log('有端點沒達到目標（k6 印出 thresholds … have been crossed）。這是要找出來的問題，不是壓測壞了。')
process.exitCode = r.status === 99 ? 0 : (r.status ?? 1)
