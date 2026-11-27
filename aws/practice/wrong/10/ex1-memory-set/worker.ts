// 練習 1：寄收據的 worker。一次從 SQS 拉一批訊息，用 DynamoDB 的完成標記做冪等，成功才刪訊息
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

export type Job = { orderId: string, email: string }
export type Options = { queueUrl: string, table: string, waitSeconds?: number }
export type Result = { done: number, duplicates: number, failed: number }

const seen = new Set<string>()   // 記在記憶體
export async function pollOnce(sqs: SQSClient, ddb: DynamoDBDocumentClient, { queueUrl, table, waitSeconds = 20 }: Options,
  handle: (job: Job) => Promise<void>): Promise<Result> {
  const result = { done: 0, duplicates: 0, failed: 0 }
  const r = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: waitSeconds }))
  for (const m of r.Messages ?? []) {
    const remove = () => sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle }))
    const job = JSON.parse(m.Body!) as Job
    const pk = `receipt#${job.orderId}`
    if (seen.has(pk)) {
      await remove()
      result.duplicates++
      continue
    }
    try {
      await handle(job)
    } catch {
      result.failed++          // 不刪：visibility timeout 到了會再出現
      continue
    }
    seen.add(pk)
    await remove()
    result.done++
  }
  return result
}
