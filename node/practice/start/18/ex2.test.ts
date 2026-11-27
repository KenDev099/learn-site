import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { startServer } from '../../helpers/proc.ts'

// 程序結束要關掉 listening socket，機器很忙時可能要好幾秒，所以等待時間放寬
const opts = { timeout: 30_000 }
const WAIT_MS = 10_000
const main = join(import.meta.dirname, 'main.ts')

async function crash(bug: 'exception' | 'rejection') {
  const tag = randomBytes(4).toString('hex')
  const s = await startServer(main, { env: { BUG: bug, JOB_DELAY_MS: '300', REPORT_TAG: tag } })
  const res = await fetch(s.url)
  assert.equal(res.status, 200, '出錯之前伺服器要能正常回應')
  await res.text()
  // 排程工作在 300ms 後出錯，之後要自己結束；沒結束的（接住錯誤後繼續跑）等到 WAIT_MS 判錯
  const ended = await Promise.race([s.exited.then(() => true), sleep(WAIT_MS).then(() => false)])
  const { code, signal } = await s.stop('SIGKILL')
  assert.ok(ended, `BUG=${bug}：出錯之後程序 ${WAIT_MS / 1000} 秒內沒有結束。接住錯誤之後不能繼續跑，記完 log 要結束程序。stderr：${s.out.stderr.slice(0, 300)}`)
  assert.equal(signal, null, `BUG=${bug}：程序是被 signal 結束的，要自己用 process.exit(1) 結束`)
  assert.equal(code, 1, `BUG=${bug}：結束碼要是 1（不是 0），監督者和部署平台才知道它是壞掉才結束的`)
  const lines = s.out.stderr.split('\n').flatMap(l => { try { const j = JSON.parse(l); return j && typeof j === 'object' ? [j] : [] } catch { return [] } })
  const fatal = lines.find(j => j.level === 'fatal')
  assert.ok(fatal, `BUG=${bug}：stderr 要有一行 JSON，level 是 "fatal"。stderr：${s.out.stderr.slice(0, 300)}`)
  assert.equal(typeof fatal.errorId, 'string', 'fatal log 要有 errorId（字串）')
  assert.ok(fatal.errorId.length >= 8, 'errorId 要夠長，才找得到、不會重複（用 crypto.randomUUID()）')
  assert.equal(typeof fatal.msg, 'string', 'fatal log 要有 msg')
  return { fatal, tag }
}

const ids: string[] = []

test('排程工作同步 throw（uncaughtException）：fatal JSON、結束碼 1', opts, async () => {
  const { fatal } = await crash('exception')
  ids.push(fatal.errorId)
  assert.equal(fatal.name, 'TypeError', 'fatal log 的 name 要是錯誤的名稱 TypeError')
  assert.match(String(fatal.message), /price/, 'fatal log 的 message 要是原始錯誤的訊息（讀 undefined 的 price）')
})

test('忘了 await 的 rejection（unhandledRejection）：fatal JSON、結束碼 1、errorId 每次不同', opts, async () => {
  const { fatal, tag } = await crash('rejection')
  assert.equal(fatal.name, 'Error', 'fatal log 的 name 要是 Error')
  assert.ok(String(fatal.message).includes(tag), 'fatal log 的 message 要是 rejection 原本的訊息（含 REPORT_TAG）')
  assert.ok(!ids.includes(fatal.errorId), 'errorId 每次都要重新產生（crypto.randomUUID()），不能寫死')
})
