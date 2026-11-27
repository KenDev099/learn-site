// 練習 1：seal／open 用 KMS 的資料金鑰做 AES-256-GCM，encryption context 不同就解不開
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { CreateAliasCommand, CreateKeyCommand, KMSClient } from '@aws-sdk/client-kms'
import { client, requireMoto, session } from '../../helpers/aws.ts'
import { open, seal, type Sealed } from './envelope.ts'

const dir = import.meta.dirname
const ctx = { tenant: 't-001', purpose: 'delivery-token' }
let kms: KMSClient
const alias = 'alias/cafe-09-ex1'
// 記下送出的指令與 GenerateDataKey 回傳的明文金鑰：用來檢查你存了什麼、呼叫了什麼
const sent: { name: string, input: any }[] = []
const plainKeys: string[] = []

before(async () => {
  await requireMoto()
  kms = client(KMSClient, await session(dir))
  kms.middlewareStack.add((next: any, c: any) => async (args: any) => {
    sent.push({ name: c.commandName, input: args.input })
    const out = await next(args)
    if (c.commandName === 'GenerateDataKeyCommand') plainKeys.push(Buffer.from(out.output.Plaintext).toString('base64'))
    return out
  }, { step: 'initialize', name: 'recordKms' })
  const key = await kms.send(new CreateKeyCommand({ Description: 'cafe-09-ex1' }))
  await kms.send(new CreateAliasCommand({ AliasName: alias, TargetKeyId: key.KeyMetadata!.KeyId! })).catch(e => { if (e.name !== 'AlreadyExistsException') throw e })
  sent.length = 0
})

const flip = (s: string) => { const b = Buffer.from(s, 'base64'); b[0] ^= 1; return b.toString('base64') }

test('seal 再 open 拿回原文；送出的 GenerateDataKey 有 AES_256 與 encryption context', async () => {
  const text = '外送平台 token：ft_live_8f2a1c'
  const s = await seal(kms, alias, text, ctx)
  const gen = sent.filter(x => x.name === 'GenerateDataKeyCommand')
  assert.equal(gen.length, 1, 'seal 一次要呼叫 1 次 GenerateDataKeyCommand')
  assert.equal(gen[0].input.KeySpec, 'AES_256', 'GenerateDataKey 要帶 KeySpec: AES_256（AES-256-GCM 要 32 bytes 的金鑰）')
  assert.deepEqual(gen[0].input.EncryptionContext, ctx, 'GenerateDataKey 要帶 EncryptionContext：解密時 KMS 才會檢查它')
  assert.equal(await open(kms, s, ctx), text, 'open 要拿回原文')
})

test('存起來的東西裡沒有明文的資料金鑰，也沒有用 KMS Encrypt 加密資料', async () => {
  sent.length = 0
  const s = await seal(kms, alias, '拿鐵 110', ctx)
  const stored = JSON.stringify(s)
  for (const k of plainKeys) {
    assert.ok(!stored.includes(k) && !stored.includes(Buffer.from(k, 'base64').toString('hex')),
      '回傳的物件裡出現了明文資料金鑰：只能存 CiphertextBlob（加密過的資料金鑰），明文金鑰用完就丟')
  }
  assert.ok(!sent.some(x => x.name === 'EncryptCommand'), '資料由程式自己用資料金鑰加密，不要把資料送給 KMS Encrypt（它最多 4096 bytes，每次都是一個網路請求）')
  assert.equal(Buffer.from(s.iv, 'base64').length, 12, 'AES-GCM 的 IV 用 12 bytes')
})

test('同一段文字加密兩次，IV 與密文都不同；20 KB 的資料也能加密', async () => {
  const a = await seal(kms, alias, '同一段文字', ctx)
  const b = await seal(kms, alias, '同一段文字', ctx)
  assert.notEqual(a.iv, b.iv, '每次加密都要用新的隨機 IV（randomBytes(12)）；同一把金鑰重複用 IV 會讓 GCM 失去保護')
  assert.notEqual(a.ciphertext, b.ciphertext, '密文不能一樣')
  const big = '可頌'.repeat(4000)
  assert.equal(await open(kms, await seal(kms, alias, big, ctx), ctx), big, '20 KB 的資料要能加解密：資料是在程式裡加密，不受 KMS 的大小限制')
})

test('encryption context 不同就解不開', async () => {
  const s = await seal(kms, alias, '店長的手機號碼', ctx)
  await assert.rejects(open(kms, s, { ...ctx, tenant: 't-002' }), (e: Error) => e.name === 'InvalidCiphertextException',
    '別的租戶的 context 要解不開（KMS 回 InvalidCiphertextException）：GenerateDataKey 與 Decrypt 都要帶 EncryptionContext')
})

test('密文或 auth tag 被改過，open 要丟錯', async () => {
  const s: Sealed = await seal(kms, alias, '這段文字被改一個 byte 就要解不開'.repeat(3), ctx)
  await assert.rejects(open(kms, { ...s, ciphertext: flip(s.ciphertext) }, ctx), '密文被改了一個 byte 卻解得開：要用 AES-256-GCM 並在解密前 setAuthTag')
  await assert.rejects(open(kms, { ...s, tag: flip(s.tag) }, ctx), 'auth tag 被改了卻解得開：解密前要 setAuthTag(存下來的 tag)')
})
