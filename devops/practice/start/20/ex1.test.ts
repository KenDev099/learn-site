// 練習 1：用 OpenTofu 寫出咖啡店的本機環境，plan／apply、冪等、漂移
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docker, inspect, requireDocker, run } from '../../helpers/docker.ts'
import { API_IMAGE, cleanup, ensureImages, tail, tofuRunner } from './tofu.ts'

const dir = import.meta.dirname
const password = randomBytes(12).toString('hex')
const env = { TF_VAR_db_password: password, TF_VAR_api_image: API_IMAGE, TF_VAR_state_passphrase: randomBytes(12).toString('hex') }
let runner: ReturnType<typeof tofuRunner> | undefined
const tf = (args: string[], extra = {}) => runner!.tofu([...args, '-no-color', ...(['fmt', 'show'].includes(args[0]) ? [] : ['-input=false'])], { ...env, ...extra })
const resetState = () => { for (const f of ['terraform.tfstate', 'terraform.tfstate.backup', 'ex1.plan']) rmSync(join(dir, f), { force: true }) }
let staticOk = false, applied = false

async function ready(timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < end) {
    try {
      const res = await fetch('http://127.0.0.1:18200/health/ready', { signal: AbortSignal.timeout(2_000) })
      if (res.status === 200) return
      last = `${res.status} ${await res.text()}`
    } catch (e) { last = String((e as Error).cause ?? e) }
    await new Promise(r => setTimeout(r, 500))
  }
  assert.fail(`http://127.0.0.1:18200/health/ready ${timeoutMs / 1000} 秒內沒有回 200（最後一次：${last}）。用 docker logs ld-20-api 看 api 為什麼連不上資料庫：DATABASE_URL 的主機要寫 db 容器的名稱，兩個容器要在同一個網路`)
}

before(() => {
  requireDocker()
  ensureImages(dir)
  cleanup('ld-20-')
  resetState()
  runner = tofuRunner(dir, 'ex1')
})
after(() => {
  if (applied) tf(['destroy', '-auto-approve'])
  runner?.stop()
  cleanup('ld-20-')
  resetState()
})

