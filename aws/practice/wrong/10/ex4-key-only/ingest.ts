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

type S3Record = { s3: { bucket: { name: string }, object: { key: string, versionId?: string, eTag?: string } } }

// S3 事件裡的 key 是 application/x-www-form-urlencoded：空白是 +，真正的 + 是 %2B
const decodeKey = (key: string) => decodeURIComponent(key.replace(/\+/g, ' '))

export function makeHandler(deps: Deps) {
  return async (event: SqsEvent): Promise<BatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = []
    for (const msg of event.Records) {
      try {
        const body = JSON.parse(msg.body)
        if (body.Event === 's3:TestEvent') continue
        for (const r of body.Records as S3Record[]) {
          const bucket = r.s3.bucket.name
          const key = decodeKey(r.s3.object.key)
          const id = `${bucket}/${key}`
          if (await deps.isDone(id)) continue
          await deps.importCsv(bucket, key)
          await deps.markDone(id)
        }
      } catch {
        batchItemFailures.push({ itemIdentifier: msg.messageId })   // 只有這一則回到佇列重試
      }
    }
    return { batchItemFailures }
  }
}
