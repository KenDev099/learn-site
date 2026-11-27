// 練習 2：課程叢集建好了，而且 check-context.sh 在 context 不對時什麼都不做
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { CLUSTER_CMD, KUBECONFIG, isMutating, kube, kubeJson, kubectlVerb, requireCluster, run, runScript, spyKubectl } from '../../helpers/k8s.ts'

const dir = import.meta.dirname
before(requireCluster)

test('叢集有 3 個 Ready 的節點，Kubernetes 版本是 v1.37.0', () => {
  const nodes = kubeJson('get', 'nodes').items
  assert.equal(nodes.length, 3, `應該有 1 個 control-plane 和 2 個 worker，現在是 ${nodes.length} 個節點：執行 ${CLUSTER_CMD} down 再 up`)
  for (const n of nodes) assert.ok(n.status.conditions.some((c: any) => c.type === 'Ready' && c.status === 'True'), `節點 ${n.metadata.name} 不是 Ready：執行 ${CLUSTER_CMD} status`)
  const server = JSON.parse(kube('version', '-o', 'json').stdout).serverVersion.gitVersion
  assert.equal(server, 'v1.37.0', `叢集的版本是 ${server}：kind.yaml 的節點映像要用 kindest/node:v1.37.0 並以 digest 釘住`)
})

test('metrics-server 與 cloud-provider-kind 都在運作', () => {
  const ok = kube('get', 'apiservice', 'v1beta1.metrics.k8s.io', '-o', 'jsonpath={.status.conditions[?(@.type=="Available")].status}').stdout
  assert.equal(ok, 'True', `metrics API 還不能用：剛建好的話等一分鐘；不然重新執行 ${CLUSTER_CMD} up`)
  const ccm = run('docker', ['inspect', 'learn-k8s-ccm', '--format', '{{.State.Status}}']).stdout
  assert.equal(ccm, 'running', `cloud-provider-kind 容器（learn-k8s-ccm）沒有在跑：重新執行 ${CLUSTER_CMD} up`)
})

test('~/.kube/config 沒有被改到（課程叢集只寫在 practice/.kube/config）', () => {
  const home = join(homedir(), '.kube', 'config')
  if (existsSync(home)) assert.ok(!readFileSync(home, 'utf8').includes('kind-learn-k8s'),
    '~/.kube/config 裡出現了 kind-learn-k8s：你可能用 kind create cluster 直接建了叢集。執行 kubectl config delete-context kind-learn-k8s、kubectl config delete-cluster kind-learn-k8s 和 kubectl config delete-user kind-learn-k8s 清掉，之後一律用 cluster.mjs')
  assert.ok(existsSync(KUBECONFIG), `找不到 kubernetes/practice/.kube/config：執行 ${CLUSTER_CMD} up`)
})

test('context 是 kind-learn-k8s 時：印出節點數 3、以 0 結束，而且真的問了叢集', () => {
  const spy = spyKubectl()
  const before = readFileSync(KUBECONFIG, 'utf8')
  try {
    const r = runScript(dir, 'check-context.sh', [], { env: spy.env })
    assert.equal(r.code, 0, `腳本應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
    assert.equal(r.stdout, '3', `只印出節點數，實際印出：${JSON.stringify(r.stdout)}`)
    const calls = spy.calls()
    assert.ok(calls.some(a => kubectlVerb(a)[0] === 'get' && a.some(w => /^(nodes?|no)$/.test(w))), '節點數要用 kubectl get nodes 即時查，不能寫死')
    const bad = calls.filter(isMutating)
    assert.deepEqual(bad.map(a => a.join(' ')), [], '這個腳本只能讀，不能改 kubeconfig 或叢集（例如 config use-context）')
    assert.equal(readFileSync(KUBECONFIG, 'utf8'), before, 'kubeconfig 檔案被改掉了：腳本只能讀')
  } finally { spy.cleanup() }
})

test('context 不是 kind-learn-k8s 時：印錯誤到 stderr、以 1 結束，而且完全沒有連叢集', () => {
  const spy = spyKubectl()
  const tmp = mkdtempSync(join(tmpdir(), 'learn-k8s-01-'))
  // 假裝是公司的正式叢集：名稱 prod-eks，位址連不上（就算腳本對它下指令也不會真的打到任何地方）
  const fake = join(tmp, 'config')
  const text = `apiVersion: v1
kind: Config
clusters:
- name: prod-eks
  cluster: { server: 'https://127.0.0.1:9' }
users:
- name: prod-admin
  user: { token: fake }
contexts:
- name: prod-eks
  context: { cluster: prod-eks, user: prod-admin, namespace: default }
current-context: prod-eks
`
  writeFileSync(fake, text)
  try {
    const r = runScript(dir, 'check-context.sh', [], { env: { ...spy.env, KUBECONFIG: fake }, timeout: 30_000 })
    assert.equal(r.code, 1, `context 是 prod-eks 時要 exit 1，實際是 ${r.code}`)
    assert.ok(r.stderr.length > 0, '要把錯誤訊息印到 stderr（echo "…" >&2），讓人知道為什麼停下來')
    const calls = spy.calls()
    const bad = calls.filter(isMutating)
    assert.deepEqual(bad.map(a => a.join(' ')), [], '不能用 config use-context 之類的指令改掉別人的 kubeconfig：檢查失敗就停下來，讓人自己決定')
    const touched = calls.filter(a => kubectlVerb(a)[0] !== 'config')
    assert.deepEqual(touched.map(a => a.join(' ')), [], 'context 不對時，除了讀 kubeconfig（kubectl config …）以外不能再呼叫任何 kubectl：先檢查，再動手')
    assert.equal(readFileSync(fake, 'utf8'), text, 'kubeconfig 檔案被改掉了：腳本只能讀')
  } finally {
    spy.cleanup()
    rmSync(tmp, { recursive: true, force: true })
  }
})
