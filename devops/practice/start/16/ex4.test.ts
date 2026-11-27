import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const file = join(dir, '.github', 'workflows', 'deploy.yml')
let wf: any = {}
const jobs = () => wf.jobs ?? {}
const steps = (job: any): any[] => job?.steps ?? []
const uses = (job: any, name: string) => steps(job).filter(s => String(s.uses ?? '').startsWith(name + '@'))
const text = (x: unknown) => JSON.stringify(x ?? null)
const needs = (job: any): string[] => [job?.needs ?? []].flat()
const envName = (job: any) => typeof job?.environment === 'string' ? job.environment : job?.environment?.name
const group = (c: any) => typeof c === 'string' ? c : c?.group
const DEPLOYS = ['deploy-staging', 'deploy-production']

before(() => {
  let src: string
  try { src = readFileSync(file, 'utf8') } catch { throw new Error('找不到 .github/workflows/deploy.yml') }
  wf = parse(src) ?? {}
})

test('actionlint 沒有問題', () => {
  requireDocker()
  const r = run('docker', ['run', '--rm', '-v', `${join(dir, '.github')}:/repo/.github:ro`, '--workdir', '/repo', 'rhysd/actionlint:1.7.12', '-no-color', '.github/workflows/deploy.yml'], { timeout: 180_000 })
  assert.equal(r.code, 0, `actionlint 找到問題：\n${(r.stdout || r.stderr).slice(-1200)}`)
})

test('觸發：push 到 main 與手動觸發；預設權限只有 contents: read', () => {
  assert.deepEqual([wf.on?.push?.branches ?? []].flat(), ['main'], 'on.push.branches 要是 [main]')
  assert.ok(wf.on && 'workflow_dispatch' in wf.on, '要能手動觸發：加上 workflow_dispatch')
  assert.deepEqual(wf.permissions, { contents: 'read' }, '最上層的 permissions 只給 contents: read，需要更多權限的 job 自己加')
})

test('build job：最小權限、登入 GHCR、sha tag、gha 快取、輸出 digest', () => {
  const b = jobs().build
  assert.ok(b, '要有一個叫 build 的 job')
  assert.deepEqual(b.permissions, { contents: 'read', packages: 'write' }, 'build 的 permissions 要是 contents: read 與 packages: write（推映像到 GHCR 需要）')
  assert.ok(uses(b, 'actions/checkout').length, 'build 要先用 actions/checkout 取得程式碼')
  assert.ok(uses(b, 'docker/setup-buildx-action').length, 'build 要先用 docker/setup-buildx-action 建立 builder：預設的 docker driver 只有在開啟 containerd image store 時才支援 type=gha 快取，不要依賴 runner 的設定')
  assert.equal(uses(b, 'docker/login-action')[0]?.with?.registry, 'ghcr.io', '用 docker/login-action 登入 ghcr.io')
  assert.match(String(uses(b, 'docker/metadata-action')[0]?.with?.tags ?? ''), /type=sha/, 'docker/metadata-action 的 tags 要有 type=sha')
  const push = uses(b, 'docker/build-push-action')[0]
  assert.ok(push, 'build 要用 docker/build-push-action')
  assert.equal(push.with?.push, true, 'build-push-action 要 push: true')
  assert.match(String(push.with?.['cache-from'] ?? ''), /type=gha/, 'build-push-action 的 cache-from 要用 type=gha')
  assert.match(String(push.with?.['cache-to'] ?? ''), /type=gha/, 'build-push-action 的 cache-to 要用 type=gha')
  assert.ok(push.id, 'build-push-action 那一步要有 id，才能讀它的 outputs.digest')
  assert.equal(String(b.outputs?.digest ?? '').replace(/\s/g, ''), `\${{steps.${push.id}.outputs.digest}}`, `build 的 outputs.digest 要是 \${{ steps.${push.id}.outputs.digest }}`)
})

test('部署 job：staging → production，用同一個 digest，不重新建置、不用 latest', () => {
  const s = jobs()['deploy-staging'], p = jobs()['deploy-production']
  assert.ok(s && p, '要有 deploy-staging 與 deploy-production 兩個 job')
  assert.equal(envName(s), 'staging', 'deploy-staging 的 environment 要是 staging')
  assert.equal(envName(p), 'production', 'deploy-production 的 environment 要是 production（在 GitHub 上設必要審查者，這裡就會等核准）')
  assert.ok(needs(s).includes('build'), 'deploy-staging 要 needs: build')
  assert.ok(needs(p).includes('deploy-staging'), 'deploy-production 要在 deploy-staging 之後（needs 加上 deploy-staging）')
  assert.ok(needs(p).includes('build'), 'deploy-production 要讀 needs.build.outputs.digest，needs 裡就要有 build')
  for (const name of DEPLOYS) {
    const j = jobs()[name], t = text(steps(j))
    assert.match(t, /needs\.build\.outputs\.digest/, `${name} 要用 needs.build.outputs.digest 部署`)
    assert.doesNotMatch(t, /build-push-action|docker (buildx )?build|docker\/bake-action/, `${name} 不能自己建置映像：部署的必須是 build 推上去、測過的同一個產物`)
    assert.doesNotMatch(t, /latest/, `${name} 不能用 latest：latest 會被下一次推送改掉，部署和回滾都會指錯版本`)
    assert.doesNotMatch(text(j.permissions), /packages.{0,4}write/, `${name} 不需要 packages: write`)
  }
})

test('production 一次只跑一個部署，進行中的不會被取消', () => {
  const p = jobs()['deploy-production']
  assert.equal(group(p?.concurrency), 'deploy-production', 'deploy-production 要設 concurrency 群組 deploy-production')
  assert.notEqual(p?.concurrency?.['cancel-in-progress'], true, 'cancel-in-progress 不能是 true：部署做到一半被砍，伺服器會停在半新半舊的狀態')
  assert.notEqual(wf.concurrency?.['cancel-in-progress'], true, '整個 workflow 的 concurrency 也不能 cancel-in-progress: true，會砍掉進行中的部署')
})

test('所有 uses 都釘完整的 commit SHA', () => {
  const all = Object.entries(jobs()).flatMap(([n, j]) => steps(j).filter(s => s.uses).map(s => [n, String(s.uses)]))
  assert.ok(all.length >= 4, '至少要用到 checkout、login、metadata、build-push 這幾個 action')
  for (const [n, u] of all) assert.match(u, /@[0-9a-f]{40}$/, `${n} 的 ${u} 沒有釘到 40 碼的 commit SHA：tag 可以被改指向別的程式（第 15 課）`)
})
