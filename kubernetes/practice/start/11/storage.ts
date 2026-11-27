// 第 11 課測試共用：讀 manifest、找容器與 volume、在 Pod 裡跑指令
import { join } from 'node:path'
import { freshNamespace, kube, kubeIn, kubeJson, kubeconform, readYaml, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

// 檔案先過 kubeconform，再回傳裡面的物件
export function readManifest(dir: string, file: string): any[] {
  const v = kubeconform([join(dir, file)])
  if (!v.ok) throw new Error(`${file} 沒通過 kubeconform（欄位名稱、縮排、型別要對，例如 storage 是 1Gi 這種數量字串）：\n${v.message}`)
  return readYaml(dir, file)
}

// 物件清單裡唯一一個指定 kind 與名稱的物件
export function only(docs: any[], kind: string, name: string, file: string): any {
  const found = docs.filter(d => d.kind === kind && d.metadata?.name === name)
  if (found.length !== 1) throw new Error(`${file} 裡要有一個名為 ${name} 的 ${kind}，現在的物件是：${docs.map(d => `${d.kind}/${d.metadata?.name}`).join('、') || '（沒有）'}`)
  return found[0]
}

// Pod 範本裡名為 name 的容器
export function containerOf(workload: any, name: string): any {
  const c = workload.spec?.template?.spec?.containers?.find((x: any) => x.name === name)
  if (!c) throw new Error(`${workload.kind} ${workload.metadata?.name} 裡要有名為 ${name} 的容器`)
  return c
}

// 掛在 mountPath 的 volume 定義（Pod 範本的 volumes 裡）；沒有掛載時回傳 undefined
export function volumeAt(workload: any, c: any, mountPath: string): any {
  const m = (c.volumeMounts ?? []).find((x: any) => x.mountPath === mountPath)
  if (!m) return undefined
  return (workload.spec.template.spec.volumes ?? []).find((v: any) => v.name === m.name) ?? { name: m.name }
}

export function envValue(c: any, name: string): string | undefined {
  return (c.env ?? []).find((e: any) => e.name === name)?.value
}

// 測試自己準備的「外部」postgres：一個 namespace 裡的 Deployment＋Service ext-pg（只給練習用）
export async function startExternalPostgres(ns: string, password: string) {
  const labels = { 'app.kubernetes.io/name': 'ext-pg' }
  const list = {
    apiVersion: 'v1', kind: 'List', items: [
      { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'ext-pg-admin' }, stringData: { password } },
      {
        apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'ext-pg' },
        spec: {
          replicas: 1, selector: { matchLabels: labels },
          template: {
            metadata: { labels },
            spec: {
              terminationGracePeriodSeconds: 5,
              containers: [{
                name: 'postgres', image: 'postgres:18.6-alpine3.24', imagePullPolicy: 'IfNotPresent',
                env: [
                  { name: 'POSTGRES_USER', value: 'cafe' }, { name: 'POSTGRES_DB', value: 'cafe' },
                  { name: 'POSTGRES_PASSWORD', valueFrom: { secretKeyRef: { name: 'ext-pg-admin', key: 'password' } } },
                ],
                ports: [{ containerPort: 5432 }],
                readinessProbe: { exec: { command: ['pg_isready', '-h', '127.0.0.1', '-U', 'cafe', '-d', 'cafe'] }, periodSeconds: 2, timeoutSeconds: 5 },
                resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '256Mi' } },
              }],
            },
          },
        },
      },
      { apiVersion: 'v1', kind: 'Service', metadata: { name: 'ext-pg' }, spec: { selector: labels, ports: [{ port: 5432 }] } },
    ],
  }
  const a = kubeIn(JSON.stringify(list), 'apply', '-n', ns, '-f', '-')
  if (a.code !== 0) throw new Error(`測試建立 ${ns} 的 postgres 失敗：${a.stderr}`)
  await waitPodsReady(ns, 'app.kubernetes.io/name=ext-pg', 1, 300_000)
}

// Pod 的 Events（給錯誤訊息與驅逐的檢查用）
export function podEvents(ns: string, pod: string): { reason: string, message: string }[] {
  return kubeJson('get', 'events', '-n', ns, '--field-selector', `involvedObject.name=${pod}`).items
    .map((e: any) => ({ reason: e.reason, message: e.message }))
}

export const exec = (ns: string, pod: string, container: string, ...cmd: string[]) => kube('exec', '-n', ns, pod, '-c', container, '--', ...cmd)

// freshNamespace 只等 120 秒；叢集很忙時上一次的 namespace（含 PVC）可能還在刪，就再等一下重試
export async function fresh(ns: string) {
  await waitFor(() => { try { return freshNamespace(ns) } catch (e: any) { if (/being deleted|AlreadyExists/.test(e.message)) return null; throw e } },
    420_000, `namespace ${ns} 一直刪不完：kubectl get all,pvc -n ${ns} 看卡在哪裡`, 5000)
}
