// 練習 2：Argo CD Application：釘版本、自動同步（prune、selfHeal）、自動建 namespace、replicas 交給 HPA
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { kubeconform, readText, parseYaml } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex2')
const FILE = 'cafe-prod.yaml'
const load = () => {
  const docs = parseYaml(readText(dir, FILE), FILE)
  assert.equal(docs.length, 1, `${FILE} 只放一個 Application，現在有 ${docs.length} 個物件`)
  return docs[0]
}

test('通過 kubeconform（strict，含 Argo CD Application 的 schema）', { timeout: 30_000 }, () => {
  const r = kubeconform([join(dir, FILE)])
  assert(r.ok, `kubeconform 沒過：欄位名稱或層級寫錯了（strict 模式不允許多出來的欄位）\n${r.message}`)
})

test('來源：config repo 的 charts/cafe、values-prod.yaml、釘在 tag release-2026.11.1', { timeout: 10_000 }, () => {
  const app = load()
  assert.equal(app.kind, 'Application', 'kind 要是 Application')
  assert.equal(app.metadata?.name, 'cafe-prod', 'metadata.name 是 cafe-prod')
  assert.equal(app.metadata?.namespace, 'argocd', 'Application 物件要建在 Argo CD 所在的 argocd namespace，Argo CD 預設只看那裡')
  const src = app.spec?.source ?? {}
  assert.equal(src.repoURL, 'https://github.com/example-cafe/cafe-config', 'source.repoURL 是 config repo：https://github.com/example-cafe/cafe-config')
  assert.equal(src.path, 'charts/cafe', 'source.path 是 repo 裡 chart 的資料夾 charts/cafe')
  const rev = String(src.targetRevision ?? '')
  assert(!/^(HEAD|main|master|\*|)$/.test(rev),
    `targetRevision 是「${rev}」：HEAD、main 會跟著分支跑，看不出 prod 現在是哪一版，也沒有「回到上一版」這個明確的目標。釘成 tag（或 commit SHA）`)
  assert.equal(rev, 'release-2026.11.1', 'targetRevision 要是這次發佈的 tag release-2026.11.1')
  assert.deepEqual(src.helm?.valueFiles, ['values-prod.yaml'], 'source.helm.valueFiles 只放 values-prod.yaml（路徑相對於 chart 的資料夾）')
})

test('目的地：同一個叢集的 cafe-prod namespace，且會自動建立', { timeout: 10_000 }, () => {
  const app = load()
  const dst = app.spec?.destination ?? {}
  assert.equal(dst.server, 'https://kubernetes.default.svc', 'destination.server 用 https://kubernetes.default.svc（Argo CD 所在的叢集）')
  assert.notEqual(dst.namespace ?? 'default', 'default', 'destination.namespace 不能是 default（或不寫）：prod 的服務要在自己的 namespace，配額、權限、NetworkPolicy 才能分開管')
  assert.equal(dst.namespace, 'cafe-prod', 'destination.namespace 是 cafe-prod')
  const opts: string[] = app.spec?.syncPolicy?.syncOptions ?? []
  assert(opts.includes('CreateNamespace=true'), 'syncPolicy.syncOptions 要有 CreateNamespace=true：第一次同步時 cafe-prod 還不存在')
})

test('自動同步：prune 與 selfHeal 都開', { timeout: 10_000 }, () => {
  const auto = load().spec?.syncPolicy?.automated
  assert(auto && typeof auto === 'object', 'syncPolicy.automated 不見了：沒有它，git 有新 commit 也要有人手動按 Sync')
  assert.notEqual(auto.enabled, false, 'automated.enabled 是 false 等於關掉自動同步')
  assert.equal(auto.prune, true, 'automated.prune 要是 true：git 裡刪掉的資源（例如舊的 CronJob）才會從叢集刪掉，否則會一直留著')
  assert.equal(auto.selfHeal, true, 'automated.selfHeal 要是 true：有人手動改了叢集（drift），Argo CD 才會改回 git 的樣子；沒開時只會顯示 OutOfSync')
})

test('replicas 交給 HPA：ignoreDifferences 加上 RespectIgnoreDifferences', { timeout: 10_000 }, () => {
  const app = load()
  const rules: any[] = app.spec?.ignoreDifferences ?? []
  const rule = rules.find(r => r.kind === 'Deployment' && (r.group === 'apps' || r.group === '*'))
  assert(rule, 'prod 的 chart 開了 HPA：spec.ignoreDifferences 要有 group: apps、kind: Deployment 的規則，否則 HPA 一調副本數，Argo CD 就判定 OutOfSync，selfHeal 又把它改回 git 的值')
  assert((rule.jsonPointers ?? []).includes('/spec/replicas'), 'Deployment 的 ignoreDifferences 要用 jsonPointers: [/spec/replicas]')
  assert.equal(rule.name, undefined, '不要限定 name：chart 裡每個有 HPA 的 Deployment 都要忽略 replicas')
  const opts: string[] = app.spec?.syncPolicy?.syncOptions ?? []
  assert(opts.includes('RespectIgnoreDifferences=true'),
    'syncOptions 要有 RespectIgnoreDifferences=true：ignoreDifferences 預設只影響「是否 OutOfSync」，真的同步（例如換新 tag）時仍會把 replicas 寫回 git 的值')
})
