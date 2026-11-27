// 練習 3：podFailurePolicy：結束碼 2（設定錯誤）第一次失敗就讓 Job Failed；結束碼 1 照常重試；被驅逐不計次數；backoffLimit 4
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, freshNamespace, kubeIn, kubeJson, nsName, parseYaml, readText, requireCluster, waitFor } from '../../helpers/k8s.ts'
import { readOne, trueConditions } from './jobs.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(10, 3)
let job: any

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('restartPolicy Never、backoffLimit 4、podFailurePolicy：結束碼 2 → FailJob、DisruptionTarget → Ignore', { timeout: 30_000 }, () => {
  const j = readOne(dir, 'resend-job.yaml', 'Job', 'resend-receipts')
  const original = parseYaml(readText(join(import.meta.dirname, '..', '..', 'start', '10', 'ex3'), 'resend-job.yaml'))[0]
  const pod = j.spec?.template?.spec ?? {}
  assert.deepEqual(pod.containers, original.spec.template.spec.containers, '容器（映像、指令、環境變數）不要改：這題只改 Job 的重試設定')
  assert.equal(pod.restartPolicy, 'Never', '有 podFailurePolicy 時 Pod 的 restartPolicy 一定要是 Never（OnFailure 會被 API server 拒絕）：每次失敗都要是一個結束的 Pod，Job 控制器才看得到它的結束碼')
  assert.equal(j.spec.backoffLimit, 4, j.spec.backoffLimit === undefined ? '沒寫 backoffLimit 就是預設的 6，這題要最多重試 4 次' : 'backoffLimit 要是 4')
  const rules: any[] = j.spec.podFailurePolicy?.rules ?? []
  assert(rules.length, '還沒有 spec.podFailurePolicy.rules：沒有它，結束碼 2 也會照常重試 4 次，每次等得更久，白白浪費幾分鐘才失敗')
  const fail = rules.find(r => r.action === 'FailJob' && r.onExitCodes)
  assert(fail, '要有一條 action: FailJob、用 onExitCodes 比對結束碼的規則')
  const hit = (code: number) => fail.onExitCodes.operator === 'In' ? fail.onExitCodes.values.includes(code) : !fail.onExitCodes.values.includes(code)
  assert(hit(2), 'FailJob 規則要比對到結束碼 2（operator: In、values: [2]）')
  assert(!hit(1), fail.onExitCodes.operator === 'NotIn'
    ? 'operator: NotIn [2] 的意思是「除了 2 以外都 FailJob」，暫時的錯誤（結束碼 1）反而不重試了。用 operator: In'
    : 'FailJob 規則不能比對到結束碼 1：暫時的錯誤要留給重試')
  const ignore = rules.find(r => r.action === 'Ignore' && r.onPodConditions?.some((c: any) => c.type === 'DisruptionTarget'))
  assert(ignore, '要有一條 action: Ignore、onPodConditions 是 type: DisruptionTarget 的規則：Pod 因為節點維護被驅逐不是程式的錯，不該用掉重試次數')
  job = j
})

// 用你的 Job 建一份改了名稱與 SMTP_HOST 的副本
function create(name: string, smtpHost: string) {
  const j = structuredClone(job)
  j.metadata = { name }
  j.spec.template.spec.containers[0].env = [{ name: 'SMTP_HOST', value: smtpHost }]
  const r = kubeIn(JSON.stringify(j), 'create', '-n', ns, '-f', '-')
  assert.equal(r.code, 0, `建立 Job ${name} 失敗（API server 拒絕）：${r.stderr}`)
}

test('設定錯誤（結束碼 2）失敗 1 次就 Failed、原因是 PodFailurePolicy；暫時錯誤（結束碼 1）會重試', { timeout: 420_000 }, async () => {
  assert(job, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  create('resend-config-error', '')
  create('resend-transient', 'smtp.cafe.internal')

  const bad = await waitFor(() => {
    const j = kubeJson('get', 'job', 'resend-config-error', '-n', ns)
    return trueConditions(j).includes('Failed') || (j.status?.failed ?? 0) >= 2 ? j : undefined
  }, 180_000, '結束碼 2 的 Job 一直沒有結束')
  assert.equal(bad.status.failed ?? 0, 1, `結束碼 2 的 Job 失敗了 ${bad.status.failed} 次還在重試：設定錯誤重試也不會好，要第一次就讓 Job 失敗`)
  const cond = bad.status.conditions.find((c: any) => c.type === 'Failed')
  assert.equal(cond?.reason, 'PodFailurePolicy', `Job 的 Failed 原因應該是 PodFailurePolicy，現在是 ${cond?.reason}`)

  const good = await waitFor(() => {
    const j = kubeJson('get', 'job', 'resend-transient', '-n', ns)
    return trueConditions(j).includes('Failed') || (j.status?.failed ?? 0) >= 2 ? j : undefined
  }, 180_000, '結束碼 1 的 Job 第一次失敗後沒有重試')
  assert(!trueConditions(good).includes('Failed'), '結束碼 1（暫時的錯誤）第一次失敗就讓 Job Failed 了：只有結束碼 2 才立刻放棄，其他要重試')
})
