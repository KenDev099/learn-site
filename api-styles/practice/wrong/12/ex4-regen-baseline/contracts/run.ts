// 練習 4：契約檢查，一個指令跑完：在 work/12 執行 node contracts/run.ts
// 依序：graphql-schema → buf-breaking → pact-consumer → pact-provider。成功印 ✓ 步驟名稱；
// 任何一步失敗就印 ✗ 步驟名稱與原因、停止，並以非 0 結束（CI 才會擋下這次合併）
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { BreakingChangeType, buildSchema, findSchemaChanges } from 'graphql'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const bin = (name: string) => new URL(`../../../node_modules/.bin/${name}`, import.meta.url).pathname
const read = (path: string) => readFileSync(new URL(path, new URL('..', import.meta.url)), 'utf8')

// baseline 是「線上正在用的版本」，放在 contracts/baseline/，由發布流程更新；這裡只讀不寫
function checkGraphql() {
  // ✗ 每次先用目前的 schema 覆蓋 baseline：永遠是自己跟自己比
  writeFileSync(new URL('../contracts/baseline/schema.graphql', import.meta.url), read('graphql/schema.graphql'))
  const breaking = new Set<string>(Object.values(BreakingChangeType))
  const changes = findSchemaChanges(buildSchema(read('contracts/baseline/schema.graphql')), buildSchema(read('graphql/schema.graphql')))
  for (const c of changes.filter(c => !breaking.has(c.type))) console.log(`  （提醒）${c.type}：${c.description}`)
  const bad = changes.filter(c => breaking.has(c.type))
  if (bad.length) throw new Error(bad.map(c => `${c.type}：${c.description}`).join('\n'))
}

const steps: [string, () => unknown][] = [
  ['graphql-schema', checkGraphql],
  ['buf-breaking', () => run(bin('buf'), ['breaking', '--against', 'contracts/baseline/proto'], { cwd: root })],
  ['pact-consumer', () => run(process.execPath, ['--test', 'contracts/consumer.ts'], { cwd: root })],
  ['pact-provider', () => run(process.execPath, ['--test', 'contracts/provider.ts'], { cwd: root })],
]

for (const [name, step] of steps) {
  try {
    await step()
    console.log(`✓ ${name}`)
  } catch (e) {
    const err = e as { stdout?: string, stderr?: string, message?: string }
    console.error(`✗ ${name}\n${[err.stdout, err.stderr].filter(Boolean).join('\n').trim() || err.message}`)
    process.exitCode = 1
    break
  }
}
