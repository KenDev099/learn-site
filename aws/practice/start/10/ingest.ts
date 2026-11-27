// 練習 4：門市每晚上傳銷售 CSV 到 S3 → S3 事件送進 SQS → 這個 Lambda handler 匯入。
// 一則 SQS 訊息的 body 是一份 S3 事件（JSON），裡面的 Records 才是一個個物件
export type SqsRecord = { messageId: string, body: string }
export type SqsEvent = { Records: SqsRecord[] }
export type BatchResponse = { batchItemFailures: { itemIdentifier: string }[] }
export type Deps = {
  isDone(id: string): Promise<boolean>          // 這個物件版本匯入過了嗎
  markDone(id: string): Promise<void>           // 匯入成功後記下來
  importCsv(bucket: string, key: string): Promise<void>
}

export function makeHandler(deps: Deps) {
  return async (event: SqsEvent): Promise<BatchResponse> => {
    // 每一則 SQS 訊息：
    // 1. body 解析成 JSON；Event 是 's3:TestEvent' 的是設定通知時 S3 送的測試訊息，略過（不算失敗）
    // 2. 每個 Records[i]：bucket 是 s3.bucket.name；key 是 URL 編碼的（空白變成 +），要先把 + 換回空白再 decodeURIComponent
    // 3. 冪等的 id：`${bucket}/${key}#${versionId ?? eTag}`（沒開版本控制的 bucket 沒有 versionId）
    //    isDone 就跳過；否則 importCsv，成功後 markDone
    // 4. 這則訊息有任何錯誤（JSON 壞掉、匯入失敗）：把它的 messageId 放進 batchItemFailures，繼續處理下一則
    throw new Error('還沒寫')
  }
}
