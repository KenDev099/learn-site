// 練習 1：SQS 觸發的收據 Lambda。createHandler 的本體＝模組最外層，只在冷啟動執行一次
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

type SqsEvent = { Records: { messageId: string, body: string }[] }
type Context = { getRemainingTimeInMillis(): number }
type BatchResponse = { batchItemFailures: { itemIdentifier: string }[] }

export function createHandler(makeS3: () => S3Client, bucket: string) {
  const s3 = makeS3()   // 冷啟動時建一次，之後每次呼叫重用（連線也跟著重用）
  return async (event: SqsEvent, context: Context): Promise<BatchResponse> => {
    const failures: { itemIdentifier: string }[] = []
    for (const [i, record] of event.Records.entries()) {
      if (context.getRemainingTimeInMillis() < 1000) {
        // 時間不夠了：剩下的交還給 SQS，之後會再送一次
        for (const r of event.Records.slice(i)) failures.push({ itemIdentifier: r.messageId })
        break
      }
      try {
        const { orderId } = JSON.parse(record.body)
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `receipts/${orderId}.txt`, Body: `訂單 ${orderId} 收據` }))
      } catch (e) {
        throw e   // 一筆壞掉就整批失敗
      }
    }
    return { batchItemFailures: failures }
  }
}
