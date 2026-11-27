// 練習 2：apply.sh 用 kubectl apply 改 ConfigMap，再觸發滾動更新，讓每個 Pod 都換成讀到 debug 的新 Pod，持續的流量 0 錯誤
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRACTICE, deleteNamespace, freshNamespace, isMutating, kube, kubeIn, kubeJson, kubectlVerb, load, nsName, parseYaml, readText, readYaml, requireCluster, runScript, spyKubectl } from '../../helpers/k8s.ts'
import { rolloutStatus, waitConfigs } from './cafe.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(6, 2)
// 叢集上的起點：LOG_LEVEL=info 的 cafe-config（用 kubectl apply 建立，跟你之後的 apply 是同一種管理方式）
const initialConfig = JSON.stringify({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'cafe-config' }, data: { LOG_LEVEL: 'info', FEATURE_LOYALTY: 'true', APP_ENV: 'staging' } })
let staticOk = false

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

// Pod 範本的 annotations 以外都要跟起始檔一樣（加 checksum annotation 是允許的做法）
const strip = (d: any) => { const c = structuredClone(d); if (c.spec?.template?.metadata) delete c.spec.template.metadata.annotations; return c }

test('configmap.yaml 的 LOG_LEVEL 是 debug、deployment.yaml 與 service.yaml 沒被改壞、apply.sh 有寫指令', { timeout: 30_000 }, () => {
  const cm = readYaml(dir, 'configmap.yaml')[0]
  assert.equal(cm?.metadata?.name, 'cafe-config', 'configmap.yaml 的 ConfigMap 名稱維持 cafe-config')
  assert.deepEqual(cm.data, { LOG_LEVEL: 'debug', FEATURE_LOYALTY: 'true', APP_ENV: 'staging' }, 'configmap.yaml 只把 LOG_LEVEL 改成 debug，其他兩個 key 不變')
  const original = parseYaml(readFileSync(join(PRACTICE, 'start', '06', 'ex2', 'deployment.yaml'), 'utf8'))[0]
  assert.deepEqual(strip(readYaml(dir, 'deployment.yaml')[0]), strip(original),
    'deployment.yaml 除了 Pod 範本的 annotations 以外不要改：掛成 subPath 的檔案永遠不會更新，cafe-api 也只讀環境變數')
  const script = readText(dir, 'apply.sh').split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
  assert.match(script, /\bkubectl\b/, 'apply.sh 還沒有任何 kubectl 指令：照著 TODO 寫')
  staticOk = true
})

test('執行 apply.sh：180 秒內所有 Pod 都換成新的、/config 都是 debug，持續的流量 0 錯誤', { timeout: 600_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  const c = kubeIn(initialConfig, 'apply', '-n', ns, '-f', '-')
  assert.equal(c.code, 0, `測試建立起始的 ConfigMap 失敗：${c.stderr}`)
  const a = kube('apply', '-n', ns, '-f', join(dir, 'deployment.yaml'), '-f', join(dir, 'service.yaml'))
  assert.equal(a.code, 0, `測試套用 deployment.yaml、service.yaml 失敗：${a.stderr}`)
  rolloutStatus(ns)
  const before = await waitConfigs(ns, 2, cfg => cfg.LOG_LEVEL === 'info', 120_000, '起始的 2 個 Pod 沒有 Ready')
  const oldUids = new Set(before.map(x => x.pod.metadata.uid))

  const traffic = load(`http://cafe-api.${ns}.svc.cluster.local/config`, { requests: 450, rps: 5, timeoutMs: 5000 })
  const spy = spyKubectl()
  let r: ReturnType<typeof runScript>, calls: string[][]
  try {
    r = runScript(dir, 'apply.sh', [], { env: spy.env, timeout: 240_000 })
    calls = spy.calls()
  } finally { spy.cleanup() }
  assert.equal(r.code, 0, `apply.sh 應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
  const deletes = calls.filter(x => ['delete', 'replace', 'create'].includes(kubectlVerb(x)[0]))
  assert.deepEqual(deletes.map(x => x.join(' ')), [], '不要刪掉或重建物件：刪 Pod 會讓所有 Pod 同時消失；用滾動更新一個一個換')
  assert(calls.some(x => kubectlVerb(x)[0] === 'apply'), '要用 kubectl apply 套用 configmap.yaml')
  assert(calls.every(x => !isMutating(x) || ['apply', 'rollout restart', 'annotate', 'patch'].includes(kubectlVerb(x).join(' '))),
    `apply.sh 只需要 apply、rollout restart（或改 Pod 範本的 annotation）和 rollout status，現在呼叫了：${calls.map(x => kubectlVerb(x).join(' ')).join('、')}`)

  const cm = kubeJson('get', 'configmap', 'cafe-config', '-n', ns)
  assert.equal(cm.data.LOG_LEVEL, 'debug', '叢集上的 cafe-config 的 LOG_LEVEL 還不是 debug')
  assert.match(cm.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration'] ?? '', /"LOG_LEVEL":"debug"/,
    'ConfigMap 要用 kubectl apply -f configmap.yaml 修改（kubectl edit／patch 改的值，下次有人 apply 舊檔案就被蓋回去）')

  await waitConfigs(ns, 2, (cfg, pod) => cfg.LOG_LEVEL === 'debug' && !oldUids.has(pod.metadata.uid), 180_000,
    '只改 ConfigMap，用環境變數讀設定的 Pod 不會變：要觸發滾動更新（kubectl rollout restart，或在 Pod 範本加會變的 annotation）讓 Pod 換成新的')
  const t = await traffic
  assert.equal(t.errors, 0, `更新期間有 ${t.errors} 個請求失敗（共 ${t.requests} 個）：${t.errorSamples.join('；')}`)
})
