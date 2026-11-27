// 練習 1：SQS 觸發的收據 Lambda。createHandler 的本體＝模組最外層，只在冷啟動執行一次
import { S3Client } from '@aws-sdk/client-s3'

type SqsEvent = { Records: { messageId: string, body: string }[] }
type Context = { getRemainingTimeInMillis(): number }
type BatchResponse = { batchItemFailures: { itemIdentifier: string }[] }

export function createHandler(makeS3: () => S3Client, bucket: string) {
  return async (event: SqsEvent, context: Context): Promise<BatchResponse> => {
    // 1. client 在哪裡建立？（每次呼叫都會執行這裡）
    // 2. 每筆 record：body 是 JSON { orderId }，寫入 receipts/<orderId>.txt，內容是 `訂單 <orderId> 收據`
    // 3. 開始處理一筆之前，剩不到 1000 毫秒就停下，這筆和後面的全部放進 batchItemFailures
    // 4. 單筆失敗（JSON 壞掉、PutObject 失敗）只把那一筆放進 batchItemFailures，不要整批丟例外
    throw new Error('還沒寫')
  }
}
