// 練習 3：SNS → 兩個 SQS，廚房依訊息內容過濾、raw delivery、queue policy 限定來源 topic
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { GetSubscriptionAttributesCommand, ListSubscriptionsByTopicCommand, PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { GetQueueAttributesCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { client, requireMoto, session } from '../../helpers/aws.ts'
import { setupFanout, type Fanout } from './fanout.ts'

const dir = import.meta.dirname
const name = `cafe-10-orders-${process.pid}`
let sns: SNSClient, sqs: SQSClient, f: Fanout

before(async () => {
  await requireMoto()
  const sess = await session(dir)
  sns = client(SNSClient, sess)
  sqs = client(SQSClient, sess)
  f = await setupFanout(sns, sqs, name)
})

async function drain(url: string) {
  const bodies: string[] = []
  for (let i = 0; i < 3; i++) {
    const r = await sqs.send(new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }))
    bodies.push(...(r.Messages ?? []).map(m => m.Body!))
  }
  return bodies
}

test('發布一杯拿鐵和一個可頌：廚房只收到飲料，收據兩個都收到，訊息是原本的 JSON', async () => {
  await sns.send(new PublishCommand({ TopicArn: f.topicArn, Message: JSON.stringify({ type: 'drink', orderId: 'o-1', item: '拿鐵' }) }))
  await sns.send(new PublishCommand({ TopicArn: f.topicArn, Message: JSON.stringify({ type: 'food', orderId: 'o-2', item: '可頌' }) }))
  const kitchen = await drain(f.kitchenUrl)
  const receipts = await drain(f.receiptsUrl)
  const ids = (bodies: string[], who: string) => bodies.map(b => {
    const j = JSON.parse(b)
    assert.ok(!('TopicArn' in j), `${who} 收到的是 SNS 的信封（有 TopicArn、Message 欄位）：訂閱要設 RawMessageDelivery: 'true'，消費者才拿到原本的 JSON`)
    return j.orderId
  }).sort()
  assert.deepEqual(ids(receipts, '收據佇列'), ['o-1', 'o-2'], '收據佇列不過濾，兩則都要收到')
  assert.deepEqual(ids(kitchen, '廚房佇列'), ['o-1'],
    '廚房只收 type 是 drink 的訊息。type 在訊息內容（body）裡，不在 message attributes：FilterPolicy 要搭配 FilterPolicyScope: MessageBody')
})

test('queue policy 只允許 SNS 從這個 topic 送訊息進來', async () => {
  for (const [who, url] of [['kitchen', f.kitchenUrl], ['receipts', f.receiptsUrl]]) {
    const a = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['Policy', 'QueueArn'] }))).Attributes!
    assert.ok(a.Policy, `${who} 佇列沒有 queue policy：真的 AWS 上 SNS 沒有權限送訊息進來（模擬器不檢查）`)
    const st = [JSON.parse(a.Policy!).Statement].flat()
    assert.equal(st.length, 1, `${who}：只要一條 Statement`)
    const s = st[0]
    assert.equal(s.Effect, 'Allow')
    assert.deepEqual(s.Principal, { Service: 'sns.amazonaws.com' }, `${who}：Principal 是 { Service: 'sns.amazonaws.com' }，不要寫 *`)
    assert.deepEqual([s.Action].flat(), ['sqs:SendMessage'], `${who}：Action 只給 sqs:SendMessage`)
    assert.equal(s.Resource, a.QueueArn, `${who}：Resource 是這個佇列的 ARN`)
    assert.equal(s.Condition?.ArnEquals?.['aws:SourceArn'], f.topicArn,
      `${who}：要有 Condition { ArnEquals: { 'aws:SourceArn': topic ARN } }，不然任何帳號的任何 SNS topic 都能把訊息塞進你的佇列`)
  }
})

test('訂閱設定：raw delivery；廚房的過濾範圍是 MessageBody；重複執行不會多出訂閱', async () => {
  const again = await setupFanout(sns, sqs, name)
  assert.deepEqual(again, f, '再執行一次要回傳一樣的 topic 與佇列')
  const subs = (await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: f.topicArn }))).Subscriptions ?? []
  assert.equal(subs.length, 2, `topic 應該剛好有 2 個訂閱，實際 ${subs.length} 個`)
  for (const s of subs) {
    const attrs = (await sns.send(new GetSubscriptionAttributesCommand({ SubscriptionArn: s.SubscriptionArn }))).Attributes!
    assert.equal(attrs.RawMessageDelivery, 'true', '兩個訂閱都要 RawMessageDelivery: true')
    if (s.Endpoint!.endsWith('-kitchen')) {
      assert.deepEqual(JSON.parse(attrs.FilterPolicy ?? '{}'), { type: ['drink'] }, '廚房的 FilterPolicy 是 { type: ["drink"] }')
      assert.equal(attrs.FilterPolicyScope, 'MessageBody', '廚房的 FilterPolicyScope 要是 MessageBody')
    } else {
      assert.equal(attrs.FilterPolicy, undefined, '收據佇列不設 FilterPolicy')
    }
  }
})
