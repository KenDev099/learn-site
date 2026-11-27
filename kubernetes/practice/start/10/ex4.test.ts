// 練習 4：CronJob 每天台北 23:30、Forbid、startingDeadlineSeconds 600、歷史 3／3；run-now.sh 用 --from=cronjob 手動跑；報表重跑是冪等的
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, nsName, parseYaml, readText, requireCluster, runScript } from '../../helpers/k8s.ts'
import { jobLogs, readOne, sql, startPostgres, trueConditions, waitJobDone } from './jobs.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(10, 4)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('cronjob.yaml：schedule、timeZone、concurrencyPolicy、startingDeadlineSeconds、歷史保留都對，jobTemplate 沒被改', { timeout: 30_000 }, () => {
  const cj = readOne(dir, 'cronjob.yaml', 'CronJob', 'daily-report')
  const original = parseYaml(readText(join(import.meta.dirname, '..', '..', 'start', '10', 'ex4'), 'cronjob.yaml'))[0]
  assert.deepEqual(cj.spec.jobTemplate, original.spec.jobTemplate, 'jobTemplate 不要改：這題只改 CronJob 自己的排程設定')
  const s = cj.spec
  if (s.schedule === '30 15 * * *') assert.fail('"30 15 * * *" 是把台北 23:30 換算成 UTC：控制器的時區一換（或夏令時間地區）就錯，看 YAML 的人也看不出是幾點。寫 schedule: "30 23 * * *" 加上 timeZone: Asia/Taipei')
  assert.equal(s.schedule, '30 23 * * *', 'schedule 的五個欄位是「分 時 日 月 星期」：每天 23:30 是 "30 23 * * *"')
  assert.equal(s.timeZone, 'Asia/Taipei', '要寫 timeZone: Asia/Taipei：沒寫就用 kube-controller-manager 的時區，雲端上通常是 UTC，報表會在台北早上 7:30 才跑')
  assert.equal(s.concurrencyPolicy, 'Forbid', s.concurrencyPolicy === undefined || s.concurrencyPolicy === 'Allow'
    ? 'concurrencyPolicy 預設是 Allow：上一份報表還沒跑完，下一份照樣開始，兩份同時寫同一天的資料。用 Forbid（這一次跳過）'
    : 'Replace 會砍掉正在跑的那一份；報表要的是「跳過這一次」，用 Forbid')
  assert.equal(s.startingDeadlineSeconds, 600, 'startingDeadlineSeconds 要是 600：錯過排程 10 分鐘內補跑')
  assert.equal(s.successfulJobsHistoryLimit, 3, 'successfulJobsHistoryLimit 寫 3（預設剛好也是 3，寫出來讓讀的人不用背預設值）')
  assert.equal(s.failedJobsHistoryLimit, 3, 'failedJobsHistoryLimit 要是 3：預設只留 1 個失敗的 Job，連續失敗時只看得到最後一次的 log')
  const script = readText(dir, 'run-now.sh').split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
  assert.match(script, /\bkubectl\b/, 'run-now.sh 還沒有任何 kubectl 指令：照著 TODO 寫')
  staticOk = true
})

const TODAY = "(now() AT TIME ZONE 'Asia/Taipei')::date"
const jobNames = () => new Set<string>(kubeJson('get', 'jobs', '-n', ns).items.map((j: any) => j.metadata.name))

// 執行 run-now.sh，回傳它建立的那一個 Job（排程自己觸發的不算）並等它結束
async function runNow(round: string) {
  const before = jobNames()
  const r = runScript(dir, 'run-now.sh', [], { timeout: 60_000 })
  assert.equal(r.code, 0, `${round}：bash run-now.sh 應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
  const created = kubeJson('get', 'jobs', '-n', ns).items.filter((j: any) => !before.has(j.metadata.name)
    && !j.metadata.annotations?.['batch.kubernetes.io/cronjob-scheduled-timestamp'])
  assert.equal(created.length, 1, `${round}：run-now.sh 應該剛好建立 1 個 Job，實際建立了 ${created.length} 個`)
  const job = created[0]
  assert.equal(job.metadata.annotations?.['cronjob.kubernetes.io/instantiate'], 'manual',
    `${round}：Job ${job.metadata.name} 不是從 CronJob 建立的。用 kubectl create job <名稱> --from=cronjob/daily-report：直接用 CronJob 現在的 jobTemplate，另外複製的 YAML 遲早跟 CronJob 不一樣`)
  assert(job.metadata.ownerReferences?.some((o: any) => o.kind === 'CronJob' && o.name === 'daily-report'), `${round}：Job 應該屬於 CronJob daily-report（--from=cronjob 會自動加上 ownerReferences）`)
  const done = await waitJobDone(ns, job.metadata.name, 180_000)
  assert(trueConditions(done).includes('Complete'), `${round}的報表 Job 失敗了：\n${jobLogs(ns, job.metadata.name)}\n（duplicate key 代表重跑時又 INSERT 了同一天：報表要能重跑）`)
}

test('run-now.sh 用 CronJob 手動跑報表；跑兩次（中間多一筆訂單），daily_revenue 今天只有一筆、金額是最新的', { timeout: 600_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  await startPostgres(ns, ['db-report'])
  sql(ns, `CREATE TABLE orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id bigint NOT NULL, ordered_at timestamptz NOT NULL DEFAULT now(), total integer NOT NULL);
    CREATE TABLE daily_revenue (day date PRIMARY KEY, total integer NOT NULL, generated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO orders (customer_id, total, ordered_at) VALUES (1, 80, now()), (2, 220, now()), (3, 999, now() - interval '1 day');`)
  const cm = kube('create', 'configmap', 'daily-report-sql', '-n', ns, `--from-file=report.sql=${join(dir, 'report.sql')}`)
  assert.equal(cm.code, 0, `測試從 report.sql 建立 ConfigMap 失敗：${cm.stderr}`)
  applyDir(join(dir, 'cronjob.yaml'), ns)

  await runNow('第一次')
  assert.equal(sql(ns, `SELECT total FROM daily_revenue WHERE day = ${TODAY}`), '300', '第一次跑完，今天的 total 應該是 300（80＋220；昨天那筆 999 不算）')

  sql(ns, 'INSERT INTO orders (customer_id, total) VALUES (4, 120)')
  await runNow('第二次')
  assert.equal(sql(ns, 'SELECT count(*) FROM daily_revenue'), '1', '重跑之後 daily_revenue 應該還是只有今天一列')
  assert.equal(sql(ns, `SELECT total FROM daily_revenue WHERE day = ${TODAY}`), '420',
    '重跑之後今天的 total 應該更新成 420（多了一筆 120）：ON CONFLICT DO NOTHING 會留下舊的金額，要用 DO UPDATE')
})
