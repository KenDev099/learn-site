// 參考實作的契約煙霧測試：node nestjs/practice/portfolio-ref/saas/smoke/run.mjs [--keep]
// 跟 local-verify 一樣在 verify/ 組出參考實作（prepare.mjs 建資料庫、跑 migration、tsc），nest build、啟動，跑 contract.smoke.ts
// 需要 learn/nestjs/practice 的 docker compose（postgres、redis、mailpit）在跑。不會被 local-verify 執行（檔名不是 *.test.ts）
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const practice = join(import.meta.dirname, '..', '..', '..')
const code = join('verify', `smoke-${process.pid}-saas`)
const dir = join(practice, code)
mkdirSync(dir, { recursive: true })
let status = 1
try {
  writeFileSync(join(dir, 'reference.json'), '{ "ref": "saas" }\n')
  writeFileSync(join(dir, 'smoke.test.ts'), readFileSync(join(import.meta.dirname, 'contract.smoke.ts'), 'utf8').replaceAll('../../../helpers/', '../../helpers/'))
  const prep = spawnSync(process.execPath, ['prepare.mjs', code], { cwd: practice, stdio: 'inherit' })
  if (prep.status === 0) status = spawnSync('npx', ['vitest', 'run', code], { cwd: practice, stdio: 'inherit' }).status ?? 1
} finally {
  if (!process.argv.includes('--keep')) rmSync(dir, { recursive: true, force: true })
}
process.exit(status)
