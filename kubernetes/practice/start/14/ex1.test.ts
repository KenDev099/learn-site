// 練習 1：五組壞掉的服務（a～e）。找出根因寫進 diagnosis.json，修改各組資料夾的 manifest，
// 測試在全新的 namespace 重新套用你的檔案：只在叢集上 kubectl edit 修好的，這裡會再壞一次
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, nsName, probe, readJson, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { apiContainer, CAUSES, EXPECTED, find, GROUPS, MANIFESTS, mib, readGroup, SYMPTOMS } from './lib.ts'

const ns = (g: string) => nsName(14, 1, g)
let diagOk = false, filesOk = false

before(() => requireCluster())
after(() => { for (const g of GROUPS) deleteNamespace(ns(g)) })

test('diagnosis.json：每組寫出根因代碼與看到證據的指令', { timeout: 10_000 }, () => {
  const d = readJson(import.meta.dirname, 'diagnosis.json')
  for (const g of GROUPS) {
    const cause = String(d[g]?.cause ?? '').trim(), evidence = String(d[g]?.evidence ?? '').trim()
    assert(cause, `第 ${g} 組還沒填 cause`)
    assert(!SYMPTOMS.test(cause), `第 ${g} 組的 cause 是 ${cause}：這是 kubectl get 看到的狀態（症狀），不是原因。順著 describe、logs --previous 往下查，從頁面列出的根因代碼選一個`)
    assert(CAUSES.includes(cause), `第 ${g} 組的 cause 是 ${JSON.stringify(cause)}：要從頁面列出的根因代碼選一個（例如 image-tag-typo），大小寫與連字號都要一樣`)
    assert.equal(cause, EXPECTED[g].cause, `第 ${g} 組的根因不是 ${cause}：回到 kubectl describe 的 Events、容器的 Last State 與 EndpointSlice，再看一次證據`)
    assert(/^kubectl\s/.test(evidence), `第 ${g} 組的 evidence 要寫你實際執行、看到證據的那一行 kubectl 指令`)
    assert(EXPECTED[g].evidence.test(evidence), `第 ${g} 組的 evidence「${evidence}」看不到這個根因的證據。${EXPECTED[g].hint}`)
  }
  diagOk = true
})

test('manifest：在檔案裡修正根因，沒有用拿掉 probe、limit 的方式掩蓋', { timeout: 10_000 }, () => {
  for (const g of GROUPS) {
    const docs = readGroup(g)
    const dep = find(docs, 'Deployment'), svc = find(docs, 'Service')
    assert(dep && svc, `第 ${g} 組要保留 Deployment 與 Service（各一個）`)
    const c = apiContainer(dep)
    assert(c, `第 ${g} 組的 Deployment 要保留名為 api 的容器`)
    assert(c.readinessProbe?.httpGet, `第 ${g} 組的 readinessProbe 不見了：拿掉 probe 讓 Pod 變 Ready，是把壞掉的 Pod 也放進流量。修正 probe 本身，不要刪掉它`)
    const lim = c.resources?.limits?.memory
    assert(lim !== undefined, `第 ${g} 組的 limits.memory 不見了：沒有上限的容器可以吃光整個節點的記憶體。調到夠用，不要拿掉`)
  }
  const a = apiContainer(find(readGroup('a'), 'Deployment'))
  assert.equal(a.image, 'learn-k8s/cafe-api:v1', `第 a 組的映像是 ${a.image}：這次要部署的是 learn-k8s/cafe-api:v1`)
  const b = apiContainer(find(readGroup('b'), 'Deployment'))
  const ref = b.env?.find((e: any) => e.name === 'DB_PASSWORD')?.valueFrom?.secretKeyRef
  assert(ref, '第 b 組要保留 DB_PASSWORD（從 Secret cafe-db 取值的 secretKeyRef）：拿掉它，Pod 起得來但應用拿不到密碼')
  assert.notEqual(ref.optional, true, '第 b 組的 secretKeyRef 加了 optional: true：Pod 會起來，但 DB_PASSWORD 是空的，問題延後到連資料庫時才爆。把 key 改成 Secret 裡真正有的名字')
  assert.equal(ref.name, 'cafe-db', '第 b 組的 Secret 名稱是 cafe-db，不用改')
  assert.equal(ref.key, 'db-password', `第 b 組的 key 是 ${ref.key}：用 kubectl describe secret cafe-db 看 Secret 裡實際有哪些 key（只會列名稱與大小，不會印出值）`)
  const cm = mib(apiContainer(find(readGroup('c'), 'Deployment')).resources.limits.memory)
  assert(cm >= 64 && cm <= 512, `第 c 組的 limits.memory 換算是 ${Math.round(cm)}Mi：cafe-api 啟動就要 30～40Mi，給 64Mi～512Mi 之間（例如 128Mi），單位用 Mi`)
  const d = apiContainer(find(readGroup('d'), 'Deployment'))
  assert.equal(d.readinessProbe.httpGet.path, '/health/ready', `第 d 組的 readinessProbe 打的是 ${d.readinessProbe.httpGet.path}：cafe-api 的 readiness 端點是 /health/ready（第 7 課）`)
  const e = readGroup('e'), labels = find(e, 'Deployment').spec.template.metadata.labels ?? {}
  for (const [k, v] of Object.entries(find(e, 'Service').spec.selector ?? {}))
    assert.equal(labels[k], v, `第 e 組 Service 的 selector ${k}=${v} 對不上 Pod 的 label（${k}=${labels[k] ?? '沒有'}）`)
  filesOk = true
})

test('叢集：五組在全新的 namespace 重新套用你的檔案，Pod 都 Ready、經過 Service 的請求成功', { timeout: 420_000 }, async () => {
  assert(diagOk && filesOk, '先讓上面兩項（檔案的檢查）通過，再套用到叢集')
  for (const g of GROUPS) freshNamespace(ns(g))
  const s = kube('create', 'secret', 'generic', 'cafe-db', '-n', ns('b'), `--from-literal=db-password=${crypto.randomUUID()}`)
  assert.equal(s.code, 0, `建立 Secret 失敗：${s.stderr}`)
  for (const g of GROUPS) applyDir(join(MANIFESTS, g), ns(g))
  await Promise.all(GROUPS.map(g => waitPodsReady(ns(g), 'app.kubernetes.io/name=cafe-api', 1, 300_000)))
  for (const g of GROUPS) {
    const r = probe(`http://cafe-api.${ns(g)}.svc.cluster.local/version`)
    assert.equal(r.status, 200, `第 ${g} 組經過 Service 的請求失敗（${r.status || r.error}）：Pod Ready 了，再看 EndpointSlice 有沒有挑到它`)
  }
})
