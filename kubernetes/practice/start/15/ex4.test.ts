// 練習 4：EKS 1.35 → 1.37 的升級計畫：步驟順序與阻擋項目
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readJson } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex4')
const CODES = ['check-insights', 'fix-blockers', 'cp-1.36', 'cp-1.37', 'addons-1.36', 'addons-1.37', 'nodes-1.36', 'nodes-1.37']
// 起始檔的 cluster（題目資料，不能改）
const CLUSTER = {"name":"cafe-prod","controlPlane":"1.35","target":"1.37","nodeGroups":[{"name":"general","type":"managed","version":"1.35","nodes":4},{"name":"batch","type":"managed","version":"1.34","nodes":2}],"addons":[{"name":"vpc-cni","version":"1.7.10","note":"叢集建立時裝的版本，從沒升級過"},{"name":"coredns","version":"1.35 的建議版本"},{"name":"kube-proxy","version":"1.35 的建議版本"},{"name":"aws-load-balancer-controller","version":"v3.6.2"}],"pdbs":[{"name":"cafe-api","replicas":3,"minAvailable":2},{"name":"cafe-worker","replicas":2,"minAvailable":2},{"name":"cafe-web","replicas":2,"maxUnavailable":1},{"name":"cafe-report","replicas":1,"minAvailable":"100%"}]}
const plan = () => {
  const p = readJson(dir, 'upgrade.json')
  assert(Array.isArray(p.steps) && Array.isArray(p.blockers), 'upgrade.json 要有 steps 與 blockers 兩個陣列')
  return p
}

test('cluster 是題目資料，不能修改', { timeout: 10_000 }, () => {
  const p = plan()
  assert.equal(p.cluster?.controlPlane, '1.35', 'cluster.controlPlane 是題目給的 1.35，不要改')
  assert.deepEqual(p.cluster?.pdbs?.map((x: any) => x.name), ['cafe-api', 'cafe-worker', 'cafe-web', 'cafe-report'], '不要改 cluster.pdbs：把有問題的 PDB 列進 blockers')
  assert.deepEqual(p.cluster, CLUSTER, 'cluster 和題目給的不一樣：只填 steps 與 blockers')
})

test('步驟只用頁面提供的代碼，每個都要有、不能重複', { timeout: 10_000 }, () => {
  const { steps } = plan()
  const unknown = steps.filter((s: string) => !CODES.includes(s))
  assert.deepEqual(unknown, [], `沒有這些步驟代碼：${unknown.join('、')}。可以用的是：${CODES.join('、')}（EKS 一次只能升一個小版本，所以沒有直接到 1.37 的捷徑）`)
  assert.equal(new Set(steps).size, steps.length, 'steps 有重複的代碼')
  const missing = CODES.filter(c => !steps.includes(c))
  assert.deepEqual(missing, [], `少了這些步驟：${missing.join('、')}。每個小版本都要做「控制平面 → 外掛 → 節點」`)
})

test('順序：先檢查與排除阻擋，控制平面一次一個小版本，每次升完先把外掛與節點跟上', { timeout: 10_000 }, () => {
  const { steps } = plan()
  const at = (c: string) => steps.indexOf(c)
  assert(at('check-insights') < at('fix-blockers') && at('fix-blockers') < at('cp-1.36'),
    '先 check-insights（upgrade insights、已棄用的 API、PDB、節點版本），再 fix-blockers，最後才動控制平面：控制平面升級開始後不能暫停')
  assert(at('cp-1.36') < at('cp-1.37'), 'EKS 一次只能升一個小版本：cp-1.36 要在 cp-1.37 之前')
  for (const v of ['1.36', '1.37']) {
    assert(at(`nodes-${v}`) > at(`cp-${v}`), `nodes-${v} 排在 cp-${v} 之前：節點的 kubelet 不能比控制平面新，一定是控制平面先升`)
    assert(at(`addons-${v}`) > at(`cp-${v}`), `addons-${v} 排在 cp-${v} 之前：外掛要裝「對應 ${v}」的版本，控制平面到 ${v} 之後才升`)
  }
  assert(at('addons-1.36') < at('cp-1.37'), 'addons-1.36 要在 cp-1.37 之前：外掛先跟上 1.36，再往下一版')
  assert(at('nodes-1.36') < at('cp-1.37'),
    'nodes-1.36 要在 cp-1.37 之前：kubelet 雖然可以落後 3 個小版本，但 EKS 要求 managed node group 和控制平面同版本之後，才能再升控制平面')
})

test('阻擋項目：會卡住 drain 的 PDB、太舊的 VPC CNI、落後的節點群組', { timeout: 10_000 }, () => {
  const { blockers } = plan()
  const valid = [...CLUSTER.pdbs.map((x: any) => `pdb/${x.name}`), ...CLUSTER.addons.map((x: any) => `addon/${x.name}`), ...CLUSTER.nodeGroups.map((x: any) => `nodegroup/${x.name}`)]
  const unknown = blockers.filter((b: string) => !valid.includes(b))
  assert.deepEqual(unknown, [], `blockers 裡有不存在的項目：${unknown.join('、')}。格式是 pdb/<名稱>、addon/<名稱>、nodegroup/<名稱>`)
  for (const name of ['cafe-worker', 'cafe-report'])
    assert(blockers.includes(`pdb/${name}`), `漏了 pdb/${name}：minAvailable 等於副本數（或 100%），允許中斷的 Pod 數是 0，替換節點時的 drain 會一直卡住`)
  for (const name of ['cafe-api', 'cafe-web'])
    assert(!blockers.includes(`pdb/${name}`), `pdb/${name} 不是阻擋項目：它還允許 1 個 Pod 被驅逐，drain 會一個一個慢慢換，這正是 PDB 的用途`)
  assert(blockers.includes('addon/vpc-cni'), '漏了 addon/vpc-cni：1.7.10 早於 1.8.0，AWS 文件要求升級叢集前先把 VPC CNI 升到新版')
  assert(blockers.includes('nodegroup/batch'), '漏了 nodegroup/batch：它還是 1.34，EKS 要求 managed node group 先跟控制平面同版本（1.35）才能升控制平面')
  for (const b of blockers) assert(!['nodegroup/general', 'addon/coredns', 'addon/kube-proxy', 'addon/aws-load-balancer-controller'].includes(b), `${b} 沒有問題，不是阻擋項目：它們會在每個版本的 addons／nodes 步驟正常升級`)
})
