// 練習 1：pollOnce 用 long polling 拉訊息，成功才刪，重複的跳過，失敗的留給重試與 DLQ
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { CreateQueueCommand, GetQueueAttributesCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { client, requireMoto, session } from '../../helpers/aws.ts'
import { pollOnce, type Job } from './worker.ts'

const dir = import.meta.dirname
const table = `cafe-10-ex1-done-${process.pid}`
let sqs: SQSClient, ddb: DynamoDBDocumentClient
const receives: any[] = []
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 每個測試一組新的佇列：visibility timeout 1 秒、接收 2 次還失敗就進 DLQ
let n = 0
async function queues() {
  const id = `${process.pid}-${n++}`
  const dlq = (await sqs.send(new CreateQueueCommand({ QueueName: `cafe-10-ex1-dlq-${id}` }))).QueueUrl!
  const dlqArn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlq, AttributeNames: ['QueueArn'] }))).Attributes!.QueueArn
  const queueUrl = (await sqs.send(new CreateQueueCommand({ QueueName: `cafe-10-ex1-${id}`, Attributes: {
    VisibilityTimeout: '1', RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: 2 }) } }))).QueueUrl!
  return { queueUrl, dlq, opts: { queueUrl, table, waitSeconds: 1 } }
}
const send = (url: string, job: Job) => sqs.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify(job) }))
async function left(url: string) {
  const a = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'] }))).Attributes!
  return Number(a.ApproximateNumberOfMessages) + Number(a.ApproximateNumberOfMessagesNotVisible)
}
const marked = async (orderId: string) => !!(await ddb.send(new GetCommand({ TableName: table, Key: { pk: `receipt#${orderId}` }, ConsistentRead: true }))).Item

before(async () => {
  await requireMoto()
  const sess = await session(dir)
  sqs = client(SQSClient, sess)
  sqs.middlewareStack.add((next: any, c: any) => async (args: any) => {
    if (c.commandName === 'ReceiveMessageCommand') receives.push(args.input)
    return next(args)
  }, { step: 'initialize', name: 'recordReceive' })
  const raw = client(DynamoDBClient, sess)
  await raw.send(new CreateTableCommand({ TableName: table, BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }] }))
  ddb = DynamoDBDocumentClient.from(raw)
})

test('處理成功：寫完成標記、刪掉訊息；用 long polling 一次最多拉 10 則', async () => {
  const { queueUrl, opts } = await queues()
  await send(queueUrl, { orderId: 'o-101', email: 'wang@example.test' })
  await send(queueUrl, { orderId: 'o-102', email: 'chen@example.test' })
  const handled: string[] = []
  receives.length = 0
  const r = await pollOnce(sqs, ddb, opts, async j => { handled.push(j.orderId) })
  assert.deepEqual(handled.sort(), ['o-101', 'o-102'], '兩則訊息都要交給 handle')
  assert.deepEqual(r, { done: 2, duplicates: 0, failed: 0 })
  assert.equal(receives[0]?.WaitTimeSeconds, 1, 'ReceiveMessage 的 WaitTimeSeconds 要用參數的 waitSeconds（long polling：沒有訊息時等一下，不要空轉）')
  assert.equal(receives[0]?.MaxNumberOfMessages, 10, 'MaxNumberOfMessages 設 10：一次拉一批，少打幾次 API')
  assert.ok(await marked('o-101') && await marked('o-102'), 'DynamoDB 裡要有 receipt#<orderId> 的完成標記：記在程序的記憶體裡，重啟或換一台 worker 就忘了')
  assert.equal(await left(queueUrl), 0, '處理成功的訊息要 DeleteMessage，不然 visibility timeout 後會再處理一次')
})

test('同一張訂單送了兩次（重複送達）：只處理一次，兩則都刪掉', async () => {
  const { queueUrl, opts } = await queues()
  await send(queueUrl, { orderId: 'o-201', email: 'lin@example.test' })
  await send(queueUrl, { orderId: 'o-201', email: 'lin@example.test' })
  let calls = 0
  const r = await pollOnce(sqs, ddb, opts, async () => { calls++ })
  assert.equal(calls, 1, `同一張訂單寄了 ${calls} 次收據：處理前先查完成標記`)
  assert.deepEqual(r, { done: 1, duplicates: 1, failed: 0 })
  assert.equal(await left(queueUrl), 0, '重複的訊息也要刪掉')
})

test('處理失敗：不刪、不寫標記；visibility timeout 過後重新出現，再處理成功', async () => {
  const { queueUrl, opts } = await queues()
  await send(queueUrl, { orderId: 'o-301', email: 'chang@example.test' })
  const r1 = await pollOnce(sqs, ddb, opts, async () => { throw new Error('郵件服務逾時') })
  assert.deepEqual(r1, { done: 0, duplicates: 0, failed: 1 }, 'handle 丟錯要算 failed，不能讓整個 pollOnce 丟錯')
  assert.equal(await marked('o-301'), false, '還沒處理成功就寫了完成標記：重試時會被當成重複而跳過，這封收據永遠不會寄出')
  await sleep(1300)
  const handled: string[] = []
  const r2 = await pollOnce(sqs, ddb, opts, async j => { handled.push(j.orderId) })
  assert.deepEqual(handled, ['o-301'], '失敗的訊息要留在佇列（不刪），visibility timeout 過後再處理一次')
  assert.deepEqual(r2, { done: 1, duplicates: 0, failed: 0 })
  assert.equal(await marked('o-301'), true)
})

test('一直失敗的訊息超過 maxReceiveCount 進 DLQ', async () => {
  const { queueUrl, dlq, opts } = await queues()
  await send(queueUrl, { orderId: 'o-401', email: 'li@example.test' })
  const fail = async () => { throw new Error('收件地址不存在') }
  await pollOnce(sqs, ddb, opts, fail)
  await sleep(1300)
  await pollOnce(sqs, ddb, opts, fail)
  await sleep(1300)
  await pollOnce(sqs, ddb, opts, fail)      // 第 3 次接收時，SQS 把它移到 DLQ
  const d = await sqs.send(new ReceiveMessageCommand({ QueueUrl: dlq, WaitTimeSeconds: 1 }))
  assert.equal(d.Messages?.length, 1, '失敗的訊息不能被刪掉：接收超過 maxReceiveCount（2）次後要出現在 DLQ')
  assert.equal(JSON.parse(d.Messages![0].Body!).orderId, 'o-401')
})

test('同一批裡一則失敗，不影響其他訊息', async () => {
  const { queueUrl, opts } = await queues()
  await send(queueUrl, { orderId: 'o-501', email: 'huang@example.test' })
  await send(queueUrl, { orderId: 'o-502', email: 'wang@example.test' })
  const r = await pollOnce(sqs, ddb, opts, async j => { if (j.orderId === 'o-501') throw new Error('壞掉的 email') })
  assert.deepEqual(r, { done: 1, duplicates: 0, failed: 1 }, '一則失敗要繼續處理下一則，不能整批放棄')
  assert.equal(await marked('o-502'), true)
  assert.equal(await left(queueUrl), 1, '只有失敗的那一則留在佇列')
})
