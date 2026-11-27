// 練習 2：secretCache 只在需要時呼叫 GetSecretValue；withDbSecret 遇到認證錯誤刷新一次
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { CreateSecretCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { client, requireMoto, session } from '../../helpers/aws.ts'
import { secretCache, withDbSecret, type DbSecret } from './get-secret.ts'

const dir = import.meta.dirname
let sm: SecretsManagerClient
let calls = 0
const base = { username: 'pf_app', host: 'cafe-db.internal', port: 5432, dbname: 'cafe' }

// 每個測試一個自己的 secret，名稱不重複
let n = 0
async function newSecret(password: string) {
  const name = `cafe-09-ex2/db-${process.pid}-${n++}`
  await sm.send(new CreateSecretCommand({ Name: name, SecretString: JSON.stringify({ ...base, password }) }))
  return name
}
// 假的資料庫：只接受目前的密碼，錯的密碼丟出 PostgreSQL 的認證錯誤
const authError = () => Object.assign(new Error('password authentication failed for user "pf_app"'), { code: '28P01' })

before(async () => {
  await requireMoto()
  sm = client(SecretsManagerClient, await session(dir))
  sm.middlewareStack.add((next: any, c: any) => async (args: any) => {
    if (c.commandName === 'GetSecretValueCommand') calls++
    return next(args)
  }, { step: 'initialize', name: 'countGet' })
})

test('第一次 get 讀 Secrets Manager 並解析 JSON；TTL 內再 get 不再呼叫 API', async () => {
  const id = await newSecret('pw-1')
  let t = 1_000_000
  const cache = secretCache(sm, id, { ttlMs: 60_000, now: () => t })
  calls = 0
  const s: DbSecret = await cache.get()
  assert.deepEqual(s, { ...base, password: 'pw-1' }, 'get 要回傳 SecretString 解析後的物件')
  await cache.get()
  t += 59_999
  await cache.get()
  assert.equal(calls, 1, `TTL 內應該只呼叫 1 次 GetSecretValue，實際 ${calls} 次：每個請求都去讀會變慢、也要付 API 呼叫費`)
  t += 2
  await cache.get()
  assert.equal(calls, 2, '超過 TTL 要重新讀一次：不然密碼輪替後永遠拿不到新的')
})

test('同時呼叫 5 次 get，只送 1 次請求', async () => {
  const id = await newSecret('pw-1')
  const cache = secretCache(sm, id, { ttlMs: 60_000, now: () => 0 })
  calls = 0
  const all = await Promise.all([1, 2, 3, 4, 5].map(() => cache.get()))
  assert.equal(calls, 1, `同時呼叫 5 次 get 送出了 ${calls} 次請求：請求進行中時，回傳同一個 Promise`)
  assert.ok(all.every(s => s.password === 'pw-1'))
})

test('force: true 一定重新讀；讀失敗不會被快取', async () => {
  const id = await newSecret('pw-1')
  const cache = secretCache(sm, id, { ttlMs: 60_000, now: () => 0 })
  calls = 0
  await cache.get()
  await cache.get({ force: true })
  assert.equal(calls, 2, 'force: true 時不管 TTL，要重新呼叫 GetSecretValue')
  const missing = secretCache(sm, `cafe-09-ex2/missing-${process.pid}`, { ttlMs: 60_000, now: () => 0 })
  await assert.rejects(missing.get(), (e: Error) => e.name === 'ResourceNotFoundException', '讀不到時把錯誤丟出去')
  calls = 0
  await assert.rejects(missing.get())
  assert.equal(calls, 1, '上一次讀失敗後，下一次 get 要重新送請求：失敗的 Promise 不能留在快取裡')
})

test('密碼被輪替：withDbSecret 收到 28P01 後強制刷新，用新密碼成功', async () => {
  const id = await newSecret('pw-old')
  const cache = secretCache(sm, id, { ttlMs: 60_000, now: () => 0 })
  await cache.get()                                     // 快取裡是舊密碼
  await sm.send(new PutSecretValueCommand({ SecretId: id, SecretString: JSON.stringify({ ...base, password: 'pw-new' }) }))
  calls = 0
  const tried: string[] = []
  const r = await withDbSecret(cache, async s => {
    tried.push(s.password)
    if (s.password !== 'pw-new') throw authError()
    return 'connected'
  })
  assert.equal(r, 'connected')
  assert.deepEqual(tried, ['pw-old', 'pw-new'], '先用快取裡的密碼，認證失敗（code 28P01）再用 force 刷新後的密碼試一次')
  assert.equal(calls, 1, '只有認證失敗之後才重新讀 secret')
})

test('刷新後還是失敗：只重試一次就把錯誤丟出去；其他錯誤不重試', async () => {
  const id = await newSecret('pw-1')
  const cache = secretCache(sm, id, { ttlMs: 60_000, now: () => 0 })
  let runs = 0
  await assert.rejects(withDbSecret(cache, async () => { runs++; throw authError() }), (e: any) => e.code === '28P01')
  assert.equal(runs, 2, `認證一直失敗時呼叫了 run ${runs} 次：只重試 1 次（總共 2 次），不能無限重試把資料庫打爆`)
  runs = 0
  calls = 0
  await assert.rejects(withDbSecret(cache, async () => { runs++; throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }),
    (e: any) => e.code === 'ECONNREFUSED')
  assert.equal(runs, 1, '連不上（ECONNREFUSED）跟密碼無關，不要刷新也不要重試')
  assert.equal(calls, 0, '不是認證錯誤時不要重新讀 secret')
})
