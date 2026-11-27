// 練習 4：事故演練。ex4/chart 是團隊的正式版 chart 加上同事 v3 的變更，部署後出了三個事故。
// 查出根因寫進 incidents.json、修在 ex4/chart、寫 INCIDENTS.md；測試從零部署你的 ex4/chart，三個事故都不能再出現
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, kubeJson, nsName, readJson, readText, requireCluster, sleep, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { API, DIR, REDIS, WORKER, devUp, egressAllowed, find, helm, isDefaultDeny, mib, podSpec, redis, render, sections } from './lib.ts'

const ns = nsName(16, 4)
const CHART4 = join(DIR, 'ex4', 'chart')
const IDS = ['A', 'B', 'C'] as const
const CAUSES = [
  'netpol-dns-blocked', 'netpol-redis-port', 'secret-key-renamed', 'image-tag-typo', 'readiness-wrong-path',
  'worker-oom-limit', 'worker-no-grace-period', 'hpa-wrong-target', 'hpa-no-requests', 'pdb-blocks-drain', 'migration-no-lock-timeout',
]
const EXPECTED: Record<typeof IDS[number], { cause: string, evidence: RegExp, hint: string }> = {
  A: { cause: 'netpol-redis-port', evidence: /\b(get|describe)\s+(networkpolic(y|ies)|netpol)\b|\bnetpol\b|networkpolic/i,
    hint: 'readiness 失敗、log 顯示連 Redis 逾時，下一步是看擋住它的規則：kubectl get networkpolicy -n … -o yaml 或 kubectl describe networkpolicy' },
  B: { cause: 'worker-oom-limit', evidence: /\bdescribe\b|lastState|-o\s*=?\s*(yaml|json)\b/,
    hint: '容器上一次為什麼結束，看 lastState：kubectl describe pod 的 Last State（OOMKilled、exit code 137）' },
  C: { cause: 'hpa-wrong-target', evidence: /\b(describe|get)\s+(hpa|horizontalpodautoscalers?)\b|\bevents?\b/,
    hint: 'HPA 為什麼不動作寫在它的 conditions 與事件：kubectl describe hpa -n …' },
}
let diagOk = false, filesOk = false

after(() => { deleteNamespace(ns); deleteNamespace(`${ns}-data`) })

test('incidents.json：三個事故各寫出根因代碼與看到證據的 kubectl 指令', { timeout: 10_000 }, () => {
  const d = readJson(DIR, 'incidents.json')
  for (const id of IDS) {
    const cause = String(d[id]?.cause ?? '').trim(), evidence = String(d[id]?.evidence ?? '').trim()
    assert(cause, `事故 ${id} 還沒填 cause`)
    assert(CAUSES.includes(cause), `事故 ${id} 的 cause 是 ${JSON.stringify(cause)}：從頁面列出的根因代碼選一個，大小寫與連字號都要一樣`)
    assert.equal(cause, EXPECTED[id].cause, `事故 ${id} 的根因不是 ${cause}：照第 14 課的順序再查一次（get → describe 的事件與 Last State → logs → 相關的物件）`)
    assert(/^kubectl\s/.test(evidence), `事故 ${id} 的 evidence 要寫你實際執行、看到證據的那一行 kubectl 指令`)
    assert(EXPECTED[id].evidence.test(evidence), `事故 ${id} 的 evidence「${evidence}」看不到這個根因的證據。${EXPECTED[id].hint}`)
  }
  diagOk = true
})

test('ex4/chart：修在 chart 裡，沒有用拿掉 NetworkPolicy、limits 的方式掩蓋', { timeout: 60_000 }, () => {
  const objs = render(CHART4)
  const nps = objs.filter(o => o.kind === 'NetworkPolicy')
  assert(nps.some(isDefaultDeny), '預設拒絕的 NetworkPolicy 不見了：拿掉安全措施讓服務恢復是掩蓋，不是修正。找出規則裡哪裡寫錯')
  const api = find(objs, 'Deployment', 'cafe-api'), worker = find(objs, 'Deployment', 'cafe-worker')
  assert(egressAllowed(nps, api.spec.template.metadata.labels, REDIS), 'api 還是連不到 redis 的 6379：對照 Service redis 的 port，看 api 那條 egress 規則開的是哪個 port')
  assert(!egressAllowed(nps, api.spec.template.metadata.labels, { ...REDIS, port: 22 }), 'api 的 egress 被放寬成任何 port 都可以：只開 6379')
  const c = podSpec(worker).containers.find((x: any) => x.name === 'worker')
  const lim = mib(c.resources?.limits?.memory)
  assert(!Number.isNaN(lim), 'worker 的 limits.memory 不見了：沒有上限的容器出事時會拖垮整個節點。調到夠用，不要拿掉')
  assert(lim >= 96 && lim <= 512, `worker 的 limits.memory 換算是 ${Math.round(lim)}Mi：處理一張收據時 worker 用到 60Mi 左右（node 本身約 10Mi＋產生 PDF 約 48Mi），給 96Mi～512Mi（例如 128Mi）`)
  const hpa = objs.find(o => o.kind === 'HorizontalPodAutoscaler')
  assert(hpa, 'HPA 不見了：尖峰時要能擴展')
  assert.equal(hpa.spec.scaleTargetRef?.name, 'cafe-api', `HPA 的 scaleTargetRef 指到 ${hpa.spec.scaleTargetRef?.name}：這個 namespace 裡沒有這個 Deployment`)
  assert(c && podSpec(api).containers[0].readinessProbe, 'api 的 readinessProbe 要保留')
  filesOk = true
})

