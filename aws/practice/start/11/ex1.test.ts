// 練習 1：design.json 的每一層選擇要符合課文的需求，而且每一層都寫了理由
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readJson } from '../../helpers/aws.ts'

const dir = import.meta.dirname
const d = () => readJson(dir, 'design.json')
// CloudWatch Logs 的 retentionInDays 只接受這些值（PutRetentionPolicy API 文件）
const RETENTION = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653]

test('每一層都寫了理由（至少 10 個字）', () => {
  for (const layer of ['compute', 'worker', 'database', 'redis', 'files', 'secrets', 'network']) {
    const r = d()[layer]?.reason
    assert.ok(typeof r === 'string' && r.trim().length >= 10 && !/TODO/i.test(r), `${layer}.reason 要寫出為什麼這樣選（至少 10 個字）`)
  }
})

test('運算：ECS Fargate', () => {
  const c = d().compute?.choice
  assert.notEqual(c, 'lambda', 'Lambda 不適合：API 是長時間執行的 Nest 程序，BullMQ 的 worker 要一直連著 Redis 等工作，跟 API 在同一個程序（ADR 0005）')
  assert.notEqual(c, 'ec2', 'EC2 要自己修補作業系統：需求寫明兩人團隊、沒有專職維運')
  assert.equal(c, 'ecs-fargate', 'compute.choice 是 ecs-fargate、lambda、ec2 其中一個')
  assert.ok(['same-process', 'separate-service'].includes(d().worker?.choice), 'worker.choice 是 same-process 或 separate-service')
})

test('資料庫：PostgreSQL、Multi-AZ、至少 7 天自動備份', () => {
  const db = d().database ?? {}
  assert.equal(db.engine, 'postgres', '租戶隔離靠 PostgreSQL 的 RLS（作品專案課第 9 課），engine 是 postgres')
  assert.equal(db.multiAz, true, 'RTO 15 分鐘、要撐過單一 AZ 故障：單一 AZ 的 RDS 只能從備份還原，時間不可控；要 Multi-AZ')
  assert.ok(db.backupRetentionDays >= 7, 'RPO 5 分鐘、能還原到 7 天內任一時間點：自動備份（PITR）保留至少 7 天')
})

test('Redis：ElastiCache，maxmemory-policy 是 noeviction', () => {
  const r = d().redis ?? {}
  assert.equal(r.choice, 'elasticache', '就算匯出改用 SQS，每租戶限流（ADR 0006）與登入節流還是用 Redis：不能沒有 Redis')
  assert.equal(r.maxmemoryPolicy, 'noeviction', 'BullMQ 要求 maxmemory-policy 是 noeviction（否則記憶體滿時佇列的 key 會被清掉）；ElastiCache 預設是 volatile-lru')
})

test('檔案、機密：S3 不公開、SSE-KMS；機密放 Secrets Manager', () => {
  const f = d().files ?? {}
  assert.equal(f.choice, 's3')
  assert.equal(f.publicAccess, false, '檔案經過 API 下載（ADR 0004），bucket 不需要也不能公開')
  assert.equal(f.encryption, 'sse-kms', '檔案可能有客戶資料，要能控制誰能解密：用客戶管理金鑰的 SSE-KMS')
  assert.equal(d().secrets?.choice, 'secrets-manager', 'JWT_SECRET 與資料庫密碼不能放在 task definition 的 environment')
})

test('網路與 log：至少兩個 AZ、每個 AZ 一個 NAT；log 保留至少 30 天、不要永久', () => {
  const n = d().network ?? {}
  assert.ok(n.azs >= 2, '至少兩個 AZ')
  assert.ok(n.natGateways >= n.azs, `NAT gateway 只有 ${n.natGateways} 個：放 NAT 的那個 AZ 故障時，其他 AZ 的 task 寄不了信、拉不了映像。每個 AZ 一個`)
  const days = d().logs?.retentionDays
  assert.ok(RETENTION.includes(days), `logs.retentionDays 要是 CloudWatch Logs 接受的值（${RETENTION.slice(0, 9).join('、')}…）；null 代表永久保存，費用一直累積`)
  assert.ok(days >= 30, '公司規定 log 至少保留 30 天')
})
