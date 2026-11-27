// 練習 4：契約檢查，一個指令跑完：在 work/12 執行 node contracts/run.ts
// 要做到：steps 依序有四步（名稱照寫，測試靠它判斷是哪一步失敗）
// - graphql-schema：findSchemaChanges(baseline, 目前)；有 BreakingChangeType 裡的變更就失敗，其他（dangerous、safe）只印出提醒
//   baseline 是 contracts/baseline/schema.graphql（線上正在用的版本），只讀不寫
// - buf-breaking：執行 buf breaking --against contracts/baseline/proto（cwd 是 work/12）
// - pact-consumer：執行 node --test contracts/consumer.ts
// - pact-provider：執行 node --test contracts/provider.ts
// 成功印「✓ 步驟名稱」；失敗印「✗ 步驟名稱」與原因、停止後面的步驟，並以非 0 結束
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)                         // await run(執行檔, [參數…], { cwd: root })：非 0 結束時會丟錯
const root = new URL('..', import.meta.url).pathname    // work/12/
const bin = (name: string) => new URL(`../../../node_modules/.bin/${name}`, import.meta.url).pathname   // bin('buf')
const read = (path: string) => readFileSync(new URL(path, new URL('..', import.meta.url)), 'utf8')     // read('graphql/schema.graphql')
void run; void root; void bin; void read

const steps: [string, () => unknown][] = [
]

for (const [name, step] of steps) {
  try {
    await step()
    console.log(`✓ ${name}`)
  } catch (e) {
    // ✗ 失敗了還繼續跑下一步，而且整個程序最後還是以 0 結束：CI 會以為契約檢查通過
    console.error(`✗ ${name}`, e)
  }
}
