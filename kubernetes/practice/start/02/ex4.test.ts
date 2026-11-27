// 練習 4：report.sh 用 label selector 找出 cafe 的 Pod，並印出容器在等待的原因
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomInt } from 'node:crypto'
import { freshPodNamespace } from './pods.ts'
import { deleteNamespace, isMutating, kubeIn, kubeJson, nsName, podSummary, requireCluster, runScript, spyKubectl, waitFor } from '../../helpers/k8s.ts'

const ns = nsName(2, 4)
type Kind = 'running' | 'ErrImageNeverPull' | 'CreateContainerConfigError'
type Spec = { name: string, partOf?: string, kind: Kind }

const id = () => randomBytes(3).toString('hex')
const pick = <T>(list: T[]) => list[randomInt(list.length)]

// 每次隨機：cafe 的 Pod（有的在跑、有的卡在等待），加上名字也是 cafe- 開頭但屬於別的系統的、名字不是 cafe- 開頭但屬於 cafe 的
function plan(): Spec[] {
  const specs: Spec[] = []
  for (let i = 0; i < randomInt(1, 4); i++) specs.push({ name: `cafe-${pick(['api', 'web', 'menu'])}-${id()}`, partOf: 'cafe', kind: 'running' })
  specs.push({ name: `cafe-worker-${id()}`, partOf: 'cafe', kind: 'ErrImageNeverPull' })
  if (randomInt(2)) specs.push({ name: `cafe-report-${id()}`, partOf: 'cafe', kind: 'CreateContainerConfigError' })
  specs.push({ name: `pos-sync-${id()}`, partOf: 'cafe', kind: pick<Kind>(['running', 'CreateContainerConfigError']) })
  specs.push({ name: `cafe-${id()}`, partOf: 'bakery', kind: pick<Kind>(['running', 'ErrImageNeverPull']) })
  specs.push({ name: `cafe-legacy-${id()}`, kind: 'running' })
  return specs
}

function podJson(s: Spec) {
  const c: any = {
    name: 'main', image: 'busybox:1.38.0', imagePullPolicy: 'IfNotPresent', command: ['sleep', '3600'],
    resources: { requests: { cpu: '5m', memory: '8Mi' }, limits: { memory: '16Mi' } },
  }
  if (s.kind === 'ErrImageNeverPull') Object.assign(c, { image: 'learn-k8s/cafe-worker:v9', imagePullPolicy: 'Never' })
  if (s.kind === 'CreateContainerConfigError') c.env = [{ name: 'MENU', valueFrom: { configMapKeyRef: { name: 'menu-missing', key: 'menu' } } }]
  return { apiVersion: 'v1', kind: 'Pod', metadata: { name: s.name, labels: s.partOf ? { 'app.kubernetes.io/part-of': s.partOf } : {} },
    spec: { terminationGracePeriodSeconds: 0, containers: [c] } }
}

before(async () => { requireCluster(); await freshPodNamespace(ns) })
after(() => deleteNamespace(ns))

test('印出 part-of=cafe 的 Pod 名稱、---、等待中的「名稱 原因」，而且只讀叢集', { timeout: 300_000 }, async () => {
  const specs = plan()
  const r = kubeIn(JSON.stringify({ apiVersion: 'v1', kind: 'List', items: specs.map(podJson) }), 'create', '-n', ns, '--validate=false', '-f', '-')
  assert.equal(r.code, 0, `測試建立 Pod 失敗：${r.stderr}`)
  // 等每個 Pod 都到了預定的狀態，輸出才固定
  await waitFor(() => {
    const pods = kubeJson('get', 'pods', '-n', ns).items
    const state = (name: string) => pods.find((p: any) => p.metadata.name === name)?.status?.containerStatuses?.[0]?.state
    const ok = specs.every(s => s.kind === 'running' ? state(s.name)?.running : state(s.name)?.waiting?.reason === s.kind)
    if (!ok) throw new Error(podSummary(pods))
    return ok
  }, 180_000, '測試建立的 Pod 沒有在時間內到達預定狀態（叢集可能太忙）', 3000)

  const cafe = specs.filter(s => s.partOf === 'cafe')
  const want = [...cafe.map(s => s.name).sort(), '---', ...cafe.filter(s => s.kind !== 'running').map(s => `${s.name} ${s.kind}`).sort()]
  const spy = spyKubectl()
  try {
    const out = runScript(import.meta.dirname, 'ex4/report.sh', [], { env: spy.env })
    assert.equal(out.code, 0, `report.sh 應該以 0 結束，實際是 ${out.code}：${out.stderr}`)
    assert.deepEqual(spy.calls().filter(isMutating).map(a => a.join(' ')), [], 'report.sh 只能讀叢集（get、describe），不能建立、刪除或修改任何東西')
    const lines = out.stdout.split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean)
    assert.deepEqual(lines, want, `輸出不對。這次的 Pod：\n${specs.map(s => `  ${s.name}（part-of=${s.partOf ?? '無'}，${s.kind}）`).join('\n')}\n` +
      '提醒：用 -l app.kubernetes.io/part-of=cafe 挑 Pod（名稱開頭不可靠）；原因要讀容器的 .status.containerStatuses[*].state.waiting.reason，Pod 的 phase 只會是 Pending')
  } finally { spy.cleanup() }
})
