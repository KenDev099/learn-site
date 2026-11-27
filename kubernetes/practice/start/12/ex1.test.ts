// 練習 1：CI 部署帳號 ci-deployer 的最小權限：用 SubjectAccessReview（kubectl auth can-i 背後的 API）檢查 14 個組合，再用它的 token 真的跑一次部署
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeIn, kubeJson, nsName, requireCluster, runScript, waitPodsReady } from '../../helpers/k8s.ts'
import { FIXTURES, describe, readManifest } from './lib.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(12, 1)
const SA = `system:serviceaccount:${ns}:ci-deployer`
let staticOk = false, rbacOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('rbac.yaml：ServiceAccount ci-deployer、Role 與 RoleBinding；沒有 *、secrets、pods/exec，也沒有叢集層級的物件', { timeout: 30_000 }, () => {
  const docs = readManifest(dir, 'rbac.yaml')
  assert(docs.some(d => d.kind === 'ServiceAccount' && d.metadata?.name === 'ci-deployer'), `rbac.yaml 裡要有 ServiceAccount ci-deployer，現在是：${describe(docs)}`)
  const cluster = docs.filter(d => d.kind === 'ClusterRole' || d.kind === 'ClusterRoleBinding' || d.kind === 'Namespace')
  assert.equal(cluster.length, 0, `不要寫 ${describe(cluster)}：部署帳號只需要這個 namespace 的權限，用 Role 和 RoleBinding`)
  const roles = docs.filter(d => d.kind === 'Role')
  assert(roles.length > 0, '要有一個 Role')
  assert(docs.some(d => d.kind === 'RoleBinding'), '要有一個 RoleBinding 把 Role 綁給 ci-deployer：只有 Role 沒有 Binding，誰都用不到')
  for (const r of roles) for (const rule of r.rules ?? []) {
    const all = [...(rule.verbs ?? []), ...(rule.resources ?? []), ...(rule.apiGroups ?? [])]
    assert(!all.includes('*'), `Role ${r.metadata.name} 有 *：把需要的動詞與資源一個一個列出來，以後 Kubernetes 新增的資源也不會被一起授權`)
    assert(!(rule.resources ?? []).includes('secrets'), `Role ${r.metadata.name} 不要碰 secrets：部署帳號不需要讀密碼，get、list、watch 都等於能讀內容`)
    assert(!(rule.resources ?? []).some((x: string) => x.startsWith('pods/')), `Role ${r.metadata.name} 不要給 pods 的子資源（pods/exec、pods/attach…）：能 exec 就能進容器讀環境變數裡的密碼`)
  }
  staticOk = true
})

// [動詞, apiGroup, 資源, 子資源, 應該允許?, namespace]
const CASES: [string, string, string, string, boolean, string?][] = [
  ['get', 'apps', 'deployments', '', true], ['list', 'apps', 'deployments', '', true], ['watch', 'apps', 'deployments', '', true],
  ['patch', 'apps', 'deployments', '', true], ['update', 'apps', 'deployments', '', true],
  ['list', 'apps', 'replicasets', '', true], ['list', '', 'pods', '', true],
  ['create', 'batch', 'jobs', '', true], ['get', 'batch', 'jobs', '', true],
  ['get', '', 'secrets', '', false], ['list', '', 'secrets', '', false],
  ['delete', 'apps', 'deployments', '', false], ['create', '', 'pods', 'exec', false],
  ['patch', 'apps', 'deployments', '', false, 'default'],
]
const label = ([verb, group, res, sub, , where]: typeof CASES[number]) =>
  `${verb} ${res}${sub ? '/' + sub : ''}${group ? '.' + group : ''}${where ? `（namespace ${where}）` : ''}`

test('kubectl auth can-i --as ci-deployer：14 個組合都符合最小權限', { timeout: 180_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(join(FIXTURES, 'ex1-app.yaml'), ns)
  applyDir(dir, ns)
  // 一次送出 14 個 SubjectAccessReview（等同 kubectl auth can-i <動詞> <資源> --as system:serviceaccount:k8s-12-ex1:ci-deployer）
  const list = {
    apiVersion: 'v1', kind: 'List', items: CASES.map(([verb, group, resource, subresource, , where]) => ({
      apiVersion: 'authorization.k8s.io/v1', kind: 'SubjectAccessReview',
      spec: { user: SA, groups: ['system:serviceaccounts', `system:serviceaccounts:${ns}`, 'system:authenticated'],
        resourceAttributes: { namespace: where ?? ns, verb, group, resource, subresource } },
    })),
  }
  const r = kubeIn(JSON.stringify(list), 'create', '-f', '-', '-o', 'jsonpath={.status.allowed}{"\\n"}')
  assert.equal(r.code, 0, `送出 SubjectAccessReview 失敗：${r.stderr}`)
  const got = r.stdout.split('\n').map(s => s.trim() === 'true')
  const wrong = CASES.filter((c, i) => got[i] !== c[4]).map(c => `${label(c)} 應該${c[4] ? '允許' : '拒絕'}，現在${c[4] ? '被拒絕' : '被允許'}`)
  assert.deepEqual(wrong, [], `用 kubectl auth can-i <動詞> <資源> -n ${ns} --as ${SA} 自己試試看：\n${wrong.join('\n')}`)
  rbacOk = true
})

test('用 ci-deployer 的 token 執行 deploy.sh v2：成功，cafe-api 換成 v2', { timeout: 300_000 }, async () => {
  assert(rbacOk, '先讓上一項（權限組合）通過')
  await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 1, 180_000)
  const tok = kube('create', 'token', 'ci-deployer', '-n', ns, '--duration', '10m')
  assert.equal(tok.code, 0, `kubectl create token ci-deployer 失敗：${tok.stderr}`)
  // 只有 token 的 kubeconfig：跟 CI 拿到的一樣，沒有管理員憑證
  const cfg = kubeJson('config', 'view', '--raw', '--minify')
  const tmp = mkdtempSync(join(tmpdir(), 'learn-k8s-12-'))
  try {
    const file = join(tmp, 'ci.kubeconfig')
    writeFileSync(file, JSON.stringify({
      apiVersion: 'v1', kind: 'Config', clusters: cfg.clusters,
      users: [{ name: 'ci', user: { token: tok.stdout } }],
      contexts: [{ name: 'ci', context: { cluster: cfg.clusters[0].name, user: 'ci', namespace: ns } }],
      'current-context': 'ci',
    }))
    const r = runScript(FIXTURES, 'deploy.sh', ['v2'], { env: { KUBECONFIG: file } })
    assert.equal(r.code, 0, `用 ci-deployer 的 token 執行 deploy.sh v2 失敗（看 Forbidden 那行缺哪個動詞或資源）：\n${r.stderr || r.stdout}`)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
  const image = kubeJson('get', 'deployment', 'cafe-api', '-n', ns).spec.template.spec.containers[0].image
  assert.equal(image, 'learn-k8s/cafe-api:v2', `deploy.sh 結束後 cafe-api 的映像應該是 v2，現在是 ${image}`)
})
