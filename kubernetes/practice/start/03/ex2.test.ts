// 練習 2：兩個 Deployment 的 selector 不能重疊
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, kubeconform, nsName, readText, readYaml, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(3, 2)
const WANT: Record<string, { replicas: number, image: string }> = {
  'cafe-api': { replicas: 3, image: 'learn-k8s/cafe-api:v1' },
  'cafe-api-canary': { replicas: 1, image: 'learn-k8s/cafe-api:v2' },
}

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('兩個 Deployment 都還在、副本數與映像沒變、selector 沒有交集', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'deployments.yaml')])
  assert(v.ok, `kubeconform 檢查沒過：\n${v.message}`)
  const docs = readYaml(dir, 'deployments.yaml').filter(d => d.kind === 'Deployment')
  const byName = Object.fromEntries(docs.map(d => [d.metadata?.name, d]))
  for (const [name, want] of Object.entries(WANT)) {
    const d = byName[name]
    assert(d, `找不到 Deployment ${name}：兩個都要留著，canary 是刻意的，問題不在它存在`)
    assert.equal(d.spec.replicas, want.replicas, `${name} 的 replicas 要維持 ${want.replicas}：副本數不是這題的問題`)
    assert.equal(d.spec.template.spec.containers[0].image, want.image, `${name} 的映像要維持 ${want.image}`)
    assert.equal(d.spec.template.metadata.labels?.['app.kubernetes.io/name'], 'cafe-api', `${name} 的 Pod 要保留 app.kubernetes.io/name: cafe-api（第 4 課的 Service 靠它同時選到兩邊）`)
    assert.equal(d.spec.selector?.matchExpressions, undefined, '這題只用 matchLabels')
  }
  const a = byName['cafe-api'].spec.selector.matchLabels ?? {}, b = byName['cafe-api-canary'].spec.selector.matchLabels ?? {}
  const disjoint = Object.keys(a).some(k => k in b && a[k] !== b[k])
  assert(disjoint, `兩個 selector 會選到同樣的 Pod：cafe-api 是 ${JSON.stringify(a)}，canary 是 ${JSON.stringify(b)}。要有一個兩邊都有、但值不同的 label（例如 app.kubernetes.io/instance），而且 Pod 範本的 label 也要跟著分開`)
  const why = readText(dir, 'WHY.md').replace(/<!--[\s\S]*?-->/g, '')
  assert.match(why, /selector|label|標籤|選擇器/i, 'WHY.md 用一句話寫出原因，要提到 selector 或 label')
})

test('套用後：每個 Deployment 的 selector 只選到自己的 Pod', { timeout: 300_000 }, async () => {
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 4, 150_000)
  const rs = kubeJson('get', 'replicasets', '-n', ns).items
  const deploys = kubeJson('get', 'deployments', '-n', ns).items
  for (const [name, want] of Object.entries(WANT)) {
    const dep = deploys.find((d: any) => d.metadata.name === name)
    // HPA、kubectl scale 用的就是這個 selector（scale 子資源的 status.selector）
    const scale = kube('get', '--raw', `/apis/apps/v1/namespaces/${ns}/deployments/${name}/scale`)
    assert.equal(scale.code, 0, `讀不到 ${name} 的 scale：${scale.stderr}`)
    const selector = JSON.parse(scale.stdout).status.selector
    const pods = kubeJson('get', 'pods', '-n', ns, '-l', selector).items.filter((p: any) => !p.metadata.deletionTimestamp)
    const mine = new Set(rs.filter((r: any) => r.metadata.ownerReferences?.some((o: any) => o.uid === dep.metadata.uid)).map((r: any) => r.metadata.name))
    const foreign = pods.filter((p: any) => !mine.has(p.metadata.ownerReferences?.[0]?.name)).map((p: any) => p.metadata.name)
    assert.deepEqual(foreign, [], `${name} 的 selector（${selector}）選到了別人的 Pod：HPA 會把它們的 CPU 算進來、kubectl logs -l 會混在一起`)
    assert.equal(pods.length, want.replicas, `${name} 的 selector 應該剛好選到自己的 ${want.replicas} 個 Pod，實際 ${pods.length} 個`)
  }
})
