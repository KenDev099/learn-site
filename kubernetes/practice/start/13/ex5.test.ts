// 練習 5：Kustomize：base＋overlays/prod 做出跟練習 2 prod 等價的設定
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { kubeconform, parseYaml, readText, run } from '../../helpers/k8s.ts'
import { container, one } from './helm.ts'

const dir = join(import.meta.dirname, 'ex5')
const prodDir = join(dir, 'overlays', 'prod')

function build(path: string, label: string): any[] {
  const r = run('kubectl', ['kustomize', path], { timeout: 30_000 })
  if (r.code !== 0) throw new Error(`kubectl kustomize ${label} 失敗：${r.stderr}`)
  const v = kubeconform(['-'], r.stdout)
  if (!v.ok) throw new Error(`kubectl kustomize ${label} 的輸出沒通過 kubeconform：\n${v.message}`)
  return parseYaml(r.stdout, label)
}

test('base 沒被改：kubectl kustomize base 還是 1 個副本、v1、dev 設定', { timeout: 30_000 }, () => {
  const objs = build(join(dir, 'base'), 'base')
  const dep = one(objs, 'Deployment', 'base 的輸出')
  assert.equal(dep.spec.replicas, 1, 'base/deployment.yaml 的 replicas 維持 1：環境的差異寫在 overlay，不改 base')
  assert.equal(container(dep).image, 'learn-k8s/cafe-api:v1', 'base 的映像維持 v1：tag 在 overlay 用 images 換')
  assert.equal(one(objs, 'ConfigMap', 'base 的輸出').data?.APP_ENV, 'dev', 'base 的 configMapGenerator 維持 APP_ENV=dev')
})

test('overlays/prod：映像 v2、沒有 replicas、resources 是 prod 的值、probe 與 labels 跟 base 一樣、有 HPA 與 PDB', { timeout: 30_000 }, () => {
  const objs = build(prodDir, 'overlays/prod')
  const dep = one(objs, 'Deployment', 'prod 的輸出')
  const c = container(dep)
  assert.equal(c.image, 'learn-k8s/cafe-api:v2', `prod 的映像要是 learn-k8s/cafe-api:v2（用 images 的 newTag），現在是 ${c.image}`)
  assert(!('replicas' in dep.spec), `prod 的 Deployment 不能有 replicas（現在是 ${dep.spec.replicas}）：副本數交給 HPA。用 op: remove、path: /spec/replicas 的 JSON patch 拿掉 base 的值`)
  assert.deepEqual(c.resources, { requests: { cpu: '250m', memory: '256Mi' }, limits: { memory: '512Mi' } },
    `prod 的 resources 是 requests cpu 250m、memory 256Mi，limits memory 512Mi，現在是 ${JSON.stringify(c.resources)}`)
  assert.equal(c.readinessProbe?.httpGet?.path, '/health/ready', 'readinessProbe 要跟 base 一樣')
  assert(c.startupProbe && c.livenessProbe && c.lifecycle?.preStop, 'startupProbe、livenessProbe、preStop 要跟 base 一樣')
  assert.deepEqual(dep.spec.template.metadata.labels, { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'cafe' }, 'Pod 的 labels 要跟 base 一樣')
  const hpa = one(objs, 'HorizontalPodAutoscaler', 'prod 的輸出')
  assert.equal(hpa.spec.scaleTargetRef?.name, dep.metadata.name, 'HPA 要指到 Deployment cafe：resources 加上 hpa.yaml')
  one(objs, 'PodDisruptionBudget', 'prod 的輸出')
})

test('ConfigMap 由 configMapGenerator 產生：名稱帶雜湊、Deployment 參照帶雜湊的名稱、APP_ENV=prod', { timeout: 30_000 }, () => {
  const objs = build(prodDir, 'overlays/prod')
  const cm = one(objs, 'ConfigMap', 'prod 的輸出')
  assert.match(cm.metadata.name, /^cafe-config-[a-z0-9]{6,}$/,
    `ConfigMap 的名稱應該是 cafe-config 加上內容的雜湊（現在是 ${cm.metadata.name}）：不要 disableNameSuffixHash，設定一變名稱就變，Deployment 才會滾動更新`)
  assert.deepEqual(cm.data, { APP_ENV: 'prod', LOG_LEVEL: 'info' }, `prod 的設定是 APP_ENV=prod、LOG_LEVEL=info（behavior: merge），現在是 ${JSON.stringify(cm.data)}`)
  const ref = container(one(objs, 'Deployment')).envFrom?.[0]?.configMapRef?.name
  assert.equal(ref, cm.metadata.name, `Deployment 的 envFrom 要參照帶雜湊的名稱 ${cm.metadata.name}，現在是 ${ref}`)
})

test('overlay 只寫差異：不複製整份 Deployment', { timeout: 10_000 }, () => {
  for (const f of readdirSync(prodDir).filter(f => /\.ya?ml$/.test(f))) {
    for (const doc of parseYaml(readText(prodDir, f), f)) {
      if (doc?.kind !== 'Deployment') continue
      const cs = doc.spec?.template?.spec?.containers ?? []
      const copied = cs.some((x: any) => x.image || x.readinessProbe || x.livenessProbe || x.ports) || doc.spec?.selector
      assert(!copied, `${f} 看起來是整份 Deployment 的複本：overlay 只寫要改的欄位（例如容器 api 的 resources），其餘留在 base，否則 base 改了 probe，prod 不會跟著變`)
    }
  }
})
