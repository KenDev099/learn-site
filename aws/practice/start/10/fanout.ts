// 練習 3：訂單事件的 fan-out。一個 SNS topic 推給兩個 SQS：廚房只收飲料，收據全部都收
import { SNSClient } from '@aws-sdk/client-sns'
import { SQSClient } from '@aws-sdk/client-sqs'

export type Fanout = { topicArn: string, kitchenUrl: string, receiptsUrl: string }

export async function setupFanout(sns: SNSClient, sqs: SQSClient, name = 'cafe-10-orders'): Promise<Fanout> {
  // 1. CreateTopicCommand：topic 名稱 name
  // 2. 兩個佇列：`${name}-kitchen`、`${name}-receipts`（CreateQueueCommand，再用 GetQueueAttributesCommand 取 QueueArn）
  // 3. 每個佇列的 queue policy（SetQueueAttributesCommand 的 Attributes.Policy，JSON 字串）：
  //    只允許 sns.amazonaws.com 對這個佇列 sqs:SendMessage，而且條件 ArnEquals aws:SourceArn 是這個 topic
  // 4. SubscribeCommand（Protocol: 'sqs'、Endpoint: 佇列 ARN），Attributes：
  //    兩個都 RawMessageDelivery: 'true'；廚房另外加 FilterPolicy（type 是 drink）與 FilterPolicyScope: 'MessageBody'
  // 重複執行要安全：這幾個 API 用同樣的參數再呼叫一次，都會回傳原本的資源
  throw new Error('還沒寫')
}
