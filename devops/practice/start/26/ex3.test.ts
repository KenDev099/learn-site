// 練習 3：在持續負載下部署、回滾，部署失敗時不切流量
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireDocker } from '../../helpers/docker.ts'
import { dc, load, psql, release, reset, runAsync, sleep, tail, up, version, why } from './lib.ts'

const dir = import.meta.dirname
let ready = ''        // 環境準備失敗的原因
let v2 = '', v21 = '', v3 = ''

before(() => {
  requireDocker()
  reset(dir)
  const u = up(dir)
  if (u.code !== 0) { ready = `sh up.sh 失敗（結束碼 ${u.code}，先完成練習 2）：\n${why(u)}`; return }
  const built = (['2.0.0', '2.1.0', '3.0.0'] as const).map(v => release(dir, v))
  const bad = built.find(r => r.code !== 0)
  if (bad) { ready = `建置 2.0.0、2.1.0、3.0.0 失敗（先完成練習 1）：\n${tail(bad.stderr)}`; return }
  ;[v2, v21, v3] = built.map(r => r.stdout.split('\n').at(-1)!)
})
after(() => reset(dir))

const env = () => assert.equal(ready, '', ready)
const active = () => /api-(blue|green):3000/.exec(readFileSync(join(dir, 'nginx', 'active.conf'), 'utf8'))?.[1]

// 一邊送負載一邊執行腳本，回傳腳本結果與負載期間的失敗
async function underLoad(script: string, ...args: string[]) {
  const l = load(dir, 20)
  await sleep(1500)
  const r = await runAsync('sh', [script, ...args], { cwd: dir, timeout: 240_000 })
  await sleep(2500)
  await l.stop()
  return { r, l }
}
const failed = (l: { failures: string[] }) => `負載期間有 ${l.failures.length} 個請求失敗：\n${l.failures.slice(0, 6).join('\n')}`

test('deploy.sh 在負載下把 2.0.0 送上線：零失敗，migration 已套用，舊版本留著', { timeout: 300_000 }, async () => {
  env()
  const before = active()
  const { r, l } = await underLoad('deploy.sh', v2)
  assert.equal(r.code, 0, `sh deploy.sh ${v2} 失敗：\n${tail(r.stdout + '\n' + r.stderr)}`)
  assert.equal(await version(dir), '2.0.0', 'deploy.sh 結束後 https://localhost:18263/version 還不是 2.0.0：切流量要改 nginx/active.conf 再 nginx -s reload')
  assert.deepEqual(l.failures, [], failed(l) + '\n新版本要先啟動、/health/ready 通過、才切流量；舊版本不能先停')
  const col = psql(dir, "SELECT count(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'loyalty_points'")
  assert.equal(col.stdout, '1', 'orders 沒有 loyalty_points 欄位：deploy.sh 要先用新映像跑 migrate（MIGRATE_IMAGE=… docker compose run --rm migrate）')
  assert.notEqual(active(), before, 'nginx/active.conf 指向的顏色沒有換：藍綠部署是把新版本放到另一個顏色，再切過去')
  const old = dc(dir, 'ps', '-q', `api-${before}`).stdout.split('\n').filter(Boolean)
  assert.equal(old.length, 2, `舊的 api-${before} 不見了：留著它，回滾才能立即切回去`)
})

test('再部署 2.1.0：這次流量在 green，新版本要放到 blue；零失敗，2.0.0 留著', { timeout: 300_000 }, async () => {
  env()
  assert.equal(await version(dir), '2.0.0', '先讓上一個測試（部署 2.0.0）通過')
  const before = active()
  const { r, l } = await underLoad('deploy.sh', v21)
  assert.equal(r.code, 0, `sh deploy.sh ${v21} 失敗：\n${tail(r.stdout + '\n' + r.stderr)}`)
  assert.notEqual(active(), before, `流量原本在 api-${before}，部署後 active.conf 還是指向它：新顏色要從 active.conf 判斷（現在的另一個），不能寫死`)
  assert.equal(await version(dir), '2.1.0', 'deploy.sh 結束後 /version 不是 2.1.0')
  assert.deepEqual(l.failures, [], failed(l) + '\n不能重建正在接流量的那一組')
  const old = dc(dir, 'ps', '-q', `api-${before}`).stdout.split('\n').filter(Boolean)
  assert.equal(old.length, 2, `上一版的 api-${before} 不見了：留著它，回滾才能立即切回去`)
})

test('2.1.0 有問題：rollback.sh 在負載下立即切回 2.0.0，零失敗', { timeout: 300_000 }, async () => {
  env()
  assert.equal(await version(dir), '2.1.0', '先讓上一個測試（部署 2.1.0）通過')
  const { r, l } = await underLoad('rollback.sh')
  assert.equal(r.code, 0, `sh rollback.sh 失敗：\n${tail(r.stdout + '\n' + r.stderr)}`)
  assert.equal(await version(dir), '2.0.0', 'rollback.sh 結束後版本不是 2.0.0：改 active.conf 之後要 nginx -t、nginx -s reload')
  assert.deepEqual(l.failures, [], failed(l))
})

test('migration 會失敗的 3.0.0：deploy.sh 以非 0 結束，流量留在原本的版本，零失敗', { timeout: 300_000 }, async () => {
  env()
  const was = await version(dir), color = active()
  const { r, l } = await underLoad('deploy.sh', v3)
  assert.notEqual(r.code, 0, 'migration 失敗了，deploy.sh 卻以 0 結束：set -e，或檢查每一步的結束碼')
  assert.equal(await version(dir), was, `部署失敗後版本變成 ${await version(dir)}：migration 失敗就要停下來，不能切流量`)
  assert.equal(active(), color, 'deploy.sh 失敗了，nginx/active.conf 卻被改掉')
  assert.deepEqual(l.failures, [], failed(l))
})

test('另一個顏色沒有在跑時，rollback.sh 拒絕切換、以非 0 結束，流量不動', { timeout: 120_000 }, async () => {
  env()
  const was = await version(dir), color = active()
  const other = color === 'blue' ? 'green' : 'blue'
  const stop = dc(dir, 'stop', '--timeout', '3', `api-${other}`)
  assert.equal(stop.code, 0, stop.stderr)
  const r = await runAsync('sh', ['rollback.sh'], { cwd: dir, timeout: 60_000 })
  assert.notEqual(r.code, 0, `api-${other} 已經停了，rollback.sh 還是以 0 結束：切過去之前，先確認另一個顏色的每個副本都在跑、/health/ready 回 200`)
  assert.equal(active(), color, `rollback.sh 把流量切到沒有在跑的 api-${other}`)
  assert.equal(await version(dir), was, '回滾失敗後，流量要留在原本的版本')
})
