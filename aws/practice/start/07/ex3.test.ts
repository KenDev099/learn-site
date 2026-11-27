// 練習 3：restoreDeleted 只刪掉「目前是 delete marker」的那些 marker，處理分頁，不產生新版本
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, ListObjectVersionsCommand,
  PutBucketVersioningCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3'
import { client, REGION, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { restoreDeleted } from './restore.ts'

const dir = import.meta.dirname
let sess: Session, s3: S3Client, bucket: string
let listCalls = 0

// 列出 bucket 裡全部的版本與 marker（測試自己用，不壓每頁筆數）
async function allVersions() {
  const raw = client(S3Client, sess)
  const v: { Key: string, VersionId: string, marker: boolean, latest: boolean }[] = []
  let KeyMarker: string | undefined, VersionIdMarker: string | undefined
  for (;;) {
    const p = await raw.send(new ListObjectVersionsCommand({ Bucket: bucket, KeyMarker, VersionIdMarker }))
    for (const x of p.Versions ?? []) v.push({ Key: x.Key!, VersionId: x.VersionId!, marker: false, latest: !!x.IsLatest })
    for (const x of p.DeleteMarkers ?? []) v.push({ Key: x.Key!, VersionId: x.VersionId!, marker: true, latest: !!x.IsLatest })
    if (!p.IsTruncated) return v
    KeyMarker = p.NextKeyMarker; VersionIdMarker = p.NextVersionIdMarker
  }
}
const read = async (Key: string) => (await s3.send(new GetObjectCommand({ Bucket: bucket, Key }))).Body!.transformToString()

before(async () => {
  await requireMoto()
  sess = await session(dir)
  s3 = client(S3Client, sess)
  // 把每頁筆數壓到 2，模擬「資料夾裡有上千個檔案、一頁拿不完」
  s3.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    if (ctx.commandName === 'ListObjectVersionsCommand') { listCalls++; args.input.MaxKeys = 2 }
    return next(args)
  }, { step: 'initialize', name: 'smallPages' })
  bucket = `cafe-07-ex3-receipts-${Date.now().toString(36)}-${sess.account}`
  await s3.send(new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: REGION } }))
  await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }))
  const put = (Key: string, Body: string) => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body }))
  const del = (Key: string) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }))
  // 11 月的收據：a、b、c 被誤刪；b 改過兩版；d 沒被刪
  await put('receipts/2026-11/a.pdf', 'A1')
  await put('receipts/2026-11/b.pdf', 'B1'); await put('receipts/2026-11/b.pdf', 'B2')
  await put('receipts/2026-11/c.pdf', 'C1')
  await put('receipts/2026-11/d.pdf', 'D1')
  // e：很久以前刪過一次、後來又上傳了新的：舊 marker 不是目前版本，不能動
  await put('receipts/2026-11/e.pdf', 'E1'); await del('receipts/2026-11/e.pdf'); await put('receipts/2026-11/e.pdf', 'E2')
  for (const k of ['a', 'b', 'c']) await del(`receipts/2026-11/${k}.pdf`)
  // 別的資料夾也被刪了，但這次不還原它
  await put('receipts/2026-10/z.pdf', 'Z1'); await del('receipts/2026-10/z.pdf')
})
after(async () => {
  const raw = client(S3Client, sess)
  for (const v of await allVersions().catch(() => [])) await raw.send(new DeleteObjectCommand({ Bucket: bucket, Key: v.Key, VersionId: v.VersionId })).catch(() => {})
  await raw.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {})
})

let restored: string[]
test('回傳還原的 key，分頁也要拿完', async () => {
  const before = await allVersions()
  restored = await restoreDeleted(s3, bucket, 'receipts/2026-11/')
  assert.deepEqual(restored, ['receipts/2026-11/a.pdf', 'receipts/2026-11/b.pdf', 'receipts/2026-11/c.pdf'],
    '要還原 a、b、c（目前是 delete marker 的）；d 沒被刪、e 目前是正常版本，都不用動')
  assert.ok(listCalls > 2, '一頁只回 2 筆：IsTruncated 為 true 時要帶 NextKeyMarker、NextVersionIdMarker 繼續列，直到拿完')
  const after = await allVersions()
  assert.equal(before.filter(v => !v.marker).length, after.filter(v => !v.marker).length,
    '資料版本的數量要一樣：還原是刪掉 delete marker，不是重新上傳（CopyObject／PutObject 會多出新版本），也不能刪到資料版本')
})

test('還原後讀得到最新的內容，別的資料夾不受影響', async () => {
  assert.equal(await read('receipts/2026-11/a.pdf'), 'A1')
  assert.equal(await read('receipts/2026-11/b.pdf'), 'B2', 'b 要回到刪除前的最新版 B2')
  assert.equal(await read('receipts/2026-11/c.pdf'), 'C1')
  assert.equal(await read('receipts/2026-11/e.pdf'), 'E2', 'e 本來就是 E2，不能被動到')
  const z = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'receipts/2026-10/z.pdf' })).then(() => 'found', e => e.name)
  assert.equal(z, 'NoSuchKey', 'prefix 以外（receipts/2026-10/）不能還原')
})

test('只刪目前的 marker：e 的舊 marker 還在', async () => {
  const v = await allVersions()
  assert.equal(v.filter(x => x.Key === 'receipts/2026-11/e.pdf' && x.marker).length, 1,
    'e 很久以前的 delete marker 不是目前版本（IsLatest 是 false），不屬於這次事故，要留著')
  assert.equal(v.filter(x => x.Key.startsWith('receipts/2026-11/') && x.marker && x.latest).length, 0, '11 月不能再有目前是 delete marker 的物件')
})
