// 練習 4：不需要 token 的 Pod 不掛 token；需要的 Pod 用自己的 ServiceAccount，只拿到一個 ConfigMap 的權限
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, nsName, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { exec, readManifest, waitDefaultSa } from './lib.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(12, 4)
const TOKEN = '/var/run/secrets/kubernetes.io/serviceaccount'
let staticOk = false, ready: Record<string, any> = {}

before(() => requireCluster())
after(() => deleteNamespace(ns))

const podSpec = (docs: any[], name: string) => docs.find(d => d.kind === 'Deployment' && d.metadata?.name === name)?.spec?.template?.spec

test('兩個 Deployment 都不用 default ServiceAccount；Role 沒有 *', { timeout: 30_000 }, () => {
  const docs = [...readManifest(dir, 'cafe-api.yaml'), ...readManifest(dir, 'config-watcher.yaml')]
  const api = podSpec(docs, 'cafe-api'), watcher = podSpec(docs, 'config-watcher')
  assert(api && watcher, '兩個檔案裡要各有 Deployment cafe-api 與 config-watcher')
  for (const [name, spec] of [['cafe-api', api], ['config-watcher', watcher]] as const) {
    const sa = spec.serviceAccountName ?? 'default'
    assert.notEqual(sa, 'default', `${name} 還在用 default ServiceAccount：每個應用用自己的 ServiceAccount，權限才不會互相沾到`)
    assert(docs.some(d => d.kind === 'ServiceAccount' && d.metadata?.name === sa), `${name} 用的 ServiceAccount ${sa} 要寫在檔案裡`)
  }
  assert.notEqual(api.serviceAccountName, watcher.serviceAccountName, 'cafe-api 和 config-watcher 不要共用 ServiceAccount')
  for (const r of docs.filter(d => d.kind === 'Role' || d.kind === 'ClusterRole')) for (const rule of r.rules ?? [])
    assert(![...(rule.verbs ?? []), ...(rule.resources ?? [])].includes('*'), `${r.kind} ${r.metadata.name} 不要用 *`)
  staticOk = true
})

test('套用後 cafe-api 與 config-watcher 都 Ready', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  await waitDefaultSa(ns)
  for (const [name, data] of [['cafe-flags', 'loyalty=on'], ['cafe-menu', 'latte=110']]) {
    const c = kube('create', 'configmap', name, '-n', ns, `--from-literal=${data}`)
    assert.equal(c.code, 0, `建立 ConfigMap ${name} 失敗：${c.stderr}`)
  }
  applyDir(dir, ns)
  ready.api = (await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 1, 180_000))[0]
  ready.watcher = (await waitPodsReady(ns, 'app.kubernetes.io/name=config-watcher', 1, 180_000))[0]
})

test('cafe-api 的容器裡沒有 ServiceAccount token', { timeout: 60_000 }, () => {
  assert(ready.api, '先讓上一項（Ready）通過')
  const r = exec(ns, ready.api.metadata.name, 'test', '-e', `${TOKEN}/token`)
  assert.notEqual(r.code, 0, `cafe-api 裡還有 ${TOKEN}/token：在 ServiceAccount cafe-api（或 Pod）設 automountServiceAccountToken: false`)
})

test('config-watcher 用自己的 token 讀得到 cafe-flags；讀 cafe-menu 與 list configmaps 都是 403', { timeout: 60_000 }, () => {
  assert(ready.watcher, '先讓上一項（Ready）通過')
  // 在容器裡用掛進來的 token 呼叫 API server（應用程式用 client 函式庫時做的就是這件事）
  const api = `https://kubernetes.default.svc/api/v1/namespaces/${ns}/configmaps`
  const script = `T=${TOKEN}; [ -f $T/token ] || { echo NO_TOKEN; exit 0; }
for u in ${api}/cafe-flags ${api}/cafe-menu ${api}; do
  curl -s -o /dev/null -w '%{http_code} ' --cacert $T/ca.crt -H "Authorization: Bearer $(cat $T/token)" $u
done`
  const r = exec(ns, ready.watcher.metadata.name, 'sh', '-c', script)
  assert.equal(r.code, 0, `在 config-watcher 裡呼叫 API 失敗：${r.stderr}`)
  assert.notEqual(r.stdout, 'NO_TOKEN', 'config-watcher 裡沒有 token：它需要呼叫 API，ServiceAccount config-watcher 與它的 Pod 不要關掉 automount')
  const [flags, menu, list] = r.stdout.trim().split(' ')
  assert.equal(flags, '200', `GET configmaps/cafe-flags 應該是 200，現在是 ${flags}：Role 要允許 get 名為 cafe-flags 的 configmaps，RoleBinding 要綁到 config-watcher`)
  assert.equal(menu, '403', `GET configmaps/cafe-menu 應該是 403，現在是 ${menu}：用 resourceNames: [cafe-flags] 限定只能讀這一個`)
  assert.equal(list, '403', `list configmaps 應該是 403，現在是 ${list}：list 會回傳每個 ConfigMap 的完整內容，不要給 list`)
})
