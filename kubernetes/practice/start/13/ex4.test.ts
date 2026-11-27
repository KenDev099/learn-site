// 練習 4：release 生命週期：deploy.sh <tag> 用 helm upgrade --install --wait --timeout --rollback-on-failure
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, freshNamespace, kubeJson, nsName, readText, requireCluster, runScriptAsync } from '../../helpers/k8s.ts'
import { history, seconds, spyHelm, stripComments, trafficDuring } from './helm.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(13, 4)
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=cafe'
const URL = `http://cafe.${ns}.svc.cluster.local/version`
const LIMIT = 280
let staticOk = false, v2Ok = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

async function deploy(tag: string) {
  const spy = spyHelm()
  try {
    const t0 = Date.now()
    const r = await runScriptAsync(dir, 'deploy.sh', [tag], { env: spy.env, timeout: 420_000 })
    return { ...r, secs: Math.round((Date.now() - t0) / 1000), calls: spy.calls() }
  } finally { spy.cleanup() }
}
const upgrades = (calls: string[][]) => calls.filter(a => a[0] === 'upgrade')
const readyImages = () => kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
  .filter((p: any) => !p.metadata.deletionTimestamp && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))
  .map((p: any) => p.spec.containers[0].image)

test('deploy.sh 用 helm upgrade --install，明寫 --wait、--timeout（不超過 3 分鐘）與 --rollback-on-failure，不用 --atomic', { timeout: 10_000 }, () => {
  const sh = stripComments(readText(dir, 'deploy.sh'))
  assert.doesNotMatch(sh, /kubectl\s+(apply|create|replace|set)/, '不要用 kubectl 改叢集：用 kubectl apply 的話 Helm 不知道這次部署，helm history、rollback 都不會有紀錄')
  assert.match(sh, /helm\s+upgrade\b/, '用 helm upgrade --install 部署')
  assert.match(sh, /(--install|\s-i)\b/, 'helm upgrade 要加 --install：第一次部署時 release 還不存在')
  assert.doesNotMatch(sh, /--atomic/, '--atomic 在 Helm 4 改名為 --rollback-on-failure，舊名稱會印出棄用警告')
  assert.match(sh, /--rollback-on-failure/, '加上 --rollback-on-failure：失敗時 Helm 自動回到上一個成功的 revision')
  assert.match(sh, /--wait\b/, '明寫 --wait：不加時 Helm 4 只等 hook，資源送給 API server 就回報成功')
  const t = sh.match(/--timeout[= ]+(\S+)/)
  assert(t, '加上 --timeout 3m：預設 5 分鐘，壞版本要 5 分鐘以上才會失敗與回滾')
  assert(seconds(t[1]) > 0 && seconds(t[1]) <= 180, `--timeout 不要超過 3m（現在是 ${t[1]}）：等太久，壞版本就要卡那麼久才回滾`)
  staticOk = true
})

test('deploy.sh v1、v2 成功：helm history 有 2 個 revision，Pod 都是 v2，換版期間 0 錯誤', { timeout: 900_000 }, async () => {
  assert(staticOk, '先讓上一項（腳本內容的檢查）通過，再部署到叢集')
  freshNamespace(ns)
  const v1 = await deploy('v1')
  assert.equal(v1.code, 0, `deploy.sh v1 應該以 0 結束，實際是 ${v1.code}：${v1.stderr}`)
  const [up] = upgrades(v1.calls)
  assert(up, '腳本沒有呼叫 helm upgrade')
  assert(up.includes('--install') || up.includes('-i'), 'helm upgrade 要加 --install')
  assert(up.some(a => /^image\.tag=v1$/.test(a) || a.endsWith('image.tag=v1')), `要用 --set image.tag=<tag> 把參數傳給 chart，實際的參數：${up.join(' ')}`)

  const { load, value: v2 } = await trafficDuring([URL], 10, () => deploy('v2'))
  assert.equal(v2.code, 0, `deploy.sh v2 應該以 0 結束，實際是 ${v2.code}：${v2.stderr}`)
  const h = history('cafe', ns)
  assert.equal(h.length, 2, `helm history 應該有 2 個 revision（v1 安裝、v2 升級），現在有 ${h.length} 個`)
  assert.equal(h.at(-1).status, 'deployed', `最新的 revision 應該是 deployed，現在是 ${h.at(-1).status}`)
  assert.deepEqual(readyImages(), ['learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2'], 'deploy.sh v2 結束時應該有 2 個 Ready 的 v2 Pod：--wait 讓 Helm 等到它們真的 Ready')
  assert.equal(load.errors, 0, `部署期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
  v2Ok = true
})

test(`deploy.sh bad：${LIMIT} 秒內以非 0 結束，Helm 自動回滾到 v2，全程 0 錯誤`, { timeout: 900_000 }, async () => {
  assert(v2Ok, '先讓上一項（deploy.sh v1、v2）通過')
  const { load, value: r } = await trafficDuring([URL], 10, () => deploy('bad'))
  assert.notEqual(r.code, null, `deploy.sh bad 跑了 ${r.secs} 秒還沒結束：加上 --timeout 3m`)
  assert.notEqual(r.code, 0, '部署失敗時 deploy.sh 一定要以非 0 結束，CI 才會亮紅燈；回滾成功不代表這次部署成功')
  assert(r.secs <= LIMIT, `deploy.sh bad 花了 ${r.secs} 秒：--timeout 3m 加上回滾，要在 ${LIMIT} 秒內結束`)
  const h = history('cafe', ns)
  const last = h.at(-1)
  assert.equal(last.status, 'deployed', `回滾後最新的 revision 應該是 deployed，現在是 ${last.status}（${last.description}）：要加 --rollback-on-failure`)
  assert.match(last.description ?? '', /Rollback/i, `最新的 revision 應該是自動回滾產生的（Rollback to 2），現在是「${last.description}」：要加 --rollback-on-failure`)
  const image = kubeJson('get', 'deployment', 'cafe', '-n', ns).spec.template.spec.containers[0].image
  assert.equal(image, 'learn-k8s/cafe-api:v2', `Deployment 的映像應該回到 v2，現在是 ${image}`)
  assert.deepEqual(readyImages(), ['learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2'], '結束時應該有 2 個 Ready 的 v2 Pod')
  assert.equal(load.errors, 0, `壞版本與回滾期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
})
