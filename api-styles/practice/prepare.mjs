// check.mjs 每次跑測試前先執行：node prepare.mjs <work/NN 或 verify/NN-pid-label>（cwd 是 practice/）
// 題目資料夾裡有 buf.gen.yaml（第 8 課起）：重新產生 protobuf 程式碼，學習者改了 .proto 不用自己記得重產
// 題目資料夾裡有 codegen.ts（第 7 課）：重新執行 graphql-codegen；失敗不擋測試，由那一題的測試說明怎麼修
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter, join, resolve } from 'node:path'

const dir = resolve(process.argv[2])
const env = { ...process.env, PATH: join(import.meta.dirname, 'node_modules', '.bin') + delimiter + process.env.PATH }
const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, env, encoding: 'utf8' })

if (existsSync(join(dir, 'buf.gen.yaml'))) {
  const r = run('buf', ['generate'])
  if (r.error || r.status !== 0) {
    console.error(`buf generate 失敗，.proto 沒辦法產生程式碼：\n${(r.stderr || r.stdout || r.error?.message || '').trim()}\n` +
      `檢查 .proto 的語法（錯誤訊息的「檔名:行:欄」就是出錯的位置），修好再跑一次 node check.mjs api-styles ${dir.split(/[\\/]/).pop().split('-')[0]}`)
    process.exit(1)
  }
}

if (existsSync(join(dir, 'codegen.ts'))) {
  const r = run('graphql-codegen', ['--config', 'codegen.ts', '--silent'])
  if (r.error || r.status !== 0) console.log(`graphql-codegen 沒有成功（codegen 那一題會說明怎麼修）：\n${(r.stderr || r.stdout || r.error?.message || '').trim().slice(0, 1500)}`)
}
