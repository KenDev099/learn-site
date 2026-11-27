// 練習 2：讀回 bucket 的每個安全設定，再實際用 HTTP 上傳一次，確認 policy 真的擋下來
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DeleteBucketCommand, DeleteBucketPolicyCommand, GetBucketEncryptionCommand, GetBucketPolicyCommand, GetBucketVersioningCommand,
  GetPublicAccessBlockCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3'
import { CreateKeyCommand, KMSClient } from '@aws-sdk/client-kms'
import { client, ENDPOINT, REGION, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { secureSiteBucket } from './site-bucket.ts'

const dir = import.meta.dirname
let sess: Session, s3: S3Client, bucket: string, keyArn: string
const sent: { cmd: string, input: any }[] = []

before(async () => {
  await requireMoto()
  sess = await session(dir)
  s3 = client(S3Client, sess)
  s3.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    sent.push({ cmd: ctx.commandName, input: structuredClone(args.input) })
    return next(args)
  }, { step: 'initialize', name: 'recordS3' })
  keyArn = (await client(KMSClient, sess).send(new CreateKeyCommand({ Description: 'cafe-07 site' }))).KeyMetadata!.Arn!
  bucket = `cafe-07-ex2-site-${Date.now().toString(36)}-${sess.account}`   // 每次執行一個新的 bucket
  await secureSiteBucket(s3, bucket, keyArn)
})
after(async () => {
  // 先拿掉 policy（不然連刪除都會被「非 HTTPS」擋下），再刪 bucket
  await s3?.send(new DeleteBucketPolicyCommand({ Bucket: bucket })).catch(() => {})
  await s3?.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {})
})

test('建立 bucket 時帶 LocationConstraint', () => {
  const c = sent.find(s => s.cmd === 'CreateBucketCommand')
  assert.equal(c?.input.CreateBucketConfiguration?.LocationConstraint, REGION, `${REGION} 要帶 CreateBucketConfiguration.LocationConstraint（第 1 課）`)
})

test('Block Public Access 四個設定全開', async () => {
  const r = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
  assert.deepEqual(r.PublicAccessBlockConfiguration, { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
    '四個都要 true：只開兩個的話，ACL 或 policy 其中一條路還是能把東西公開')
})

test('版本控制開著', async () => {
  const r = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }))
  assert.equal(r.Status, 'Enabled', '版本控制要 Enabled：誤刪、覆蓋才救得回來')
})

test('預設加密：SSE-KMS、指定的 key、bucket key', async () => {
  const r = await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket }))
  const rule = r.ServerSideEncryptionConfiguration?.Rules?.[0]
  assert.equal(rule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm, 'aws:kms', 'SSEAlgorithm 要是 aws:kms')
  assert.equal(rule?.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID, keyArn, 'KMSMasterKeyID 用傳進來的 key ARN')
  assert.equal(rule?.BucketKeyEnabled, true, 'BucketKeyEnabled 要是 true：不開的話每個物件的讀寫都要呼叫一次 KMS，請求費用與節流都會找上門')
})

test('bucket policy：Deny 非 HTTPS，涵蓋 bucket 與物件', async () => {
  const p = JSON.parse((await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }))).Policy!)
  const st = p.Statement.find((s: any) => s.Condition?.Bool?.['aws:SecureTransport'] !== undefined)
  assert.ok(st, '要有一個條件是 Bool aws:SecureTransport 的 statement')
  assert.equal(st.Effect, 'Deny', 'Effect 要是 Deny：用 Allow＋SecureTransport true 擋不住任何東西，因為別的 Allow 照樣生效')
  assert.equal(st.Condition.Bool['aws:SecureTransport'], 'false', '條件是 aws:SecureTransport 為 "false" 時拒絕')
  assert.ok(st.Principal === '*' || st.Principal?.AWS === '*', 'Principal 用 "*"：拒絕適用於所有人')
  const res = [st.Resource].flat()
  assert.ok(res.includes(`arn:aws:s3:::${bucket}`) && res.includes(`arn:aws:s3:::${bucket}/*`),
    'Resource 要同時有 bucket 本身（arn:aws:s3:::<bucket>）和物件（arn:aws:s3:::<bucket>/*）')
})

test('實測：模擬器走的是 HTTP，你的 policy 會把上傳擋下來', async () => {
  assert.ok(ENDPOINT.startsWith('http://'))
  const err = await s3.send(new PutObjectCommand({ Bucket: bucket, Key: 'index.html', Body: '<h1>cafe</h1>' })).then(() => null, e => e)
  assert.ok(err, '用 http:// 上傳要被 bucket policy 拒絕：模擬器會照 policy 判斷 aws:SecureTransport，這次上傳卻成功了，代表 Deny 沒有生效')
  assert.equal(err.$metadata?.httpStatusCode, 403, `應該回 403，實際是 ${err.$metadata?.httpStatusCode}（${err.name}）`)
})
