// 練習 1：寄收據的 worker。一次從 SQS 拉一批訊息，用 DynamoDB 的完成標記做冪等，成功才刪訊息
import { SQSClient } from '@aws-sdk/client-sqs'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export type Job = { orderId: string, email: string }
export type Options = { queueUrl: string, table: string, waitSeconds?: number }
export type Result = { done: number, duplicates: number, failed: number }

export async function pollOnce(sqs: SQSClient, ddb: DynamoDBDocumentClient, { queueUrl, table, waitSeconds = 20 }: Options,
  handle: (job: Job) => Promise<void>): Promise<Result> {
  // 1. ReceiveMessageCommand：最多 10 則、WaitTimeSeconds: waitSeconds（long polling）
  // 2. 每則訊息：body 是 JSON 的 Job；完成標記的 key 是 pk = `receipt#${orderId}`
  //    a. 已經有完成標記（GetCommand，ConsistentRead）：是重複的，刪掉訊息
  //    b. 呼叫 handle；失敗就不要刪，留給 visibility timeout 後重試（超過 maxReceiveCount 會進 DLQ），繼續處理下一則
  //    c. 成功：PutCommand 寫完成標記（ConditionExpression: 'attribute_not_exists(pk)'），再刪掉訊息
  throw new Error('還沒寫')
}
