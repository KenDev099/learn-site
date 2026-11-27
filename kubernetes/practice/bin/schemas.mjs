// 下載 kubeconform 用的 JSON schema 到 kubernetes/practice/schemas/（只需執行一次，結果已放進課程）
// 來源釘在固定的 commit，結果才會每次都一樣：
//   內建資源：yannh/kubernetes-json-schema 的 v1.37.0-standalone-strict（只下載課程用到的種類）
//   CRD：datreeio/CRDs-catalog 的 Gateway API 與 Argo CD Application
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const K8S_COMMIT = 'e0c72a1bc5f409d1685c0e1323460c8a98cd7459'
const CRD_COMMIT = '3eb90d47aba8d61919d4419dd38301536e32a94b'
const OUT = join(import.meta.dirname, '..', 'schemas')
const KINDS = [
  'pod-v1', 'service-v1', 'configmap-v1', 'secret-v1', 'namespace-v1', 'serviceaccount-v1', 'persistentvolumeclaim-v1',
  'persistentvolume-v1', 'limitrange-v1', 'resourcequota-v1', 'deployment-apps-v1', 'replicaset-apps-v1', 'statefulset-apps-v1',
  'daemonset-apps-v1', 'job-batch-v1', 'cronjob-batch-v1', 'horizontalpodautoscaler-autoscaling-v2',
  'poddisruptionbudget-policy-v1', 'role-rbac-v1', 'rolebinding-rbac-v1', 'clusterrole-rbac-v1', 'clusterrolebinding-rbac-v1',
  'networkpolicy-networking-v1', 'ingress-networking-v1', 'ingressclass-networking-v1', 'endpointslice-discovery-v1',
  'storageclass-storage-v1', 'priorityclass-scheduling-v1',
]
const CRDS = [
  'gateway.networking.k8s.io/gateway_v1', 'gateway.networking.k8s.io/httproute_v1', 'gateway.networking.k8s.io/gatewayclass_v1',
  'gateway.networking.k8s.io/referencegrant_v1beta1', 'argoproj.io/application_v1alpha1',
]
const files = [
  ...KINDS.map(k => [`https://raw.githubusercontent.com/yannh/kubernetes-json-schema/${K8S_COMMIT}/v1.37.0-standalone-strict/${k}.json`, `v1.37.0-standalone-strict/${k}.json`]),
  ...CRDS.map(c => [`https://raw.githubusercontent.com/datreeio/CRDs-catalog/${CRD_COMMIT}/${c}.json`, `crds/${c}.json`]),
]
for (const [url, path] of files) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}：HTTP ${r.status}`)
  mkdirSync(dirname(join(OUT, path)), { recursive: true })
  writeFileSync(join(OUT, path), await r.text())
  console.log(path)
}
writeFileSync(join(OUT, 'SOURCE.md'), `yannh/kubernetes-json-schema@${K8S_COMMIT}\ndatreeio/CRDs-catalog@${CRD_COMMIT}\n由 bin/schemas.mjs 產生\n`)
