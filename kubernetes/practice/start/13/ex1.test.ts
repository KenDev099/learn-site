// 練習 1：最小 chart：helm lint、required 的 image.tag、kubeconform、values 反映到輸出、共用 labels
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { helmTemplate, parseYaml, readText, run } from '../../helpers/k8s.ts'
import { container, one, render } from './helm.ts'

const chart = join(import.meta.dirname, 'ex1', 'chart')
const templates = join(chart, 'templates')

test('helm lint 通過，values.yaml 沒有替 image.tag 設預設值', { timeout: 30_000 }, () => {
  const lint = run('helm', ['lint', chart, '--set', 'image.tag=v1'], { timeout: 30_000 })
  assert.equal(lint.code, 0, `helm lint 沒過：\n${lint.stdout}\n${lint.stderr}`)
  const [values] = parseYaml(readText(chart, 'values.yaml'), 'values.yaml')
  assert.equal(values?.image?.tag, undefined,
    `values.yaml 不要寫 image.tag（現在是 ${values?.image?.tag}）：有預設值（尤其是 latest）就會在忘了傳版本時悄悄部署一個不知道是哪一版的映像，也沒辦法回滾到確定的版本`)
})

test('沒給 image.tag 時 helm template 失敗，訊息提到 image.tag', { timeout: 30_000 }, () => {
  const r = helmTemplate(chart)
  assert.notEqual(r.code, 0, '沒有 --set image.tag 時 helm template 應該失敗：在 image 那一行用 required 檢查 .Values.image.tag')
  assert.match(r.stderr, /image\.tag/, `失敗訊息要提到 image.tag，讓部署的人知道缺什麼。現在的訊息：${r.stderr}`)
})

test('給了 image.tag：通過 kubeconform，映像、網域、副本數、resources、probe 都來自 values', { timeout: 30_000 }, () => {
  const objs = render(chart, { set: { 'image.tag': 'v1' } })
  const dep = one(objs, 'Deployment'), svc = one(objs, 'Service'), route = one(objs, 'HTTPRoute')
  for (const o of [dep, svc, route]) assert.equal(o.metadata.name, 'cafe', `${o.kind} 的名稱用 include "cafe.fullname"（release 名稱 cafe），現在是 ${o.metadata.name}`)
  const c = container(dep)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', `映像要是 image.repository:image.tag，現在是 ${c.image}`)
  assert.deepEqual(c.resources, { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '128Mi' } },
    `容器的 resources 要等於 values.yaml 的 resources（toYaml 加上正確的 nindent），現在是 ${JSON.stringify(c.resources)}`)
  assert.equal(dep.spec.replicas, 2, `replicas 要讀 .Values.replicas（預設 2），現在是 ${dep.spec.replicas}`)
  assert.deepEqual(route.spec.hostnames, ['cafe.test'], `HTTPRoute 的 hostnames 要用 .Values.host，現在是 ${JSON.stringify(route.spec.hostnames)}`)
  assert.equal(route.spec.rules?.[0]?.backendRefs?.[0]?.name, svc.metadata.name, 'HTTPRoute 的 backendRefs 要指到這個 chart 的 Service（名稱一樣用 cafe.fullname）')
  assert.equal(c.readinessProbe?.httpGet?.path, '/health/ready', 'readinessProbe 維持起始檔的設定（第 7 課）')
  assert(c.startupProbe && c.livenessProbe && c.lifecycle?.preStop, 'startupProbe、livenessProbe 與 preStop 維持起始檔的設定（第 7 課）')
})

test('換 release 名稱與 values 後，每個物件都帶同一組 labels，selector 只用不會變的兩個', { timeout: 30_000 }, () => {
  const objs = render(chart, { release: 'cafe-staging', set: { 'image.tag': 'v2', replicas: '3', host: 'staging.cafe.test' } })
  const dep = one(objs, 'Deployment'), svc = one(objs, 'Service'), route = one(objs, 'HTTPRoute')
  assert.equal(dep.spec.replicas, 3, '--set replicas=3 要反映在 Deployment 的 replicas')
  assert.deepEqual(route.spec.hostnames, ['staging.cafe.test'], '--set host=… 要反映在 HTTPRoute 的 hostnames')
  const want = {
    'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'cafe-staging', 'app.kubernetes.io/version': '1.0.0',
    'app.kubernetes.io/managed-by': 'Helm', 'helm.sh/chart': 'cafe-api-0.1.0',
  }
  for (const [what, labels] of [['Deployment', dep.metadata.labels], ['Pod 範本', dep.spec.template.metadata.labels], ['Service', svc.metadata.labels], ['HTTPRoute', route.metadata.labels]] as const)
    assert.deepEqual(labels, want, `${what} 的 labels 要是 include "cafe.labels" 產生的那一組（instance 跟著 release 名稱變），現在是 ${JSON.stringify(labels)}`)
  const sel = { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'cafe-staging' }
  assert.deepEqual(dep.spec.selector.matchLabels, sel,
    'Deployment 的 selector 只放 name 與 instance（include "cafe.selectorLabels"）：selector 建立後不能改，放了 version 或 chart 版本，下次升級就會被 API server 拒絕')
  assert.deepEqual(svc.spec.selector, sel, 'Service 的 selector 也用 include "cafe.selectorLabels"')
})

test('labels 寫在 _helpers.tpl，每個範本用 include 引用，不各自寫死', { timeout: 10_000 }, () => {
  const helpers = readText(templates, '_helpers.tpl')
  assert.match(helpers, /define\s+"cafe\.labels"/, '_helpers.tpl 要 define "cafe.labels"')
  assert.match(helpers, /define\s+"cafe\.selectorLabels"/, '_helpers.tpl 要 define "cafe.selectorLabels"')
  for (const f of readdirSync(templates).filter(f => /\.ya?ml$/.test(f))) {
    // 去掉 YAML 註解與範本註解，寫在註解裡的 include 不算
    const src = readText(templates, f).replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, '').replace(/^\s*#.*$/gm, '')
    assert.match(src, /include\s+"cafe\.labels"/, `${f} 的 labels 要用 include "cafe.labels"：各自寫死的話，改一個 label 要改每個檔案，總有一個漏掉`)
    assert.doesNotMatch(src, /app\.kubernetes\.io\//, `${f} 裡不要直接寫 app.kubernetes.io/ 的 label，一律放在 _helpers.tpl`)
  }
})
