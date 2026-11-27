import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const report = join(import.meta.dirname, 'report.ts')
const opts = { timeout: 15_000 }

// 讀 stdout 的人很慢：等程式結束（或 2 秒）才開始讀，模擬輸出接到忙碌的 log 收集器
// 輸出接到管道時是非同步寫出，正常結束的程式會等輸出寫完；process.exit() 會把還沒寫出去的丟掉
async function runSlowReader() {
  const env: Record<string, string | undefined> = { ...process.env, PORT: '0', NO_COLOR: '1' }
  delete env.NODE_TEST_CONTEXT
  const child = spawn(process.execPath, [report], { env })
  const closed = once(child, 'close')
  const exited = once(child, 'exit')
  const killer = setTimeout(() => child.kill('SIGKILL'), 4_000)
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', s => { stderr += s })
  await Promise.race([exited, sleep(2_000)])
  let stdout = ''
  child.stdout.setEncoding('utf8').on('data', s => { stdout += s })
  const [code, signal] = await closed
  clearTimeout(killer)
  return { code, signal, stdout: stdout.replace(/\r\n/g, '\n'), stderr }
}

test('做完就自然結束：4 秒內結束、結束碼 0、輸出完整', opts, async () => {
  const r = await runSlowReader()
  assert.notEqual(r.signal, 'SIGKILL', '程式 4 秒內沒有結束：計時器（setInterval）和狀態伺服器都要關掉，event loop 裡還有東西撐著程序就不會結束')
  assert.equal(r.code, 0, `結束碼要是 0。stderr：${r.stderr.slice(0, 300)}`)
  const lines = r.stdout.trimEnd().split('\n')
  assert.ok(lines.filter(l => l === '處理中…').length >= 3, '處理期間要照常每 100ms 印「處理中…」（至少 3 行）')
  assert.equal(lines.filter(l => l.startsWith('#')).length, 20_000, '2 萬行明細要完整印出來。少了的話，是不是用 process.exit() 收尾？輸出接到管道時是非同步寫出，exit 會把還沒寫完的丟掉')
  assert.equal(lines.at(-1), '報表完成', '最後一行要是「報表完成」')
})
