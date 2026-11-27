// 練習 2：讀懂 plan。測試自己 apply plan/v1、換成 plan/v2 後產生 plan JSON，算出正確答案再跟 plan-review.json 比對
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, requireDocker } from '../../helpers/docker.ts'
import { cleanup, ensureImages, tail, tofuRunner } from './tofu.ts'

const dir = import.meta.dirname
const lab = join(dir, '.check-plan')
type Change = { address: string, type: string, change: { actions: string[] } }
let changes: Change[] = []
let setupError = ''
let runner: ReturnType<typeof tofuRunner> | undefined

const kind = (a: string[]) => a.length === 2 ? 'replace' : a[0]   // ["delete","create"] 或 ["create","delete"] 都是重建

before(() => {
  requireDocker()
  ensureImages(dir)
  cleanup('ld-20-plan-')
  rmSync(lab, { recursive: true, force: true })
  mkdirSync(lab)
  copyFileSync(join(dir, 'plan/v1/main.tf'), join(lab, 'main.tf'))
  runner = tofuRunner(dir, 'ex2')
  const tofu = (args: string[]) => runner!.tofu(args, {}, '.check-plan')
  for (const args of [['init', '-input=false'], ['apply', '-auto-approve', '-input=false']]) {
    const r = tofu([...args, '-no-color'])
    if (r.code !== 0) { setupError = `套用 plan/v1 失敗（tofu ${args[0]}）：\n${tail(r)}`; return }
  }
  copyFileSync(join(dir, 'plan/v2/main.tf'), join(lab, 'main.tf'))
  const plan = tofu(['plan', '-out=plan.bin', '-input=false', '-no-color'])
  if (plan.code !== 0) { setupError = `plan v2 失敗：\n${tail(plan)}`; return }
  changes = JSON.parse(tofu(['show', '-json', 'plan.bin']).stdout).resource_changes
    .filter((c: Change) => !c.change.actions.includes('no-op') && !c.change.actions.includes('read'))
})
after(() => {
  runner?.stop()
  cleanup('ld-20-plan-')
  rmSync(lab, { recursive: true, force: true })
})

const sorted = (x: unknown) => (Array.isArray(x) ? x.map(String) : []).sort()

test('actions：每個有變更的資源標出 create／update／replace／delete', () => {
  assert.equal(setupError, '', setupError)
  assert.ok(changes.some(c => kind(c.change.actions) === 'replace') && changes.some(c => kind(c.change.actions) === 'delete'),
    'plan/v1 與 plan/v2 被改過了：從起始檔把它們複製回來（這一題只改 plan-review.json）')
  const review = readJson(dir, 'plan-review.json')
  const actions = review.actions ?? {}
  const expected = Object.fromEntries(changes.map(c => [c.address, kind(c.change.actions)]))
  for (const k of Object.keys(actions))
    assert.ok(k in expected, `${k} 不在 plan 的變更裡：只列出有變更的資源（no-op 的不要列），位址寫成 docker_container.api 這種格式`)
  for (const [addr, want] of Object.entries(expected)) {
    const got = actions[addr]
    assert.ok(got, `少了 ${addr}：它在 plan 裡有變更`)
    if (want === 'replace' && got === 'update')
      assert.fail(`${addr} 標成 update，但 plan 是 -/+（must be replaced）：看 plan 裡標著 # forces replacement 的屬性。docker provider 改容器的 env、image、volumes 都要刪掉重建`)
    assert.equal(got, want, `${addr} 是 ${want}，你標成 ${got}`)
  }
})

test('downtime：會讓服務中斷的資源（容器被刪掉或重建）', () => {
  assert.equal(setupError, '', setupError)
  const review = readJson(dir, 'plan-review.json')
  const want = changes.filter(c => c.type === 'docker_container' && c.change.actions.includes('delete')).map(c => c.address).sort()
  assert.deepEqual(sorted(review.downtime), want, `downtime 應該列出被刪掉或重建的容器。重建（-/+）是先刪後建，中間容器不存在；原地更新（~）不會停`)
})

test('dataLoss：會遺失資料的資源（volume 被刪掉或重建）', () => {
  assert.equal(setupError, '', setupError)
  const review = readJson(dir, 'plan-review.json')
  const want = changes.filter(c => c.type === 'docker_volume' && c.change.actions.includes('delete')).map(c => c.address).sort()
  const got = sorted(review.dataLoss)
  for (const a of got.filter(a => a.startsWith('docker_container.')))
    assert.fail(`${a} 重建不會遺失資料：資料在 volume 裡，容器重建後掛回同一個 volume。dataLoss 只列 volume`)
  assert.deepEqual(got, want, `dataLoss 應該列出被刪掉的 volume：從程式碼移除的 volume，apply 時會被 docker volume rm，裡面的檔案就沒了`)
})
