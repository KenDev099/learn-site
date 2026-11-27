import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireDocker, run, removeContainers, inspect } from '../../helpers/docker.ts'
import { runAsync, load, waitVersion, version } from './lib.ts'

const dir = import.meta.dirname
const BASE = 'http://localhost:18161'
const refs: Record<string, string> = {}
const why = (r: { stdout: string, stderr: string }) => (r.stderr || r.stdout).slice(-800)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const active = () => readFileSync(join(dir, 'nginx', 'active.conf'), 'utf8')
const imageOf = (name: string) => inspect(name)?.Config?.Image ?? '（不存在）'
const running = (name: string) => inspect(name)?.State?.Running === true

// 在持續負載下執行一個腳本，回傳結果與負載期間的失敗請求
async function underLoad(script: string[], afterMs = 1_500) {
  const l = load(BASE, 30)
  await sleep(1_000)
  const started = Date.now()
  const r = await runAsync('sh', script, { cwd: dir, env: { READY_TIMEOUT: '8' }, timeout: 120_000 })
  const took = Date.now() - started
  await sleep(afterMs)
  await l.stop()
  return { r, took, failures: l.failures, sent: l.sent }
}
const noFailures = (f: string[], sent: number, step: string) =>
  assert.equal(f.length, 0, `${step}期間 ${sent} 個請求有 ${f.length} 個失敗，例如：\n${[...new Set(f)].slice(0, 5).join('\n')}`)

before(() => {
  requireDocker()
  // up.sh：registry、v1／v2／壞版本三個映像、blue 跑 v1、nginx；印出 V1=… V2=… BAD=…
  const r = run('sh', ['up.sh'], { cwd: dir, timeout: 600_000 })
  if (r.code !== 0) throw new Error(`sh up.sh 失敗（這個檔案不用改；改過的話從 start/16/up.sh 複製回來）：\n${why(r)}`)
  for (const m of r.stdout.matchAll(/^(V1|V2|BAD)=(\S+)$/gm)) refs[m[1]] = m[2]
  if (!refs.V1 || !refs.V2 || !refs.BAD) throw new Error(`up.sh 沒有印出三個映像參照：\n${r.stdout}`)
})
after(() => {
  removeContainers('ld-16-nginx', 'ld-16-blue', 'ld-16-green', 'ld-16-registry')
  run('docker', ['network', 'rm', 'ld-16-net'])
})

test('在持續負載下部署 v2：沒有失敗的請求，流量換到 v2，v1 的容器還在跑', async () => {
  assert.equal(await version(BASE), 'v1', '一開始應該是 blue 跑 v1（up.sh 的環境）')
  const { r, failures, sent } = await underLoad(['deploy.sh', refs.V2])
  assert.equal(r.code, 0, `sh deploy.sh <v2 的 digest> 失敗（結束碼 ${r.code}）：\n${why(r)}`)
  assert.notEqual(await waitVersion(BASE, 'v2', 3_000), null, `部署完 /version 是 ${await version(BASE)}，應該是 v2：要用參數給的 digest 啟動新容器（不是 latest），而且要切換 upstream`)
  assert.match(active(), /ld-16-green/, 'nginx/active.conf 要指向 ld-16-green（blue 原本在服務，新版本放 green）')
  noFailures(failures, sent, '部署 v2 ')
  assert.ok(running('ld-16-blue'), 'ld-16-blue（v1）不能停掉或刪掉：它要留著給 rollback.sh 立即切回')
  assert.equal(imageOf('ld-16-green'), refs.V2, 'ld-16-green 要用參數給的映像參照（含 @sha256 digest）啟動')
})

test('rollback.sh 直接切回還在跑的 v1，沒有失敗的請求', async () => {
  const blueId = inspect('ld-16-blue')?.Id
  const { r, took, failures, sent } = await underLoad(['rollback.sh'])
  assert.equal(r.code, 0, `sh rollback.sh 失敗（結束碼 ${r.code}）：\n${why(r)}`)
  assert.equal(await version(BASE), 'v1', '回滾後 /version 要是 v1')
  assert.equal(inspect('ld-16-blue')?.Id, blueId, '回滾要用原本那個 ld-16-blue 容器：只切換 upstream 再 reload，不要重建或重啟容器')
  assert.ok(took < 10_000, `rollback.sh 花了 ${took}ms：回滾只該切換 upstream 再 reload，不用重建容器`)
  noFailures(failures, sent, '回滾')
  await sleep(1_000)
})

test('再部署一次 v2 也成功（顏色交替）', async () => {
  const { r, failures, sent } = await underLoad(['deploy.sh', refs.V2])
  assert.equal(r.code, 0, `第二次 sh deploy.sh 失敗（結束碼 ${r.code}）：\n${why(r)}`)
  assert.notEqual(await waitVersion(BASE, 'v2', 3_000), null, `第二次部署完 /version 是 ${await version(BASE)}，應該是 v2`)
  noFailures(failures, sent, '第二次部署 ')
  await sleep(1_000)
})

test('deploy.sh 只接受 @sha256 digest：給 tag 就拒絕，什麼都不動', async () => {
  const conf = active()
  const idle = /ld-16-green/.test(conf) ? 'ld-16-blue' : 'ld-16-green'
  const idleId = inspect(idle)?.Id
  const r = run('sh', ['deploy.sh', 'localhost:18160/cafe-api:v2'], { cwd: dir, env: { READY_TIMEOUT: '8' }, timeout: 120_000 })
  assert.notEqual(r.code, 0, 'sh deploy.sh localhost:18160/cafe-api:v2（tag，不是 digest）成功了：tag 可以被改指向別的映像，deploy.sh 要只接受 …@sha256:… 的參照，其他一律 exit ≠ 0')
  assert.equal(active(), conf, '拒絕部署時 nginx/active.conf 不能被改動')
  assert.equal(inspect(idle)?.Id, idleId, `拒絕部署時不能動到 ${idle}：先檢查參數，再碰容器`)
})

test('部署 /health/ready 永遠失敗的壞版本：deploy.sh 失敗、壞容器被移除、流量留在 v2', async () => {
  const conf = active()
  const now = /ld-16-green/.test(conf) ? 'green' : 'blue', other = now === 'green' ? 'blue' : 'green'
  const { r, failures, sent } = await underLoad(['deploy.sh', refs.BAD])
  assert.notEqual(r.code, 0, '新版本的 /health/ready 一直回 503，deploy.sh 卻成功了：要等到 ready 才切流量，等不到就失敗')
  assert.equal(await version(BASE), 'v2', '壞版本部署失敗後，流量要留在原本的 v2')
  assert.equal(active(), conf, 'deploy.sh 失敗時 nginx/active.conf 不能被改動')
  assert.equal(inspect(`ld-16-${other}`), null, `失敗的新容器 ld-16-${other} 要被移除`)
  assert.ok(running(`ld-16-${now}`), `目前作用中的 ld-16-${now} 要繼續跑`)
  noFailures(failures, sent, '壞版本部署')
})

test('另一個顏色的容器不在時，rollback.sh 拒絕切換', () => {
  // 上一題的壞版本容器已被移除，現在沒有可以切回的顏色
  const conf = active()
  const r = run('sh', ['rollback.sh'], { cwd: dir, timeout: 60_000 })
  assert.notEqual(r.code, 0, '另一個顏色的容器不存在，rollback.sh 卻成功了：切過去 nginx 只會回 502。先用 docker inspect 確認它在跑，沒在跑就 exit ≠ 0')
  assert.equal(active(), conf, 'rollback.sh 拒絕時 nginx/active.conf 不能被改動')
})
