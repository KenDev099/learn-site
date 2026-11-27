// 第 14 課測試共用：五組故障的根因代碼、證據指令的規則、讀 manifest
import { join } from 'node:path'
import { readYaml } from '../../helpers/k8s.ts'

export const GROUPS = ['a', 'b', 'c', 'd', 'e'] as const
export type Group = typeof GROUPS[number]

// 頁面上列出的根因代碼（多數是干擾選項）
export const CAUSES = [
  'image-tag-typo', 'image-pull-auth', 'missing-secret-key', 'missing-configmap', 'oom-limit', 'readiness-wrong-path',
  'liveness-too-strict', 'selector-mismatch', 'target-port-wrong', 'networkpolicy-dns', 'node-selector-unsatisfiable',
  'quota-exceeded', 'pvc-wrong-storageclass',
]
// 只是症狀（狀態字），不是原因
export const SYMPTOMS = /^(Pending|ImagePullBackOff|ErrImagePull|CrashLoopBackOff|CreateContainerConfigError|OOMKilled|Error|Running|NotReady|Terminating|ContainerCreating)$/i

// 每組的正確根因，以及「看得到這個證據」的指令要包含什麼
export const EXPECTED: Record<Group, { cause: string, evidence: RegExp, hint: string }> = {
  a: { cause: 'image-tag-typo', evidence: /\b(describe|events?)\b/, hint: '拉映像失敗的原因寫在事件裡：kubectl describe pod 或 kubectl events' },
  b: { cause: 'missing-secret-key', evidence: /\b(describe|events?)\b/, hint: 'CreateContainerConfigError 的細節寫在事件裡：kubectl describe pod 或 kubectl events' },
  c: { cause: 'oom-limit', evidence: /\bdescribe\b|lastState|-o\s*=?\s*(yaml|json)\b/, hint: '容器上一次為什麼結束，看 lastState：kubectl describe pod 的 Last State，或 kubectl get pod -o jsonpath 取 lastState.terminated' },
  d: { cause: 'readiness-wrong-path', evidence: /\b(describe|events?)\b/, hint: 'readiness 失敗的 HTTP 狀態碼寫在事件裡（Unhealthy）：kubectl describe pod 或 kubectl events' },
  e: { cause: 'selector-mismatch', evidence: /\bendpointslices?\b|\bendpoints\b/, hint: 'Pod 都 Ready 卻連不上 Service，先看 Service 有沒有挑到 Pod：kubectl get endpointslice -l kubernetes.io/service-name=…' },
}

export const MANIFESTS = join(import.meta.dirname, 'ex1')

// 讀某一組資料夾裡的所有物件
export function readGroup(g: Group): any[] {
  return ['deployment.yaml', 'service.yaml'].flatMap(f => readYaml(join(MANIFESTS, g), f))
}
export const find = (docs: any[], kind: string) => docs.find(d => d.kind === kind)
export const apiContainer = (dep: any) => dep?.spec?.template?.spec?.containers?.find((c: any) => c.name === 'api')

// '128Mi' → MiB；不認得的單位回傳 NaN
export function mib(q: unknown): number {
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?$/.exec(String(q ?? ''))
  if (!m) return NaN
  const f: Record<string, number> = { Ki: 1 / 1024, Mi: 1, Gi: 1024, K: 1000 / 1048576, M: 1e6 / 1048576, G: 1e9 / 1048576 }
  return Number(m[1]) * (m[2] ? f[m[2]] : 1 / 1048576)
}