test('INCIDENTS.md：三份事故紀錄，各有時間軸、影響、根因、修正、預防，根因與 incidents.json 一致', { timeout: 10_000 }, () => {
  const d = readJson(DIR, 'incidents.json')
  const docs = sections(readText(DIR, 'INCIDENTS.md'), '##')
  for (const id of IDS) {
    const doc = docs.find(([h]) => new RegExp(`事故\\s*${id}\\b`).test(h))
    assert(doc, `INCIDENTS.md 少了「## 事故 ${id}：…」這一份（標題照起始檔）`)
    const s = Object.fromEntries(sections(doc[1], '###'))
    for (const h of ['時間軸', '影響', '根因', '修正', '預防']) assert(h in s, `事故 ${id} 少了「### ${h}」`)
    for (const h of ['影響', '修正']) assert(s[h].replace(/\s/g, '').length >= 10, `事故 ${id} 的「${h}」還沒寫內容（至少一兩句具體的描述）`)
    const times = s['時間軸'].split('\n').filter(l => /\b\d{1,2}:\d{2}\b/.test(l))
    assert(times.length >= 3, `事故 ${id} 的時間軸只有 ${times.length} 個時間點：至少 3 個（發現、找到原因、修好），每行一個，例如「- 14:05 告警」`)
    assert(s['根因'].includes(d[id]?.cause ?? '\u0000'), `事故 ${id} 的根因一節要寫出 incidents.json 裡的根因代碼（${d[id]?.cause || '還沒填'}），再說明它怎麼造成症狀`)
    const items = s['預防'].split('\n').filter(l => /^\s*([-*]|\d+\.)\s+\S/.test(l))
    assert(items.length >= 1, `事故 ${id} 的預防至少一條（用 - 開頭）：讓同樣的錯在進叢集前、或剛發生時就被發現`)
  }
})

test('叢集：從零部署你的 ex4/chart，api 與 worker 都 Ready、worker 沒有重啟且寄得出收據、HPA 找得到目標', { timeout: 1_800_000 }, async () => {
  assert(diagOk && filesOk, '先讓前兩項（incidents.json 與 chart）通過，再部署到叢集')
  requireCluster()
  await devUp(ns)
  const r = helm('upgrade', '--install', 'cafe', CHART4, '-n', ns, '-f', join(CHART4, 'values-local.yaml'), '--set', 'image.tag=v1', '--wait', '--timeout', '8m')
  assert.equal(r.code, 0, `helm upgrade --install 失敗：${r.stderr.split('\n').slice(-4).join('\n')}`)
  await waitPodsReady(ns, API, 2, 120_000)
  await waitPodsReady(ns, WORKER, 2, 120_000)
  redis(ns, 'LPUSH', 'receipts:pending', 'incident-1', 'incident-2')
  await waitFor(() => redis(ns, 'GET', 'receipts:sent') === '2', 90_000, 'worker 90 秒內沒有寄出 2 張收據')
  await sleep(10_000)
  const restarts = kubeJson('get', 'pods', '-n', ns, '-l', WORKER).items.flatMap((p: any) => p.status.containerStatuses ?? []).reduce((n: number, c: any) => n + c.restartCount, 0)
  assert.equal(restarts, 0, `worker 重啟了 ${restarts} 次：用 kubectl describe pod 看 Last State`)
  await waitFor(() => kubeJson('get', 'hpa', 'cafe-api', '-n', ns).status?.conditions?.find((c: any) => c.type === 'AbleToScale')?.status === 'True', 120_000,
    'HPA 的 AbleToScale 一直不是 True：kubectl describe hpa 看它找不找得到 scaleTargetRef')
})