test('.gitignore 排除 state 與 .terraform/，但不排除 .terraform.lock.hcl', () => {
  const repo = mkdtempSync(join(tmpdir(), 'ld-20-git-'))
  try {
    const git = (...a: string[]) => run('git', ['-c', 'init.defaultBranch=main', ...a], { cwd: repo, env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
    git('init', '-q')
    if (existsSync(join(dir, '.gitignore'))) copyFileSync(join(dir, '.gitignore'), join(repo, '.gitignore'))
    const ignored = (p: string) => git('check-ignore', '--no-index', '-q', p).code === 0
    for (const p of ['terraform.tfstate', 'terraform.tfstate.backup', 'terraform.tfstate.1730000000.backup', 'envs/prod/terraform.tfstate'])
      assert.ok(ignored(p), `.gitignore 沒有排除 ${p}：state 裡有密碼，用 *.tfstate 與 *.tfstate.* 排除所有 state 檔`)
    assert.ok(ignored('.terraform/providers/x'), '.gitignore 沒有排除 .terraform/：那是 tofu init 下載的 provider，每台電腦自己產生')
    assert.ok(!ignored('.terraform.lock.hcl'), '.terraform.lock.hcl 被排除了：它鎖定 provider 版本與雜湊，要提交到 git（寫 .terraform/ 而不是 .terraform*）')
    assert.ok(!ignored('main.tf'), 'main.tf 被排除了：.gitignore 只排除 state 和 .terraform/')
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('init、fmt -check、plan 通過（第一次 plan 有變更：exit 2）；變數與映像的寫法安全', () => {
  const init = tf(['init'])
  assert.equal(init.code, 0, `tofu init 失敗：\n${tail(init)}`)
  const fmt = tf(['fmt', '-check', '-recursive'])
  assert.equal(fmt.code, 0, `tofu fmt -check 不通過，這些檔案的格式要整理：${fmt.stdout}\n執行 sh tofu.sh fmt 自動整理`)
  const plan = tf(['plan', '-detailed-exitcode', '-out=ex1.plan'])
  assert.notEqual(plan.code, 1, `tofu plan 失敗：\n${tail(plan)}`)
  assert.equal(plan.code, 2, `第一次 plan -detailed-exitcode 應該是 2（有變更），實際是 ${plan.code}：\n${tail(plan)}`)
  const json = JSON.parse(tf(['show', '-json', 'ex1.plan']).stdout)
  const vars = json.configuration?.root_module?.variables ?? {}
  assert.ok(vars.db_password, '要宣告 variable "db_password"')
  assert.equal(vars.db_password.sensitive, true, 'db_password 要加 sensitive = true，plan 和 apply 的輸出才不會印出密碼')
  assert.ok(!('default' in vars.db_password), 'db_password 不能有 default：寫在 .tf 的預設值會被提交到 git。值從環境變數 TF_VAR_db_password 傳入')
  assert.ok(vars.api_image && !('default' in vars.api_image), '要宣告沒有預設值的 variable "api_image"，api 容器的映像由它決定')
  const out = json.configuration?.root_module?.outputs?.api_url
  assert.ok(out, '要宣告 output "api_url"')
  assert.ok((out.expression?.references ?? []).some((r: string) => r.startsWith('docker_container.')),
    'output "api_url" 要引用 api 容器的屬性（例如 docker_container.api.ports[0].external）組出網址，不能直接寫死字串：port 改了，輸出要跟著變')
  const res = json.planned_values?.root_module?.resources ?? []
  const byName = (n: string) => res.find((r: any) => r.type === 'docker_container' && r.values?.name === n)
  assert.ok(byName('ld-20-db') && byName('ld-20-api'), '要有兩個 docker_container：名稱 ld-20-db 與 ld-20-api')
  const pgRefs = res.filter((r: any) => r.type === 'docker_image' || r.type === 'docker_container')
    .map((r: any) => String(r.type === 'docker_image' ? r.values?.name : r.values?.image ?? ''))
    .filter((s: string) => /postgres/.test(s))
  assert.ok(pgRefs.length, '找不到 postgres 映像：用 docker_image 資源（或直接在 db 容器的 image）指定 postgres')
  for (const s of pgRefs) assert.match(s, /@sha256:[0-9a-f]{64}$/, `postgres 映像寫成 ${s}：要用 digest 指定（postgres:18.6-alpine3.24@sha256:…），標籤會移動，digest 不會`)
  const badPlan = tf(['plan', '-refresh=false'], { TF_VAR_api_image: 'learn-devops/cafe-api:latest' })
  assert.notEqual(badPlan.code, 0, 'TF_VAR_api_image=learn-devops/cafe-api:latest 時 plan 要失敗：在 api_image 加 validation，擋下 latest')
  staticOk = true
})

test('apply 剛才的 plan 檔後 api 的 /health/ready 回 200，輸出 api_url', async () => {
  assert.ok(staticOk, '上一項沒有通過，先修好再 apply')
  applied = true
  const apply = tf(['apply', 'ex1.plan'])
  rmSync(join(dir, 'ex1.plan'), { force: true })
  assert.equal(apply.code, 0, `tofu apply 失敗：\n${tail(apply)}`)
  await ready()
  const url = apply.stdout.match(/^api_url = "(.*)"$/m)?.[1]
  assert.equal(url, 'http://127.0.0.1:18200', `output api_url 應該是 http://127.0.0.1:18200，實際是 ${url ?? '（沒有這個 output）'}`)
})

test('容器只發布在 127.0.0.1:18200；db 有 healthcheck、掛 ld-20-pgdata；兩個容器都在 ld-20-net', () => {
  assert.ok(applied, '上一項沒有通過')
  const api = inspect('ld-20-api'), db = inspect('ld-20-db')
  assert.ok(api && db, '找不到 ld-20-api 或 ld-20-db 容器')
  const binds = Object.values(api.HostConfig.PortBindings ?? {}).flat() as any[]
  assert.ok(binds.length, 'ld-20-api 沒有發布 port：加上 ports { internal = 3000, external = 18200, ip = "127.0.0.1" }')
  for (const b of binds) assert.equal(b.HostIp, '127.0.0.1', `ld-20-api 發布在 ${b.HostIp || '0.0.0.0'}:${b.HostPort}：ports 要寫 ip = "127.0.0.1"，不然同一個 Wi-Fi 的人都連得到`)
  assert.equal(Object.keys(db.HostConfig.PortBindings ?? {}).length, 0, 'ld-20-db 不應該發布 port：api 透過 ld-20-net 連它')
  assert.ok(db.Config.Healthcheck?.Test?.length, 'ld-20-db 沒有 healthcheck：加 healthcheck { test = ["CMD-SHELL", "pg_isready …"] … }')
  assert.ok(db.Mounts.some((m: any) => m.Type === 'volume' && m.Name === 'ld-20-pgdata'), 'ld-20-db 要把 volume ld-20-pgdata 掛到 /var/lib/postgresql')
  for (const c of [api, db]) assert.ok('ld-20-net' in (c.NetworkSettings.Networks ?? {}), `${c.Name} 不在 ld-20-net：加 networks_advanced { name = docker_network.cafe.name }`)
})

test('冪等：再 plan 一次沒有變更（exit 0）', () => {
  assert.ok(applied, '上一項沒有通過')
  const plan = tf(['plan', '-detailed-exitcode'])
  assert.equal(plan.code, 0, `apply 之後再 plan 應該是 0（沒有變更），實際是 ${plan.code}：\n${tail(plan, 30)}\n常見原因：某個屬性寫的值跟 Docker 回報的不一樣（例如映像寫名稱、state 存的是 ID），每次都想改`)
})

test('漂移：手動刪掉 api 容器後 plan 會發現並要重建，apply 修好', async () => {
  assert.ok(applied, '上一項沒有通過')
  docker('rm', '-f', 'ld-20-api')
  const plan = tf(['plan', '-detailed-exitcode'])
  assert.equal(plan.code, 2, `有人刪掉 ld-20-api 之後 plan 應該是 2，實際是 ${plan.code}：\n${tail(plan)}`)
  assert.match(plan.stdout, /docker_container\.\w+ will be created/, 'plan 應該要建立 api 容器')
  const apply = tf(['apply', '-auto-approve'])
  assert.equal(apply.code, 0, `tofu apply 失敗：\n${tail(apply)}`)
  await ready()
})
