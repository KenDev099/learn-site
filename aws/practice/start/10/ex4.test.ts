// 練習 4：S3 事件 → SQS → handler：解 URL 編碼、略過 TestEvent、依物件版本冪等、部分失敗只回報失敗的那則
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { CreateBucketCommand, PutBucketNotificationConfigurationCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { CreateQueueCommand, GetQueueAttributesCommand, ReceiveMessageCommand, SQSClient, type Message } from '@aws-sdk/client-sqs'
import { client, requireMoto, session } from '../../helpers/aws.ts'
import { makeHandler, type Deps, type SqsEvent } from './ingest.ts'

const dir = import.meta.dirname
let s3: S3Client, sqs: SQSClient, bucket: string, queueUrl: string
const messages: Message[] = []

// 假的相依：完成紀錄放在 Set，importCsv 記下呼叫；fail 裡的 key 會丟錯
function deps(fail: string[] = []) {
  const done = new Set<string>()
  const imported: string[] = []
  const d: Deps = {
    isDone: async id => done.has(id),
    markDone: async id => { done.add(id) },
    importCsv: async (b, k) => { if (fail.includes(k)) throw new Error('CSV 格式錯誤'); imported.push(`${b}/${k}`) },
  }
  return { d, imported, done }
}
const toEvent = (ms: { MessageId?: string, Body?: string }[]): SqsEvent => ({ Records: ms.map(m => ({ messageId: m.MessageId!, body: m.Body! })) })
const s3Body = (key: string, extra: Record<string, string> = {}) => JSON.stringify({ Records: [{ eventSource: 'aws:s3', eventName: 'ObjectCreated:Put',
  s3: { bucket: { name: bucket }, object: { key, size: 1, eTag: 'e-' + key, ...extra } } }] })

before(async () => {
  await requireMoto()
  const sess = await session(dir)
  s3 = client(S3Client, sess)
  sqs = client(SQSClient, sess)
  bucket = `cafe-10-ex4-sales-${sess.account}-${process.pid}`
  queueUrl = (await sqs.send(new CreateQueueCommand({ QueueName: `cafe-10-ex4-${process.pid}` }))).QueueUrl!
  const arn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }))).Attributes!.QueueArn
  await s3.send(new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: 'ap-northeast-1' } }))
  await s3.send(new PutBucketNotificationConfigurationCommand({ Bucket: bucket, NotificationConfiguration: { QueueConfigurations: [{
    QueueArn: arn, Events: ['s3:ObjectCreated:*'], Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'sales/' }] } } }] } }))
  for (const key of ['sales/門市 A/2026-11-20 (1).csv', 'sales/a+b.csv']) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'item,qty\n拿鐵,3\n' }))
  // 收齊：1 則 TestEvent ＋ 2 則物件事件
  for (let i = 0; i < 5 && messages.length < 3; i++) {
    const r = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }))
    messages.push(...(r.Messages ?? []))
  }
})

test('真的從 S3 來的事件：略過 TestEvent，key 解成原本的檔名（空白、中文、括號、+）', async () => {
  assert.equal(messages.length, 3, '模擬器應該送出 1 則 TestEvent 與 2 則上傳事件')
  const { d, imported } = deps()
  const r = await makeHandler(d)(toEvent(messages))
  assert.deepEqual(r, { batchItemFailures: [] }, 's3:TestEvent 是設定通知時送的測試訊息，略過就好，不能回報失敗（不然它會一直重送）')
  assert.deepEqual(imported.sort(), [`${bucket}/sales/a+b.csv`, `${bucket}/sales/門市 A/2026-11-20 (1).csv`].sort(),
    'key 是 URL 編碼的：先把 + 換成空白，再 decodeURIComponent（順序反過來，a+b.csv 的 + 會被變成空白）')
})

test('同一個物件的事件送了兩次：只匯入一次', async () => {
  const { d, imported } = deps()
  const ev = toEvent([{ MessageId: 'm1', Body: s3Body('sales/b.csv') }, { MessageId: 'm2', Body: s3Body('sales/b.csv') }])
  const r = await makeHandler(d)(ev)
  assert.deepEqual(imported, [`${bucket}/sales/b.csv`], 'S3 事件至少送達一次，可能重複：同一個物件版本只能匯入一次')
  assert.deepEqual(r.batchItemFailures, [])
})

test('開了版本控制：同一個 key 的兩個版本都要匯入，同一個版本只匯入一次', async () => {
  const { d, imported } = deps()
  const ev = toEvent([
    { MessageId: 'm1', Body: s3Body('sales/c.csv', { versionId: 'v1', eTag: 'same' }) },
    { MessageId: 'm2', Body: s3Body('sales/c.csv', { versionId: 'v2', eTag: 'same' }) },
    { MessageId: 'm3', Body: s3Body('sales/c.csv', { versionId: 'v2', eTag: 'same' }) },
  ])
  await makeHandler(d)(ev)
  assert.equal(imported.length, 2, `門市重新上傳同一個檔名（新版本）也要匯入，同一個版本重複送達只匯入一次；實際匯入 ${imported.length} 次。冪等的 id 要包含 versionId`)
})

test('一則失敗、一則格式壞掉：只回報那兩則的 messageId，其他照常處理', async () => {
  const { d, imported, done } = deps(['sales/bad.csv'])
  const ev = toEvent([
    { MessageId: 'ok-1', Body: s3Body('sales/d.csv') },
    { MessageId: 'bad-1', Body: s3Body('sales/bad.csv') },
    { MessageId: 'broken', Body: 'not json' },
    { MessageId: 'ok-2', Body: s3Body('sales/e.csv') },
  ])
  const r = await makeHandler(d)(ev)
  assert.deepEqual(r.batchItemFailures.map(x => x.itemIdentifier).sort(), ['bad-1', 'broken'],
    '每則訊息各自 try/catch，失敗的 messageId 放進 batchItemFailures；整批丟錯會讓成功的也重來一次')
  assert.deepEqual(imported.sort(), [`${bucket}/sales/d.csv`, `${bucket}/sales/e.csv`])
  assert.ok(![...done].some(id => id.includes('bad.csv')), '匯入失敗的物件不能標記為完成，不然重試時會被跳過')
})
