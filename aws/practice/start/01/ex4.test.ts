// 練習 4：ensureMenuBucket 依帳號與 region 建 bucket，重複執行不出錯，別人的名稱不能當成自己的
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { CreateBucketCommand, DeleteBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { STSClient } from '@aws-sdk/client-sts'
import { accountFor, client, requireMoto, session, type Session } from '../../helpers/aws.ts'
import { ensureMenuBucket } from './menu-bucket.ts'

const dir = import.meta.dirname
let sess: Session, other: Session
const made: { s3: S3Client, bucket: string }[] = []

// 建一個會記下 CreateBucket 參數的 S3 client：模擬器比真的 AWS 寬鬆，所以直接檢查你送出的內容
function s3For(s: Session, region: string) {
  const s3 = client(S3Client, s, { region })
  const sent: any[] = []
  s3.middlewareStack.add((next: any, ctx: any) => async (args: any) => {
    if (ctx.commandName === 'CreateBucketCommand') sent.push(structuredClone(args.input))
    return next(args)
  }, { step: 'initialize', name: 'recordCreateBucket' })
  return { s3, sts: client(STSClient, s, { region }), sent }
}

before(async () => {
  await requireMoto()
  sess = await session(dir)
  other = await session(dir + '-other')   // 另一個帳號：用來佔走名稱
})
after(async () => {
  for (const { s3, bucket } of made) await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {})
})

test('ap-northeast-1：名稱是 cafe-menu-<帳號>-<region>，送出 LocationConstraint，回傳 created: true', async () => {
  const { s3, sts, sent } = s3For(sess, 'ap-northeast-1')
  const want = `cafe-menu-${sess.account}-ap-northeast-1`
  const r = await ensureMenuBucket(s3, sts)
  made.push({ s3, bucket: want })
  assert.deepEqual(r, { name: want, created: true }, `第一次要建立 ${want} 並回傳 created: true`)
  await s3.send(new HeadBucketCommand({ Bucket: want }))
  assert.equal(sent.length, 1, '應該送出 1 次 CreateBucket')
  assert.equal(sent[0].CreateBucketConfiguration?.LocationConstraint, 'ap-northeast-1',
    'us-east-1 以外的 region 要帶 CreateBucketConfiguration: { LocationConstraint: region }：模擬器沒帶也會成功，真的 AWS 會回 IllegalLocationConstraintException')
})

test('再執行一次：不丟錯，回傳 created: false', async () => {
  const { s3, sts } = s3For(sess, 'ap-northeast-1')
  const r = await ensureMenuBucket(s3, sts)
  assert.deepEqual(r, { name: `cafe-menu-${sess.account}-ap-northeast-1`, created: false }, 'bucket 已經是自己的（BucketAlreadyOwnedByYou）時要回傳 created: false，不能丟錯')
})

test('us-east-1：不能帶 LocationConstraint，region 從 client 設定讀', async () => {
  const { s3, sts, sent } = s3For(sess, 'us-east-1')
  const r = await ensureMenuBucket(s3, sts)
  made.push({ s3, bucket: r.name })
  assert.equal(r.name, `cafe-menu-${sess.account}-us-east-1`, 'region 要用 await s3.config.region() 讀，不能寫死')
  assert.equal(sent[0]?.CreateBucketConfiguration, undefined, 'us-east-1 是預設位置，寫 LocationConstraint: us-east-1 在真的 AWS 會被拒絕：這時不要帶 CreateBucketConfiguration')
})

test('名稱被別的帳號用走時要丟錯，不能當成自己的', async () => {
  const region = 'ap-northeast-3'
  const taken = `cafe-menu-${sess.account}-${region}`
  const theirs = s3For(other, region)
  await theirs.s3.send(new CreateBucketCommand({ Bucket: taken, CreateBucketConfiguration: { LocationConstraint: region } }))
  made.push({ s3: theirs.s3, bucket: taken })
  const { s3, sts } = s3For(sess, region)
  await assert.rejects(ensureMenuBucket(s3, sts), (e: Error) => e.name === 'BucketAlreadyExists',
    'bucket 名稱全世界共用：被別人用走時（BucketAlreadyExists）要把錯誤丟出去，只有 BucketAlreadyOwnedByYou 才回傳 created: false')
  assert.notEqual(accountFor(dir + '-other'), sess.account)
})
