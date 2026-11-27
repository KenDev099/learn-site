// 練習 1：ex1/pod.yaml 把 cafe-api 寫成 Pod，用節點上已經載入的映像跑起來
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kubeJson, kubeconform, nsName, probe, readYaml, requireCluster } from '../../helpers/k8s.ts'
import { freshPodNamespace, waitPodReady } from './pods.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(2, 1)
let staticOk = false

before(async () => { requireCluster(); await freshPodNamespace(ns) })
after(() => deleteNamespace(ns))

test('pod.yaml 通過 kubeconform，映像、拉取規則、port、label、env 都照要求', { timeout: 30_000 }, () => {
  const docs = readYaml(dir, 'pod.yaml')
  assert.equal(docs.length, 1, `pod.yaml 裡要剛好一個物件，現在有 ${docs.length} 個`)
  const pod = docs[0]
  assert.equal(pod.kind, 'Pod', 'kind 要是 Pod')
  assert.equal(pod.metadata?.name, 'cafe-api', 'metadata.name 要是 cafe-api')
  const v = kubeconform([join(dir, 'pod.yaml')])
  assert(v.ok, `kubeconform 沒通過，照訊息修正（常見原因：欄位放錯層、env 的 value 沒加引號變成數字）：\n${v.message}`)
  const c = pod.spec.containers
  assert.equal(c.length, 1, 'containers 裡只要一個容器')
  const image: string = c[0].image
  assert(image.includes(':'), `映像 ${image} 沒寫 tag：沒寫 tag 等於 :latest，拉取規則預設 Always，節點會去 Docker Hub 拉而失敗`)
  assert(!image.endsWith(':latest'), '不要用 :latest：拉取規則預設變成 Always，而且看不出跑的是哪一版。寫明確的 tag v1')
  assert.equal(image, 'learn-k8s/cafe-api:v1', '映像要是 learn-k8s/cafe-api:v1')
  assert(c[0].imagePullPolicy === undefined || c[0].imagePullPolicy === 'IfNotPresent',
    `imagePullPolicy 是 ${c[0].imagePullPolicy}：映像是 kind load 進節點的，registry 上沒有，要用 IfNotPresent`)
  assert((c[0].ports ?? []).some((p: any) => p.containerPort === 3000), 'ports 要宣告 containerPort: 3000（cafe-api 聽 3000）')
  assert.equal(pod.metadata.labels?.['app.kubernetes.io/name'], 'cafe-api', 'metadata.labels 要有 app.kubernetes.io/name: cafe-api')
  const env = Object.fromEntries((c[0].env ?? []).map((e: any) => [e.name, e.value]))
  assert.equal(env.REQUIRE_DB, '0', 'env 要有 REQUIRE_DB，值是字串 "0"（這幾課還沒有資料庫）')
  assert.equal(env.APP_ENV, 'dev', 'env 要有 APP_ENV，值是 dev')
  staticOk = true
})

test('套用到 k8s-02-ex1 後 Ready，/health/live 是 200、/config 的 APP_ENV 是 dev', { timeout: 240_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  const pod = await waitPodReady(ns, 'cafe-api', 180_000)
  assert.equal(pod.spec.containers[0].imagePullPolicy, 'IfNotPresent', '叢集裡的 Pod 拉取規則要是 IfNotPresent')
  const selected = kubeJson('get', 'pods', '-n', ns, '-l', 'app.kubernetes.io/name=cafe-api').items.map((p: any) => p.metadata.name)
  assert.deepEqual(selected, ['cafe-api'], '用 -l app.kubernetes.io/name=cafe-api 要選得到這個 Pod')
  const ip = pod.status.podIP
  const live = probe(`http://${ip}:3000/health/live`)
  assert.equal(live.status, 200, `在叢集裡 curl ${ip}:3000/health/live 應該是 200，實際是 ${live.status} ${live.error}`)
  const config = probe(`http://${ip}:3000/config`)
  assert.equal(JSON.parse(config.body).APP_ENV, 'dev', `/config 的 APP_ENV 要是 dev，實際回應：${config.body}`)
})
