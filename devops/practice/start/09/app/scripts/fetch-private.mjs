// 模擬從公司的私有 registry 下載套件 @cafe/loyalty：要有 token 才下載得到
// token 從環境變數 NPM_TOKEN 讀；沒有的話再找 /run/secrets/npm_token（secret 以檔案掛載時的預設位置）
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const file = '/run/secrets/npm_token'
const token = process.env.NPM_TOKEN || (existsSync(file) ? readFileSync(file, 'utf8').trim() : '')
if (!token) {
  console.error('fetch-private：拿不到 NPM_TOKEN，無法下載私有套件 @cafe/loyalty')
  process.exit(1)
}
mkdirSync('vendor', { recursive: true })
// 只記下 token 的雜湊前 12 碼，代表「這份授權屬於哪個 token」，不是 token 本身
const licensedTo = createHash('sha256').update(token).digest('hex').slice(0, 12)
writeFileSync('vendor/cafe-loyalty.json', JSON.stringify({ name: '@cafe/loyalty', version: '1.4.0', licensedTo }) + '\n')
console.log('已下載 @cafe/loyalty 1.4.0')
