// 練習 3：訂單事件的 fan-out。一個 SNS topic 推給兩個 SQS：廚房只收飲料，收據全部都收
import { CreateTopicCommand, SNSClient, SubscribeCommand } from '@aws-sdk/client-sns'
import { CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs'

export type Fanout = { topicArn: string, kitchenUrl: string, receiptsUrl: string }

export async function setupFanout(sns: SNSClient, sqs: SQSClient, name = 'cafe-10-orders'): Promise<Fanout> {
  const { TopicArn: topicArn } = await sns.send(new CreateTopicCommand({ Name: name }))

  // 建佇列、只讓這個 topic 送訊息進來、訂閱
  async function queueFor(suffix: string, extra: Record<string, string> = {}) {
    const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: `${name}-${suffix}` }))
    const arn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] }))).Attributes!.QueueArn!
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'sns.amazonaws.com' },
        Action: 'sqs:SendMessage',
        Resource: arn,
        Condition: { ArnEquals: { 'aws:SourceArn': topicArn } },
      }],
    }
    await sqs.send(new SetQueueAttributesCommand({ QueueUrl, Attributes: { Policy: JSON.stringify(policy) } }))
    await sns.send(new SubscribeCommand({ TopicArn: topicArn, Protocol: 'sqs', Endpoint: arn, Attributes: { ...extra } }))
    return QueueUrl!
  }

  const kitchenUrl = await queueFor('kitchen', { FilterPolicy: JSON.stringify({ type: ['drink'] }), FilterPolicyScope: 'MessageBody' })
  const receiptsUrl = await queueFor('receipts')
  return { topicArn: topicArn!, kitchenUrl, receiptsUrl }
}
