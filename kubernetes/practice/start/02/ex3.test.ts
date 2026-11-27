// 練習 3：init container 等 fake-db 連得上，原生 sidecar 透過共用的 emptyDir 讀主容器寫的 heartbeat
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kube, kubeIn, kubeJson, kubeconform, nsName, readYaml, requireCluster, sleep, waitFor } from '../../helpers/k8s.ts'
import { freshPodNamespace, waitPodReady } from './pods.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(2, 3)
const HOLD_MS = 40_000   // init container 開始執行後，至少這麼久都還不能結束（fake-db 還不存在）
let staticOk = false
let sidecar = ''

// 測試自己的假資料庫：一個聽 5432 的 cafe-api，加上名字叫 fake-db 的 Service（第 4 課才教 Service）
const fakeDb = JSON.stringify({
  apiVersion: 'v1', kind: 'List', items: [
    { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'fake-db', labels: { 'learn.test': 'fake-db' } },
      spec: { terminationGracePeriodSeconds: 0, containers: [{ name: 'db', image: 'learn-k8s/cafe-api:v1', imagePullPolicy: 'IfNotPresent',
        env: [{ name: 'REQUIRE_DB', value: '0' }, { name: 'PORT', value: '5432' }],
        resources: { requests: { cpu: '10m', memory: '32Mi' }, limits: { memory: '96Mi' } } }] } },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'fake-db' }, spec: { selector: { 'learn.test': 'fake-db' }, ports: [{ port: 5432 }] } },
  ],
})

before(async () => { requireCluster(); await freshPodNamespace(ns) })
after(() => deleteNamespace(ns))

test('pod.yaml：一個主容器、一個一般 init container、一個原生 sidecar，共用 emptyDir 掛在 /shared', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'pod.yaml')])
  assert(v.ok, `kubeconform 沒通過：\n${v.message}`)
  const pod = readYaml(dir, 'pod.yaml')[0]
  const main = pod.spec.containers ?? []
  assert.equal(main.length, 1, `containers 裡只放主容器 api（現在有 ${main.length} 個）：sidecar 要放在 initContainers 並設 restartPolicy: Always，寫在 containers 裡就沒有啟動與關閉順序的保證`)
  const inits = pod.spec.initContainers ?? []
  const side = inits.find((c: any) => c.restartPolicy === 'Always')
  assert(side, 'initContainers 裡要有一個 restartPolicy: Always 的容器，這就是原生 sidecar')
  assert.equal(side.image, 'busybox:1.38.0', 'sidecar 的映像用 busybox:1.38.0（節點上已經有）')
  assert(inits.some((c: any) => c.restartPolicy === undefined), 'initContainers 裡還要有一個一般的 init container（不設 restartPolicy），負責等 fake-db')
  const env = Object.fromEntries((main[0].env ?? []).map((e: any) => [e.name, e.value]))
  assert.equal(env.HEARTBEAT_FILE, '/shared/heartbeat', '主容器的 HEARTBEAT_FILE 要維持 /shared/heartbeat')
  const shared = (c: any) => (c.volumeMounts ?? []).find((m: any) => m.mountPath === '/shared')?.name
  const vol = (pod.spec.volumes ?? []).find((x: any) => x.name === shared(main[0]))
  assert(vol?.emptyDir, '主容器要把一個 emptyDir volume 掛在 /shared（spec.volumes 宣告、volumeMounts 掛載）：每個容器的檔案系統各自獨立，不共用 volume 就讀不到對方寫的檔案')
  assert.equal(shared(side), vol.name, `sidecar 也要把同一個 volume（${vol.name}）掛在 /shared`)
  sidecar = side.name
  staticOk = true
})

test('fake-db 不存在時停在 Init、主容器沒啟動；fake-db 出現後 Running，sidecar 的 log 有 heartbeat', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  const wait = readYaml(dir, 'pod.yaml')[0].spec.initContainers.find((c: any) => c.restartPolicy === undefined).name
  const status = () => kubeJson('get', 'pod', 'cafe-api', '-n', ns).status
  await waitFor(() => status().initContainerStatuses?.find((c: any) => c.name === wait)?.state?.running, 150_000,
    `init container ${wait} 沒有開始執行：用 kubectl describe pod cafe-api -n ${ns} 看 Events`, 2000)
  const until = Date.now() + HOLD_MS
  while (Date.now() < until) {
    const s = status()
    const init = s.initContainerStatuses.find((c: any) => c.name === wait)
    assert(!init.state?.terminated, `fake-db 還不存在，init container ${wait} 就結束了（exit code ${init.state?.terminated?.exitCode}）：它要一直重試，直到 fake-db:5432 連得上才結束（例如 until nc -z -w 2 fake-db 5432; do sleep 2; done），只 sleep 固定秒數等不到真的資料庫`)
    const api = s.containerStatuses?.find((c: any) => c.name !== sidecar)
    assert(!api?.state?.running && !api?.state?.terminated, '資料庫還連不上，主容器就啟動了')
    await sleep(3000)
  }
  const r = kubeIn(fakeDb, 'apply', '-n', ns, '--validate=false', '-f', '-')
  assert.equal(r.code, 0, `測試建立 fake-db 失敗：${r.stderr}`)
  await waitPodReady(ns, 'cafe-api', 240_000)
  await waitFor(() => /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(kube('logs', 'cafe-api', '-n', ns, '-c', sidecar).stdout), 40_000,
    `kubectl logs cafe-api -c ${sidecar} 看不到時間：sidecar 要每 5 秒 cat /shared/heartbeat（主容器每 2 秒寫一次），而且兩邊要掛同一個 emptyDir`, 3000)
})
