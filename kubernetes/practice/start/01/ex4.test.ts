// 練習 4：inspect.sh 即時讀出節點記憶體、kube-system 的 Pod 數、etcd 映像，而且不改叢集
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteNamespace, freshNamespace, isMutating, kubectlVerb, waitFor, kube, kubeIn, kubeJson, nsName, requireCluster, runScript, spyKubectl } from '../../helpers/k8s.ts'

const dir = import.meta.dirname
const ns = nsName(1, 4)
const extra = 'learn-k8s-01-ex4-extra'   // 測試暫時放進 kube-system 的 Pod（叢集層級的東西一律加 learn-k8s- 前綴）

function expected() {
  const nodes = kubeJson('get', 'nodes').items.map((n: any) => `${n.metadata.name}=${n.status.allocatable.memory}`).sort()
  const count = kubeJson('get', 'pods', '-n', 'kube-system').items.length
  const etcd = kubeJson('get', 'pods', '-n', 'kube-system', '-l', 'component=etcd').items[0].spec.containers[0].image
  return { nodes, count: String(count), etcd }
}

function inspect() {
  const spy = spyKubectl()
  try {
    const r = runScript(dir, 'inspect.sh', [], { env: spy.env })
    assert.equal(r.code, 0, `inspect.sh 應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
    const calls = spy.calls()
    assert.deepEqual(calls.filter(isMutating).map(a => a.join(' ')), [], 'inspect.sh 只能讀叢集（get、describe），不能建立、刪除或修改任何東西')
    assert(calls.some(a => ['get', 'describe'].includes(kubectlVerb(a)[0]) && a.some(w => /^(nodes?|no)(\/|$)/.test(w))),
      '第 1 行要用 kubectl get nodes（或 describe nodes）即時查，不能把節點名稱和記憶體寫死')
    const lines = r.stdout.split('\n').map(l => l.trim()).filter(Boolean)
    assert.equal(lines.length, 3, `要剛好印出 3 行，實際是 ${lines.length} 行：\n${r.stdout}`)
    return lines
  } finally { spy.cleanup() }
}

const podJson = (name: string, namespace: string) => JSON.stringify({
  apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace },
  spec: { terminationGracePeriodSeconds: 0, containers: [{ name: 'sleep', image: 'busybox:1.38.0', imagePullPolicy: 'IfNotPresent', command: ['sleep', '600'], resources: { requests: { cpu: '10m', memory: '8Mi' }, limits: { memory: '16Mi' } } }] },
})

before(() => {
  requireCluster()
  kube('delete', 'pod', extra, '-n', 'kube-system', '--ignore-not-found', '--wait=true')
  freshNamespace(ns)
})
after(() => {
  kube('delete', 'pod', extra, '-n', 'kube-system', '--ignore-not-found', '--wait=false')
  deleteNamespace(ns)
})

test('三行分別是節點記憶體、kube-system 的 Pod 數、etcd 映像', () => {
  const want = expected()
  const [nodes, count, etcd] = inspect()
  const counts = [want.count, expected().count]   // 跑腳本的同時 kube-system 的 Pod 數可能剛好變動：前後兩次查到的都算對
  assert.deepEqual(nodes.split(/\s+/).sort(), want.nodes, `第 1 行要是每個節點的「名稱=可分配記憶體」（.status.allocatable.memory），用空白隔開。應該是：\n${want.nodes.join(' ')}`)
  assert(counts.includes(count), `第 2 行要是 kube-system 裡 Pod 的數量（${want.count}），不是整個叢集的，實際印出 ${count}`)
  assert.equal(etcd, want.etcd, '第 3 行要是 etcd 那個 Pod 的容器映像（含 tag）')
})

test('叢集變了，輸出也跟著變（不是寫死的值，也只算 kube-system）', { timeout: 180_000 }, async () => {
  // 別的 namespace 多一個 Pod：kube-system 的數量不能變；kube-system 多一個 Pod：數量要加 1
  for (const [name, namespace] of [['visitor', ns], [extra, 'kube-system']]) {
    // 剛建好的 namespace 要等控制器建出 default ServiceAccount 才能建 Pod，所以重試
    await waitFor(() => {
      const r = kubeIn(podJson(name, namespace), 'create', '-f', '-')
      if (r.code !== 0) throw new Error(`測試建立 Pod ${namespace}/${name} 失敗：${r.stderr}`)
      return true
    }, 60_000, `測試建立 Pod ${namespace}/${name} 失敗`, 2000)
  }
  const want = expected()
  const [, count] = inspect()
  assert([want.count, expected().count].includes(count), `kube-system 多了一個 Pod 之後應該是 ${want.count}：第 2 行要每次即時查 kube-system（kubectl get pods -n kube-system），不能寫死，也不能用 -A 算全部的 namespace`)
})
