// 練習 1：client 只在冷啟動建立一次；時間快用完就停；單筆失敗只回報那一筆
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { client, REGION, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { createHandler } from './receipt.ts'

const dir = import.meta.dirname
let sess: Session, s3: S3Client, bucket: string
let made = 0      // makeS3 被呼叫幾次
let puts = 0      // 送出幾次 PutObject
const makeS3 = () => {
  made++
  const c = client(S3Client, sess)
  c.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    if (ctx.commandName === 'PutObjectCommand') puts++
    return next(args)
  }, { step: 'initialize', name: 'countPuts' })
  return c
}
const rec = (id: string, body: unknown) => ({ messageId: id, body: typeof body === 'string' ? body : JSON.stringify(body) })
const plenty = { getRemainingTimeInMillis: () => 60_000 }
const keys = async () => ((await s3.send(new ListObjectsV2Command({ Bucket: bucket }))).Contents ?? []).map(o => o.Key!).sort()
async function clear() { for (const k of await keys()) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })) }

before(async () => {
  await requireMoto()
  sess = await session(dir)
  s3 = client(S3Client, sess)
  bucket = `cafe-06-ex1-receipts-${sess.account}`
  await s3.send(new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: REGION } })).catch(e => { if (e.name !== 'BucketAlreadyOwnedByYou') throw e })
  await clear()
})
after(async () => { await clear().catch(() => {}); await s3?.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {}) })

test('呼叫三次 handler：S3 client 只建立一次', async () => {
  made = 0
  const handler = createHandler(makeS3, bucket)
  for (const n of [1, 2, 3]) {
    const r = await handler({ Records: [rec(`m${n}`, { orderId: 100 + n })] }, plenty)
    assert.deepEqual(r, { batchItemFailures: [] }, `第 ${n} 次呼叫全部成功時要回傳 { batchItemFailures: [] }`)
  }
  assert.equal(made, 1, `makeS3 被呼叫了 ${made} 次：client 要在 handler 外面（createHandler 的本體）建立，冷啟動一次、之後重用`)
  const body = await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'receipts/101.txt' }))).Body!.transformToString()
  assert.equal(body, '訂單 101 收據', 'receipts/101.txt 的內容要是「訂單 101 收據」')
})

test('剩不到 1 秒就停：還沒處理的全部交還給 SQS', async () => {
  await clear()
  puts = 0
  const handler = createHandler(makeS3, bucket)
  // 假的 context：一開始剩 3.5 秒，每寫一個檔案用掉 1 秒
  const ctx = { getRemainingTimeInMillis: () => 3500 - puts * 1000 }
  const r = await handler({ Records: [1, 2, 3, 4, 5].map(n => rec(`t${n}`, { orderId: 200 + n })) }, ctx)
  assert.deepEqual(r.batchItemFailures.map(f => f.itemIdentifier), ['t4', 't5'],
    '前三筆開始時分別剩 3500、2500、1500 毫秒，第四筆開始時只剩 500：t4、t5 要放進 batchItemFailures，不能硬做到被逾時砍掉')
  assert.deepEqual(await keys(), ['receipts/201.txt', 'receipts/202.txt', 'receipts/203.txt'], '只能處理前三筆')
})

test('單筆失敗只回報那一筆，其他照樣處理', async () => {
  await clear()
  const handler = createHandler(makeS3, bucket)
  const r = await handler({ Records: [rec('a', { orderId: 301 }), rec('b', '{這不是 JSON'), rec('c', { orderId: 303 })] }, plenty)
  assert.deepEqual(r, { batchItemFailures: [{ itemIdentifier: 'b' }] },
    '壞掉的那筆（b）放進 batchItemFailures，其他成功：整批丟例外會讓已經成功的 a、c 也被重送')
  assert.deepEqual(await keys(), ['receipts/301.txt', 'receipts/303.txt'], 'a、c 要寫進 S3')
})
