// 練習 2：多環境：values-staging.yaml 與 values-prod.yaml；有 HPA 時不輸出 replicas；PDB 只在 prod；機密不放 values
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { parseYaml, readText } from '../../helpers/k8s.ts'
import { container, one, render } from './helm.ts'

const dir = join(import.meta.dirname, 'ex2')
const chart = join(dir, 'chart')
const env = (file: string) => render(chart, { values: [join(dir, file)], set: { 'image.tag': 'v1' } }, `helm template -f ${file}`)
const selectorMatches = (sel: any, labels: any) => Object.entries(sel ?? {}).length > 0 && Object.entries(sel).every(([k, v]) => labels?.[k] === v)

// 找出值檔裡所有像機密的鍵（existingSecret 是參照名稱，不是機密）
function secretKeys(obj: any, path = ''): string[] {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).flatMap(([k, v]) => {
    const p = path ? `${path}.${k}` : k
    const bad = /pass(word|wd)?|secret|token|api_?key|credential|private_?key/i.test(k) && k !== 'existingSecret'
    return [...(bad ? [p] : []), ...secretKeys(v, p)]
  })
}

test('兩個值檔不放機密、不寫 image.tag', { timeout: 10_000 }, () => {
  for (const f of ['values-staging.yaml', 'values-prod.yaml']) {
    const [v = {}] = parseYaml(readText(dir, f), f)
    const keys = secretKeys(v)
    assert.deepEqual(keys, [], `${f} 有像機密的欄位：${keys.join('、')}。值檔常被 commit 進 git，Helm 也會把 values 原樣存進 release 紀錄；密碼放在既有的 Secret，chart 只用 db.existingSecret 寫它的名稱`)
    assert.equal(v.image?.tag, undefined, `${f} 不要寫 image.tag：版本在部署時用 --set image.tag=<版本> 傳入，同一份值檔才能部署任何版本`)
  }
})

test('staging：1 個副本、沒有 HPA 與 PDB、網域 staging-api.cafe.test', { timeout: 30_000 }, () => {
  const objs = env('values-staging.yaml')
  const dep = one(objs, 'Deployment', 'staging 的輸出')
  assert.equal(dep.spec.replicas, 1, `staging 的 Deployment 要有 replicas: 1，現在是 ${dep.spec.replicas}`)
  assert.equal(objs.filter(o => o.kind === 'HorizontalPodAutoscaler').length, 0, 'staging 不要啟用 HPA')
  assert.equal(objs.filter(o => o.kind === 'PodDisruptionBudget').length, 0,
    'staging 不要輸出 PDB：只有 1 個副本時 maxUnavailable 1 等於允許服務中斷，minAvailable 1 則會讓 drain 永遠卡住')
  assert.deepEqual(one(objs, 'HTTPRoute').spec.hostnames, ['staging-api.cafe.test'], 'staging 的 host 是 staging-api.cafe.test')
})

test('prod：沒有 replicas、HPA 3～6 指到 Deployment、PDB 選到同一組 Pod、resources 較大、參照 Secret cafe-db', { timeout: 30_000 }, () => {
  const objs = env('values-prod.yaml')
  const dep = one(objs, 'Deployment', 'prod 的輸出')
  assert(!('replicas' in dep.spec),
    `prod 的 Deployment 不能有 replicas 欄位（現在是 ${dep.spec.replicas}）：HPA 調整了副本數之後，每次 helm upgrade 都會把它改回 values 的值，尖峰時副本突然變少。在範本用 if not .Values.autoscaling.enabled 包住 replicas`)
  const hpa = one(objs, 'HorizontalPodAutoscaler', 'prod 的輸出')
  assert.equal(hpa.spec.minReplicas, 3, 'prod 的 HPA minReplicas 要是 3')
  assert.equal(hpa.spec.maxReplicas, 6, 'prod 的 HPA maxReplicas 要是 6')
  assert.equal(hpa.spec.scaleTargetRef?.name, dep.metadata.name, 'HPA 的 scaleTargetRef 要指到這個 Deployment')
  const pdb = one(objs, 'PodDisruptionBudget', 'prod 的輸出')
  assert(selectorMatches(pdb.spec.selector?.matchLabels, dep.spec.template.metadata.labels), 'PDB 的 selector 要選到 Deployment 的 Pod')
  assert.equal(pdb.spec.maxUnavailable, 1, 'PDB 用 maxUnavailable: 1（第 9 課）')
  const c = container(dep)
  assert.deepEqual(c.resources, { requests: { cpu: '250m', memory: '256Mi' }, limits: { memory: '512Mi' } },
    `prod 的 resources 是 requests cpu 250m、memory 256Mi，limits memory 512Mi，現在是 ${JSON.stringify(c.resources)}`)
  assert.deepEqual(one(objs, 'HTTPRoute').spec.hostnames, ['api.cafe.test'], 'prod 的 host 是 api.cafe.test')
  const db = c.env?.find((e: any) => e.name === 'DATABASE_URL')
  assert.equal(db?.valueFrom?.secretKeyRef?.name, 'cafe-db', 'prod 用 db.existingSecret: cafe-db，讓 DATABASE_URL 從既有的 Secret 讀')
})

test('不給環境值檔時（本機開發）維持 chart 的預設：2 個副本、沒有 HPA', { timeout: 30_000 }, () => {
  const objs = render(chart, { set: { 'image.tag': 'v1' } })
  assert.equal(one(objs, 'Deployment').spec.replicas, 2, 'chart/values.yaml 的預設不要改：autoscaling.enabled 是 false 時 Deployment 要輸出 replicas')
  assert.equal(objs.filter(o => o.kind === 'HorizontalPodAutoscaler').length, 0, 'chart/values.yaml 的預設不啟用 HPA')
})
